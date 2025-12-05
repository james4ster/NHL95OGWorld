/*
Main bot file for NHL95OGBot
- Discord bot setup
- Capture new Discord joiners automatically
- Assigns default ELO (1500) to new players in RawStandings
- Assigns default role of general-player to new players
- Persistent button-based queue in a dedicated channel
*/

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

// === Imports ===
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';

// Persistent queue
import { sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel } from './queue.js';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

// Game state parsing
import readOgRomBinaryGameState from "./gameStateParsing/game-state/read-og-rom-game-state.js"
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

// === Welcome / add new players ===
handleGuildMemberAdd(client);

// === Google Sheets Helper: Add player to PlayerMaster ===
async function writePlayerToSheet(discordId, username, displayName, joinDate) {
  const raw = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const credentials = {
    ...raw,
    private_key: raw.private_key.replace(/\\n/g, '\n'),
  };
  
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
    const raw = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    const credentials = {
      ...raw,
      private_key: raw.private_key.replace(/\\n/g, '\n'),
    };

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
      // Add to PlayerMaster
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'PlayerMaster!A:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[discordId, username, displayName, joinDate]] },
      });
      console.log(`✅ Added ${username} to PlayerMaster`);

      // Set default ELO in RawStandings if empty
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

// === Express Server for health check ===
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready to serve!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// === Interaction Handler for Buttons ===
client.on('interactionCreate', async (interaction) => {
  await handleInteraction(interaction, client);
});

// === Game State Upload Handler ===
client.on('messageCreate', async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only process files dropped into the save-state channel
    if (message.channel.id !== SAVE_STATE_CHANNEL_ID) return;

    // No attachments? Ignore.
    if (message.attachments.size === 0) return;

    // Find any .state attachment
    const stateAttachment = [...message.attachments.values()]
      .find(att => att.name && att.name.endsWith('.state'));

    if (!stateAttachment) return; // other file type, ignore

    console.log(`📥 Detected .state upload: ${stateAttachment.name}`);

    // Download file into memory
    const response = await fetch(stateAttachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const nodeBuffer = Buffer.from(arrayBuffer);

    // Convert to simple ArrayBuffer for parser
    const gameFileBuffer = nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength
    );

    // Parse game state
    const gameData = await readOgRomBinaryGameState(gameFileBuffer);

    console.log("📊 Parsed Game Data:", gameData.data);

    // TODO: hook your sheets logic here
    // await writeGameToSheets(gameData.data);

    await message.reply("✅ Save state processed!");

  } catch (err) {
    console.error("❌ Error processing .state file:", err);
    await message.reply("❌ Could not process this save file — check logs.");
  }
});



// === Discord Login + Queue Initialization ===
(async () => {
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing! Bot cannot log in.');
    return;
  } else {
    console.log('✅ DISCORD_TOKEN is set, attempting login...');
  }

  (async () => {
    console.log('🔹 Attempting Discord login...');
    try {
      await client.login(process.env.DISCORD_TOKEN);
      console.log(`✅ Logged in as ${client.user.tag}`);
    } catch (err) {
      console.error('❌ Discord login failed:', err);
    }
    console.log('🔹 client.login() finished');
  })();

})();

// === Ready Event: flush old queue messages ===
client.once('ready', async () => {
  try {
    console.log('🧹 Startup flush: clearing old messages in queue channel');

    // Only delete messages in the channel, do NOT touch in-memory queue
    await resetQueueChannel(client, { clearMemory: false });

    console.log('✅ Queue channel flushed, in-memory queue preserved');
  } catch (err) {
    console.error('❌ Error during ready queue flush:', err);
  }
});
