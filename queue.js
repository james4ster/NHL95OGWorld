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
      const p1 = waitingPlayers[i];     // Home
      const p2 = waitingPlayers[i + 1]; // Away

      // 🔥 Prevent duplicate ack messages
      if (p1.matchupMessageSent || p2.matchupMessageSent) continue;

      // Unique pair ID so both players share it
      const pairId = `${p1.id}_${p2.id}_${Date.now()}`;

      // Mark players as pending
      p1.status = 'pending';
      p2.status = 'pending';

      p1.pendingPairId = pairId;
      p2.pendingPairId = pairId;

      p1.ack_home = false;
      p2.ack_away = false;

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

      //
      // ---------- AWAY MESSAGE ----------
      //
      const awayContent =
        `🎮 Matchup Pending Acknowledgment\n` +
        `Each player, please acknowledge using the buttons below.\n\n` +
        `🚌 Away\n<@${p2.id}> [${p2.elo}] ${nhlEmojiMap[p2.awayTeam]}`;

      const awayRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ack_play_${p2.id}_${pairId}`)
          .setLabel('Play')
          .setEmoji(nhlEmojiMap[p2.awayTeam])
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ack_dont_${p2.id}_${pairId}`)
          .setLabel("Don't Play")
          .setEmoji(nhlEmojiMap[p2.awayTeam])
          .setStyle(ButtonStyle.Danger)
      );

      const awayMsg = await channel.send({
        content: awayContent,
        components: [awayRow]
      });

      // Store message so we can delete it later
      p2.ackMessage = awayMsg;


      //
      // ---------- HOME MESSAGE ----------
      //
      const homeContent =
        `──────────────────────────\n\n` +
        `🏠 Home\n<@${p1.id}> [${p1.elo}] ${nhlEmojiMap[p1.homeTeam]}`;

      const homeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ack_play_${p1.id}_${pairId}`)
          .setLabel('Play')
          .setEmoji(nhlEmojiMap[p1.homeTeam])
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ack_dont_${p1.id}_${pairId}`)
          .setLabel("Don't Play")
          .setEmoji(nhlEmojiMap[p1.homeTeam])
          .setStyle(ButtonStyle.Danger)
      );

      const homeMsg = await channel.send({
        content: homeContent,
        components: [homeRow]
      });

      p1.ackMessage = homeMsg;

      //
      // Prevent duplicate matchups being sent
      //
      p1.matchupMessageSent = true;
      p2.matchupMessageSent = true;
    }

    // Update queue window after processing
    await sendOrUpdateQueueMessage(client);

  } finally {
    processingMatchups = false;
  }
}



// ----------------- Interaction handler -----------------
async function handleInteraction(interaction) {
    try {
        if (!interaction.isButton()) return;

        const id = interaction.customId;

        //
        // ------------------------------------------
        // JOIN QUEUE
        // ------------------------------------------
        //
        if (id.startsWith("queue_join_")) {
            const userId = interaction.user.id;

            if (queue.find(q => q.userId === userId)) {
                return interaction.reply({ content: "You are already in the queue.", ephemeral: true });
            }

            const name = interaction.member.displayName || interaction.user.username;

            queue.push({
                userId,
                name,
                mmr: 0,
                matchupMessageSent: false,
                pendingPairId: null,
                ack_home: false,
                ack_away: false
            });

            await interaction.reply({ content: "You've joined the queue!", ephemeral: true });
            updateQueueWindow(interaction.client);
            processPendingMatchups(interaction.client);
            return;
        }

        //
        // ------------------------------------------
        // LEAVE QUEUE
        // ------------------------------------------
        //
        if (id.startsWith("queue_leave_")) {
            const userId = interaction.user.id;

            const idx = queue.findIndex(q => q.userId === userId);
            if (idx === -1) {
                return interaction.reply({ content: "You are not in the queue.", ephemeral: true });
            }

            // Cleanup pending data
            queue[idx].matchupMessageSent = false;
            queue[idx].pendingPairId = null;

            queue.splice(idx, 1);

            await interaction.reply({ content: "You've left the queue.", ephemeral: true });
            updateQueueWindow(interaction.client);
            return;
        }

        //
        // ------------------------------------------
        // ACKNOWLEDGE (PLAY)
        // ------------------------------------------
        //
        if (id.startsWith("ack_play_")) {
            const [_, __, userId, pairId] = id.split("_");

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This button isn't for you.", ephemeral: true });
            }

            const players = queue.filter(q => q.pendingPairId === pairId);
            if (players.length !== 2) {
                return interaction.reply({ content: "Match no longer valid.", ephemeral: true });
            }

            const home = players.find(p => p.isHome);
            const away = players.find(p => !p.isHome);

            if (!home || !away) {
                return interaction.reply({ content: "Matchup error.", ephemeral: true });
            }

            if (home.userId === userId) home.ack_home = true;
            if (away.userId === userId) away.ack_away = true;

            // Disable THIS message’s buttons
            const disabledRows = interaction.message.components.map(row => {
                const newRow = new ActionRowBuilder();
                row.components.forEach(btn => {
                    newRow.addComponents(ButtonBuilder.from(btn).setDisabled(true));
                });
                return newRow;
            });

            await interaction.update({ components: disabledRows });

            // Show checkmark in queue window
            updateQueueWindow(interaction.client);

            // If both acknowledged — delete both ack messages
            if (home.ack_home && away.ack_away) {
                try {
                    if (home.ackMessage) await home.ackMessage.delete();
                    if (away.ackMessage) await away.ackMessage.delete();
                } catch (e) {}

                // Remove both from queue
                queue = queue.filter(q => q.pendingPairId !== pairId);

                updateQueueWindow(interaction.client);
            }

            return;
        }

        //
        // ------------------------------------------
        // DON'T PLAY
        // ------------------------------------------
        //
        if (id.startsWith("ack_dont_")) {
            const [_, __, userId, pairId] = id.split("_");

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This button isn’t for you.", ephemeral: true });
            }

            const players = queue.filter(q => q.pendingPairId === pairId);

            // Delete both ack messages
            for (const p of players) {
                try { if (p.ackMessage) await p.ackMessage.delete(); } catch (e) {}
            }

            // Remove both from queue
            queue = queue.filter(q => q.pendingPairId !== pairId);

            await interaction.reply({ content: "Match canceled. You were removed from the queue.", ephemeral: true });

            updateQueueWindow(interaction.client);
            return;
        }

    } catch (err) {
        console.error("❌ Error handling interaction:", err);
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
