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
import fetch from 'node-fetch';
import { sendOrUpdateQueueMessage, handleInteraction, initializeQueue } from './queue.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';
import processGameState from "./processGameState.js";
//import readOgRomBinaryGameState from "./gameStateParsing/game-state/read-og-rom-game-state.js";
//import fs from "node:fs/promises";

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
app.get('/', (req, res) => res.send('🟢 NHL95Bot is alive and ready!'));

// Start Express server IMMEDIATELY for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// === Interaction Handler ===
client.on('interactionCreate', async (interaction) => {
  await handleInteraction(interaction, client);
});

// === Game State Upload Handler ===
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only trigger in the save-state upload channel
  if (message.channel.id !== STATE_UPLOAD_CHANNEL_ID) return;

  // No attachments? Ignore
  if (!message.attachments || message.attachments.size === 0) return;

  const attachment = message.attachments.first();
  const attachmentName = attachment.name;

  // Regex: ends with ".state" optionally followed by digits
  if (!/\.state\d*$/.test(attachmentName) && !attachmentName.endsWith('.bin')) {
    message.reply("⚠️ Please upload a valid game state file.");
    return;
  }

  try {
    // Download the file into your workspace
    const res = await fetch(attachment.url);
    const arrayBuffer = await res.arrayBuffer();
    await fs.writeFile("./NHL_95.state30", Buffer.from(arrayBuffer));

    message.reply("📥 Game state received. Processing...");

    // --- Call the parser here ---
    await processGameState();

    message.reply("✅ Game data successfully written to Google Sheets!");

  } catch (err) {
    console.error("❌ Error processing game state:", err);
    message.reply("❌ Error processing game state. Check logs.");
  }
});




// === Debug Events ===

    // WebSocket or Discord client errors
    client.on('error', (err) => {
      console.error('❌ Discord client error:', err);
    });
    
    // Shard-level errors (if sharding is used)
    client.on('shardError', (err) => {
      console.error('❌ Discord shard error:', err);
    });
    
    // Catch unhandled promise rejections that could crash your bot
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Promise Rejection:', reason);
    });
    
    // Catch errors thrown but not caught
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err);
    });




// === Ready Event ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('🟢 Bot ready event fired');
  console.log('🔹 QUEUE_CHANNEL_ID:', QUEUE_CHANNEL_ID);

  try {
    await initializeQueue(client);
    console.log('✅ Queue initialization complete');
  } catch (err) {
    console.error('❌ Error during queue initialization:', err);
  }
});

// === Discord Login ===
async function startDiscord() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN missing');
    process.exit(1);
  }

  try {
    console.log('🔹 Attempting Discord login...');
    console.log('🔹 Token present:', process.env.DISCORD_TOKEN ? 'Yes (length: ' + process.env.DISCORD_TOKEN.length + ')' : 'No');

    // Set a timeout to see if login hangs
    const loginTimeout = setTimeout(() => {
      console.warn('⚠️ Login taking longer than expected (30s)...');
    }, 30000);

    await client.login(process.env.DISCORD_TOKEN);
    clearTimeout(loginTimeout);
    console.log('🔹 Login promise resolved, waiting for ready event...');

  } catch (err) {
    console.error('❌ Discord login failed:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Full error:', err);
  }
}

// Start Discord bot (async, won't block Express server)
startDiscord();