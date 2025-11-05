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
function paginateTeams(teams) {
  // first page 14 teams, second page the rest
  const pages = [];
  pages.push(teams.slice(0, 14));
  if (teams.length > 14) pages.push(teams.slice(14));
  return pages;
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
  let currentPicker = pickOrder[0];
  let currentPage = 0;

  // ============================================================
  // Function to render the current page of the dropdown
  const getDropdownRow = (pageIndex) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`team_select_${currentPicker.id}_${pageIndex}`)
      .setPlaceholder('Select your team...')
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
  // Function to render pagination buttons
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
  // Send initial message for first picker
  const message = await channel.send({
    content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
    components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
  });

  const collector = message.createMessageComponentCollector({ time: 60000 });

  // ============================================================
  // Handle interactions
  collector.on('collect', async (i) => {
    if (i.user.id !== currentPicker.id) {
      await i.reply({ content: '⚠️ It’s not your turn!', ephemeral: true });
      return;
    }

    // --------------------
    // Pagination buttons
    if (i.isButton()) {
      if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
      if (i.customId === 'next_page' && currentPage < pages.length - 1) currentPage++;

      await i.update({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
      return;
    }

    // --------------------
    // Team selection
    if (i.isStringSelectMenu()) {
      const selectedTeam = i.values[0];
      picks[currentPicker.id] = selectedTeam;

      // Acknowledge current interaction
      await i.update({
        content: `✅ <@${currentPicker.id}> picked **${nhlEmojiMap[selectedTeam]} ${selectedTeam}**!`,
        components: [],
      });

      // Determine next picker
      const nextPicker = pickOrder.find((p) => p.id !== currentPicker.id);

      if (picks[nextPicker.id]) {
        collector.stop('complete'); // both picked
      } else {
        // Switch to next picker
        currentPicker = nextPicker;
        currentPage = 0; // reset pagination for next player

        await channel.send({
          content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
          components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
        });
      }
    }
  });

  // ============================================================
  // On completion or timeout
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
