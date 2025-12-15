// finalizeRawData() — call this AFTER the parser writes the state to RawData

import { google } from 'googleapis';
import updateCoachesStreaks from './updateCoachesStreaks.js'; // after processing raw data updates
import updateElo from './updateElo.js';


async function finalizeRawData() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch PendingGames rows
    const pendingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PendingGames!A:H',
    });
    const pendingRows = pendingRes.data.values || [];

    // Fetch RawData rows
    const rawRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawData!A:BR',
    });
    const rawRows = rawRes.data.values || [];

    // Track updates to RawData and PendingGames
    const rawUpdates = [];
    const pendingUpdates = [];

    for (let i = 0; i < pendingRows.length; i++) {
      const pg = pendingRows[i];
      const [uniqueId, awayPlayer, awayTeam, homePlayer, homeTeam, timestamp, status] = pg;

      if (status !== 'Pending') continue; // Skip already processed

      // Find RawData rows where BQ/BR are blank and Home/Away match
      for (let j = 0; j < rawRows.length; j++) {
        const rd = rawRows[j];
        const rdHomeTeam = rd[7]; // H = column H (index 7)
        const rdAwayTeam = rd[8]; // I = column I (index 8)
        const rdBQ = rd[68]; // BQ = index 68
        const rdBR = rd[69]; // BR = index 69

        if ((rdBQ || rdBR)) continue; // Skip if already filled
        if (rdHomeTeam === homeTeam && rdAwayTeam === awayTeam) {

          // Scores from RawData
          const awayScore = rd[13]; // Column N
          const homeScore = rd[41]; // Column AP

          // Assign coaches to RawData
          rawUpdates.push({
            range: `RawData!BQ${j + 1}:BR${j + 1}`,
            values: [[homePlayer, awayPlayer]],
          });

          // Mark PendingGames as processed
          pendingUpdates.push({
            range: `PendingGames!G${i + 1}`,
            values: [['Processed']],
          });

          // Update coach streaks (runs once per finalized game)
          await updateCoachesStreaks({
            sheets,
            spreadsheetId: process.env.SPREADSHEET_ID,
            homeCoach: homePlayer,
            awayCoach: awayPlayer,
            homeTeamScore: homeScore,
            awayTeamScore: awayScore,
          });

          break; // Match found, move to next PendingGames row
        }

      }
    }

    // Apply RawData updates
    for (const u of rawUpdates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: u.range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: u.values },
      });
    }

    // Apply PendingGames updates
    for (const u of pendingUpdates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: u.range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: u.values },
      });
    }
    console.log(`✅ Finalized ${rawUpdates.length} RawData row(s) from PendingGames`);

    // Update ELO after finalizing RawData
    await updateElo(); 

    
  } catch (err) {
    console.error('❌ Error finalizing RawData:', err);
  }
}

export { finalizeRawData };
