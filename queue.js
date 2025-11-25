// queue.js
/*
Persistent NHL ’95 Queue System
- Fetches nicknames & ELO from Google Sheets
- Pairing players for matches
- Play / Don't Play buttons with proper handling
- Deletes matchup messages as needed
*/

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

let queue = [];

const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// ----------------- Buttons -----------------
function buildQueueButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join_queue').setLabel('Join Queue').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave_queue').setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
  );
}

function buildAckButtons(playerId, emoji) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ack_play_${playerId}`)
      .setLabel('Play')
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ack_decline_${playerId}`)
      .setLabel("Don't Play")
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Danger)
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
      if (u.status === 'waiting') statusEmoji = '🟡';
      else if (u.status === 'pending') statusEmoji = '🟠';
      else if (u.status === 'acknowledged') statusEmoji = '✅';
      return `${i + 1}. ${u.name} [${u.elo}] ${statusEmoji}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();

  return embed;
}

// ----------------- Safe queue message send/edit -----------------
async function sendOrUpdateQueueMessage(client) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const embed = await buildQueueEmbed();

    let existing = null;
    if (client.queueMessageId) {
      try {
        existing = await channel.messages.fetch(client.queueMessageId);
      } catch {}
    }

    if (existing) {
      await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
    } else {
      const messages = await channel.messages.fetch({ limit: 10 });
      existing = messages.find(m => m.content === '**NHL ’95 Game Queue**');
      if (existing) {
        client.queueMessageId = existing.id;
        await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
      } else {
        const newMsg = await channel.send({ content: '**NHL ’95 Game Queue**', embeds: [embed], components: [buildQueueButtons()] });
        client.queueMessageId = newMsg.id;
      }
    }
  } catch (err) {
    console.error('❌ Failed to send/update queue message:', err);
  }
}

// ----------------- Google Sheets Helper -----------------
async function fetchPlayerData(discordId) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const [pmRes, rsRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'PlayerMaster!A:C' }),
    sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'RawStandings!A:AM' })
  ]);

  const playerMasterData = pmRes.data.values || [];
  const rawStandingsData = rsRes.data.values || [];

  const pmRow = playerMasterData.find(r => r[0]?.trim() === discordId);
  const nickname = pmRow ? pmRow[2]?.trim() : null;

  const rsRow = rawStandingsData.find(r => r[0]?.trim() === nickname);
  const elo = rsRow ? parseInt(rsRow[38], 10) : 1500;

  return { nickname: nickname || 'Unknown', elo };
}

// ----------------- Pairing processor -----------------
let processingMatchups = false;

async function processPendingMatchups(client) {
  if (processingMatchups) return;
  processingMatchups = true;

  try {
    const waitingPlayers = queue.filter(u => u.status === 'waiting');
    if (waitingPlayers.length < 2) return;

    const nhlEmojiMap = getNHLEmojiMap();
    const teams = Object.keys(nhlEmojiMap);
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
      const p1 = waitingPlayers[i];
      const p2 = waitingPlayers[i + 1];

      if (p1.matchupMessage || p2.matchupMessage) continue;

      p1.status = 'pending';
      p2.status = 'pending';
      p1.pendingPairId = p2.id;
      p2.pendingPairId = p1.id;

      let homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

      p1.homeTeam = homeTeam;
      p1.awayTeam = awayTeam;
      p2.homeTeam = homeTeam;
      p2.awayTeam = awayTeam;

      const awayContent =
        `🎮 Matchup Pending Acknowledgment\nEach player, please acknowledge using the buttons below.\n\n` +
        `🚌 Away\n<@${p2.id}> ${p2.name} [${p2.elo}] ${nhlEmojiMap[p2.awayTeam]}`;

      const awayRow = buildAckButtons(p2.id, nhlEmojiMap[p2.awayTeam]);
      const awayMsg = await channel.send({ content: awayContent, components: [awayRow] });
      p2.matchupMessage = awayMsg;

      const homeContent =
        `──────────────────────────\n\n` +
        `🏠 Home\n<@${p1.id}> ${p1.name} [${p1.elo}] ${nhlEmojiMap[p1.homeTeam]}`;

      const homeRow = buildAckButtons(p1.id, nhlEmojiMap[p1.homeTeam]);
      const homeMsg = await channel.send({ content: homeContent, components: [homeRow] });
      p1.matchupMessage = homeMsg;
    }

    await sendOrUpdateQueueMessage(client);
  } finally {
    processingMatchups = false;
  }
}

// ----------------- Interaction handler -----------------
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});

    // --- Queue Join ---
    if (interaction.customId === 'join_queue') {
      const { nickname, elo } = await fetchPlayerData(userId);

      if (!queue.find(u => u.id === userId)) {
        queue.push({ id: userId, name: nickname, elo, status: 'waiting' });
      }

      await sendOrUpdateQueueMessage(client);
      await processPendingMatchups(client);
      return;
    }

    // --- Queue Leave ---
    if (interaction.customId === 'leave_queue') {
      const leavingPlayer = queue.find(u => u.id === userId);
      if (leavingPlayer) {
        if (leavingPlayer.matchupMessage) try { await leavingPlayer.matchupMessage.delete(); } catch {}
        const partner = queue.find(u => u.id === leavingPlayer.pendingPairId);
        if (partner && partner.matchupMessage) {
          try { await partner.matchupMessage.delete(); } catch {}
          partner.status = 'waiting';
          delete partner.pendingPairId;
          delete partner.matchupMessage;
        }
      }
      queue = queue.filter(u => u.id !== userId);
      await sendOrUpdateQueueMessage(client);
      return;
    }

    // --- Acknowledge Play / Decline ---
    if (interaction.customId.startsWith('ack_play_') || interaction.customId.startsWith('ack_decline_')) {
      if (!interaction.customId.endsWith(userId)) {
        await interaction.reply({ content: "❌ This button is not for you.", ephemeral: true });
        return;
      }

      const player = queue.find(u => u.id === userId);
      if (!player || !player.pendingPairId) return;
      const partner = queue.find(u => u.id === player.pendingPairId);

      // --- Play ---
      if (interaction.customId.startsWith('ack_play_')) {
        player.status = 'acknowledged';
        player.acknowledged = true;

        // Disable buttons
        const disabledRow = interaction.message.components.map(row => {
          row.components.forEach(btn => btn.setDisabled(true));
          return row;
        });
        await interaction.update({ components: disabledRow });

        await sendOrUpdateQueueMessage(client);

        // If both acknowledged, send to rated games
        if (partner && partner.acknowledged) {
          try { if (player.matchupMessage) await player.matchupMessage.delete(); } catch {}
          try { if (partner.matchupMessage) await partner.matchupMessage.delete(); } catch {}

          const nhlEmojiMap = getNHLEmojiMap();
          const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);
          await ratedChannel.send(
            `🎮 Rated Game Matchup!\nAway: <@${partner.id}> ${partner.name} [${partner.elo}] ${nhlEmojiMap[partner.awayTeam]}\nHome: <@${player.id}> ${player.name} [${player.elo}] ${nhlEmojiMap[player.homeTeam]}`
          );

          queue = queue.filter(u => ![player.id, partner.id].includes(u.id));
          await sendOrUpdateQueueMessage(client);
        }
      }

      // --- Don't Play ---
      if (interaction.customId.startsWith('ack_decline_')) {
        if (partner && partner.matchupMessage) {
          try { await partner.matchupMessage.delete(); } catch {}
          partner.status = 'waiting';
          delete partner.pendingPairId;
          delete partner.matchupMessage;
          delete partner.acknowledged;
        }
        if (player.matchupMessage) try { await player.matchupMessage.delete(); } catch {}
        queue = queue.filter(u => u.id !== userId);

        await sendOrUpdateQueueMessage(client);
        await processPendingMatchups(client);
      }
    }

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// ----------------- Reset -----------------
async function resetQueueChannel(client, options = { clearMemory: true }) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });

    for (const msg of messages.values()) {
      try { await msg.delete(); } catch {}
    }

    if (options.clearMemory) {
      queue.forEach(u => {
        delete u.pendingPairId;
        delete u.matchupMessage;
      });
      queue.length = 0;
    }

    await sendOrUpdateQueueMessage(client);
    console.log('🧹 Queue channel reset; old messages removed');
  } catch (err) {
    console.error('❌ Error resetting queue channel:', err);
  }
}

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel, processPendingMatchups };
