import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

// In-memory queue
let queue = [];

// Queue channel ID
const QUEUE_CHANNEL_ID = '1441041038931132537';

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

// Build embed showing current queue
function buildQueueEmbed() {
  const list = queue.length
    ? queue.map((u, i) => `${i + 1}. ${u.name} [${u.elo}]`).join('\n')
    : '_Queue is empty_';

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  if (!client.queueMessageId) {
    // Message ID missing → send a new persistent queue window
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const msg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [buildQueueEmbed()],
      components: [buildButtons()],
    });
    client.queueMessageId = msg.id;
    return;
  }

  // Update the existing queue message
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const msg = await channel.messages.fetch(client.queueMessageId);
    await msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
  } catch (err) {
    console.log('❌ Error editing queue message, resending');
    client.queueMessageId = null;
    await sendOrUpdateQueueMessage(client); // retry with new message
  }
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  try {
    // Fetch current ELO from RawStandings
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const rawRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AM',
    });
    const data = rawRes.data.values || [];

    // Map discordId → username + ELO
    const row = data.find(r => r[0] === userId);
    const elo = row ? row[38] || 1500 : 1500;
    const name = row ? row[1] || interaction.user.username : interaction.user.username;

    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) queue.push({ id: userId, name, elo });
    } else if (interaction.customId === 'leave_queue') {
      queue = queue.filter(u => u.id !== userId);
    }

    await interaction.deferUpdate();
    await sendOrUpdateQueueMessage(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// Reset queue channel: delete old messages, flush queue, send fresh persistent message
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 50 });
  for (const msg of messages.values()) {
    await msg.delete();
  }
  queue = [];
  console.log('🧹 Queue channel reset; all old messages removed');

  await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
