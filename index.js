/* 
Main bot file for NHL95OGBot
 - Discord bot setup
 - Capture new Discord joiners automatically when the join the discord server - write to PlayerMaster tab
 - Assigns default ELO (1500) to new players in RawStandings
 - Assigns default role of general-player to new players
 */

// === Imports ===
console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import { setupQueueCommands } from './queue.js';
import { setupChallengeCommands } from './challenge.js'; 
import { setupTeamPickCommands } from './teamPick.js';

// === Discord Bot Setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
handleGuildMemberAdd(client); // New joiner function

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
// === Event listener for new members ===
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

    // === Fetch existing Discord IDs in PlayerMaster ===
    const playerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:A',
    });
    const existingIds = playerRes.data.values ? playerRes.data.values.flat() : [];

    if (existingIds.includes(discordId)) {
      console.log(`ℹ️ ${username} already exists in PlayerMaster, skipping insert.`);
    } else {
      // === Add new player ===
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'PlayerMaster!A:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[discordId, username, displayName, joinDate]] },
      });
      console.log(`✅ Added ${username} to PlayerMaster`);

      // === Fetch RawStandings once ===
      const rawRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'RawStandings!A:AO', // include AM:AO
      });
      const data = rawRes.data.values || [];

      const rowIndex = data.findIndex(row => row[0] === discordId);
      if (rowIndex !== -1) {
        const currentElo = data[rowIndex][38]; // Column AM
        const highestElo = data[rowIndex][39]; // Column AN
        const lowestElo = data[rowIndex][40];  // Column AO

        if (!currentElo) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: `RawStandings!AM${rowIndex + 1}:AO${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[1500, 1500, 1500]] },
          });
          console.log(`✅ Set default ELO = 1500 (current, highest, lowest) for ${username}`);
        } else {
          console.log(`ℹ️ ${username} already has an ELO: ${currentElo} (High: ${highestElo}, Low: ${lowestElo})`);
        }
      } else {
        console.log(`⚠️ Discord ID ${discordId} not found in RawStandings`);
      }
    }

    // === Assign default role ===
    const roleId = '1433493333149352099';
    const role = member.guild.roles.cache.get(roleId);
    if (role) {
      await member.roles.add(role);
      console.log(`✅ Assigned default role to ${username}`);
    }

  } catch (err) {
    console.error('❌ Error processing new member:', err);
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
setupQueueCommands(client);       // /play-random, /leave, /queue
setupChallengeCommands(client);   // /challenge-opponent-random-teams, /challenge-opponent-fixed-teams
setupTeamPickCommands(client);    // /pickteams (optional)

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
