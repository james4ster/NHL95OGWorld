import { nhlEmojiMap } from './nhlEmojiMap.js';

// ============================================================
// Keep track of the queue with timestamps
const queue = [];
const QUEUE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

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
        expiredUser.channel.send(`⏰ <@${expiredUser.id}> removed from queue due to inactivity.`);
      }
    }
  }
}, 60 * 1000); // check every minute

// ============================================================
// Setup slash commands
export function setupQueueCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') await handlePlay(interaction);
    if (commandName === 'queue') await handleQueue(interaction);
  });
}

// ============================================================
// /play command handler
async function handlePlay(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.user;
  if (queue.find(p => p.id === user.id)) {
    await interaction.editReply({ content: `⚠️ You're already in the queue!` });
    return;
  }

  queue.push({ id: user.id, username: user.username, timestamp: Date.now(), channel: interaction.channel });
  await interaction.editReply({ content: `🟢 You've joined the queue! Current: ${queue.map(u => `<@${u.id}>`).join(', ')}` });

  // Start match if 2 or more players
  if (queue.length >= 2) {
    const [player1, player2] = queue.splice(0, 2);
    const home = Math.random() < 0.5 ? player1 : player2;
    const away = home === player1 ? player2 : player1;

    // Random teams
    const teams = Object.keys(nhlEmojiMap);
    const homeTeam = teams[Math.floor(Math.random() * teams.length)];
    let awayTeam = teams[Math.floor(Math.random() * teams.length)];
    while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

    await interaction.channel.send(
      `🏒 **Random Match Ready!**\n${getNHLEmoji(homeTeam)} <@${home.id}> **at** ${getNHLEmoji(awayTeam)} <@${away.id}>`
    );
  }
}

// ============================================================
// /queue command handler
async function handleQueue(interaction) {
  if (queue.length === 0) {
    await interaction.reply({ content: '🚫 The queue is currently empty.', ephemeral: true });
    return;
  }
  const queueList = queue.map(u => `<@${u.id}>`).join(', ');
  await interaction.reply({ content: `📋 Current queue (${queue.length}): ${queueList}`, ephemeral: true });
}
