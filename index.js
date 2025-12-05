/*
Main bot file for NHL95OGBot
- Discord bot setup
- Capture new Discord joiners automatically
- Assigns default ELO (1500) to new players in RawStandings
- Assigns default role of general-player to new players
- Persistent button-based queue in a dedicated channel
*/

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

// === Global Debugging ===
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

// === Imports ===
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import fetch from 'node-fetch'; // only if not global
import { sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel } from './queue.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';
import readOgRomBinaryGameState from "./gameStateParsing/game-state/read-og-rom-game-state.js";
import fs from "node:fs/promises";

// === Config Variables ===
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const STATE_UPLOAD_CHANNEL_ID = process.env.SAVE_STATE_CHANNEL_ID;

// === Discord Client Setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// === Welcome / Add New Players ===
handleGuildMemberAdd(client);

// === Google Sheets Helper ===
async function writePlayerToSheet(discordId, username, displayName, joinDate) {
  try {
    const raw = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const credentials = { ...raw, private_key: raw.private_key.replace(/\\n/g, '\n') };
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
  } catch (err) {
    console.error('❌ Error writing player to sheet:', err);
  }
}

// === New Member Event ===
client.on('guildMemberAdd', async (member) => {
  const discordId = member.id;
  const username = member.user.tag;
  const displayName = member.displayName;
  const joinDate = new Date().toLocaleString();

  try {
    const raw = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const credentials = { ...raw, private_key: raw.private_key.replace(/\\n/g, '\n') };
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

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

      // Set default ELO
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

// === Express Server for Render Health Check ===
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready!'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// === Interaction Handler ===
client.on('interactionCreate', async (interaction) => {
  await handleInteraction(interaction, client);
});

// === Discord Login + Queue Initialization ===
(async () => {
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN missing');
    return;
  }
  try {
    console.log('🔹 Logging in...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
  } catch (err) {
    console.error('❌ Discord login failed:', err);
  }
})();

// === Ready Event (v14) ===
client.once('ready', async () => {
  console.log('🟢 Bot is online');
  console.log('🔹 QUEUE_CHANNEL_ID inside ready:', QUEUE_CHANNEL_ID);
  try {
    console.log('Fetching queue channel...');
    const queueMsg = await resetQueueChannel(client, { clearMemory: false });
    console.log('Sending/Updating queue message...');
    if (!queueMsg) console.warn('⚠️ Queue message not found or failed to send');
    else console.log('✅ Queue message ready:', queueMsg.id);
  } catch (err) {
    console.error('❌ Error during ready queue flush:', err);
  }
});


