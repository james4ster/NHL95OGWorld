import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

let queue = [];

const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// DM acknowledgment timeout
const ACK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
async function buildQueueEmbed() {
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

  const pendingPlayers = queue.filter(u => u.status === 'pending' && u.pendingPairId);
  let pendingDesc = '';
  const seen = new Set();
  for (const p of pendingPlayers) {
    if (seen.has(p.id)) continue;
    const partner = queue.find(x => x.id === p.pendingPairId);
    if (!partner) continue;
    const pEmoji = p.status === 'pending' ? '🟡' : '✅';
    const partnerEmoji = partner.status === 'pending' ? '🟡' : '✅';
    pendingDesc += `- ${p.name} [${p.elo}] ${pEmoji} vs ${partner.name} [${partner.elo}] ${partnerEmoji}\n`;
    seen.add(p.id);
    seen.add(partner.id);
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();

  if (pendingDesc) embed.addFields({ name: 'Pending Matches', value: pendingDesc });

  return embed;
}

// ----------------- Safe queue message send/edit -----------------
async function sendOrUpdateQueueMessage(client) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const embed = await buildQueueEmbed();

    if (client.queueMessageId) {
      try {
        const existing = await channel.messages.fetch(client.queueMessageId);
        await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
        return;
      } catch {
        console.warn('❗ Previous queue message missing; creating a new one.');
        client.queueMessageId = null;
      }
    }

    const newMsg = await channel.send({ content: '**🎮 NHL ’95 Game Queue**', embeds: [embed], components: [buildQueueButtons()] });
    client.queueMessageId = newMsg.id;
  } catch (err) {
    console.error('❌ Failed to send/update queue message:', err);
  }
}

// ----------------- Idle queue cleanup -----------------
function startIdleQueueTimeout(client) {
  setInterval(() => {
    const now = Date.now();
    let updated = false;

    queue.forEach((player, idx) => {
      if (player.status === 'waiting') {
        if (!player.joinTime) player.joinTime = now;
        if (now - player.joinTime > 5 * 60 * 1000) { // 5 min for testing
          queue.splice(idx, 1);
          updated = true;
          console.log(`🕐 Player ${player.name} removed due to idle queue timeout.`);
        }
      }
    });

    if (updated) sendOrUpdateQueueMessage(client).catch(() => {});
  }, 60 * 1000);
}

// ----------------- DM Pending -----------------
async function sendPendingDM(client, player1, player2, [homeTeam, awayTeam]) {
  const nhlEmojiMap = getNHLEmojiMap();
  const homePlayerFirst = Math.random() < 0.5;
  const homePlayer = homePlayerFirst ? player1 : player2;
  const awayPlayer = homePlayerFirst ? player2 : player1;

  const dmEmbed = new EmbedBuilder()
    .setTitle('🎮 Matchup Pending Acknowledgment')
    .setDescription(
      `Away: ${awayPlayer.name} [${awayPlayer.elo}] ${nhlEmojiMap[awayTeam]}\n` +
      `Home: ${homePlayer.name} [${homePlayer.elo}] ${nhlEmojiMap[homeTeam]}\n\n` +
      `Do you want to play this matchup?`
    )
    .setColor('#ffff00')
    .setTimestamp();

  for (const p of [homePlayer, awayPlayer]) {
    try {
      const user = await client.users.fetch(p.id);
      await user.send({ embeds: [dmEmbed], components: [buildAckButtons(p.id)] });
    } catch (err) {
      console.error('❌ Failed to send DM to', p.id, err);
      p.status = 'waiting';
      if (p.pendingPairId) {
        const partner = queue.find(q => q.id === p.pendingPairId);
        if (partner) partner.status = 'waiting';
        delete partner.pendingPairId;
      }
      delete p.pendingPairId;
    }

    setTimeout(() => {
      if (p.status === 'pending') {
        const partner = queue.find(q => q.id === p.pendingPairId);
        p.status = 'waiting';
        delete p.pendingPairId;
        if (partner) {
          partner.status = 'waiting';
          delete partner.pendingPairId;
        }
        sendOrUpdateQueueMessage(client).catch(() => {});
      }
    }, ACK_TIMEOUT);
  }

  await sendOrUpdateQueueMessage(client);
}

