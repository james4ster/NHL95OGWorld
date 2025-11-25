import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import { sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel, processPendingMatchups } from './queue.js';

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

handleGuildMemberAdd(client);

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

client.on('interactionCreate', async (interaction) => {
  await handleInteraction(interaction, client);
});

(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
  } catch (err) {
    console.error('❌ Discord login failed:', err);
  }
})();

client.once('ready', async () => {
  try {
    console.log('🧹 Startup flush: clearing old messages in queue channel');
    await resetQueueChannel(client, { clearMemory: false });
    console.log('✅ Queue channel flushed, in-memory queue preserved');

    // process any pending matchups left in memory after restart
    await processPendingMatchups(client);
  } catch (err) {
    console.error('❌ Error during ready queue flush:', err);
  }
});
