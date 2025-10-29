  // deployCommands.js
  import { REST, Routes, SlashCommandBuilder } from 'discord.js';
  import dotenv from 'dotenv';

  dotenv.config(); // make sure your .env has DISCORD_TOKEN and CLIENT_ID

  const commands = [
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Join the queue to play a game'),
    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Leave the game queue')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  (async () => {
    try {
      console.log('🚀 Registering slash commands...');

      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );

      console.log('✅ Slash commands registered successfully!');
    } catch (error) {
      console.error('❌ Error registering commands:', error);
    }
  })();
