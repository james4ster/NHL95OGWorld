// queue.js
import { nhlEmojiMap } from './nhlEmojiMap.js';

const queue = []; // in-memory queue

export function setupQueueCommands(client) {

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Simplified team assignment: pick random available NHL team
    const nhlTeams = Object.keys(nhlEmojiMap);

    const getRandomTeam = () => nhlTeams[Math.floor(Math.random() * nhlTeams.length)];

    if (interaction.commandName === 'play') {
      if (queue.some(p => p.id === userId)) {
        return interaction.reply({ content: '⚠️ You are already in the queue!', ephemeral: true });
      }

      const player = {
        id: userId,
        username,
        team: getRandomTeam()
      };

      queue.push(player);

      // If there’s already someone waiting, match them
      if (queue.length >= 2) {
        const player1 = queue.shift(); // first in queue
        const player2 = queue.shift(); // second in queue

        const matchupMsg = `🏒 Matchup Ready! \n${nhlEmojiMap[player1.team]} **${player1.username}** vs ${nhlEmojiMap[player2.team]} **${player2.username}**`;
        await interaction.reply(matchupMsg);
      } else {
        // first player in queue
        const allPlayers = queue.map(p => `<@${p.id}>`).join(', ');
        await interaction.reply({
          content: `🟢 You’ve joined the queue! Waiting for another player... Currently in queue: ${allPlayers}`,
          ephemeral: false
        });
      }
    }

    if (interaction.commandName === 'leave') {
      const index = queue.findIndex(p => p.id === userId);
      if (index === -1) return interaction.reply({ content: '⚠️ You are not in the queue.', ephemeral: true });

      queue.splice(index, 1);
      const allPlayers = queue.map(p => `<@${p.id}>`).join(', ');
      await interaction.reply({ content: `🛑 You left the queue. Players still waiting: ${allPlayers || 'None'}`, ephemeral: false });
    }
  });
}
