import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import { handleGuildMemberAdd } from './welcome.js';
import { google } from 'googleapis';
import { queue, sendOrUpdateQueueMessage, handleInteraction } from './queue.js';

console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

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

// Flush queue on restart
queue.length = 0;

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
        }

        // Assign default role
        const roleId = '1433493333149352099';
        const role = member.guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role);

    } catch (err) {
        console.error('❌ Error processing new member:', err);
    }
});

// === Express Server ===
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('🟢 NHL95OGBot is alive and ready!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// === Interaction Handler for Queue Buttons ===
client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction, client);
});

// === Login to Discord and initialize queue message ===
(async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log(`✅ Logged in as ${client.user.tag}`);

        // Send/update the persistent queue message
        await sendOrUpdateQueueMessage(client);

    } catch (err) {
        console.error('❌ Discord login failed:', err);
        console.error(err.stack);
    }
})();
