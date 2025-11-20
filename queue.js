import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

// In-memory queue
let queue = [];

// In-memory cache for ELOs
let eloCache = new Map();
let lastEloFetch = 0;
const ELO_CACHE_TTL = 60 * 1000; // 1 minute cache TTL

// Queue channel ID
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;

// Build the buttons for join/leave
function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('join_queue')
      .setLabel('Join Queue')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('leave_queue')
      .setLabel('Leave Queue')
      .setStyle(ButtonStyle.Danger)
  );
}

// Fetch ELOs from RawStandings with caching
async function fetchEloForQueue() {
  const now = Date.now();
  if (eloCache.size && now - lastEloFetch < ELO_CACHE_TTL) {
    return eloCache; // return cached values
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const rawRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'RawStandings!A:AO',
  });

  const data = rawRes.data.values || [];
  eloCache = new Map();
  data.forEach(row => {
    const discordId = row[0];
    const elo = row[38] ? parseInt(row[38]) : 1500; // Column AM = index 38
    eloCache.set(discordId, elo);
  });

  lastEloFetch = now;
  return eloCache;
}

// Build embed showing current queue with ELO
async function buildQueueEmbed() {
  if (!queue.length) {
    return new EmbedBuilder()
      .setTitle('🎮 NHL ’95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  const eloMap = await fetchEloForQueue();

  const list = queue
    .map((u, i) => `${i + 1}. <@${u}> [${eloMap.get(u) || 1500}]`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  if (client.queueMessageId) {
    try {
      const msg = await channel.messages.fetch(client.queueMessageId);
      const embed = await buildQueueEmbed();
      return msg.edit({ embeds: [embed], components: [buildButtons()] });
    } catch (e) {
      console.log('Queue message missing, sending a new one.');
    }
  }

  // Send a new persistent queue message
  const embed = await buildQueueEmbed();
  const msg = await channel.send({
    content: '**NHL ’95 Game Queue**',
    embeds: [embed],
    components: [buildButtons()],
  });

  client.queueMessageId = msg.id;
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  try {
    if (interaction.customId === 'join_queue') {
      if (!queue.includes(userId)) queue.push(userId);
    }

    if (interaction.customId === 'leave_queue') {
      queue = queue.filter(id => id !== userId);
    }

    await interaction.deferUpdate();
    await sendOrUpdateQueueMessage(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (err.code !== 10062) throw err;
  }
}

// Reset queue channel: delete old messages, flush queue, send fresh message
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 100 });
  for (const msg of messages.values()) {
    await msg.delete();
  }
  queue = [];
  console.log('🧹 Queue channel reset; all old messages removed');

  await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
