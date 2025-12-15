// updateElo.js
export default async function updateElo({ sheets, spreadsheetId }) {
  const K_FACTOR = 20;

  // --- Fetch all relevant sheets
  const [rawDataRes, standingsRes, historyRes, logoRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: "RawData!A1:CL" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "RawStandings!A1:AO" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "EloHistory!A1:T" }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "LogoMaster!A1:E" }),
  ]);

  const rawValues = rawDataRes.data.values;
  const standingsValues = standingsRes.data.values;
  const historyValues = historyRes.data.values;
  const logoValues = logoRes.data.values;

  // --- Build manager ELO maps
  const eloMap = {}, highMap = {}, lowMap = {};
  for (let i = 1; i < standingsValues.length; i++) {
    const manager = standingsValues[i][0];
    if (!manager) continue;
    const elo = Number(standingsValues[i][38]) || 1500; // AM
    const high = Number(standingsValues[i][39]) || 1500; // AN
    const low = Number(standingsValues[i][40]) || 1500;  // AO
    eloMap[manager] = elo;
    highMap[manager] = high;
    lowMap[manager] = low;
  }

  // --- Build team strength map
  const teamStrengthMap = {};
  for (let i = 1; i < logoValues.length; i++) {
    const team = logoValues[i][0];
    if (!team) continue;
    const strength = Number(logoValues[i][4]) || 1;
    teamStrengthMap[team] = strength;
  }

  // --- Already processed GameIDs
  const processedGameIDs = new Set(historyValues.slice(1).map(r => r[0] && r[18] === "Y" ? String(r[0]) : null).filter(Boolean));

  const newHistoryRows = [];

  // --- Loop through RawData to calculate new ELO
  for (let i = 1; i < rawValues.length; i++) {
    const row = rawValues[i];
    const gameIdRaw = row[1]; // Game_ID (col B)
    if (!gameIdRaw) continue;
    const gameId = String(gameIdRaw);
    if (processedGameIDs.has(gameId)) continue;

    const season = row[4];      // E
    const homeMgr = row[68];    // BQ
    const awayMgr = row[69];    // BR
    if (!homeMgr || !awayMgr) continue;

    const homeScore = Number(row[41] ?? 0); // AP
    const awayScore = Number(row[13] ?? 0); // N

    let homeResult = "T", awayResult = "T";
    if (homeScore > awayScore) { homeResult = "W"; awayResult = "L"; }
    else if (homeScore < awayScore) { homeResult = "L"; awayResult = "W"; }

    const homePreElo = eloMap[homeMgr] ?? 1500;
    const awayPreElo = eloMap[awayMgr] ?? 1500;

    const homeTeam = row[71] ?? ""; // BT
    const awayTeam = row[70] ?? ""; // BS
    const homeStrength = teamStrengthMap[homeTeam] || 1;
    const awayStrength = teamStrengthMap[awayTeam] || 1;

    const expectedHome = 1 / (1 + Math.pow(10, (awayPreElo - homePreElo) / 400));
    const expectedAway = 1 - expectedHome;
    const scoreHome = homeResult === "W" ? 1 : homeResult === "L" ? 0 : 0.5;
    const scoreAway = awayResult === "W" ? 1 : awayResult === "L" ? 0 : 0.5;

    const homePostElo = Math.round(homePreElo + K_FACTOR * (scoreHome - expectedHome) * homeStrength);
    const awayPostElo = Math.round(awayPreElo + K_FACTOR * (scoreAway - expectedAway) * awayStrength);

    const homeTeam = row[71] ?? ""; // BT column
    const awayTeam = row[70] ?? ""; // BS column
    
    eloMap[homeMgr] = homePostElo;
    eloMap[awayMgr] = awayPostElo;

    highMap[homeMgr] = Math.max(highMap[homeMgr] || 1500, homePostElo);
    lowMap[homeMgr] = Math.min(lowMap[homeMgr] || 1500, homePostElo);
    highMap[awayMgr] = Math.max(highMap[awayMgr] || 1500, awayPostElo);
    lowMap[awayMgr] = Math.min(lowMap[awayMgr] || 1500, awayPostElo);

   
    newHistoryRows.push([
      gameId, season, "", homeMgr, awayMgr,
      homeTeam, homeResult, homeScore,
      awayTeam, awayResult, awayScore,
      homePreElo, awayPreElo, homePostElo, awayPostElo,
      eloChangeHome, eloChangeAway, "", "Y",
      new Date().toLocaleString() // Timestamp
    ]);
  }

  // --- Write new EloHistory rows
  if (newHistoryRows.length > 0) {
    const firstEmptyRow = historyValues.length + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `EloHistory!A${firstEmptyRow}`,
      valueInputOption: "RAW",
      resource: { values: newHistoryRows }
    });
  }

  // --- Update RawStandings ELO/High/Low
  const standingsUpdates = [];
  for (let i = 1; i < standingsValues.length; i++) {
    const manager = standingsValues[i][0];
    if (!manager) continue;
    const current = eloMap[manager];
    const high = highMap[manager];
    const low = lowMap[manager];
    standingsUpdates.push({ range: `RawStandings!AM${i + 1}:AO${i + 1}`, values: [[current, high, low]] });
  }

  for (const update of standingsUpdates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: update.range,
      valueInputOption: "RAW",
      resource: { values: update.values }
    });
  }

  console.log(`✅ ELO update complete. ${newHistoryRows.length} new games processed.`);
}
