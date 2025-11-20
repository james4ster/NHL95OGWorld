import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

// In-memory queue
let queue = [];

// Queue channel ID
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;

// Build join/leave buttons
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

// Build embed showing current queue with ELO
async function buildQueueEmbed(client) {
  if (queue.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎮 NHL ’95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  // Fetch ELOs from Google Sheets
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get PlayerMaster to map Discord ID → username
  const pmRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'PlayerMaster!A:B',
  });
  const pmData = pmRes.data.values || [];
  const idToUsername = Object.fromEntries(pmData.map(r => [r[0], r[1]]));

  // Get RawStandings to map username → ELO (column AM)
  const rsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'RawStandings!A:AM',
  });
  const rsData = rsRes.data.values || [];
  const usernameToElo = {};
  for (const row of rsData) {
    const username = row[0]; // Column A
    const elo = row[38] || 1500; // Column AM = 38 (0-indexed)
    usernameToElo[username] = elo;
  }

  // Build list with ELO
  const list = queue
    .map((discordId, i) => {
      const username = idToUsername[discordId] || `<@${discordId}>`;
      const elo = usernameToElo[username] || 1500;
      return `${i + 1}. ${username} [${elo}]`;
    })
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update persistent queue message
async function sendOrUpdateQueueMessage(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  try {
    if (client.queueMessageId) {
      const msg = await channel.messages.fetch(client.queueMessageId);
      const embed = await buildQueueEmbed(client);
      return await msg.edit({ embeds: [embed], components: [buildButtons()] });
    }
  } catch (e) {
    console.log('Queue message missing, sending a new one.');
  }

  // Send new persistent message if missing
  const embed = await buildQueueEmbed(client);
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

    // Defer update (acknowledge interaction)
    await interaction.deferUpdate();

    // Update the persistent queue message
    await sendOrUpdateQueueMessage(client);
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    // 10062 = Unknown interaction; safe to ignore
    if (err.code !== 10062) throw err;
  }
}

// Reset queue channel: delete old messages and create fresh persistent message
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  // Delete old messages
  const messages = await channel.messages.fetch({ limit: 100 });
  for (const msg of messages.values()) {
    await msg.delete();
  }

  queue = [];
  console.log('🧹 Queue channel reset; all old messages removed');

  // Send initial persistent queue message
  await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
