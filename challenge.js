// challenge.js
import { MessageFlags } from 'discord.js';
import { startTeamPickSession } from './teamPick.js';

export function setupChallengeCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'challenge') {
        const challenger = interaction.user;
        const opponent = interaction.options.getUser('opponent');

        if (!opponent) {
          await interaction.reply({
            content: '⚠️ You must specify someone to challenge.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (opponent.id === challenger.id) {
          await interaction.reply({
            content: '⚠️ You cannot challenge yourself.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Acknowledge the command quickly
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Now safe to do async work if needed
        await interaction.editReply(
          `🏒 Challenge created!\n<@${challenger.id}> vs <@${opponent.id}>`
        );

        // Start the team pick flow
        startTeamPickSession(interaction.channel, challenger, opponent);
      }
    } catch (err) {
      console.error('Interaction error:', err);
    }
  });
}
