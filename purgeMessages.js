import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const CHANNEL_ID = '1433073501333487657';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel.isTextBased()) return console.error('Not a text channel');

  let fetched;
  do {
    fetched = await channel.messages.fetch({ limit: 100 });
    if (fetched.size === 0) break;

    for (const msg of fetched.values()) {
      const age = Date.now() - msg.createdTimestamp;
      try {
        if (age < 14 * 24 * 60 * 60 * 1000) {
          await msg.delete(); // bulkDelete won’t work for old messages
        } else {
          await msg.delete(); // delete individually for old messages
        }
        console.log(`Deleted: ${msg.id}`);
      } catch (err) {
        console.error(`Failed to delete ${msg.id}:`, err.message);
      }
    }
  } while (fetched.size > 0);

  console.log('✅ Channel fully cleared');
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
