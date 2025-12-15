// finalizeRawData.js
import { google } from 'googleapis';
import updateCoachesStreaks from './updateCoachesStreaks.js';
import updateElo from './updateELO.js';

async function finalizeRawData() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const pendingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PendingGames!A:H',
    });
    const pendingRows = pendingRes.data.values || [];

    const rawRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawData!A:BR',
    });
    const rawRows = rawRes.data.values || [];

    const rawUpdates = [];
    const pendingUpdates = [];

    for (let i = 0; i < pendingRows.length; i++) {
      const pg = pendingRows[i];
      const [uniqueId, awayPlayer, awayTeam, homePlayer, homeTeam, timestamp, status, gameId] = pg;

      // Skip any row that is already processed or already has a gameId
      if (status !== 'Pending' || gameId) continue;

      for (let j = 0; j < rawRows.length; j++) {
        const rd = rawRows[j];
        const rdHomeTeam = rd[7];
        const rdAwayTeam = rd[8];
        const rdBQ = rd[68];
        const rdBR = rd[69];

        if (rdBQ || rdBR) continue; // Skip if already filled
        if (rdHomeTeam === homeTeam && rdAwayTeam === awayTeam) {

          const awayScore = rd[13];
          const homeScore = rd[41];

          rawUpdates.push({
            range: `RawData!BQ${j + 1}:BR${j + 1}`,
            values: [[homePlayer, awayPlayer]],
          });

          // Write back GameID safely
          const newGameId = rd[1];
          pendingUpdates.push({
            range: `PendingGames!G${i + 1}:H${i + 1}`,
            values: [['Processed', newGameId]],
          });

          await updateCoachesStreaks({
            sheets,
            spreadsheetId: process.env.SPREADSHEET_ID,
            homeCoach: homePlayer,
            awayCoach: awayPlayer,
            homeTeamScore: homeScore,
            awayTeamScore: awayScore,
          });

          break; // move to next pending row
        }
      }
    }

    for (const u of rawUpdates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: u.range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: u.values },
      });
    }

    for (const u of pendingUpdates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: u.range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: u.values },
      });
    }

    console.log(`✅ Finalized ${rawUpdates.length} RawData row(s) from PendingGames`);

    await updateElo({ sheets, spreadsheetId: process.env.SPREADSHEET_ID });

  } catch (err) {
    console.error('❌ Error finalizing RawData:', err);
  }
}

export { finalizeRawData };
