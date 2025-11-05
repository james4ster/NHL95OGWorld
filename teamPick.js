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
function paginateTeams(teams, pageSizes = [14]) {
  const pages = [];
  let start = 0;
  for (let size of pageSizes) {
    pages.push(teams.slice(start, start + size));
    start += size;
  }
  if (start < teams.length) pages.push(teams.slice(start)); // remaining teams
  return pages;
}

// ============================================================
// Start the team pick session
export async function startTeamPickSession(channel, challenger, opponent) {
  const teams = Object.keys(nhlEmojiMap);
  const pages = paginateTeams(teams, [14]); // first page 14, second page rest

  // Track picks
  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  // Randomly decide who picks first
  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPickerIndex = 0;
  let currentPage = 0;

  // ============================================================
  const getDropdownRow = (pageIndex) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('team_select')
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
    content: `🎯 <@${pickOrder[currentPickerIndex].id}>, it's your turn to pick your team!`,
    components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
  });

  const collector = message.createMessageComponentCollector({ time: 60000 });

  collector.on('collect', async (i) => {
    // Only allow current picker
    if (i.user.id !== pickOrder[currentPickerIndex].id) {
      await i.reply({ content: '⚠️ It’s not your turn!', flags: 64 }); // ephemeral
      return;
    }

    // Pagination buttons
    if (i.isButton()) {
      if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
      if (i.customId === 'next_page' && currentPage < pages.length - 1) currentPage++;

      await i.update({
        content: `🎯 <@${pickOrder[currentPickerIndex].id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
      });
      return;
    }

    // Team selection
    if (i.isStringSelectMenu()) {
      const selectedTeam = i.values[0];
      picks[pickOrder[currentPickerIndex].id] = selectedTeam;

      // Switch turn or finish
      currentPickerIndex++;
      if (currentPickerIndex < pickOrder.length) {
        currentPage = 0; // reset pagination for next picker
        await i.update({
          content: `🎯 <@${pickOrder[currentPickerIndex].id}>, it's your turn to pick your team!`,
          components: [getDropdownRow(currentPage), getPaginationRow(currentPage)],
        });
      } else {
        // End of picking
        await i.update({
          content: `✅ Picks complete!\n<@${challenger.id}> picked **${nhlEmojiMap[picks[challenger.id]]} ${picks[challenger.id]}**\n<@${opponent.id}> picked **${nhlEmojiMap[picks[opponent.id]]} ${picks[opponent.id]}**`,
          components: [],
        });

        // Randomize home/away
        const homeId = Math.random() < 0.5 ? challenger.id : opponent.id;
        const awayId = homeId === challenger.id ? opponent.id : challenger.id;

        await channel.send(
          `🏒 **Match Ready!**\n${nhlEmojiMap[picks[awayId]]} <@${awayId}> **at** ${nhlEmojiMap[picks[homeId]]} <@${homeId}>`
        );
        collector.stop('complete');
      }
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'complete') {
      await channel.send('⏰ Team pick session timed out.');
    }
  });
}
