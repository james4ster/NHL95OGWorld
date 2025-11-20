/*
Main bot file for NHL95OGBot
- Discord bot setup
- Capture new Discord joiners automatically when they join the server
- Assigns default ELO (1500) to new players in RawStandings
- Assigns default role of general-player to new players
- Persistent button-based queue in a dedicated channel
- Randomized matchup for 2 players with emojis and ELO display
*/

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

// === Imports ===
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';

// ⭐ Persistent button queue
import { sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel, tryMatchup } from './queue.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

// === Config Variables ===
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// === Discord Client Setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// === Welcome / add new players ===
handleGuildMemberAdd(client);

// === Google Sheets Helper: Add player to PlayerMaster ===
async function writePlayerToSheet(discordId, username, displayName, joinDate) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'PlayerMaster!A:E',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[discordId, username, displayName, joinDate]],
    },
  });

  console.log(`✅ Added ${username} to PlayerMaster`);
}

// === New Member Event ===
client.on('guildMemberAdd', async (member) => {
  const discordId = member.id;
  const username = member.user.tag;
  const displayName = member.displayName;
  const joinDate = new Date().toLocaleString();

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if player already exists
    const playerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:A',
    });
    const existingIds = playerRes.data.values ? playerRes.data.values.flat() : [];

    if (!existingIds.includes(discordId)) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'PlayerMaster!A:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[discordId, username, displayName, joinDate]] },
      });
      console.log(`✅ Added ${username} to PlayerMaster`);

      // Set default ELO in RawStandings
      const rawRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'RawStandings!A:AO',
      });
      const data = rawRes.data.values || [];
      const rowIndex = data.findIndex(row => row[0] === discordId);

      if (rowIndex !== -1 && !data[rowIndex][38]) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `RawStandings!AM${rowIndex + 1}:AO${rowIndex + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[1500, 1500, 1500]] },
        });
        console.log(`✅ Set default ELO = 1500 for ${username}`);
      }
    }

    // Assign default role
    const roleId = '1433493333149352099'; // general-player role
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role);

  } catch (err) {
    console.error('❌ Error processing new member:', err);
  }
});

// === Express Server ===
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready to serve!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// === Interaction Handler for Buttons ===
client.on('interactionCreate', async (interaction) => {
  await handleInteraction(interaction, client);

  // ⭐ Attempt a matchup if queue has >=2 players
  try {
    await tryMatchup(client, RATED_GAMES_CHANNEL_ID);
  } catch (err) {
    console.error('❌ Error handling matchup:', err);
  }
});

// === Discord Login + Queue Initialization ===
(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Reset queue channel: delete old messages, flush queue, send new persistent message with buttons
    await resetQueueChannel(client);

  } catch (err) {
    console.error('❌ Discord login failed:', err);
    console.error(err.stack);
  }
})();
