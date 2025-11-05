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
function paginateTeams(teams, pageSizes = [14, 12]) {
  const pages = [];
  let start = 0;
  for (let size of pageSizes) {
    pages.push(teams.slice(start, start + size));
    start += size;
  }
  return pages;
}

// ============================================================
// Start the team pick session
export async function startTeamPickSession(channel, challenger, opponent) {
  const teams = Object.keys(nhlEmojiMap);
  const pages = paginateTeams(teams); // first page 14, second page rest
  const pickerPages = {
    [challenger.id]: 0,
    [opponent.id]: 0,
  };

  // Track picks
  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  // Randomly decide who picks first
  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPicker = pickOrder[0];

  // ============================================================
  // Function to render the current page of the dropdown
  const getDropdownRow = (pickerId) => {
    const pageIndex = pickerPages[pickerId];
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`team_select_${pickerId}`)
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
  const getPaginationRow = (pickerId) => {
    const pageIndex = pickerPages[pickerId];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`prev_page_${pickerId}`)
        .setLabel('⬅️ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(`next_page_${pickerId}`)
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
    components: [getDropdownRow(currentPicker.id), getPaginationRow(currentPicker.id)],
  });

  const collector = message.createMessageComponentCollector({
    time: 60000,
  });

  // ============================================================
  // Interaction collector
  collector.on('collect', async (i) => {
    // Only current picker can interact
    if (i.user.id !== currentPicker.id) {
      await i.reply({ content: '⚠️ It’s not your turn!', ephemeral: true });
      return;
    }

    // Handle pagination
    if (i.isButton()) {
      if (i.customId.startsWith('prev_page')) {
        pickerPages[i.user.id] = Math.max(pickerPages[i.user.id] - 1, 0);
      } else if (i.customId.startsWith('next_page')) {
        pickerPages[i.user.id] = Math.min(pickerPages[i.user.id] + 1, pages.length - 1);
      }

      await i.update({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPicker.id), getPaginationRow(currentPicker.id)],
      });
      return;
    }

    // Handle team selection
    if (i.isStringSelectMenu()) {
      const selectedTeam = i.values[0];
      picks[currentPicker.id] = selectedTeam;

      await i.update({
        content: `✅ <@${currentPicker.id}> picked **${nhlEmojiMap[selectedTeam]} ${selectedTeam}**!`,
        components: [],
      });

      // Switch turn or finish
      const nextPicker = pickOrder.find((p) => !picks[p.id]);
      if (!nextPicker) {
        collector.stop('complete');
        return;
      }

      currentPicker = nextPicker;

      // Edit same message for next picker
      await message.edit({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow(currentPicker.id), getPaginationRow(currentPicker.id)],
      });
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
