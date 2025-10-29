// deployCommands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;  // put your bot’s client ID in .env
const GUILD_ID = process.env.GUILD_ID;    // optional if you want to test in one guild only

// Define commands directly here (same ones you register in index.js)
const commands = [
  new SlashCommandBuilder()
    .setName('reports')
    .setDescription('Ask Ed to run some reports'),
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Ask Ed to show your schedule'),
  new SlashCommandBuilder()
    .setName('myelo')
    .setDescription('Ask Ed to show ELO history'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🚀 Registering ${commands.length} slash commands...`);

    // 🌍 Global commands
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );

    // 👇 If you want faster updates while testing, you can use guild commands instead
    // await rest.put(
    //   Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    //   { body: commands },
    // );

    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
