// queue.js
/*
Persistent NHL '95 Queue System
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
      .setTitle('🎮 NHL \'95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  const soloPlayers = queue.filter(u => !u.pendingPairId);
  const pendingPlayers = queue.filter(u => u.pendingPairId);

  let description = '';

  if (soloPlayers.length) {
    description += soloPlayers
      .map((u, i) => `${i + 1}. ${u.name} [${u.elo}]`)
      .join('\n');
  }

  if (pendingPlayers.length) {
    const seen = new Set();
    for (const p of pendingPlayers) {
      if (seen.has(p.id)) continue;
      const partner = queue.find(x => x.id === p.pendingPairId);
      if (!partner) continue;

      const pEmoji = p.acknowledged ? '✅' : '🟡';
      const partnerEmoji = partner.acknowledged ? '✅' : '🟡';

      description += description ? '\n' : '';
      description += `- ${p.name} [${p.elo}] ${pEmoji} vs ${partner.name} [${partner.elo}] ${partnerEmoji}`;

      seen.add(p.id);
      seen.add(partner.id);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 NHL \'95 Game Queue')
    .setDescription(description)
    .setColor('#0099ff')
    .setTimestamp();

  return embed;
}

// ----------------- Mutex for safe queue message updates -----------------
let queueUpdateInProgress = false;

async function sendOrUpdateQueueMessage(client) {
  if (queueUpdateInProgress) return; // skip if already updating
  queueUpdateInProgress = true;

  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    const embed = await buildQueueEmbed();
    console.log('🔹 Queue embed built');

    let existing = null;
    if (client.queueMessageId) {
      try {
        existing = await channel.messages.fetch(client.queueMessageId);
        console.log('🔹 Found existing message');
      } catch {}
    }

    if (existing) {
      await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
    } else {
      const messages = await channel.messages.fetch({ limit: 10 });
      existing = messages.find(m => m.content === '**NHL \'95 Game Queue**');
      if (existing) {
        client.queueMessageId = existing.id;
        await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
      } else {
        const newMsg = await channel.send({ content: '**NHL \'95 Game Queue**', embeds: [embed], components: [buildQueueButtons()] });
        client.queueMessageId = newMsg.id;
      }
    }
  } catch (err) {
    console.error('❌ Failed to send/update queue message:', err);
    console.error('Error stack:', err.stack);
  } finally {
    queueUpdateInProgress = false;
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
const MATCHUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function processPendingMatchups(client) {
  if (processingMatchups) return;
  processingMatchups = true;

  try {
    // Only select players who are waiting and not already locked/paired/messaged
    const waitingPlayers = queue.filter(
      u => u.status === 'waiting' && !u.pendingPairId && !u.lockedForPairing
    );

    if (waitingPlayers.length < 2) return;

    const nhlEmojiMap = getNHLEmojiMap();
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    // Loop in pairs
    for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
      const p1 = waitingPlayers[i];
      const p2 = waitingPlayers[i + 1];

      // Skip if either player is already paired or locked
      if (p1.pendingPairId || p2.pendingPairId || p1.lockedForPairing || p2.lockedForPairing) continue;

      // Lock players for pairing
      p1.lockedForPairing = true;
      p2.lockedForPairing = true;

      // Set pending pair ID
      p1.pendingPairId = p2.id;
      p2.pendingPairId = p1.id;

      // Set status
      p1.status = 'pending';
      p2.status = 'pending';

      // Randomly assign home/away teams
      const teams = Object.keys(getNHLEmojiMap());
      let homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) awayTeam = teams[Math.floor(Math.random() * teams.length)];

      p1.homeTeam = homeTeam;
      p1.awayTeam = awayTeam;
      p2.homeTeam = homeTeam;
      p2.awayTeam = awayTeam;

      // --- Send Ack Messages (prevent duplicates) ---
      const messages = await channel.messages.fetch({ limit: 50 });

      // Away
      if (!p2.matchupMessage) {
        const existingAway = messages.find(m =>
          m.content.includes(`<@${p2.id}>`) && m.content.includes('🚌 Away')
        );
        if (existingAway) {
          p2.matchupMessage = existingAway;
        } else {
          const awayContent =
            `🎮 Matchup Pending Acknowledgment\nEach player, please acknowledge using the buttons below.\n\n` +
            `🚌 Away\n<@${p2.id}> ${p2.name} [${p2.elo}] ${nhlEmojiMap[p2.awayTeam]}`;
          const awayRow = buildAckButtons(p2.id, nhlEmojiMap[p2.awayTeam]);
          p2.matchupMessage = await channel.send({ content: awayContent, components: [awayRow] });
        }
      }

      // Home
      if (!p1.matchupMessage) {
        const existingHome = messages.find(m =>
          m.content.includes(`<@${p1.id}>`) && m.content.includes('🏠 Home')
        );
        if (existingHome) {
          p1.matchupMessage = existingHome;
        } else {
          const homeContent =
            `──────────────────────────\n\n` +
            `🏠 Home\n<@${p1.id}> ${p1.name} [${p1.elo}] ${nhlEmojiMap[p1.homeTeam]}`;
          const homeRow = buildAckButtons(p1.id, nhlEmojiMap[p1.homeTeam]);
          p1.matchupMessage = await channel.send({ content: homeContent, components: [homeRow] });
        }
      }

      // --- Timeout for unacknowledged matchup ---
      const timeoutId = setTimeout(async () => {
        try {
          const player1 = queue.find(u => u.id === p1.id);
          const player2 = queue.find(u => u.id === p2.id);

          if (player1 && player2 && player1.pendingPairId === p2.id) {
            if (player1.matchupMessage) try { await player1.matchupMessage.delete(); } catch {}
            if (player2.matchupMessage) try { await player2.matchupMessage.delete(); } catch {}

            queue = queue.filter(u => ![p1.id, p2.id].includes(u.id));
            await sendOrUpdateQueueMessage(client);

            console.log(`⏰ Matchup timed out: ${p1.name} vs ${p2.name}`);
          }
        } catch (err) {
          console.error('❌ Error handling matchup timeout:', err);
        } finally {
          if (p1) delete p1.lockedForPairing;
          if (p2) delete p2.lockedForPairing;
        }
      }, MATCHUP_TIMEOUT_MS);

      p1.timeoutId = timeoutId;
      p2.timeoutId = timeoutId;
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
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }

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
        if (leavingPlayer.timeoutId) clearTimeout(leavingPlayer.timeoutId);

        if (leavingPlayer.matchupMessage) {
          try {
            await leavingPlayer.matchupMessage.delete();
          } catch (err) {
            console.error(err);
          }
        }

        const partner = queue.find(u => u.id === leavingPlayer.pendingPairId);
        if (partner) {
          if (partner.timeoutId) clearTimeout(partner.timeoutId);
          if (partner.matchupMessage) {
            try {
              await partner.matchupMessage.delete();
            } catch (err) {
              console.error(err);
            }
          }
          partner.status = 'waiting';
          delete partner.pendingPairId;
          delete partner.matchupMessage;
          delete partner.acknowledged;
        }
      }

      queue = queue.filter(u => u.id !== userId);
      await sendOrUpdateQueueMessage(client);
      return;
    }

    // --- Acknowledge Play / Decline ---
    if (interaction.customId.startsWith('ack_play_') || interaction.customId.startsWith('ack_decline_')) {
      const targetPlayerId = interaction.customId.split('_')[2];

      if (userId !== targetPlayerId) {
        await interaction.followUp({ content: '❌ This button is not for you! Only the tagged player can respond.', ephemeral: true });
        return;
      }

      const player = queue.find(u => u.id === userId);
      if (!player || !player.pendingPairId) return;
      const partner = queue.find(u => u.id === player.pendingPairId);

      const nhlEmojiMap = getNHLEmojiMap();
      const ratedChannel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);

      // --- Play ---
      if (interaction.customId.startsWith('ack_play_')) {
        player.acknowledged = true;

        if (interaction.message) {
          const disabledRow = new ActionRowBuilder().addComponents(
            interaction.message.components[0].components.map(btn =>
              ButtonBuilder.from(btn).setDisabled(true)
            )
          );
          try {
            await interaction.message.edit({ components: [disabledRow] });
          } catch (err) {
            console.error('❌ Failed to disable Play buttons:', err);
          }
        }

        await sendOrUpdateQueueMessage(client);

        // Finalize matchup if both acknowledged
        if (partner && partner.acknowledged) {
          if (player.timeoutId) clearTimeout(player.timeoutId);
          if (partner.timeoutId) clearTimeout(partner.timeoutId);

          if (player.matchupMessage) {
            try {
              await player.matchupMessage.delete();
            } catch (err) {
              console.error(err);
            }
          }
          if (partner.matchupMessage) {
            try {
              await partner.matchupMessage.delete();
            } catch (err) {
              console.error(err);
            }
          }

          await ratedChannel.send(
            `🎮 Rated Game Matchup!\n🚌 Away: <@${partner.id}> ${partner.name} [${partner.elo}] ${nhlEmojiMap[partner.awayTeam]}\n` +
            `🏠 Home: <@${player.id}> ${player.name} [${player.elo}] ${nhlEmojiMap[player.homeTeam]}`
          );

          try {
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            const auth = new google.auth.GoogleAuth({
              credentials,
              scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const sheets = google.sheets({ version: 'v4', auth });

            const now = new Date().toISOString();

            const newRow = [
              `${player.id}-${partner.id}-${Date.now()}`,
              partner.name,
              partner.awayTeam,
              player.name,
              player.homeTeam,
              now,
              'Pending',
              ''
            ];

            await sheets.spreadsheets.values.append({
              spreadsheetId: process.env.SPREADSHEET_ID,
              range: 'PendingGames!A:H',
              valueInputOption: 'USER_ENTERED',
              resource: { values: [newRow] }
            });

            console.log(`✅ Pending game recorded: ${player.name} vs ${partner.name}`);
          } catch (err) {
            console.error('❌ Failed to write PendingGames row:', err);
          }

          queue = queue.filter(u => ![player.id, partner.id].includes(u.id));
          await sendOrUpdateQueueMessage(client);
        }
      }

      // --- Don't Play ---
      if (interaction.customId.startsWith('ack_decline_')) {
        if (player.timeoutId) clearTimeout(player.timeoutId);
        if (partner && partner.timeoutId) clearTimeout(partner.timeoutId);

        if (partner && partner.matchupMessage) {
          try {
            await partner.matchupMessage.delete();
          } catch (err) {
            console.error(err);
          }
        }
        if (player.matchupMessage) {
          try {
            await player.matchupMessage.delete();
          } catch (err) {
            console.error(err);
          }
        }

        queue = queue.filter(u => ![player.id, partner?.id].includes(u.id));
        await sendOrUpdateQueueMessage(client);
        await processPendingMatchups(client);
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// ----------------- Initialize Queue on Bot Startup -----------------
async function initializeQueue(client) {
  try {
    console.log('🔄 Initializing queue system...');
    queue.length = 0;

    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 100 });
    for (const msg of messages.values()) {
      try {
        await msg.delete();
      } catch (err) {
        console.error(err);
      }
    }

    await sendOrUpdateQueueMessage(client);
    console.log('✅ Queue system initialized - channel cleared, empty queue window created');
  } catch (err) {
    console.error('❌ Error initializing queue:', err);
  }
}

// ----------------- Reset -----------------
async function resetQueueChannel(client, options = { clearMemory: true }) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });
    for (const msg of messages.values()) {
      try {
        await msg.delete();
      } catch (err) {
        console.error(err);
      }
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

export { queue, sendOrUpdateQueueMessage, handleInteraction, resetQueueChannel, processPendingMatchups, initializeQueue };
