/* 
Main bot file for NHL95OGBot
 - Discord bot setup
 - Capture new Discord joiners automatically when the join the discord server - write to PlayerMaster tab

 */

// === Imports ===
console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import { setupQueueCommands } from './queue.js';

// === Discord Bot Setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
handleGuildMemberAdd(client); // Optional welcome messages

// === Function to write new member to Google Sheets ===
async function writePlayerToSheet(discordId, username, displayName, joinDate) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'PlayerMaster!A:E',  // A=Discord ID, B=Username, C=Display Name, D=Join Date
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[discordId, username, displayName, joinDate]],
    },
  });

  console.log(`✅ Added ${username} to Players tab`);
}

// === Event listener for new members ===
// === When new member joins the server, write to PlayerMaster tab ===
client.on('guildMemberAdd', async (member) => {
  const discordId = member.id;
  const username = member.user.tag;
  const displayName = member.displayName; 
  const joinDate = new Date().toLocaleString();

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // 1️⃣ Check if Discord ID already exists in PlayerMaster (column A)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:A',
    });

    const existingIds = res.data.values ? res.data.values.flat() : [];
    if (existingIds.includes(discordId)) {
      console.log(`ℹ️ ${username} already exists in PlayerMaster, skipping insert.`);
    } else {
      // 2️⃣ Add new player
      await writePlayerToSheet(discordId, username, displayName, joinDate);
    }

  } catch (err) {
    console.error('❌ Error checking or writing PlayerMaster:', err);
  }

  // === Assign default role of general-player ===
  const roleId = '1433493333149352099';
  const role = member.guild.roles.cache.get(roleId);
  if (role) {
    try {
      await member.roles.add(role);
      console.log(`✅ Assigned default role to ${username}`);
    } catch (err) {
      console.error(`❌ Failed to assign role to ${username}:`, err);
    }
  }
});


// === Express Server ===
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🟢 NHL95OGBot is alive and ready to serve!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// === Register queue commands with the client ===
setupQueueCommands(client);

// === Login to Discord ===
(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
  } catch (err) {
    console.error('❌ Discord login failed:', err);
    console.error(err.stack);
  }
})();
// The export was used to test testCaptureUser.js
//export { writePlayerToSheet };