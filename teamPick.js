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
function paginateTeams(teams, firstPageSize = 14) {
  return [teams.slice(0, firstPageSize), teams.slice(firstPageSize)];
}

// ============================================================
// Start the team pick session
export async function startTeamPickSession(channel, challenger, opponent) {
  const teams = Object.keys(nhlEmojiMap);
  const pages = paginateTeams(teams);

  // Track current picks
  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  // Randomly decide who picks first
  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPickerIndex = 0;
  let currentPage = 0;

  // ============================================================
  // Build dropdown row for a given page
  const getDropdownRow = (pageIndex) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`team_select`)
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
  // Build pagination buttons
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
  // Send initial message
  let message = await channel.send({
    content: `🎯 <@${pickOrder[currentPickerIndex].id}>, it's your turn to pick your team!`,
    components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
  });

  // ============================================================
  // Collector for dropdown and button interactions
  const collector = message.createMessageComponentCollector({
    componentType: ['STRING_SELECT', 'BUTTON'],
    time: 120000, // 2 minutes
  });

  collector.on('collect', async (i) => {
    const currentPicker = pickOrder[currentPickerIndex];

    // Not this user's turn
    if (i.user.id !== currentPicker.id) {
      await i.reply({ content: '⚠️ It’s not your turn!', ephemeral: true });
      return;
    }

    // === Handle pagination buttons ===
    if (i.isButton()) {
      if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
      if (i.customId === 'next_page' && currentPage < pages.length - 1) currentPage++;

      await i.update({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
      return;
    }

    // === Handle team selection ===
    if (i.isStringSelectMenu()) {
      const selectedTeam = i.values[0];
      picks[currentPicker.id] = selectedTeam;

      await i.update({
        content: `✅ <@${currentPicker.id}> picked **${nhlEmojiMap[selectedTeam]} ${selectedTeam}**!`,
        components: [],
      });

      // Check if next player already picked
      const nextPickerIndex = (currentPickerIndex + 1) % 2;
      if (picks[pickOrder[nextPickerIndex].id]) {
        collector.stop('complete');
        return;
      }

      // Switch turn
      currentPickerIndex = nextPickerIndex;
      currentPage = 0; // reset to first page for next picker

      message = await channel.send({
        content: `🎯 <@${pickOrder[currentPickerIndex].id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'complete') {
      await channel.send('⏰ Team pick session timed out.');
      return;
    }

    const [user1, user2] = Object.keys(picks);
    const [team1, team2] = Object.values(picks);

    // Randomize home/away
    const home = Math.random() < 0.5 ? user1 : user2;
    const away = home === user1 ? user2 : user1;

    await channel.send(
      `🏒 **Match Ready!**\n${nhlEmojiMap[picks[away]]} <@${away}> **at** ${nhlEmojiMap[picks[home]]} <@${home}>`
    );
  });
}
