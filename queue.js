// queue.js
import { SlashCommandBuilder } from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js'; // your imported emoji map

// Keep track of queue with timestamps
const queue = [];
const QUEUE_TIMEOUT = 10 * 60 * 1000; // remove from queue after 10 minutes of inactivity

// Helper to get NHL emoji
function getNHLEmoji(teamCode) {
  return nhlEmojiMap[teamCode] || '🏒';
}

// Periodically clean up expired users
setInterval(() => {
  const now = Date.now();
  for (let i = queue.length - 1; i >= 0; i--) {
    if (now - queue[i].timestamp > QUEUE_TIMEOUT) {
      const expiredUser = queue.splice(i, 1)[0];
      if (expiredUser.channel) {
        expiredUser.channel.send(`⏰ <@${expiredUser.id}> has been removed from the queue due to inactivity.`);
      }
    }
  }
}, 60 * 1000); // check every minute

// Setup slash commands and interactions
export function setupQueueCommands(client, testChannelId) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') await handlePlay(interaction);
    if (commandName === 'leave') await handleLeave(interaction);
    if (commandName === 'queue') await handleQueue(interaction);
  });
}

// === /play Command ===
async function handlePlay(interaction) {
  const user = interaction.user;

  // Already in queue
  if (queue.find(p => p.id === user.id)) {
    await interaction.reply({ content: `⚠️ You're already in the queue, <@${user.id}>!`, ephemeral: true });
    return;
  }

  // Add user with timestamp + channel ref
  queue.push({
    id: user.id,
    username: user.username,
    timestamp: Date.now(),
    channel: interaction.channel
  });

  await interaction.reply(`🟢 You’ve joined the queue! Waiting for another player... Currently in queue: ${queue.map(u => `<@${u.id}>`).join(', ')}`);

  // If two or more players, start a match
  if (queue.length >= 2) {
    const [player1, player2] = queue.splice(0, 2); // remove from queue

    // Randomize home/away
    const home = Math.random() < 0.5 ? player1 : player2;
    const away = home === player1 ? player2 : player1;

    // Random teams (ensure unique)
    const teams = Object.keys(nhlEmojiMap);
    const homeTeam = teams[Math.floor(Math.random() * teams.length)];
    let awayTeam = teams[Math.floor(Math.random() * teams.length)];
    while (awayTeam === homeTeam) {
      awayTeam = teams[Math.floor(Math.random() * teams.length)];
    }

    const homeEmoji = getNHLEmoji(homeTeam);
    const awayEmoji = getNHLEmoji(awayTeam);

    // Announce matchup
    await interaction.channel.send(
      `🏒 **Matchup Ready!**\n${awayEmoji} <@${away.id}> **at** ${homeEmoji} <@${home.id}>`
    );
  }
}

// === /leave Command ===
async function handleLeave(interaction) {
  const user = interaction.user;
  const index = queue.findIndex(p => p.id === user.id);

  if (index === -1) {
    await interaction.reply({ content: `⚠️ You are not in the queue, <@${user.id}>.`, ephemeral: true });
    return;
  }

  queue.splice(index, 1);
  await interaction.reply(`🛑 You have left the queue, <@${user.id}>.`);
}

// === /queue Command ===
async function handleQueue(interaction) {
  if (queue.length === 0) {
    await interaction.reply('🚫 The queue is currently empty.');
    return;
  }

  const queueList = queue.map(u => `<@${u.id}>`).join(', ');
  await interaction.reply(`📋 Current queue (${queue.length}): ${queueList}`);
}
