import { getNHLEmojiMap } from './nhlEmojiMap.js';
import { google } from 'googleapis';

let queue = [];
let queueMessage;

// === Reset queue channel on restart ===
export async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 50 });
  await Promise.all(messages.map(msg => msg.delete()));

  queue = [];
  queueMessage = await channel.send('🎯 Queue is empty. Click "Join Queue" to enter!');
}

// === Send/update persistent queue message ===
export async function sendOrUpdateQueueMessage(channel) {
  const content = queue.length
    ? `🎯 Queue:\n${queue.map(p => `${p.name} [${p.elo}]`).join('\n')}`
    : '🎯 Queue is empty. Click "Join Queue" to enter!';

  if (queueMessage) await queueMessage.edit({ content });
  else queueMessage = await channel.send({ content });
}

// === Handle join/leave buttons ===
export async function handleInteraction(interaction, client) {
  const channel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  const discordId = interaction.user.id;

  try {
    if (interaction.customId === 'join') {
      // Fetch ELO from RawStandings
      const sheets = google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      })});
      const rawRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'RawStandings!A:AO'
      });
      const data = rawRes.data.values || [];
      const rowIndex = data.findIndex(r => r[0] === discordId);
      const elo = rowIndex !== -1 ? data[rowIndex][38] || 1500 : 1500;

      if (!queue.find(p => p.id === discordId)) {
        queue.push({ id: discordId, name: interaction.user.username, elo });
      }

      await sendOrUpdateQueueMessage(channel);
      await interaction.deferUpdate(); // no ephemeral message
    } else if (interaction.customId === 'leave') {
      queue = queue.filter(p => p.id !== discordId);
      await sendOrUpdateQueueMessage(channel);
      await interaction.deferUpdate();
    }

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// === Random Matchup for 2 players ===
export async function tryMatchup(client, ratedChannelId) {
  if (queue.length < 2) return;

  // Pick 2 random players
  const shuffled = queue.sort(() => Math.random() - 0.5);
  const [player1, player2] = shuffled.splice(0, 2);
  queue = shuffled;

  // Fetch NHL team for emojis from RawStandings
  const sheets = google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })});
  const rawRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'RawStandings!A:AO'
  });
  const data = rawRes.data.values || [];
  const row1 = data.find(r => r[0] === player1.id);
  const row2 = data.find(r => r[0] === player2.id);

  const nhlMap = getNHLEmojiMap();
  const team1 = row1 ? nhlMap[row1[3]] : '🏒'; // column D = NHL team
  const team2 = row2 ? nhlMap[row2[3]] : '🏒';

  // Pick home/away randomly
  const homeFirst = Math.random() < 0.5;
  const homePlayer = homeFirst ? player1 : player2;
  const awayPlayer = homeFirst ? player2 : player1;
  const homeTeam = homeFirst ? team1 : team2;
  const awayTeam = homeFirst ? team2 : team1;

  // Post matchup
  const channel = await client.channels.fetch(ratedChannelId);
  await channel.send(`🏒 Matchup Set!\n${homeTeam} <@${homePlayer.id}> at ${awayTeam} <@${awayPlayer.id}>`);

  // Update queue message
  const queueChannel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  await sendOrUpdateQueueMessage(queueChannel);
}
