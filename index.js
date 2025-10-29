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
  const displayName = member.displayName; // nickname or username fallback
  const joinDate = new Date().toLocaleString(); // capture join timestamp

  try {
    await writePlayerToSheet(discordId, username, displayName, joinDate);
  } catch (err) {
    console.error('❌ Failed to add new member to Players tab:', err);
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