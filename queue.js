import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// In-memory queue
export const queue = [];

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

// Send or update the persistent queue message
export async function sendOrUpdateQueueMessage(client) {
    const channelId = '1441041038931132537';
    const channel = await client.channels.fetch(channelId);
    if (!channel.isTextBased()) return;

    // If the persistent message exists, update it
    if (client.queueMessageId) {
        try {
            const msg = await channel.messages.fetch(client.queueMessageId);
            return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
        } catch (e) {
            console.log('Queue message missing, sending new one.');
        }
    }

    // Otherwise, send a new persistent queue message
    const msg = await channel.send({
        content: '**NHL ’95 Game Queue**',
        embeds: [buildQueueEmbed()],
        components: [buildButtons()]
    });

    client.queueMessageId = msg.id;
}

// Handle button clicks
export async function handleInteraction(interaction, client) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    if (interaction.customId === 'join_queue') {
        if (!queue.includes(userId)) queue.push(userId);
        await interaction.reply({ content: 'You joined the queue!', ephemeral: true });
    }

    if (interaction.customId === 'leave_queue') {
        const index = queue.indexOf(userId);
        if (index !== -1) queue.splice(index, 1);
        await interaction.reply({ content: 'You left the queue.', ephemeral: true });
    }

    // Update the persistent queue message
    await sendOrUpdateQueueMessage(client);
}

// Reset the queue on bot startup
export async function resetQueueChannel(client) {
    const channelId = '1441041038931132537';
    const channel = await client.channels.fetch(channelId);
    if (!channel.isTextBased()) return;

    const messages = await channel.messages.fetch({ limit: 100 });
    await Promise.all(messages.map(msg => msg.delete().catch(console.error)));

    console.log('🧹 Queue channel reset; all old messages removed');

    queue.length = 0; // flush in-memory queue
    await sendOrUpdateQueueMessage(client);
}
