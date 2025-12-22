// scoreboardOutput.js
import { Client, GatewayIntentBits } from 'discord.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

export async function sendScoreboardMessage(gameData) {
  try {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
    await client.login(process.env.DISCORD_BOT_TOKEN);

    const channel = await client.channels.fetch(process.env.SCOREBOARD_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      console.error('❌ Scoreboard channel not found or not text-based');
      return;
    }

    const nhlEmojiMap = getNHLEmojiMap();

    const messageContent =
      `🏒 Final Score!\n` +
      `🚌 Away: ${gameData.awayPlayer} (${gameData.awayTeam}) ${nhlEmojiMap[gameData.awayTeam]} - Score: ${gameData.awayScore}\n` +
      `🏠 Home: ${gameData.homePlayer} (${gameData.homeTeam}) ${nhlEmojiMap[gameData.homeTeam]} - Score: ${gameData.homeScore}`;



    await channel.send({ content: messageContent });
    await client.destroy();
  } catch (err) {
    console.error('❌ Failed to send scoreboard message:', err);
  }
}
