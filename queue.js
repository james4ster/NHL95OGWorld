import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

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
        ? queue.map((u, i) => `${i + 1}. <@${u}>`).join('\n')
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

    if (client.queueMessageId) {
        try {
            const msg = await channel.messages.fetch(client.queueMessageId);
            return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
        } catch (e) {
            console.log('Queue message missing, sending a new one.');
        }
    }

    // Send a new persistent queue message
    const msg = await channel.send({
        content: '**NHL ’95 Game Queue**',
        embeds: [buildQueueEmbed()],
        components: [buildButtons()],
    });

    client.queueMessageId = msg.id;
}

// Handle button interactions
async function handleInteraction(interaction, client) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    if (interaction.customId === 'join_queue') {
        if (!queue.includes(userId)) queue.push(userId);
    }

    if (interaction.customId === 'leave_queue') {
        queue = queue.filter(id => id !== userId);
    }

    // Acknowledge interaction without ephemeral message
    await interaction.deferUpdate();

    // Refresh the queue message
    await sendOrUpdateQueueMessage(client);
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

    // Send initial persistent queue message
    await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
