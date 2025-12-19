// assignDefaultELO.js
// Script called by the bot when a new member joins to assign default ELO (1500) to RawStandings AM-AO
//===========================================================================================

export async function assignDefaultELO(sheets) {
  const rawRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'RawStandings!A:AO',
  });
  const data = rawRes.data.values || [];

  for (let i = 0; i < data.length; i++) {
    const player = data[i][0]; // column A is "player"
    if (!player) continue; // skip rows with no player

    const AM = data[i][38];
    const AN = data[i][39];
    const AO = data[i][40];

    // Only set 1500 if blank
    if ((AM === undefined || AM === '' || AM === 0) ||
        (AN === undefined || AN === '' || AN === 0) ||
        (AO === undefined || AO === '' || AO === 0)) {

      const newELOs = [
        (AM === undefined || AM === '' || AM === 0) ? 1500 : AM,
        (AN === undefined || AN === '' || AN === 0) ? 1500 : AN,
        (AO === undefined || AO === '' || AO === 0) ? 1500 : AO,
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `RawStandings!AM${i + 1}:AO${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newELOs] },
      });

      console.log(`✅ Default ELO set for player ${player}`);
    }
  }
}
