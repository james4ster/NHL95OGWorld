import { nhlEmojiMap } from './nhlEmojiMap.js';
import { EmbedBuilder } from 'discord.js';

export async function handleScheduleCommand(interaction) {
  try {
    // Always defer first
    await interaction.deferReply();

    const discordId = interaction.user.id;
    const url = `https://script.google.com/macros/s/AKfycbyMlsEWIiQOhojzLVe_VNirLVVhymltp1fMxLHH2XrVnQZbln2Qbhw36fDz6b1I4UqS/exec?report=schedule&discordId=${discordId}`;

    let json;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (err) {
      console.error('❌ Failed fetching schedule:', err);
      return safeReply(interaction, '❌ Could not fetch schedule. Try again later.');
    }

    const data = json?.data;
    if (!data) return safeReply(interaction, '❌ No schedule data found.');

    const { record, schedule, userTeam, allTimeVsUpcoming, managerToTeam } = data;

    // Provide defaults if any property is missing
    const wins = schedule?.wins || [];
    const losses = schedule?.losses || [];
    const unplayed = schedule?.unplayed || [];

    const emoji = (team) => nhlEmojiMap[team] || team;

    let message = `__**My name is Ed and my favorite movie is Nyad:**__\n\n`;
    message += `**Record:** ${record?.wins ?? 0}-${record?.losses ?? 0}-${record?.ties ?? 0}\n\n`;

    const formatGame = (game) => {
      if (!game) return '';
      const opponent = game.opponent ?? '';
      const isHome = game.homeSide ?? true;
      const homeTeam = isHome ? userTeam : opponent;
      const awayTeam = isHome ? opponent : userTeam;
      const vsString = `${emoji(homeTeam)} ${homeTeam} vs ${emoji(awayTeam)} ${awayTeam}`;
      const score = game.scoreString || '- — -';
      const outcome = game.result === 'W' ? '✅' : game.result === 'L' ? '❌' : '';
      return `${outcome} ${vsString} ${score}`;
    };

    if (wins.length) message += `__**Wins:**__\n${wins.map(formatGame).join('\n')}\n\n`;
    if (losses.length) message += `__**Losses:**__\n${losses.map(formatGame).join('\n')}\n\n`;
    if (unplayed.length) message += `__**Upcoming Games:**__\n${unplayed.map(formatGame).join('\n')}\n\n`;

    if (allTimeVsUpcoming && Object.keys(allTimeVsUpcoming).length) {
      message += `__**All Time Record vs Upcoming Opponents:**__\n`;
      for (const [manager, rec] of Object.entries(allTimeVsUpcoming)) {
        const team = managerToTeam?.[manager];
        const teamEmoji = team ? nhlEmojiMap[team] || '' : '';
        message += `${teamEmoji} ${manager}: ${rec?.wins ?? 0}-${rec?.losses ?? 0}-${rec?.ties ?? 0}\n`;
      }
    }

    // Send safely
    await safeReply(interaction, message);

  } catch (error) {
    console.error('❌ Unexpected error in handleScheduleCommand:', error);
    await safeReply(interaction, '❌ Failed to fetch your schedule.');
  }
}

// Helper to safely send messages or embeds
async function safeReply(interaction, message) {
  try {
    if (message.length <= 2000) {
      await interaction.editReply(message);
    } else if (message.length <= 4096) {
      const embed = new EmbedBuilder().setDescription(message);
      await interaction.editReply({ embeds: [embed] });
    } else {
      const chunks = splitMessage(message, 4096);
      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder().setDescription(chunks[i]);
        if (i === 0) {
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.followUp({ embeds: [embed] }).catch(console.error);
        }
      }
    }
  } catch (err) {
    console.error('❌ Failed to send message:', err);
    // Fallback if original message is gone or webhook invalid
    if (!interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(console.error);
    }
  }
}

function splitMessage(text, maxLength = 4096) {
  const lines = text.split('\n');
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    if ((chunk + line + '\n').length > maxLength) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
