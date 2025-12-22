import { Client, GatewayIntentBits } from 'discord.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

const SCORE_POSTED_INDEX = 74; // BW

export async function postUnsentScores({ sheets, spreadsheetId }) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawData!A:BW',
  });

  const rows = res.data.values || [];
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

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const awayScore = row[13]; // N
    const homeScore = row[41]; // AP
    const homePlayer = row[68]; // BQ
    const awayPlayer = row[69]; // BR
    const homeTeam = row[7]; // H
    const awayTeam = row[8]; // I

    // 1️⃣ Must be fully finalized
    if (
      awayScore === '' || awayScore === undefined ||
      homeScore === '' || homeScore === undefined ||
      homePlayer === '' || homePlayer === undefined ||
      awayPlayer === '' || awayPlayer === undefined
    ) {
      continue;
    }

    // 2️⃣ Must not already be posted
    if (row[SCORE_POSTED_INDEX]?.trim() === '✅') continue;

    const message =
      `🏒 Final Score!\n` +
      `🚌 Away: ${awayPlayer} (${awayTeam}) ${nhlEmojiMap[awayTeam]} - Score: ${awayScore}\n` +
      `🏠 Home: ${homePlayer} (${homeTeam}) ${nhlEmojiMap[homeTeam]} - Score: ${homeScore}`;

    await channel.send({ content: message });

    // 3️⃣ Mark as posted
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `RawData!BW${i + 1}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [['✅']] },
    });
  }

  await client.destroy();
}
