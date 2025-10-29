// === Imports ===
console.log('📄 SPREADSHEET_ID env var:', process.env.SPREADSHEET_ID);

import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';
import express from 'express';
import fs from 'fs';

// Bot functionality
import { handleScheduleCommand } from './schedule.js';
import { nhlEmojiMap } from './nhlEmojiMap.js';
import { generateSeasonRecap } from './recap.js';
import { handleGuildMemberAdd } from './welcome.js';
import { parseSiriInput, postToDiscord } from './siriPost.js';

// === Imports for ELO Charting ===
import { getSheetData } from './nhl95-elo-chart/fetchELO.js';
import { flattenEloHistory } from './nhl95-elo-chart/processELO.js';
import { buildDatasets } from './nhl95-elo-chart/datasets.js';
import { renderChart } from './nhl95-elo-chart/renderChart.js';

// === QuickChart ===
import QuickChart from 'quickchart-js';

// === Import Google Sheets API for /elo ===
import { google } from 'googleapis';

// === Discord Bot Setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,  // Added to support the Welcome message (welcome.js)
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
handleGuildMemberAdd(client); //

// === GAS URLs ===
const reportsUrl = 'https://script.google.com/macros/s/AKfycbyMlsEWIiQOhojzLVe_VNirLVVhymltp1fMxLHH2XrVnQZbln2Qbhw36fDz6b1I4UqS/exec?report=reports';

// === Bot Online Confirmation ===
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});


// == ELO Rankings ==
async function getEloRankings() {
  console.log('📄 SPREADSHEET_ID:', process.env.SPREADSHEET_ID);
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Rankings!A2:AF', // A=manager, AF=ELO
  });

  const rows = res.data.values || [];
  return rows
    .map(row => ({
      manager: row[0],
      elo: parseFloat(row[31]) || 0 // AF = index 31
    }))
    .sort((a, b) => b.elo - a.elo);
}
//end



// === Slash Command Handler ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'reports') {
    await interaction.reply({ content: '📡 Ed is getting your reports...', ephemeral: true });

    try {
      const res = await fetch(reportsUrl);
      const json = await res.json();

      if (json.error || !json.data) {
        throw new Error(json.error || 'No data returned');
      }

      const { ga, gf, shutouts } = json.data;

      await interaction.channel.send({
        content: `🎤 **Listen... Here are your reports.  I love dragons! **`,
        embeds: [
          {
            title: "📊 Goals Against per Game - Min 30 GP",
            image: { url: ga }
          },
          {
            title: "🚀 Goals For per Game - Min 30 GP",
            image: { url: gf }
          },
          {
            title: "🧱 All-Time Shutouts",
            image: { url: shutouts }
          }
        ]
      });

    } catch (error) {
      console.error('❌ Error running reports:', error);
      await interaction.channel.send('❌ I messed up running your reports.');
    }
  }

  if (interaction.commandName === 'schedule') {
    return handleScheduleCommand(interaction);
  }

  if (interaction.commandName === 'myelo') {
    await interaction.reply({ content: '📈 Generating your ELO chart...', ephemeral: true });

    try {
      const chartUrl = await generateManagerEloChartQC(interaction.user.id);

      if (!chartUrl) {
        return interaction.editReply('❌ No ELO data found for you.');
      }

      await interaction.channel.send({
        embeds: [
          {
            title: `${interaction.user.username}'s ELO History`,
            image: { url: chartUrl },
            color: 0xff0000
          }
        ]
      });

      await interaction.editReply({ content: '✅ Done!', ephemeral: true });
    } catch (err) {
      console.error('❌ Error generating /myelo chart:', err);
      await interaction.editReply('❌ Failed to generate your ELO chart.');
    }
  }

  if (interaction.commandName === 'elo') {
    await interaction.deferReply();

    try {
      const ranking = await getEloRankings();
      if (!ranking.length) return interaction.editReply('No ELO data found.');

      const formatted = ranking
        .map((r, i) => `#${i + 1} ${r.manager} — ${r.elo.toFixed(0)}`)
        .join('\n');

      // Handle Discord 2000-char limit
      const MAX_LENGTH = 2000;
      if (formatted.length <= MAX_LENGTH) {
        await interaction.editReply(`📊 **ELO Rankings**\n\n${formatted}`);
      } else {
        const chunks = [];
        let current = '';
        for (const line of formatted.split('\n')) {
          if ((current + line + '\n').length > MAX_LENGTH) {
            chunks.push(current);
            current = '';
          }
          current += line + '\n';
        }
        if (current) chunks.push(current);

        await interaction.editReply(chunks.shift());
        for (const chunk of chunks) await interaction.followUp(chunk);
      }

    } catch (err) {
      console.error('❌ Error fetching ELO rankings:', err);
      await interaction.editReply('❌ Failed to fetch ELO rankings.');
    }
  }

});

// === Slash Command Registration (Run once or on updates) ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Registering slash commands...');

    const commands = [
      new SlashCommandBuilder()
        .setName('reports')
        .setDescription('Ask Ed to run some reports'),
      new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Ask Ed to show your schedule'),
      new SlashCommandBuilder()
        .setName('myelo')
        .setDescription('Ask Ed to show ELO history'),
      new SlashCommandBuilder()
        .setName('elo')
        .setDescription('As Ed to show ELO rankings')
    ].map(cmd => cmd.toJSON());

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();

