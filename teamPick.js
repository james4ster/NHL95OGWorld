// teamPick.js
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';

// ============================================================
// Paginate teams into pages: 14 first, rest second
function paginateTeams(teams) {
  const firstPage = teams.slice(0, 14);
  const secondPage = teams.slice(14);
  const pages = [firstPage];
  if (secondPage.length) pages.push(secondPage);
  return pages;
}

// ============================================================
// Start the team pick session
export async function startTeamPickSession(interaction, challenger, opponent) {
  const teams = Object.keys(nhlEmojiMap);
  const pages = paginateTeams(teams);

  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPicker = pickOrder[0];
  let currentPage = 0;
  let message; // Will store the dropdown message

  // ============================================================
  const getDropdownRow = (pageIndex) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`team_select_${pageIndex}_${currentPicker.id}`)
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

  const getPaginationRow = (pageIndex) => {
    return new ActionRowBuilder().addComponents(
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
  };

  // ============================================================
  message = await interaction.followUp({
    content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
    components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({
    time: 60000,
  });

  collector.on('collect', async (i) => {
    // Ignore if not current picker
    if (i.user.id !== currentPicker.id) {
      return i.reply({
        content: '⚠️ It’s not your turn!',
        ephemeral: true,
      });
    }

    // Handle pagination
    if (i.isButton()) {
      if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
      if (i.customId === 'next_page' && currentPage < pages.length - 1) currentPage++;

      return i.update({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
    }

    // Handle team selection
    if (i.isStringSelectMenu()) {
      const selectedTeam = i.values[0];
      picks[currentPicker.id] = selectedTeam;

      await i.update({
        content: `✅ <@${currentPicker.id}> picked **${nhlEmojiMap[selectedTeam]} ${selectedTeam}**!`,
        components: [],
      });

      const nextPicker = pickOrder.find((p) => p.id !== currentPicker.id);
      if (picks[nextPicker.id]) {
        collector.stop('complete');
      } else {
        currentPicker = nextPicker;
        currentPage = 0; // Reset to first page for next player

        message = await interaction.followUp({
          content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
          components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
          fetchReply: true,
        });
      }
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'complete') {
      return interaction.followUp('⏰ Team pick session timed out.');
    }

    const [team1, team2] = Object.values(picks);
    const [user1, user2] = Object.keys(picks);
    const home = Math.random() < 0.5 ? user1 : user2;
    const away = home === user1 ? user2 : user1;

    await interaction.followUp({
      content: `🏒 **Match Ready!**\n${nhlEmojiMap[picks[away]]} <@${away}> **at** ${nhlEmojiMap[picks[home]]} <@${home}>`,
    });
  });
}
