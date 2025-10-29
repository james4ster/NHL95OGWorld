import { Client, GatewayIntentBits } from 'discord.js';

console.log('Token length:', process.env.DISCORD_TOKEN?.length); // sanity check

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  process.exit(0); // stop after testing
});

client.on('error', (err) => {
  console.error('❌ Client error:', err);
});

(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log('Login promise resolved');
  } catch (err) {
    console.error('❌ Login failed:', err);
  }
})();
