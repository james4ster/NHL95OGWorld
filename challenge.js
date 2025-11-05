// challenge.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';
import { startTeamPickSession } from './teamPick.js'; // Import helper to start team pick session

// ============================================================
// Track active challenges
// key: challengeID (random string), value: { challenger, opponent, type, status, channel }
const activeChallenges = new Map();

// Helper to generate random ID
function generateChallengeID() {
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================
// Setup challenge commands and button interactions
export function setupChallengeCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // === /challenge-opponent-random-teams & /challenge-opponent-fixed-teams ===
    if (interaction.isChatInputCommand() && (interaction.commandName === 'challenge-opponent-random-teams' || interaction.commandName === 'challenge-opponent-fixed-teams')) {
      await handleChallenge(interaction);
    }

    // === Accept/Decline button handler ===
    if (interaction.isButton()) {
      const [action, challengeID] = interaction.customId.split('_');
      const challenge = activeChallenges.get(challengeID);
      if (!challenge) {
        await interaction.reply({ content: '⚠️ Challenge no longer exists.', ephemeral: true });
        return;
      }

      if (interaction.user.id !== challenge.opponent.id) {
        await interaction.reply({ content: '⚠️ Only the challenged player can respond.', ephemeral: true });
        return;
      }

      if (action === 'accept') {
        challenge.status = 'accepted';
        await interaction.update({ content: `✅ <@${challenge.opponent.id}> accepted the challenge from <@${challenge.challenger.id}>!`, components: [] });

        // Handle based on challenge type
        if (challenge.type === 'random-teams') {
          // Random teams + home/away
          const teams = Object.keys(nhlEmojiMap);
          const homeTeam = teams[Math.floor(Math.random() * teams.length)];
          let awayTeam = teams[Math.floor(Math.random() * teams.length)];
          while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

          const home = Math.random() < 0.5 ? challenge.challenger : challenge.opponent;
          const away = home === challenge.challenger ? challenge.opponent : challenge.challenger;

          await challenge.channel.send(
            `🏒 **Random Challenge Match Ready!**\n${nhlEmojiMap[awayTeam]} <@${away.id}> **at** ${nhlEmojiMap[homeTeam]} <@${home.id}>`
          );
        } else if (challenge.type === 'fixed-teams') {
          // Start team pick session
          startTeamPickSession(challenge.channel, challenge.challenger, challenge.opponent);
        }

        activeChallenges.delete(challengeID);
      }

      if (action === 'decline') {
        await interaction.update({ content: `❌ <@${challenge.opponent.id}> declined the challenge from <@${challenge.challenger.id}>.`, components: [] });
        activeChallenges.delete(challengeID);
      }
    }
  });
}

// ============================================================
// Challenge command handler
async function handleChallenge(interaction) {
  const challenger = interaction.user;
  const opponent = interaction.options.getUser('opponent');

  if (!opponent) {
    await interaction.reply({ content: '⚠️ You must specify a user to challenge.', ephemeral: true });
    return;
  }

  if (opponent.id === challenger.id) {
    await interaction.reply({ content: '⚠️ You cannot challenge yourself.', ephemeral: true });
    return;
  }

  const challengeID = generateChallengeID();
  const type = interaction.commandName === 'challenge-opponent-random-teams' ? 'random-teams' : 'fixed-teams';

  activeChallenges.set(challengeID, {
    challenger: { id: challenger.id, username: challenger.username },
    opponent: { id: opponent.id, username: opponent.username },
    type,
    status: 'pending',
    channel: interaction.channel
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`accept_${challengeID}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`decline_${challengeID}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({ content: `🏒 <@${opponent.id}>, you have been challenged by <@${challenger.id}>! Do you accept?`, components: [row] });
}
