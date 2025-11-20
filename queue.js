import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// Persistent in-memory queue
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

    // Check if there is an existing queue message
    let msg;
    if (client.queueMessageId) {
        try {
            msg = await channel.messages.fetch(client.queueMessageId);
            return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
        } catch (err) {
            console.log('Queue message not found, sending a new one.');
        }
    }

    // Try to find an existing queue message in the last 10 messages
    const messages = await channel.messages.fetch({ limit: 10 });
    const oldMsg = messages.find(
        m => m.author.id === client.user.id && m.content.includes('NHL ’95 Game Queue')
    );

    if (oldMsg) {
        client.queueMessageId = oldMsg.id;
        msg = oldMsg;
        return msg.edit({ embeds: [buildQueueEmbed()], components: [buildButtons()] });
    }

    // Otherwise, create a new message
    msg = await channel.send({
        content: '**NHL ’95 Game Queue**',
        embeds: [buildQueueEmbed()],
        components: [buildButtons()]
    });

    client.queueMessageId = msg.id;
    return msg;
}

// Button handlers
export async function handleInteraction(interaction, client) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    // JOIN
    if (interaction.customId === 'join_queue') {
        if (!queue.includes(userId)) queue.push(userId);
        await interaction.reply({ content: '✅ You joined the queue!', ephemeral: true });
    }

    // LEAVE
    if (interaction.customId === 'leave_queue') {
        const index = queue.indexOf(userId);
        if (index > -1) queue.splice(index, 1);
        await interaction.reply({ content: '❌ You left the queue.', ephemeral: true });
    }

    // Update the persistent queue message
    await sendOrUpdateQueueMessage(client);
}
