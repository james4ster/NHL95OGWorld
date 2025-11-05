// challenge.js
import { Client, GatewayIntentBits } from 'discord.js';
import { startTeamPickSession } from './teamPick.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ============================================================
// Wrap your existing interaction logic in a setup function
function setupChallengeCommands() {
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

        // ACCEPT challenge immediately (or you can wait for a button confirmation)
        await interaction.reply({
          content: `✅ <@${opponentMention.id}> accepted the challenge from <@${challenger.id}>!`,
        });

        // ============================================================
        // Pass the channel and the two users — do NOT pass interaction
        startTeamPickSession(interaction.channel, challenger, opponentMention);
      }
    } catch (err) {
      console.error('Interaction error:', err);
    }
  });

  client.login(process.env.BOT_TOKEN);
}

// ============================================================
// Export the setup function so index.js can import it
export { setupChallengeCommands };
