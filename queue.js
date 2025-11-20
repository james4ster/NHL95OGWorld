const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// In-memory queue
let queue = [];

// Build the UI buttons
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

// Send or update the queue message
async function sendOrUpdateQueueMessage(client) {
    const channelId = '1441041038931132537';
    const channel = await client.channels.fetch(channelId);

    // If message already exists, update it
    if (client.queueMessageId) {
        try {
            const msg = await channel.messages.fetch(client.queueMessageId);
            return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
        } catch (e) {
            console.log("Queue message missing, sending new one.");
        }
    }

    // Otherwise create a new one
    const msg = await channel.send({
        content: '**NHL ’95 Game Queue**',
        embeds: [buildQueueEmbed()],
        components: [buildButtons()]
    });

    client.queueMessageId = msg.id;
}

// Button handlers
async function handleInteraction(interaction, client) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    // JOIN
    if (interaction.customId === 'join_queue') {
        if (!queue.includes(userId)) queue.push(userId);
        await interaction.reply({ content: 'You joined the queue!', ephemeral: true });
    }

    // LEAVE
    if (interaction.customId === 'leave_queue') {
        queue = queue.filter(id => id !== userId);
        await interaction.reply({ content: 'You left the queue.', ephemeral: true });
    }

    // Update queue message
    await sendOrUpdateQueueMessage(client);
}

module.exports = {
    queue,
    sendOrUpdateQueueMessage,
    handleInteraction
};
