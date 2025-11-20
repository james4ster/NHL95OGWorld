import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

// === In-memory queue ===
let queue = [];

// Persistent queue message ID
let queueMessageId;

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

// Build the queue embed with ELO
async function buildQueueEmbed(client) {
  // Prepare ELO map
  let eloMap = {}; // { discordId: ELO }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AO'
    });

    const data = res.data.values || [];

    // Map Discord ID (col A) → ELO (col AM, index 38)
    data.forEach(row => {
      if (row[0]) {
        eloMap[row[0]] = row[38] ? parseInt(row[38], 10) : 1500;
      }
    });
  } catch (err) {
    console.error('❌ Error fetching ELO from spreadsheet:', err);
  }

  // Build queue description
  const list = queue.length
    ? queue.map((u, i) => `${i + 1}. <@${u.id}> [${eloMap[u.id] || 1500}]`).join('\n')
    : '_Queue is empty_';

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  try {
    const embed = await buildQueueEmbed(client);

    if (queueMessageId) {
      try {
        const msg = await channel.messages.fetch(queueMessageId);
        await msg.edit({ embeds: [embed], components: [buildButtons()] });
        return;
      } catch (e) {
        console.log('Queue message missing, sending a new one.');
      }
    }

    const msg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [embed],
      components: [buildButtons()]
    });

    queueMessageId = msg.id;
  } catch (err) {
    console.error('❌ Error editing queue message, resending:', err);
  }
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) {
        queue.push({ id: userId, name: username });
      }
    }

    if (interaction.customId === 'leave_queue') {
      queue = queue.filter(u => u.id !== userId);
    }

    // Defer update safely (avoid spam errors)
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    } catch (err) {
      if (err.code !== 10062) console.error('❌ Error deferring interaction:', err);
    }

    // Refresh the queue message
    await sendOrUpdateQueueMessage(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// Reset queue channel: delete old messages and send fresh message
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
