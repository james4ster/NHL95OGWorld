// challenge.js
import { startTeamPickSession } from './teamPick.js';

// ============================================================
// Setup /challenge command interaction
export function setupChallengeCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      // === /challenge Command ===
      if (interaction.commandName === 'challenge') {
        const challenger = interaction.user;
        const opponent = interaction.options.getUser('opponent');

        // --- Validate opponent ---
        if (!opponent) {
          return await interaction.reply({
            content: '⚠️ You must specify someone to challenge.',
            ephemeral: true
          });
        }

        if (opponent.id === challenger.id) {
          return await interaction.reply({
            content: '⚠️ You cannot challenge yourself.',
            ephemeral: true
          });
        }

        // --- Defer reply because we will do async work ---
        await interaction.deferReply({ ephemeral: true });

        // --- Safe to do async operations now ---
        await interaction.editReply(
          `🏒 Challenge created!\n<@${challenger.id}> vs <@${opponent.id}>`
        );

        // --- Start the team pick flow ---
        // Passing the channel and both users
        startTeamPickSession(interaction.channel, challenger, opponent);
      }
    } catch (err) {
      console.error('Interaction error:', err);

      // --- Try to reply if interaction was never acknowledged ---
      if (interaction && !interaction.replied) {
        try {
          await interaction.reply({
            content: '❌ Something went wrong while creating the challenge.',
            ephemeral: true
          });
        } catch (e) {
          console.error('Failed to send fallback reply:', e);
        }
      }
    }
  });
}
