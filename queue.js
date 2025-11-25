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
  if (processingMatchups) return;
  processingMatchups = true;

  try {
    const waitingPlayers = queue.filter(u => u.status === 'waiting');
    const nhlEmojiMap = getNHLEmojiMap();
    const teams = Object.keys(nhlEmojiMap);
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
      const p1 = waitingPlayers[i]; // Home
      const p2 = waitingPlayers[i + 1]; // Away

      if (p1.status !== 'waiting' || p2.status !== 'waiting') continue;
      if (p1.matchupMessageSent || p2.matchupMessageSent) continue;

      // Mark as pending immediately
      p1.status = 'pending';
      p2.status = 'pending';
      p1.pendingPairId = p2.id;
      p2.pendingPairId = p1.id;

      // Pick random teams
      let homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

      p1.homeTeam = homeTeam;
      p1.awayTeam = awayTeam;
      p2.homeTeam = homeTeam;
      p2.awayTeam = awayTeam;

      // --- Away team message ---
      const awayContent =
        `🎮 Matchup Pending Acknowledgment\n` +
        `Each player, please acknowledge using the buttons below.\n\n` +
        `🚌 Away\n<@${p2.id}> [${p2.elo}] ${nhlEmojiMap[p2.awayTeam]}`;

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

      const awayMsg = await channel.send({
        content: awayContent,
        components: [awayRow]
      });
      p2.matchupMessage = awayMsg;

      // --- Home team message ---
      const homeContent =
        `──────────────────────────\n\n` +
        `🏠 Home\n<@${p1.id}> [${p1.elo}] ${nhlEmojiMap[p1.homeTeam]}`;

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

      const homeMsg = await channel.send({
        content: homeContent,
        components: [homeRow]
      });
      p1.matchupMessage = homeMsg;

      // Mark messages sent
      p1.matchupMessageSent = true;
      p2.matchupMessageSent = true;
    }

    // Update the main queue window once
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
    // Defer to avoid interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
  } catch {}

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const [pmRes, rsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'PlayerMaster!A:C' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'RawStandings!A:AM' }),
    ]);

    const playerMasterData = pmRes.data.values || [];
    const rawStandingsData = rsRes.data.values || [];

    // Lookup player info
    const pmRow = playerMasterData.find(r => r[0]?.trim() === userId);
    const playerNickname = pmRow ? pmRow[2]?.trim() : interaction.user.username;
    const rsRow = rawStandingsData.find(r => r[0]?.trim() === playerNickname);
    const elo = rsRow ? parseInt(rsRow[38], 10) : 1000;

    const playerInQueue = queue.find(u => u.id === userId);

    // ----------------- JOIN QUEUE -----------------
    if (interaction.customId === 'join_queue') {
      if (!playerInQueue) {
        queue.push({ id: userId, name: playerNickname, elo, status: 'waiting' });
        await sendOrUpdateQueueMessage(client);
      }
      return;
    }

    // ----------------- LEAVE QUEUE -----------------
    if (interaction.customId === 'leave_queue') {
      if (playerInQueue) {
        // Remove pendingPair reference
        if (playerInQueue.pendingPairId) {
          const partner = queue.find(u => u.id === playerInQueue.pendingPairId);
          if (partner) {
            delete partner.pendingPairId;
            delete partner.matchupMessageSent;
            delete partner.matchupMessage;
          }
        }
      }
      queue = queue.filter(u => u.id !== userId);
      await sendOrUpdateQueueMessage(client);
      return;
    }

    // ----------------- ACKNOWLEDGE BUTTONS -----------------
    if (
      interaction.customId.startsWith('ack_play_') ||
      interaction.customId.startsWith('ack_decline_')
    ) {
      if (!playerInQueue || !playerInQueue.pendingPairId) return;

      // Restrict buttons
      if (!interaction.customId.endsWith(userId)) {
        await interaction.reply({ content: "❌ This button is not for you.", ephemeral: true });
        return;
      }

      const partner = queue.find(u => u.id === playerInQueue.pendingPairId);

      // PLAY BUTTON
      if (interaction.customId.startsWith('ack_play_')) {
        playerInQueue.status = 'acknowledged';
        playerInQueue.acknowledged = true;

        // Disable clicked buttons
        const disabledRow = interaction.message.components.map(row => {
          row.components.forEach(btn => btn.setDisabled(true));
          return row;
        });
        await interaction.update({ components: disabledRow });

        // Both acknowledged?
        if (partner && partner.acknowledged) {
          try { if (playerInQueue.matchupMessage) await playerInQueue.matchupMessage.delete(); } catch {}
          try { if (partner.matchupMessage) await partner.matchupMessage.delete(); } catch {}

          const nhlEmojiMap = getNHLEmojiMap();
          const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);

          await ratedChannel.send(
            `🎮 Rated Game Matchup!\n` +
            `Away: <@${partner.id}> [${partner.elo}] : ${nhlEmojiMap[partner.awayTeam]}\n` +
            `Home: <@${playerInQueue.id}> [${playerInQueue.elo}] : ${nhlEmojiMap[playerInQueue.homeTeam]}`
          );

          // Remove both from queue
          queue = queue.filter(u => ![playerInQueue.id, partner.id].includes(u.id));

          // Update queue window
          await sendOrUpdateQueueMessage(client);
        }
      }

      // DON'T PLAY BUTTON
      else if (interaction.customId.startsWith('ack_decline_')) {
        if (partner) {
          partner.status = 'waiting';
          delete partner.pendingPairId;
          delete partner.matchupMessageSent;
          delete partner.matchupMessage;
          try {
            const partnerUser = await client.users.fetch(partner.id);
            partnerUser.send(`Your opponent <@${playerInQueue.id}> declined the matchup. You have been returned to the queue.`).catch(() => {});
          } catch {}
        }

        // Remove player from queue and delete ack message
        queue = queue.filter(u => u.id !== userId);
        try { if (playerInQueue.matchupMessage) await playerInQueue.matchupMessage.delete(); } catch {}
        await interaction.message.delete().catch(() => {});

        // Update queue window
        await sendOrUpdateQueueMessage(client);
      }

      // Only process pending matchups once
      await processPendingMatchups(client);
      return;
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

    // Only reset queue array if explicitly requested
    if (options.clearMemory) {
      queue.forEach(u => {
        delete u.pendingPairId;
        delete u.matchupMessageSent;
        delete u.matchupMessage;
      });
      queue.length = 0;
    }

    // Rebuild queue window
    await sendOrUpdateQueueMessage(client);

    console.log('🧹 Queue channel reset; old messages removed');
  } catch (err) {
    console.error('❌ Error resetting queue channel:', err);
  }
}
export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel };
