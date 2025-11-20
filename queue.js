import { google } from 'googleapis';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

let queue = [];
let queueMessage;

// === Build buttons for persistent message ===
function getQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('leave').setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
    )
  ];
}

// === Initialize persistent queue message ===
export async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  if (!channel) return;

  // Try to fetch last message sent by bot
  const messages = await channel.messages.fetch({ limit: 50 });
  queueMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

  // Queue starts empty on restart
  queue = [];

  // If no persistent message found, send a new one
  if (!queueMessage) {
    queueMessage = await channel.send({
      content: '*(empty)*',
      components: getQueueButtons()
    });
  } else {
    // Edit the existing one to clear content
    await queueMessage.edit({ content: '*(empty)*', components: getQueueButtons() });
  }
}

// === Update persistent queue message ===
export async function sendOrUpdateQueueMessage(channel) {
  const content = queue.length > 0
    ? queue.map(p => `${p.name} [${p.elo}]`).join('\n')
    : '*(empty)*';

  if (queueMessage) {
    try {
      await queueMessage.edit({ content, components: getQueueButtons() });
    } catch (err) {
      console.error('❌ Error editing queue message, resending:', err);
      // If edit fails (Unknown Message), send a new persistent message
      queueMessage = await channel.send({ content, components: getQueueButtons() });
    }
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

    // ELO from column AM (0-based index 38)
    const elo = rowIndex !== -1 ? Number(data[rowIndex][38]) || 1500 : 1500;

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
