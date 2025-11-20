import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// === In-memory queue ===
export let queue = [];

// Persistent message ID
let queueMessageId;

// === Buttons ===
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

// === Embed showing current queue ===
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

// === Send or update persistent queue message ===
export async function sendOrUpdateQueueMessage(client) {
  const channelId = '1441041038931132537';
  const channel = await client.channels.fetch(channelId);

  if (queueMessageId) {
    try {
      const msg = await channel.messages.fetch(queueMessageId);
      return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
    } catch {
      console.log('Queue message missing, sending a new one.');
    }
  }

  const msg = await channel.send({
    content: '**NHL ’95 Game Queue**',
    embeds: [buildQueueEmbed()],
    components: [buildButtons()],
  });

  queueMessageId = msg.id;
}

// === Handle button interactions ===
export async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (interaction.customId === 'join_queue') {
    if (!queue.includes(userId)) queue.push(userId);
    await interaction.reply({ content: '✅ You joined the queue!', ephemeral: true });
  }

  if (interaction.customId === 'leave_queue') {
    queue = queue.filter(id => id !== userId);
    await interaction.reply({ content: '✅ You left the queue.', ephemeral: true });
  }

  await sendOrUpdateQueueMessage(client);
}

// === Reset queue channel on bot restart ===
export async function resetQueueChannel(client) {
  const channelId = '1441041038931132537';
  const channel = await client.channels.fetch(channelId);

  const messages = await channel.messages.fetch({ limit: 50 });
  for (const [, msg] of messages) {
    if (msg.author.id === client.user.id) {
      await msg.delete().catch(() => {});
    }
  }

  console.log('🧹 Queue channel reset; all old messages removed');

  queue = [];
  await sendOrUpdateQueueMessage(client);
}
