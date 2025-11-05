// teamPick.js
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';

// ============================================================
// Helper: Split teams into pages for pagination
function paginateTeams(teams, pageSize = 25) {
  const pages = [];
  for (let i = 0; i < teams.length; i += pageSize) {
    pages.push(teams.slice(i, i + pageSize));
  }
  return pages;
}

// ============================================================
// Start the team pick session
export async function startTeamPickSession(interaction, challenger, opponent, fromChallenge = false) {
  const channel = interaction.channel;
  const teams = Object.keys(nhlEmojiMap);
  const pages = paginateTeams(teams);

  // Track current picks
  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  // Randomly decide who picks first
  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPicker = pickOrder[0];
  let currentPage = 0;

  // ============================================================
  // Function to render the current page of the dropdown
  const getDropdownRow = (pageIndex) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`team_select_${pageIndex}`)
      .setPlaceholder('Select your NHL team...')
      .addOptions(
        pages[pageIndex].map((team) => ({
          label: team,
          value: team,
          emoji: nhlEmojiMap[team],
        }))
      );

    return new ActionRowBuilder().addComponents(menu);
  };

  // ============================================================
  // Function to render pagination controls
  const getPaginationRow = (pageIndex) => {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('⬅️ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === pages.length - 1)
    );
    return row;
  };

  // ============================================================
  // Send initial message
  const message = await channel.send({
    content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
    components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
  });

  const collector = message.createMessageComponentCollector({
    time: 60000,
  });

  // ============================================================
  // Interaction collector
  collector.on('collect', async (i) => {
    // Handle pagination
    if (i.isButton()) {
      if (i.user.id !== currentPicker.id) {
        await i.reply({ content: '⚠️ It’s not your turn!', ephemeral: true });
        return;
      }

      if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
      if (i.customId === 'next_page' && currentPage < pages.length - 1) currentPage++;

      await i.update({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
      return;
    }

    // Handle team selection
    if (i.isStringSelectMenu()) {
      if (i.user.id !== currentPicker.id) {
        await i.reply({ content: '⚠️ It’s not your turn!', ephemeral: true });
        return;
      }

      const selectedTeam = i.values[0];
      picks[currentPicker.id] = selectedTeam;

      await i.update({
        content: `✅ <@${currentPicker.id}> picked **${nhlEmojiMap[selectedTeam]} ${selectedTeam}**!`,
        components: [],
      });

      // Switch turn or finish
      const nextPicker = pickOrder.find((p) => p.id !== currentPicker.id);
      if (picks[nextPicker.id]) {
        collector.stop('complete');
      } else {
        currentPicker = nextPicker;
        await channel.send({
          content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
          components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
        });
      }
    }
  });

  // ============================================================
  // Handle timeout or completion
  collector.on('end', async (_, reason) => {
    if (reason !== 'complete') {
      await channel.send('⏰ Team pick session timed out.');
      return;
    }

    const [team1, team2] = Object.values(picks);
    const [user1, user2] = Object.keys(picks);

    // Randomize home/away
    const home = Math.random() < 0.5 ? user1 : user2;
    const away = home === user1 ? user2 : user1;

    await channel.send(
      `🏒 **Match Ready!**\n${nhlEmojiMap[picks[away]]} <@${away}> **at** ${nhlEmojiMap[picks[home]]} <@${home}>`
    );
  });
}
