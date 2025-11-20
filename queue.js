// queue.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

let queue = [];

// Queue & rated games channels
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// Timeout for DM acknowledgment in ms
const ACK_TIMEOUT = 5 * 60 * 1000;

// ----------------- Buttons -----------------
function buildQueueButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join_queue').setLabel('Join Queue').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave_queue').setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
  );
}

function buildAckButtons(playerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ack_play_${playerId}`).setLabel('Play').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ack_decline_${playerId}`).setLabel("Don't Play").setStyle(ButtonStyle.Danger)
  );
}

// ----------------- Queue Embed -----------------
async function buildQueueEmbed(client) {
  if (queue.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎮 NHL ’95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  const list = queue
    .map((u, i) => {
      let statusEmoji = '';
      if (u.status === 'pending') statusEmoji = '🟡';
      else if (u.status === 'acknowledged') statusEmoji = '✅';
      return `${i + 1}. ${u.name} [${u.elo}] ${statusEmoji}`;
    })
    .join('\n');

  const pendingMatches = queue.filter(u => u.status === 'pending' && u.pendingPairId);
  let pendingDesc = '';
  const addedPairs = new Set();
  for (const player of pendingMatches) {
    if (addedPairs.has(player.id)) continue;
    const pair = queue.find(u => u.id === player.pendingPairId);
    if (!pair) continue;
    const homeEmoji = player.status === 'pending' ? '🟡' : '✅';
    const awayEmoji = pair.status === 'pending' ? '🟡' : '✅';
    pendingDesc += `- ${player.name} [${player.elo}] ${homeEmoji} vs ${pair.name} [${pair.elo}] ${awayEmoji}\n`;
    addedPairs.add(player.id);
    addedPairs.add(pair.id);
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();

  if (pendingDesc) embed.addFields({ name: 'Pending Matches', value: pendingDesc });

  return embed;
}

async function sendOrUpdateQueueMessage(client) {
    try {
        const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
        const embed = await buildQueueEmbed(client);

        let msg;
        if (client.queueMessageId) {
            try {
                msg = await channel.messages.fetch(client.queueMessageId);
                await msg.edit({ embeds: [embed], components: [buildQueueButtons()] });
                return;
            } catch (err) {
                console.warn('❌ Previous queue message missing, creating new one');
            }
        }

        msg = await channel.send({ content: '**NHL ’95 Game Queue**', embeds: [embed], components: [buildQueueButtons()] });
        client.queueMessageId = msg.id;
    } catch (err) {
        console.error('❌ Failed to send/update queue message:', err);
    }
}


// ----------------- DM Pending -----------------
async function sendPendingDM(client, player1, player2) {
  const nhlEmojiMap = getNHLEmojiMap();
  const teams = Object.keys(nhlEmojiMap);
  let homeTeam = teams[Math.floor(Math.random() * teams.length)];
  let awayTeam = teams[Math.floor(Math.random() * teams.length)];
  while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

  const homePlayerFirst = Math.random() < 0.5;
  const homePlayer = homePlayerFirst ? player1 : player2;
  const awayPlayer = homePlayerFirst ? player2 : player1;

  // Assign pending pair
  homePlayer.status = 'pending';
  homePlayer.pendingPairId = awayPlayer.id;
  awayPlayer.status = 'pending';
  awayPlayer.pendingPairId = homePlayer.id;

  const dmEmbed = new EmbedBuilder()
    .setTitle('🎮 Matchup Pending Acknowledgment')
    .setDescription(
      `Away: ${awayPlayer.name} [${awayPlayer.elo}] ${nhlEmojiMap[awayTeam]}\n` +
      `Home: ${homePlayer.name} [${homePlayer.elo}] ${nhlEmojiMap[homeTeam]}`
    )
    .setColor('#ffff00')
    .setTimestamp();

  for (const p of [homePlayer, awayPlayer]) {
    try {
      const dm = await client.users.fetch(p.id);
      const sentMsg = await dm.send({ embeds: [dmEmbed], components: [buildAckButtons(p.id)] });
      // Timeout
      setTimeout(() => {
        if (p.status === 'pending') {
          p.status = 'waiting';
          delete p.pendingPairId;
          sendOrUpdateQueueMessage(client);
          sentMsg.delete().catch(() => {});
        }
      }, ACK_TIMEOUT);
    } catch (err) {
      console.error('❌ Failed to send DM for acknowledgment:', err);
      p.status = 'waiting';
      delete p.pendingPairId;
    }
  }

  await sendOrUpdateQueueMessage(client);
}

// ----------------- Pairing -----------------
async function processPendingMatchups(client) {
  const waitingPlayers = queue.filter(u => u.status === 'waiting');
  for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
    const p1 = waitingPlayers[i];
    const p2 = waitingPlayers[i + 1];
    if (p1.status !== 'waiting' || p2.status !== 'waiting') continue;
    await sendPendingDM(client, p1, p2);
  }
}

// ----------------- Queue Interaction -----------------
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

    // Fetch PlayerMaster & RawStandings
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const [pmRes, rsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'PlayerMaster!A:C' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'RawStandings!A:AM' }),
    ]);

    const playerMasterData = pmRes.data.values || [];
    const rawStandingsData = rsRes.data.values || [];

    const pmRow = playerMasterData.find(r => r[1] === userId);
    const playerNickname = pmRow ? pmRow[2] : interaction.user.username;
    const rsRow = rawStandingsData.find(r => r[0] === playerNickname);
    const elo = rsRow ? parseInt(rsRow[38] || '1500', 10) : 1500;
    const name = playerNickname;

    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) {
        queue.push({ id: userId, name, elo, status: 'waiting' });
      }
    } else if (interaction.customId === 'leave_queue') {
      queue = queue.filter(u => u.id !== userId);
    } else if (interaction.customId.startsWith('ack_play_')) {
      const player = queue.find(u => u.id === userId);
      if (!player || !player.pendingPairId) return;
      player.status = 'acknowledged';
      const pair = queue.find(u => u.id === player.pendingPairId);
      if (pair && pair.status === 'acknowledged') {
        // Post to rated-games
        const nhlEmojiMap = getNHLEmojiMap();
        const teams = Object.keys(nhlEmojiMap);
        let homeTeam = teams[Math.floor(Math.random() * teams.length)];
        let awayTeam = teams[Math.floor(Math.random() * teams.length)];
        while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];
        const homePlayerFirst = Math.random() < 0.5;
        const homePlayer = homePlayerFirst ? player : pair;
        const awayPlayer = homePlayerFirst ? pair : player;

        const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);
        await ratedChannel.send(
          `🎮 Rated Game Matchup!\n` +
          `Away: <@${awayPlayer.id}> [${awayPlayer.elo}]: ${nhlEmojiMap[awayTeam]}\n` +
          `Home: <@${homePlayer.id}> [${homePlayer.elo}]: ${nhlEmojiMap[homeTeam]}`
        );

        queue = queue.filter(u => ![player.id, pair.id].includes(u.id));
      }
    } else if (interaction.customId.startsWith('ack_decline_')) {
      const player = queue.find(u => u.id === userId);
      if (player && player.status === 'pending') {
        player.status = 'waiting';
        delete player.pendingPairId;
      }
    }

    await processPendingMatchups(client);
    await sendOrUpdateQueueMessage(client);
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// ----------------- Reset -----------------
async function resetQueueChannel(client) {
  const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 50 });
  for (const msg of messages.values()) {
    await msg.delete();
  }
  queue = [];
  console.log('🧹 Queue channel reset; all old messages removed');
  await processPendingMatchups(client);
  await sendOrUpdateQueueMessage(client);
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
