// challenge.js
import { Client, GatewayIntentBits } from 'discord.js';
import { startTeamPickSession } from './teamPick.js';

export function setupChallengeCommands() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      if (commandName === 'challenge') {
        const challenger = interaction.user;
        const opponentMention = interaction.options.getUser('opponent');

        if (!opponentMention) {
          await interaction.reply({ content: '⚠️ You must specify someone to challenge.', ephemeral: true });
          return;
        }

        if (opponentMention.id === challenger.id) {
          await interaction.reply({ content: '⚠️ You cannot challenge yourself.', ephemeral: true });
          return;
        }

        await interaction.reply({
          content: `✅ <@${opponentMention.id}> accepted the challenge from <@${challenger.id}>!`,
        });

        // Pass channel and users
        startTeamPickSession(interaction.channel, challenger, opponentMention);
      }
    } catch (err) {
      console.error('Interaction error:', err);
    }
  });

  client.login(process.env.BOT_TOKEN);
}
