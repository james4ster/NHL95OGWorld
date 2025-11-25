/*========
This version of queue.js is the working version of the single queue window.
- The ack messages work
- The rated-game channel post works correctly
- No more DMs; acknowledgment happens in queue channel
*/

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import { getNHLEmojiMap } from './nhlEmojiMap.js';

let queue = [];

// Queue & rated games channels
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const RATED_GAMES_CHANNEL_ID = process.env.RATED_GAMES_CHANNEL_ID;

// Timeout for acknowledgment in ms
const ACK_TIMEOUT = 5 * 60 * 1000;

// ----------------- Buttons -----------------
function buildQueueButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join_queue').setLabel('Join Queue').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave_queue').setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
  );
}

// Buttons for pending matchups in queue channel
function buildAckButtons(playerId, emoji) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`play_${playerId}`)
      .setLabel('Play')
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`dontplay_${playerId}`)
      .setLabel("Don't Play")
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Danger)
  );
}

// ----------------- Safe queue message send/edit -----------------
async function sendOrUpdateQueueMessage(client) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const embed = await buildQueueEmbed(client);

    // fetch existing message safely
    let existing = null;
    if (client.queueMessageId) {
      try {
        existing = await channel.messages.fetch(client.queueMessageId);
      } catch {}
    }

    if (existing) {
      await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
    } else {
      // Double-check: ensure no other message exists in the channel with same content
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

  // Pending pairs
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

// ----------------- Pairing processor -----------------
let processingMatchups = false; // GLOBAL LOCK

async function processPendingMatchups(client) {
  if (processingMatchups) return;        // ⛔ already running
  processingMatchups = true;             // 🔒 acquire lock

  try {
    const waitingPlayers = queue.filter(u => u.status === 'waiting');
    const nhlEmojiMap = getNHLEmojiMap();
    const teams = Object.keys(nhlEmojiMap);

    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
      const p1 = waitingPlayers[i];
      const p2 = waitingPlayers[i + 1];

      // Skip if already paired
      if (p1.status !== 'waiting' || p2.status !== 'waiting') continue;
      if (p1.matchupMessageSent || p2.matchupMessageSent) continue;

      // 🔥 Mark them as pending IMMEDIATELY so second call can't reuse them
      p1.status = 'pending';
      p2.status = 'pending';

      p1.pendingPairId = p2.id;
      p2.pendingPairId = p1.id;

      // Pick random teams
      let homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) {
        awayTeam = teams[Math.floor(Math.random() * teams.length)];
      }

      p1.homeTeam = homeTeam;
      p1.awayTeam = awayTeam;
      p2.homeTeam = homeTeam;
      p2.awayTeam = awayTeam;

      // Build embed
      const pendingEmbed = new EmbedBuilder()
        .setTitle('🎮 Matchup Pending Acknowledgment')
        .setDescription(
          `🚌 **Away**\n` +
          `${p2.name} [${p2.elo}] ${nhlEmojiMap[p2.awayTeam]}\n\n` +
          `──────────────────────────\n\n` +
          `🏠 **Home**\n` +
          `${p1.name} [${p1.elo}] ${nhlEmojiMap[p1.homeTeam]}\n\n` +
          `Each player, please acknowledge using the buttons below.`
        )
        .setColor('#ffff00')
        .setTimestamp();

      // Build button rows with player name above buttons
      const awayRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ack_play_${p2.id}`)
          .setLabel('Play')
          .setEmoji(nhlEmojiMap[p2.awayTeam])
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ack_decline_${p2.id}`)
          .setLabel("Don't Play")
          .setEmoji(nhlEmojiMap[p2.awayTeam])
          .setStyle(ButtonStyle.Danger)
      );

      const homeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ack_play_${p1.id}`)
          .setLabel('Play')
          .setEmoji(nhlEmojiMap[p1.homeTeam])
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ack_decline_${p1.id}`)
          .setLabel("Don't Play")
          .setEmoji(nhlEmojiMap[p1.homeTeam])
          .setStyle(ButtonStyle.Danger)
      );

      // Send message
      await channel.send({
        embeds: [pendingEmbed],
        content: `🚌 Away: ${p2.name}\n🏠 Home: ${p1.name}`, // optional: add above rows
        components: [awayRow, homeRow]
      });

      p1.matchupMessageSent = true;
      p2.matchupMessageSent = true;
    }

    // Update queue UI once
    await sendOrUpdateQueueMessage(client);

  } finally {
    processingMatchups = false;  // 🔓 release lock
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

    const pmRow = playerMasterData.find(r => r[0]?.trim() === userId);
    const playerNickname = pmRow ? pmRow[2]?.trim() : interaction.user.username;

    const rsRow = rawStandingsData.find(r => r[0]?.trim() === playerNickname);
    if (!rsRow) {
      console.warn('⚠️ Could not find ELO for player:', playerNickname);
      return;
    }
    const elo = parseInt(rsRow[38], 10);
    const name = playerNickname;

    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) {
        queue.push({ id: userId, name, elo, status: 'waiting' });
      }
    } else if (interaction.customId === 'leave_queue') {
      const leavingPlayer = queue.find(u => u.id === userId);
      if (leavingPlayer) {
        delete leavingPlayer.matchupMessageSent;
        if (leavingPlayer.pendingPairId) {
          const partner = queue.find(u => u.id === leavingPlayer.pendingPairId);
          if (partner) delete partner.matchupMessageSent;
        }
      }
      queue = queue.filter(u => u.id !== userId);
    } else if (interaction.customId.startsWith('ack_play_')) {
      const player = queue.find(u => u.id === userId);
      if (!player || !player.pendingPairId) return;

      player.status = 'acknowledged';
      const partner = queue.find(u => u.id === player.pendingPairId);

      if (partner && partner.status === 'acknowledged') {
        const nhlEmojiMap = getNHLEmojiMap();
        const homeTeam = player.homeTeam;
        const awayTeam = player.awayTeam;

        const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);
        await ratedChannel.send(
          `🎮 Rated Game Matchup!\n` +
          `Away: <@${partner.id}> [${partner.elo}]: ${nhlEmojiMap[awayTeam]}\n` +
          `Home: <@${player.id}> [${player.elo}]: ${nhlEmojiMap[homeTeam]}`
        );

        // Remove both from queue
        queue = queue.filter(u => ![player.id, partner.id].includes(u.id));
      }
    } else if (interaction.customId.startsWith('ack_decline_')) {
      const player = queue.find(u => u.id === userId);
      if (player) {
        if (player.pendingPairId) {
          const partner = queue.find(u => u.id === player.pendingPairId);
          if (partner) {
            partner.status = 'waiting';
            delete partner.pendingPairId;
            delete partner.matchupMessageSent;
            try { 
              const partnerUser = await client.users.fetch(partner.id);
              partnerUser.send(`Your opponent <@${player.id}> declined the matchup. You have been returned to the queue.`).catch(() => {});
            } catch {}
          }
        }
        delete player.matchupMessageSent;
        queue = queue.filter(u => u.id !== userId);
      }
    }

    // Only call once
    await processPendingMatchups(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// ----------------- Reset -----------------
async function resetQueueChannel(client) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });

    // Delete all existing messages
    for (const msg of messages.values()) {
      try { await msg.delete(); } catch {}
    }

    // Reset queue and clear any matchup flags
    queue = [];

    console.log('🧹 Queue channel reset; all old messages removed');

    // Rebuild queue window (will show empty queue)
    await sendOrUpdateQueueMessage(client);

    // No need to call processPendingMatchups() here — queue is empty
  } catch (err) {
    console.error('❌ Error resetting queue channel:', err);
  }
}
export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
