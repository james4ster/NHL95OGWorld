// teamPick.js
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';

// ============================================================
// Track ongoing team pick sessions
// key: sessionID, value: { channel, player1, player2, picks }
const teamPickSessions = new Map();

export function setupTeamPickCommands(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    // Handle direct /pickteams command if you want
    if (interaction.isChatInputCommand() && interaction.commandName === 'pickteams') {
      const player1 = interaction.user;
      const player2 = interaction.options.getUser('opponent');
      if (!player2) {
        await interaction.reply({ content: '⚠️ You must specify an opponent.', ephemeral: true });
        return;
      }
      startTeamPickSession(interaction.channel, player1, player2);
    }

    // Handle dropdown selections
    if (interaction.isStringSelectMenu()) {
      const sessionID = interaction.customId.split('_')[1];
      const session = teamPickSessions.get(sessionID);
      if (!session) {
        await interaction.reply({ content: '⚠️ This team pick session no longer exists.', ephemeral: true });
        return;
      }

      const userID = interaction.user.id;
      if (![session.player1.id, session.player2.id].includes(userID)) {
        await interaction.reply({ content: '⚠️ You are not part of this session.', ephemeral: true });
        return;
      }

      // Save pick
      const teamCode = interaction.values[0];
      session.picks[userID] = teamCode;

      await interaction.update({ content: `✅ <@${userID}> picked ${nhlEmojiMap[teamCode]} ${teamCode}`, components: [] });

      // If both picked, announce match
      if (session.picks[session.player1.id] && session.picks[session.player2.id]) {
        const player1Team = session.picks[session.player1.id];
        const player2Team = session.picks[session.player2.id];

        // Random home/away
        const home = Math.random() < 0.5 ? session.player1 : session.player2;
        const away = home === session.player1 ? session.player2 : session.player1;
        const homeTeam = home === session.player1 ? player1Team : player2Team;
        const awayTeam = away === session.player1 ? player1Team : player2Team;

        session.channel.send(
          `🏒 **Team Challenge Match Ready!**\n${nhlEmojiMap[awayTeam]} <@${away.id}> **at** ${nhlEmojiMap[homeTeam]} <@${home.id}>`
        );

        // Delete session
        teamPickSessions.delete(sessionID);
      }
    }
  });
}

// ============================================================
// Start a team pick session for two players
export function startTeamPickSession(channel, player1, player2) {
  const sessionID = Math.random().toString(36).substring(2, 10);
  teamPickSessions.set(sessionID, {
    channel,
    player1,
    player2,
    picks: {}
  });

  const teams = Object.keys(nhlEmojiMap);
  const options = teams.map(code => ({ label: code, value: code }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pickteam_${sessionID}`)
    .setPlaceholder('Select your team')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  channel.send({
    content: `🏒 Team selection time! <@${player1.id}> and <@${player2.id}>, pick your teams using the dropdowns below.`,
    components: [row]
  });
}