// === Express Server to Keep Replit Awake & API Route ===
const app = express();
app.use(express.json()); // <== Added middleware to parse JSON bodies

// Add API endpoint to generate recap
app.post('/api/generate-recap', async (req, res) => {
  try {
    const teamStats = req.body;
    const recap = await generateSeasonRecap(teamStats);
    res.send(recap);
  } catch (err) {
    console.error('Error generating recap:', err);
    res.status(500).send('Internal Server Error');
  }
});

// === Siri Score Endpoint ===
app.post('/api/siri-score', async (req, res) => {
  try {
    const { text } = req.body; // text comes from the Siri Shortcut
    if (!text) throw new Error("No text provided");

    const result = parseSiriInput(text);
    const message = `${result.awayTeam} ${result.awayScore} - ${result.homeTeam} ${result.homeScore}`;

    await postToDiscord(message);

    // Custom success message
    res.json({
       message: "Your score was posted nerd"
    });

  } catch (err) {
    console.error('❌ Siri input error:', err);
    res.json({
      success: false,
      message: "Error processing input. Make sure you said a valid score. Are you high?"
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🟢 TickleBot is alive and ready to serve!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// === Dynamic Message Listener Using phrases.json ===
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));
const repliedMessages = new Set();

client.on('messageCreate', async message => {
  if (message.author.bot || message.webhookId) return;
  if (repliedMessages.has(message.id)) return;

  // ✅ Reply if someone @mentions the bot
  const msgLower = message.content.toLowerCase();
  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
    return;
  }

  if (message.reference) {
    const repliedTo = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (repliedTo?.author?.bot) return;
  }

  //const msgLower = message.content.toLowerCase();
  const channelName = message.channel?.name;

  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(trigger => trigger.toLowerCase());
    const channelMatches =
      !phraseObj.channel ||
      (Array.isArray(phraseObj.channel)
        ? phraseObj.channel.includes(channelName)
        : phraseObj.channel === channelName);

    const triggerMatches = triggers.some(trigger => {
      const regex = new RegExp(`\\b${trigger}\\b`, 'i');
      return regex.test(msgLower);
    });

    const isOnlyOT = triggers.length === 1 && (
      triggers[0] === "ot" || triggers[0] === "overtime"
    );

    const msgIsOT = /^ot[\.\!\?]*$/i.test(message.content.trim());
    const msgIsOvertime = /^overtime[\.\!\?]*$/i.test(message.content.trim());

    if (channelMatches && triggerMatches) {
      if (isOnlyOT && !(msgIsOT || msgIsOvertime)) continue;

      repliedMessages.add(message.id);
      message.reply(phraseObj.response);

      setTimeout(() => {
        repliedMessages.delete(message.id);
      }, 10 * 60 * 1000);

      break;
    }
  }
});


// === ELO Chart Functions ===
// === ELO Chart Functions (QuickChart, bucketed) ===
export async function generateManagerEloChartQC(managerDiscordId) {
  try {
    const eloRows = await getSheetData('ELOHistory!A:P');
    const adamRows = await getSheetData('AdamSetup!B12:D');
    const flatElo = flattenEloHistory(eloRows, adamRows);

    const managerElo = flatElo.filter(row => row.discordId === managerDiscordId);
    if (!managerElo.length) {
      console.log(`No ELO data for ${managerDiscordId}`);
      return;
    }

    const bucketSize = 15;
    const bucketedData = [];
    for (let i = 0; i < managerElo.length; i += bucketSize) {
      const chunk = managerElo.slice(i, i + bucketSize);
      if (chunk.length > 0) {
        const avgElo = chunk.reduce((sum, r) => sum + r.elo, 0) / chunk.length;
        bucketedData.push({ x: i + chunk.length, y: avgElo });
      }
    }

    const datasets = [
      {
        label: managerElo[0].manager,
          data: bucketedData,
          borderColor: "red",          // line color
          backgroundColor: "blue",     // default fill color (optional)
          pointBorderColor: "blue",    // outline of the points
          pointBackgroundColor: "blue",// fill color of the points
          pointRadius: 5,
          showLine: true
      },
    ];

    const chartConfig = {
      type: 'line',
      data: { datasets },
      options: {
        plugins: {
          legend: { display: true, position: 'right' },
          title: {
            display: true,
            text: 'Manager ELO History (bucketed - 15 Games)',
            font: { size: 20 },
          },
          datalabels: { // this enables labels above points
            display: true,
            align: 'top',
            formatter: (value) => Math.round(value.y),
            font: { weight: 'bold', size: 12 },
            color: 'black',
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Games' },
            ticks: { stepSize: bucketSize },
          },
          y: {
            title: { display: true, text: 'ELO' },
          },
        },
      },
    };

    const qc = new QuickChart();
    qc.setConfig(chartConfig)
      .setWidth(1400)
      .setHeight(700)
      .setVersion('4'); // Chart.js v4

    const chartUrl = qc.getUrl();

    console.log(`📈 Manager ELO chart URL: ${chartUrl}`);
    return chartUrl;

  } catch (err) {
    console.error('❌ Error generating manager ELO chart (QuickChart):', err);
  }
}


// Example usage:
//generateManagerEloChartQC('582240735793774618');



console.log('DISCORD_TOKEN length:', process.env.DISCORD_TOKEN?.length);

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


