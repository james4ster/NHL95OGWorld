import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds] // minimal intent just to connect
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
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
