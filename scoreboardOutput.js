import { Client, GatewayIntentBits } from 'discord.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

const SCORE_POSTED_INDEX = 74; // BW

// Column indexes for RawData
const AWAY_SCORE_INDEX = 13; // N
const HOME_SCORE_INDEX = 41; // AP
const HOME_PLAYER_INDEX = 68; // BQ
const AWAY_PLAYER_INDEX = 69; // BR
const HOME_TEAM_INDEX = 7; // H
const AWAY_TEAM_INDEX = 8; // I
const GAME_ID_INDEX = 1; // B in RawData

// Column indexes for RawPlayer
const RP_GAME_ID_INDEX = 5; // GameID
const RP_TEAM_INDEX = 6; // Team
const RP_NAME_INDEX = 7; // Name
const RP_POS_INDEX = 8; // Pos
const RP_G_INDEX = 9; // Goals
const RP_A_INDEX = 10; // Assists
const RP_PTS_INDEX = 11; // Points
const RP_SO_INDEX = 12; // Shutouts (goalies)

export async function postUnsentScores({ sheets, spreadsheetId }) {
  // Load RawData
  const rawRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawData!A:BW',
  });
  const rawRows = rawRes.data.values || [];

  // Load RawPlayer
  const rpRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawPlayer!A:Z', // adjust if needed
  });
  const rawPlayerRows = rpRes.data.values || [];

  const nhlEmojiMap = getNHLEmojiMap();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
  await client.login(process.env.DISCORD_BOT_TOKEN);

  const channel = await client.channels.fetch(process.env.SCOREBOARD_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    console.error('❌ Scoreboard channel not found or not text-based');
    await client.destroy();
    return;
  }

  // Track posted GameIDs to prevent duplicates
  const postedGames = new Set();

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];

    const awayScore = row[AWAY_SCORE_INDEX];
    const homeScore = row[HOME_SCORE_INDEX];
    const homePlayer = row[HOME_PLAYER_INDEX];
    const awayPlayer = row[AWAY_PLAYER_INDEX];
    const homeTeam = row[HOME_TEAM_INDEX];
    const awayTeam = row[AWAY_TEAM_INDEX];
    const gameId = row[GAME_ID_INDEX];

    // Only post if fully finalized
    if (
      awayScore === '' || awayScore === undefined ||
      homeScore === '' || homeScore === undefined ||
      homePlayer === '' || homePlayer === undefined ||
      awayPlayer === '' || awayPlayer === undefined
    ) continue;

    // Skip if already posted
    if (row[SCORE_POSTED_INDEX]?.trim() === '✅') continue;

    // Prevent posting same game twice
    if (postedGames.has(gameId)) continue;
    postedGames.add(gameId);

    // Get all players for this game
    const gamePlayers = rawPlayerRows.filter(r => r[RP_GAME_ID_INDEX] === gameId);

    // Top scorers (skaters only)
    const skaters = gamePlayers.filter(r => r[RP_POS_INDEX] !== 'G');
    const maxPts = Math.max(...skaters.map(p => Number(p[RP_PTS_INDEX]) || 0));
    const topScorers = skaters.filter(p => Number(p[RP_PTS_INDEX]) === maxPts);

    let highlights = [];
    if (topScorers.length > 0 && maxPts > 0) {
      const topStr = topScorers
        .map(p => `${p[RP_NAME_INDEX]} (${p[RP_TEAM_INDEX]}) ${p[RP_PTS_INDEX]}PTS`)
        .join(', ');
      highlights.push(`⭐ Top Scorer: ${topStr}`);
    }

    // Shutouts (goalies only, unique)
    const shutoutGoalies = gamePlayers
      .filter(r => r[RP_POS_INDEX] === 'G' && Number(r[RP_SO_INDEX]) > 0)
      .reduce((acc, g) => {
        const key = `${g[RP_NAME_INDEX]}-${g[RP_TEAM_INDEX]}`;
        if (!acc.seen.has(key)) {
          acc.seen.add(key);
          acc.list.push(`🥅 Shutout: ${g[RP_NAME_INDEX]} (${g[RP_TEAM_INDEX]})`);
        }
        return acc;
      }, { seen: new Set(), list: [] }).list;

    highlights.push(...shutoutGoalies);

    // Build message
    const message =
      `🏒 Final Score!\n` +
      `🚌 Away: ${awayPlayer} (${awayTeam}) ${nhlEmojiMap[awayTeam]} - Score: ${awayScore}\n` +
      `🏠 Home: ${homePlayer} (${homeTeam}) ${nhlEmojiMap[homeTeam]} - Score: ${homeScore}` +
      (highlights.length > 0 ? `\n${highlights.join('\n')}` : '');

    // Send to Discord
    await channel.send({ content: message });

    // Mark as posted
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `RawData!BW${i + 1}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [['✅']] },
    });
  }

  await client.destroy();
}
