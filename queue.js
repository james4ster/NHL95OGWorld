// queue.js
// this version works 100% perfect for joining and leaving, as well as the matchups with perfect output
// the next version i will attempt to add an acknoledgment when a matchup is made
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getNHLEmojiMap } from './nhlEmojiMap.js'; // Use your emoji map

// In-memory queue
let queue = [];

// Queue & rated games channels
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// Build the buttons for join/leave
function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('join_queue')
      .setLabel('Join Queue')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('leave_queue')
      .setLabel('Leave Queue')
      .setStyle(ButtonStyle.Danger)
  );
}

// Build embed showing current queue
async function buildQueueEmbed(client) {
  if (queue.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎮 NHL ’95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  // Fetch mappings from Sheets
  let idToPlayerName = {};
  let playerNameToElo = {};

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const pmRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:C',
    });
    const pmData = pmRes.data.values || [];
    for (const row of pmData) {
      const discordId = row[0];
      const playerName = row[2];
      if (discordId && playerName) idToPlayerName[discordId] = playerName;
    }

    const rsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AM',
    });
    const rsData = rsRes.data.values || [];
    for (const row of rsData) {
      const playerName = row[0];
      const eloRaw = row[38];
      const elo = eloRaw ? parseInt(eloRaw, 10) : 1500;
      if (playerName) playerNameToElo[playerName] = elo;
    }
  } catch (err) {
    console.error('❌ Error fetching sheets data for ELO mapping:', err);
  }

  // Build main queue list with status
  const queueList = queue
    .map((u, i) => {
      const discordId = u.id;
      const playerName = idToPlayerName[discordId] || u.name || `<@${discordId}>`;
      const elo = playerNameToElo[playerName] || (u.elo || 1500);

      // Determine status emoji
      let statusEmoji;
      switch (u.status) {
        case 'pending':
          statusEmoji = '🟡'; // pending acknowledgment
          break;
        case 'acknowledged':
          statusEmoji = '✅';
          break;
        default:
          statusEmoji = 'waiting'; // not yet paired
      }

      return `${i + 1}. ${playerName} [${elo}] - ${statusEmoji}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setColor('#0099ff')
    .setTimestamp()
    .setDescription(queueList);

  // Optional: add a Pending Matches section if you want to show paired players
  const pendingMatches = queue.filter(u => u.status === 'pending');
  if (pendingMatches.length > 0) {
    let pendingDescription = '';
    // Assuming pendingMatches are in pairs sequentially in the queue
    for (let i = 0; i < pendingMatches.length; i += 2) {
      const home = pendingMatches[i];
      const away = pendingMatches[i + 1];
      if (!away) break;
      const homeEmoji = home.status === 'pending' ? '🟡' : home.status === 'acknowledged' ? '✅' : '';
      const awayEmoji = away.status === 'pending' ? '🟡' : away.status === 'acknowledged' ? '✅' : '';
      pendingDescription += `- ${home.name} [${home.elo}] ${homeEmoji} vs ${away.name} [${away.elo}] ${awayEmoji}\n`;
    }
    embed.addFields({ name: 'Pending Matches', value: pendingDescription });
  }

  return embed;
}


// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  if (!client.queueMessageId) {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const embed = await buildQueueEmbed(client);
    const msg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [embed],
      components: [buildButtons()],
    });
    client.queueMessageId = msg.id;
    return;
  }

  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const msg = await channel.messages.fetch(client.queueMessageId);
    const embed = await buildQueueEmbed(client);
    await msg.edit({ embeds: [embed], components: [buildButtons()] });
  } catch (err) {
    console.log('❌ Could not edit queue message. Recreating single persistent window.');
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const m of msgs.values()) {
      try { await m.delete(); } catch {}
    }
    const embed = await buildQueueEmbed(client);
    const newMsg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [embed],
      components: [buildButtons()],
    });
    client.queueMessageId = newMsg.id;
  }
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  try {
    // --- Optional fix for 40060 error ---
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    } catch (err) {
      if (err.code !== 40060) console.error(err);
    }

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const [pmRes, rsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'PlayerMaster!A:C',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'RawStandings!A:AM',
      }),
    ]);

    const playerMasterData = pmRes.data.values || [];
    const rawStandingsData = rsRes.data.values || [];

    const pmRow = playerMasterData.find(r => r[1] === userId); // B = Discord ID
    const playerNickname = pmRow ? pmRow[2] : interaction.user.username; // C = Nickname

    const rsRow = rawStandingsData.find(r => r[0] === playerNickname);
    const elo = rsRow ? rsRow[38] || 1500 : 1500;
    const name = playerNickname;

  if (interaction.customId === 'join_queue') {
    if (!queue.find(u => u.id === userId)) {
      queue.push({ 
        id: userId, 
        name, 
        elo, 
        status: 'waiting' // new field for pending acknowledgment system
      });
    }
  } else if (interaction.customId === 'leave_queue') {
    queue = queue.filter(u => u.id !== userId);
  }

    // --- Check for matchup ---
    while (queue.length >= 2) {
      const [player1, player2] = queue.splice(0, 2);

      // Fetch ELO mapping
      let idToPlayerName = {};
      let playerNameToElo = {};
      try {
        const [pmRes2, rsRes2] = await Promise.all([
          sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'PlayerMaster!A:C',
          }),
          sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'RawStandings!A:AM',
          }),
        ]);

        const pmData2 = pmRes2.data.values || [];
        const rsData2 = rsRes2.data.values || [];

        for (const row of pmData2) {
          const discordId = row[0];
          const playerName = row[2];
          if (discordId && playerName) idToPlayerName[discordId] = playerName;
        }
        for (const row of rsData2) {
          const playerName = row[0];
          const eloRaw = row[38];
          const elo = eloRaw ? parseInt(eloRaw, 10) : 1500;
          if (playerName) playerNameToElo[playerName] = elo;
        }
      } catch (err) {
        console.error('❌ Error fetching sheets data for ELO mapping:', err);
      }

      const nhlEmojiMap = getNHLEmojiMap();
      const teams = Object.keys(nhlEmojiMap);

      let homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

      // Randomly pick home/away
      const homePlayerFirst = Math.random() < 0.5;
      const homePlayer = homePlayerFirst ? player1 : player2;
      const awayPlayer = homePlayerFirst ? player2 : player1;

      // Lookup ELO
      const homeElo = playerNameToElo[idToPlayerName[homePlayer.id]] || homePlayer.elo || 1500;
      const awayElo = playerNameToElo[idToPlayerName[awayPlayer.id]] || awayPlayer.elo || 1500;

      const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);
      await ratedChannel.send(
        `🎮 Rated Game Matchup!\n` +
        `Away: <@${awayPlayer.id}> [${awayElo}]: ${nhlEmojiMap[awayTeam]}\n` +
        `Home: <@${homePlayer.id}> [${homeElo}]: ${nhlEmojiMap[homeTeam]}`
      );
    }

    await sendOrUpdateQueueMessage(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// Reset queue channel
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 50 });
  for (const msg of messages.values()) {
    await msg.delete();
  }
  queue = [];
  console.log('🧹 Queue channel reset; all old messages removed');
  await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