// ----------------- Pairing processor -----------------
async function processPendingMatchups(client) {
  const waitingPlayers = queue.filter(u => u.status === 'waiting');
  const nhlEmojiMap = getNHLEmojiMap();
  const teams = Object.keys(nhlEmojiMap);

  for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
    const p1 = waitingPlayers[i];
    const p2 = waitingPlayers[i + 1];
    if (p1.status !== 'waiting' || p2.status !== 'waiting') continue;

    // Pick random teams once and pass to DM
    let homeTeam = teams[Math.floor(Math.random() * teams.length)];
    let awayTeam = teams[Math.floor(Math.random() * teams.length)];
    while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

    p1.status = 'pending';
    p2.status = 'pending';
    p1.pendingPairId = p2.id;
    p2.pendingPairId = p1.id;

    await sendPendingDM(client, p1, p2, [homeTeam, awayTeam]);
  }
}

// ----------------- Interaction handler -----------------
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
  } catch {}

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const [pmRes, rsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'PlayerMaster!A:C' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'RawStandings!A:AM' }),
    ]);

    const playerMasterData = pmRes.data.values || [];
    const rawStandingsData = rsRes.data.values || [];

    const pmRow = playerMasterData.find(r => r[0] === userId);
    const playerNickname = pmRow ? pmRow[2] : interaction.user.username;

    const rsRow = rawStandingsData.find(r => r[0] === playerNickname);
    const elo = rsRow ? parseInt(rsRow[38], 10) : 1500;
    const name = playerNickname;

    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) {
        queue.push({ id: userId, name, elo, status: 'waiting', joinTime: Date.now() });
      }
    } else if (interaction.customId === 'leave_queue') {
      queue = queue.filter(u => u.id !== userId);
    } else if (interaction.customId.startsWith('ack_play_')) {
      const player = queue.find(u => u.id === userId);
      if (player && player.pendingPairId) {
        player.status = 'acknowledged';
        const partner = queue.find(u => u.id === player.pendingPairId);
        if (partner && partner.status === 'acknowledged') {
          const nhlEmojiMap = getNHLEmojiMap();
          const teams = Object.keys(nhlEmojiMap);
          let homeTeam = teams[Math.floor(Math.random() * teams.length)];
          let awayTeam = teams[Math.floor(Math.random() * teams.length)];
          while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

          const homePlayerFirst = Math.random() < 0.5;
          const homePlayer = homePlayerFirst ? player : partner;
          const awayPlayer = homePlayerFirst ? partner : player;

          const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);
          await ratedChannel.send(
            `🎮 Rated Game Matchup!\n` +
            `Away: <@${awayPlayer.id}> [${awayPlayer.elo}]: ${nhlEmojiMap[awayTeam]}\n` +
            `Home: <@${homePlayer.id}> [${homePlayer.elo}]: ${nhlEmojiMap[homeTeam]}`
          );

          queue = queue.filter(u => ![player.id, partner.id].includes(u.id));
        }
      }
    } else if (interaction.customId.startsWith('ack_decline_')) {
      const player = queue.find(u => u.id === userId);
      if (player) {
        if (player.pendingPairId) {
          const partner = queue.find(u => u.id === player.pendingPairId);
          if (partner) {
            partner.status = 'waiting';
            delete partner.pendingPairId;
            try {
              const partnerUser = await client.users.fetch(partner.id);
              partnerUser.send(`Your opponent <@${player.id}> declined the matchup. You have been returned to the queue.`).catch(() => {});
            } catch {}
          }
        }
        queue = queue.filter(u => u.id !== userId);
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
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });
    for (const msg of messages.values()) {
      try { await msg.delete(); } catch {}
    }
    queue = [];
    console.log('🧹 Queue channel reset; all old messages removed');
    await processPendingMatchups(client);
    await sendOrUpdateQueueMessage(client);
  } catch (err) {
    console.error('❌ Error resetting queue channel:', err);
  }
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel, startIdleQueueTimeout };
