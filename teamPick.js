// teamPick.js
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';

// ============================================================
// Start the team pick session
export async function startTeamPickSession(channel, challenger, opponent) {
  const teams = Object.keys(nhlEmojiMap);

  // Track picks
  const picks = {
    [challenger.id]: null,
    [opponent.id]: null,
  };

  // Randomly decide who picks first
  const pickOrder = Math.random() < 0.5 ? [challenger, opponent] : [opponent, challenger];
  let currentPicker = pickOrder[0];

  // ============================================================
  // Function to render the dropdown menu
  const getDropdownRow = () => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('team_select')
      .setPlaceholder('Select your NHL team...')
      .addOptions(
        teams.map((team) => ({
          label: team,
          value: team,
          emoji: nhlEmojiMap[team],
        }))
      );

    return new ActionRowBuilder().addComponents(menu);
  };

  // ============================================================
  // Send initial message
  const message = await channel.send({
    content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
    components: [getDropdownRow()],
  });

  const collector = message.createMessageComponentCollector({ time: 60000 });

  // ============================================================
  // Collector logic
  collector.on('collect', async (i) => {
    if (!i.isStringSelectMenu()) return;

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

    // Check if the other picker already picked
    const nextPicker = pickOrder.find((p) => p.id !== currentPicker.id);
    if (picks[nextPicker.id]) {
      collector.stop('complete');
    } else {
      currentPicker = nextPicker;
      await channel.send({
        content: `🎯 <@${currentPicker.id}>, it's your turn to pick your team!`,
        components: [getDropdownRow()],
      });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'complete') {
      await channel.send('⏰ Team pick session timed out.');
      return;
    }

    const [user1, user2] = Object.keys(picks);

    // Randomize home/away
    const home = Math.random() < 0.5 ? user1 : user2;
    const away = home === user1 ? user2 : user1;

    await channel.send(
      `🏒 **Match Ready!**\n${nhlEmojiMap[picks[away]]} <@${away}> **at** ${nhlEmojiMap[picks[home]]} <@${home}>`
    );
  });
}
