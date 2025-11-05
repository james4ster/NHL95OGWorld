import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  // Random queue
  new SlashCommandBuilder()
    .setName('play-random')
    .setDescription('Join the queue to play a game with a random opponent and randomized teams and home/away'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the rated-games queue'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('See who is currently in the queue waiting to play'),

  // Challenge opponent (random teams)
  new SlashCommandBuilder()
    .setName('challenge-opponent-random-teams')
    .setDescription('Challenge another player to a game with random teams and randomized home/away')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('The player you want to challenge')
        .setRequired(true)
    ),

  // Challenge opponent (fixed teams / pick)
  new SlashCommandBuilder()
    .setName('challenge-opponent-fixed-teams')
    .setDescription('Challenge another player to a game where you each pick teams')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('The player you want to challenge')
        .setRequired(true)
    ),

  // Pick teams directly
  new SlashCommandBuilder()
    .setName('pickteams')
    .setDescription('Pick teams for a match with another player')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('The other player')
        .setRequired(true)
    )
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
