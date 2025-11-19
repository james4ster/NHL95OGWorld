// queue.js
import { nhlEmojiMap } from './nhlEmojiMap.js'; // your imported emoji map

// ============================================================
// Keep track of the queue with timestamps
const queue = [];
const QUEUE_TIMEOUT = 10 * 60 * 1000; // 10 minutes of inactivity

// === Helper to get NHL emoji for a team ===
function getNHLEmoji(teamCode) {
  return nhlEmojiMap[teamCode] || '🏒';
}

// === Periodically clean up expired users ===
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

// ============================================================
// Setup slash commands and interactions
export function setupQueueCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // === /play-random Command ===
    if (commandName === 'play-random') await handlePlayRandom(interaction);

    // === /leave Command ===
    if (commandName === 'leave') await handleLeave(interaction);

    // === /queue Command ===
    if (commandName === 'queue') await handleQueue(interaction);
  });
}

// ============================================================
// /play-random command handler
async function handlePlayRandom(interaction) {
  // deferReply because this command might do async work (waiting for match)
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.user;

  // Already in queue
  if (queue.find(p => p.id === user.id)) {
    await interaction.editReply({ content: `⚠️ You're already in the queue, <@${user.id}>!` });
    return;
  }

  // Add user with timestamp + channel reference
  queue.push({
    id: user.id,
    username: user.username,
    timestamp: Date.now(),
    channel: interaction.channel
  });

  await interaction.editReply({
    content: `🟢 You’ve joined the random queue! Waiting for another player... Currently in queue: ${queue.map(u => `<@${u.id}>`).join(', ')}`
  });

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
    while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

    const homeEmoji = getNHLEmoji(homeTeam);
    const awayEmoji = getNHLEmoji(awayTeam);

    // Announce matchup directly to the channel
    await interaction.channel.send(
      `🏒 **Random Match Ready!**\n${awayEmoji} <@${away.id}> **at** ${homeEmoji} <@${home.id}>`
    );
  }
}

// ============================================================
// /leave command handler
async function handleLeave(interaction) {
  const user = interaction.user;
  const index = queue.findIndex(p => p.id === user.id);

  // --- Not in queue ---
  if (index === -1) {
    return await interaction.reply({
      content: `⚠️ You are not in the queue, <@${user.id}>.`,
      ephemeral: true
    });
  }

  // --- Remove from queue ---
  queue.splice(index, 1);
  await interaction.reply({
    content: `🛑 You have left the queue, <@${user.id}>.`,
    ephemeral: true
  });
}

// ============================================================
// /queue command handler
async function handleQueue(interaction) {
  // --- Empty queue ---
  if (queue.length === 0) {
    return await interaction.reply({
      content: '🚫 The queue is currently empty.',
      ephemeral: true
    });
  }

  // --- Show current queue ---
  const queueList = queue.map(u => `<@${u.id}>`).join(', ');
  await interaction.reply({
    content: `📋 Current queue (${queue.length}): ${queueList}`,
    ephemeral: true
  });
}
