import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// In-memory queue
let queue = [];

// Queue channel ID
const QUEUE_CHANNEL_ID = '1441041038931132537';

// Persistent message ID
let queueMessageId = null;

// Build buttons
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

// Build embed showing queue
function buildQueueEmbed() {
  const list = queue.length
    ? queue.map((u, i) => `${i + 1}. <@${u}>`).join('\n')
    : '_Queue is empty_';

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update persistent queue message
async function sendOrUpdateQueueMessage(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  if (queueMessageId) {
    try {
      const msg = await channel.messages.fetch(queueMessageId);
      await msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
      return msg;
    } catch (err) {
      // Message deleted or missing, send new one
      queueMessageId = null;
    }
  }

  // Send new persistent message
  const msg = await channel.send({
    content: '**NHL ’95 Game Queue**',
    embeds: [buildQueueEmbed()],
    components: [buildButtons()]
  });

  queueMessageId = msg.id;
  return msg;
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (interaction.customId === 'join_queue') {
    if (!queue.includes(userId)) queue.push(userId);
    await interaction.reply({ content: '✅ You joined the queue!', flags: 64 });
  }

  if (interaction.customId === 'leave_queue') {
    queue = queue.filter(id => id !== userId);
    await interaction.reply({ content: '❌ You left the queue.', flags: 64 });
  }

  // Update the persistent message
  await sendOrUpdateQueueMessage(client);
}

// Flush queue and remove old messages in queue channel
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  // Fetch and delete old messages
  const messages = await channel.messages.fetch({ limit: 100 });
  const botMessages = messages.filter(msg => msg.author.id === client.user.id);
  for (const msg of botMessages.values()) {
    await msg.delete().catch(() => null);
  }

  queue = [];
  queueMessageId = null;

  console.log('🧹 Queue channel reset; all old messages removed');

  // Send new persistent message
  await sendOrUpdateQueueMessage(client);
}

export { handleInteraction, resetQueueChannel };
