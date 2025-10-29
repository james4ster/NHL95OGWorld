import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ✅ Your actual bot info
const CLIENT_ID = '1394409621229408296';        // your bot's client ID
const GUILD_ID = '1196260352061620275';         // your server (guild) ID

(async () => {
  try {
    console.log(`Removing all guild commands from guild ID ${GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log('✅ All guild commands removed successfully.');
  } catch (error) {
    console.error('❌ Error removing guild commands:', error);
  }
})();
