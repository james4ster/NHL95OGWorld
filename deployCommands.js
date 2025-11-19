import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  // /play command
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Join the queue to play a game with a random opponent and randomized teams'),

  // /queue command
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('See who is currently in the queue waiting to play')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // global commands
      { body: commands }
    );

    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
