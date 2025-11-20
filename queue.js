import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// === In-memory queue ===
let queue = [];

// Discord message ID for the persistent queue
let queueMessageId = null;

// Build the buttons
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
  const list = queue.length ? queue.map((u, i) => `${i + 1}. <@${u}>`).join('\n') : '_Queue is empty_';
  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  const channelId = '1441041038931132537';
  const channel = await client.channels.fetch(channelId);

  if (queueMessageId) {
    try {
      const msg = await channel.messages.fetch(queueMessageId);
      return await msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
    } catch {
      // Message missing? Send a new one
      queueMessageId = null;
    }
  }

  // Create new persistent message
  const msg = await channel.send({
    content: '**NHL ’95 Game Queue**',
    embeds: [buildQueueEmbed()],
    components: [buildButtons()]
  });
  queueMessageId = msg.id;
}

// Reset the queue channel: delete old messages & flush queue
async function resetQueueChannel(client) {
  const channelId = '1441041038931132537';
  const channel = await client.channels.fetch(channelId);

  // Delete all messages in the queue channel
  const messages = await channel.messages.fetch({ limit: 100 });
  for (const msg of messages.values()) {
    if (msg.author.id === client.user.id) await msg.delete();
  }

  queue = [];
  queueMessageId = null;
  console.log('🧹 Queue channel reset; all old messages removed');

  // Send the persistent message
  await sendOrUpdateQueueMessage(client);
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  try {
    // JOIN
    if (interaction.customId === 'join_queue') {
      if (!queue.includes(userId)) queue.push(userId);
      await interaction.reply({ content: '✅ You joined the queue!', flags: 64 });
    }

    // LEAVE
    if (interaction.customId === 'leave_queue') {
      queue = queue.filter(id => id !== userId);
      await interaction.reply({ content: '✅ You left the queue.', flags: 64 });
    }

    // Update persistent queue message
    await sendOrUpdateQueueMessage(client);
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
