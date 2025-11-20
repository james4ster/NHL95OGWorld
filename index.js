import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import {
    queue,
    sendOrUpdateQueueMessage,
    handleInteraction,
    resetQueueChannel
} from './queue.js';

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID); // make sure env name is correct

// === Discord Bot Setup ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

handleGuildMemberAdd(client);

// === Google Sheets Helper (write new member) ===
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

    console.log(`✅ Added ${username} to Players tab`);
}

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

        const roleId = '1433493333149352099';
        const role = member.guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role);

    } catch (err) {
        console.error('❌ Error processing new member:', err);
    }
});

// === Express server ===
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready!'));
app.listen(process.env.PORT || 3000, () => console.log(`🌐 Web server running`));

// === Button interaction handler ===
client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction, client);
});

// === Login and initialize persistent queue ===
(async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log(`✅ Logged in as ${client.user.tag}`);

        // Reset queue channel and flush old messages
        await resetQueueChannel(client);

    } catch (err) {
        console.error('❌ Discord login failed:', err);
        console.error(err.stack);
    }
})();
