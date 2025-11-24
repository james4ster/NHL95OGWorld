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

// ----------------- Safe queue message send/edit -----------------
async function sendOrUpdateQueueMessage(client) {
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const embed = await buildQueueEmbed(client);

    if (client.queueMessageId) {
      try {
        const existing = await channel.messages.fetch(client.queueMessageId);
        await existing.edit({ embeds: [embed], components: [buildQueueButtons()] });
        return;
      } catch (err) {
        console.warn('❗ Previous queue message missing; creating a new queue message.');
        client.queueMessageId = null;
      }
    }

    const newMsg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [embed],
      components: [buildQueueButtons()]
    });
    client.queueMessageId = newMsg.id;
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
      const displayElo = u.elo || 1500;
      return `${i + 1}. ${u.name} [${displayElo}] ${statusEmoji}`;
    })
    .join('\n');

  // Build pending pairs display (use pendingPairId to pair correctly)
  const pendingPlayers = queue.filter(u => u.status === 'pending' && u.pendingPairId);
  let pendingDesc = '';
  const seen = new Set();
  for (const p of pendingPlayers) {
    if (seen.has(p.id)) continue;
    const partner = queue.find(x => x.id === p.pendingPairId);
    if (!partner) continue;
    const pEmoji = p.status === 'pending' ? '🟡' : '✅';
    const partnerEmoji = partner.status === 'pending' ? '🟡' : '✅';
    pendingDesc += `- ${p.name} [${p.elo || 1500}] ${pEmoji} vs ${partner.name} [${partner.elo || 1500}] ${partnerEmoji}\n`;
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

// ----------------- DM Pending -----------------
async function sendPendingDM(client, player1, player2) {
  const nhlEmojiMap = getNHLEmojiMap();
  const teams = Object.keys(nhlEmojiMap);

  // ------------------------------------------------------
  // Stable randomized teams + home/away assignment
  // ------------------------------------------------------
  let homeTeam = teams[Math.floor(Math.random() * teams.length)];
  let awayTeam = teams[Math.floor(Math.random() * teams.length)];
  while (awayTeam === homeTeam) {
    awayTeam = teams[Math.floor(Math.random() * teams.length)];
  }

  const homePlayerFirst = Math.random() < 0.5;
  const homePlayer = homePlayerFirst ? player1 : player2;
  const awayPlayer = homePlayerFirst ? player2 : player1;

  // Store stable match metadata on *both* players
  homePlayer.matchHomeTeam = homeTeam;
  awayPlayer.matchHomeTeam = homeTeam;
  homePlayer.matchAwayTeam = awayTeam;
  awayPlayer.matchAwayTeam = awayTeam;

  homePlayer.isHome = true;
  awayPlayer.isHome = false;
  // ------------------------------------------------------

  // mark pair metadata so we can match acks
  homePlayer.status = 'pending';
  homePlayer.pendingPairId = awayPlayer.id;

  awayPlayer.status = 'pending';
  awayPlayer.pendingPairId = homePlayer.id;

  const dmEmbed = new EmbedBuilder()
    .setTitle('🎮 Matchup Pending Acknowledgment')
    .setDescription(
      `Away: ${awayPlayer.name} [${awayPlayer.elo || 1500}] ${nhlEmojiMap[awayPlayer.matchAwayTeam]}\n` +
      `Home: ${homePlayer.name} [${homePlayer.elo || 1500}] ${nhlEmojiMap[homePlayer.matchHomeTeam]}\n\n` +
      `Do you want to play this matchup?`
    )
    .setColor('#ffff00')
    .setTimestamp();

  for (const p of [homePlayer, awayPlayer]) {
    try {
      const user = await client.users.fetch(p.id);
      await user.send({ embeds: [dmEmbed], components: [buildAckButtons(p.id)] });
    } catch (err) {
      console.error('❌ Failed to send DM for acknowledgment to', p.id, err);
      p.status = 'waiting';
      if (p.pendingPairId) {
        const partner = queue.find(q => q.id === p.pendingPairId);
        if (partner) {
          partner.status = 'waiting';
          delete partner.pendingPairId;
        }
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

// ----------------- Pairing processor (batch pairs) -----------------
async function processPendingMatchups(client) {
  const waitingPlayers = queue.filter(u => u.status === 'waiting');
  for (let i = 0; i + 1 < waitingPlayers.length; i += 2) {
    const p1 = waitingPlayers[i];
    const p2 = waitingPlayers[i + 1];
    if (p1.status !== 'waiting' || p2.status !== 'waiting') continue;
    await sendPendingDM(client, p1, p2);
  }
}

// ----------------- Player info fetcher -----------------
async function getPlayerInfo(sheets, discordId) {
  const [pmRes, rsRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:C'
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AM'
    })
  ]);

  const pm = pmRes.data.values || [];
  const rs = rsRes.data.values || [];

  let nickname = null;
  for (const row of pm) {
    if (row[1] === discordId) {
      nickname = row[2];
      break;
    }
  }

  if (!nickname) nickname = discordId;

  const TEAM_INDEX = 3;       // Column D
  const ELO_INDEX = 38;       // Column AM
  const NAME_INDEX = 2;       // Column C

  let team = null;
  let elo = 1500;

  for (const row of rs) {
    if (row[NAME_INDEX] === nickname) {
      team = row[TEAM_INDEX];
      elo = parseInt(row[ELO_INDEX]) || 1500;
      break;
    }
  }

  return { name: nickname, team, elo };
}


// ----------------- Interaction handler -----------------
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const sheets = google.sheets({ version: 'v4', auth: client.jwt });
  const userId = interaction.user.id;

  // ----------------- JOIN QUEUE -----------------
  if (interaction.customId === 'join_queue') {
    const { name, team, elo } = await getPlayerInfo(sheets, userId);

    if (!queue.find(u => u.id === userId)) {
      queue.push({ id: userId, name, team, elo, status: 'waiting' });
    }

    await interaction.reply({ content: 'You joined the queue!', ephemeral: true });
    await sendOrUpdateQueueMessage(client);
    await processPendingMatchups(client);
    return;
  }

  // ----------------- LEAVE QUEUE -----------------
  if (interaction.customId === 'leave_queue') {
    queue = queue.filter(u => u.id !== userId);
    await interaction.reply({ content: 'You left the queue.', ephemeral: true });
    await sendOrUpdateQueueMessage(client);
    return;
  }

  // ----------------- ACKNOWLEDGE / DECLINE -----------------
  if (interaction.customId.startsWith('ack_play_') || interaction.customId.startsWith('ack_decline_')) {
    const accepted = interaction.customId.startsWith('ack_play_');

    const player = queue.find(u => u.id === userId);
    if (!player || !player.pendingPairId) {
      return interaction.reply({ content: "Couldn't find your pending match.", ephemeral: true });
    }

    const partner = queue.find(u => u.id === player.pendingPairId);
    if (!partner) {
      delete player.pendingPairId;
      player.status = 'waiting';
      return interaction.reply({ content: 'Your opponent left the queue.', ephemeral: true });
    }

    if (!accepted) {
      player.status = 'waiting';
      partner.status = 'waiting';
      delete player.pendingPairId;
      delete partner.pendingPairId;

      await interaction.reply({ content: 'You declined the matchup.', ephemeral: true });
      await sendOrUpdateQueueMessage(client);
      return;
    }

    player.status = 'acknowledged';
    await interaction.reply({ content: 'Match acknowledged!', ephemeral: true });
    await sendOrUpdateQueueMessage(client);

    if (partner.status === 'acknowledged') {
      const channel = await client.channels.fetch(RATED_GAMES_CHANNEL_ID);

      // ------------------------------------------------------
      // USE THE STORED MATCH TEAMS + HOME/AWAY
      // ------------------------------------------------------
      const homePlayer = player.isHome ? player : partner;
      const awayPlayer = player.isHome ? partner : player;

      const nhlEmojiMap = getNHLEmojiMap();
      const homeTeam = homePlayer.matchHomeTeam;
      const awayTeam = awayPlayer.matchAwayTeam;

      await channel.send(
        `**Rated Game Matched!**\n` +
        `Home: ${homePlayer.name} [${homePlayer.elo}] ${nhlEmojiMap[homeTeam]}\n` +
        `Away: ${awayPlayer.name} [${awayPlayer.elo}] ${nhlEmojiMap[awayTeam]}`
      );
      // ------------------------------------------------------

      queue = queue.filter(u => u.id !== player.id && u.id !== partner.id);
      await sendOrUpdateQueueMessage(client);
    }
  }
}

export { handleInteraction };
