import { Client, GatewayIntentBits } from 'discord.js';

// Create client with all necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,            // Required for guild-related events
    GatewayIntentBits.GuildMessages,     // Required to read messages
    GatewayIntentBits.MessageContent,    // Required to access message content
    GatewayIntentBits.GuildMembers       // Required to detect member joins
  ]
});

(async () => {
  console.log('🔹 Logging in...');
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
  } catch (err) {
    console.error('❌ Discord login failed:', err);
  }
})();

// Ready event
client.on('ready', () => {
  console.log('🟢 Bot ready and online!');
});

// Example interaction/message listener
client.on('interactionCreate', async (interaction) => {
  console.log('🔔 Interaction received:', interaction.id);
  // handleInteraction(interaction); // Hook your existing handler here
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  console.log('📩 Message received:', message.content);
});
