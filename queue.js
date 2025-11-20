import { getNHLEmojiMap } from './nhlEmojiMap.js';
import { google } from 'googleapis';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

let queue = [];
let queueMessage;

// === Build buttons for persistent message ===
function getQueueButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave').setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
  );
  return [row];
}

// === Reset queue channel on restart ===
export async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  if (!channel) return;

  // Fetch existing messages
  const messages = await channel.messages.fetch({ limit: 50 });

  // Delete old messages
  await Promise.all(messages.map(msg => msg.delete()));

  queue = [];

  // Send persistent queue message with buttons
  queueMessage = await channel.send({
    content: '🎯 Queue is empty. Click "Join Queue" to enter!',
    components: getQueueButtons()
  });
}

// === Send/update persistent queue message ===
export async function sendOrUpdateQueueMessage(channel) {
  const content = queue.length
    ? `🎯 Queue:\n${queue.map(p => `${p.name} [${p.elo}]`).join('\n')}`
    : '🎯 Queue is empty. Click "Join Queue" to enter!';

  if (queueMessage) {
    await queueMessage.edit({ content, components: getQueueButtons() });
  } else {
    queueMessage = await channel.send({ content, components: getQueueButtons() });
  }
}

// === Handle join/leave buttons ===
export async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const channel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  const discordId = interaction.user.id;

  try {
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

    if (interaction.customId === 'join') {
      if (!queue.find(p => p.id === discordId)) {
        queue.push({ id: discordId, name: interaction.user.username, elo });
      }
    } else if (interaction.customId === 'leave') {
      queue = queue.filter(p => p.id !== discordId);
    }

    await sendOrUpdateQueueMessage(channel);
    await interaction.deferUpdate();

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// === Random Matchup for 2 players ===
export async function tryMatchup(client, ratedChannelId) {
  if (queue.length < 2) return;

  const shuffled = queue.sort(() => Math.random() - 0.5);
  const [player1, player2] = shuffled.splice(0, 2);
  queue = shuffled;

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
  const team1 = row1 ? nhlMap[row1[3]] : '🏒'; 
  const team2 = row2 ? nhlMap[row2[3]] : '🏒';

  const homeFirst = Math.random() < 0.5;
  const homePlayer = homeFirst ? player1 : player2;
  const awayPlayer = homeFirst ? player2 : player1;
  const homeTeam = homeFirst ? team1 : team2;
  const awayTeam = homeFirst ? team2 : team1;

  const channel = await client.channels.fetch(ratedChannelId);
  await channel.send(`🏒 Matchup Set!\n${homeTeam} <@${homePlayer.id}> at ${awayTeam} <@${awayPlayer.id}>`);

  const queueChannel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  await sendOrUpdateQueueMessage(queueChannel);
}
