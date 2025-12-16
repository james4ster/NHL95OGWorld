// updateDiscordIcons.js
import { google } from 'googleapis';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

export async function updateDiscordIcons(client) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch PlayerMaster data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'PlayerMaster!A2:E',
  });
  const rows = res.data.values || [];

  const updates = [];

  for (let i = 0; i < rows.length; i++) {
    const discordId = rows[i][0];
    if (!discordId) {
      updates.push(['']); // leave blank if no ID
      continue;
    }

    try {
      const user = await client.users.fetch(discordId);
      const avatarURL = user.displayAvatarURL({ format: 'png', size: 128 });
      const avatarFormula = `=IMAGE("${avatarURL}")`; // <-- wrap in IMAGE formula
      updates.push([avatarFormula]);
    } catch (err) {
      console.error(`Failed to fetch avatar for ${discordId}:`, err);
      updates.push(['']);
    }
  }

  // Write Discord icons back to PlayerMaster!E2:E
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'PlayerMaster!E2:E',
    valueInputOption: 'USER_ENTERED', // important so IMAGE() formula works
    resource: { values: updates },
  });

  console.log(`✅ Updated ${updates.length} Discord icons`);
}

// ----------------- EXECUTABLE BLOCK -----------------
// only run this if the file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await updateDiscordIcons(client);
    process.exit(0);
  });

  client.login(process.env.BOT_TOKEN);
}
