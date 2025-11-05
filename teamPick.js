import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';

// --- List of all NHL teams ---
const NHL_TEAMS = [
  { label: 'ANA - Anaheim Ducks', value: 'ANA' },
  { label: 'BOS - Boston Bruins', value: 'BOS' },
  { label: 'BUF - Buffalo Sabres', value: 'BUF' },
  { label: 'CGY - Calgary Flames', value: 'CGY' },
  { label: 'CAR - Carolina Hurricanes', value: 'CAR' },
  { label: 'CHI - Chicago Blackhawks', value: 'CHI' },
  { label: 'COL - Colorado Avalanche', value: 'COL' },
  { label: 'CBJ - Columbus Blue Jackets', value: 'CBJ' },
  { label: 'DAL - Dallas Stars', value: 'DAL' },
  { label: 'DET - Detroit Red Wings', value: 'DET' },
  { label: 'EDM - Edmonton Oilers', value: 'EDM' },
  { label: 'FLA - Florida Panthers', value: 'FLA' },
  { label: 'LAK - Los Angeles Kings', value: 'LAK' },
  { label: 'MIN - Minnesota Wild', value: 'MIN' },
  { label: 'MTL - Montreal Canadiens', value: 'MTL' },
  { label: 'NSH - Nashville Predators', value: 'NSH' },
  { label: 'NJD - New Jersey Devils', value: 'NJD' },
  { label: 'NYI - New York Islanders', value: 'NYI' },
  { label: 'NYR - New York Rangers', value: 'NYR' },
  { label: 'OTT - Ottawa Senators', value: 'OTT' },
  { label: 'PHI - Philadelphia Flyers', value: 'PHI' },
  { label: 'PIT - Pittsburgh Penguins', value: 'PIT' },
  { label: 'SJS - San Jose Sharks', value: 'SJS' },
  { label: 'SEA - Seattle Kraken', value: 'SEA' },
  { label: 'STL - St. Louis Blues', value: 'STL' },
  { label: 'TBL - Tampa Bay Lightning', value: 'TBL' },
  { label: 'TOR - Toronto Maple Leafs', value: 'TOR' },
  { label: 'VAN - Vancouver Canucks', value: 'VAN' },
  { label: 'VGK - Vegas Golden Knights', value: 'VGK' },
  { label: 'WSH - Washington Capitals', value: 'WSH' },
  { label: 'WPG - Winnipeg Jets', value: 'WPG' },
];

// Split teams into pages of 25
const TEAMS_PER_PAGE = 25;
const PAGES = [];
for (let i = 0; i < NHL_TEAMS.length; i += TEAMS_PER_PAGE) {
  PAGES.push(NHL_TEAMS.slice(i, i + TEAMS_PER_PAGE));
}

export async function startTeamPickSession(interaction, player1, player2) {
  let currentPage = 0;
  const selections = {};

  const getComponents = (page) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`teamSelect_${page}`)
      .setPlaceholder('Select your team')
      .addOptions(PAGES[page]);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prevPage')
        .setLabel('⬅ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('nextPage')
        .setLabel('Next ➡')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === PAGES.length - 1)
    );

    return [new ActionRowBuilder().addComponents(menu), buttons];
  };

  const message = await interaction.reply({
    content: `🏒 **Team Selection Time!**\n\n${player1} and ${player2}, please pick your teams!`,
    components: getComponents(currentPage),
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({
    time: 60000,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'prevPage' || i.customId === 'nextPage') {
      currentPage =
        i.customId === 'nextPage'
          ? Math.min(currentPage + 1, PAGES.length - 1)
          : Math.max(currentPage - 1, 0);
      await i.update({ components: getComponents(currentPage) });
      return;
    }

    if (i.customId.startsWith('teamSelect_')) {
      const team = i.values[0];
      selections[i.user.id] = team;

      await i.reply({ content: `✅ You selected **${team}**`, ephemeral: true });

      if (Object.keys(selections).length === 2) {
        collector.stop('both_selected');
      }
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'both_selected') {
      const p1Team = selections[player1.id];
      const p2Team = selections[player2.id];

      await message.edit({
        content: `✅ **Team selection complete!**\n\n${player1} chose **${p1Team}**\n${player2} chose **${p2Team}**`,
        components: [],
      });
    } else {
      await message.edit({
        content: '⏰ Time expired before both players selected teams.',
        components: [],
      });
    }
  });
}
