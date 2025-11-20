// queue.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

// In-memory queue
let queue = [];

// Queue channel ID
const QUEUE_CHANNEL_ID = '1441041038931132537';

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
// NOTE: async because we fetch ELOs from Google Sheets to display current values
async function buildQueueEmbed(client) {
  // If queue empty, quick return
  if (queue.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎮 NHL ’95 Game Queue')
      .setDescription('_Queue is empty_')
      .setColor('#0099ff')
      .setTimestamp();
  }

  // ---------------------------
  // Fetch mappings from Sheets
  // - PlayerMaster: map discordId -> playerName (PlayerMaster col C)
  // - RawStandings: map playerName -> elo (RawStandings col AM, index 38)
  // ---------------------------
  let idToPlayerName = {};   // discordId -> playerName
  let playerNameToElo = {};  // playerName -> elo

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // PlayerMaster: read A:C (Discord ID, username, playerName) - we want A -> C
    const pmRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:C',
    });
    const pmData = pmRes.data.values || [];
    // each row: [discordId, username, playerName]
    for (const row of pmData) {
      const discordId = row[0];
      const playerName = row[2]; // PlayerMaster column C
      if (discordId && playerName) idToPlayerName[discordId] = playerName;
    }

    // RawStandings: read A:AM (we need column A (playerName) and AM index 38)
    const rsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AM',
    });
    const rsData = rsRes.data.values || [];
    for (const row of rsData) {
      const playerName = row[0]; // RawStandings column A
      const eloRaw = row[38];    // RawStandings column AM (0-based index 38)
      const elo = eloRaw ? parseInt(eloRaw, 10) : 1500;
      if (playerName) playerNameToElo[playerName] = elo;
    }
  } catch (err) {
    console.error('❌ Error fetching sheets data for ELO mapping:', err);
  }

  // Build list, resolving each queued user's playerName and elo
  const list = queue
    .map((u, i) => {
      // u may be { id, name, elo } from older entries — prefer authoritative mapping
      const discordId = u.id;
      const playerName = idToPlayerName[discordId] || u.name || `<@${discordId}>`;
      const elo = playerNameToElo[playerName] || (u.elo || 1500);
      // Show the playerName (if it's a plain string) but still mention the Discord user for clarity
      // If playerName looks like a Discord mention already, keep it
      const displayName = playerName.startsWith('<@') ? playerName : playerName;
      return `${i + 1}. ${displayName} [${elo}]`;
    })
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🎮 NHL ’95 Game Queue')
    .setDescription(list)
    .setColor('#0099ff')
    .setTimestamp();
}

// Send or update the persistent queue message
async function sendOrUpdateQueueMessage(client) {
  if (!client.queueMessageId) {
    // Message ID missing → send a new persistent queue window
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

  // Update the existing queue message
  try {
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    const msg = await channel.messages.fetch(client.queueMessageId);
    const embed = await buildQueueEmbed(client);
    await msg.edit({ embeds: [embed], components: [buildButtons()] });
  } catch (err) {
    console.log('❌ Could not edit queue message. Recreating single persistent window.');

    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);

    // Delete ALL messages to guarantee only one window exists
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const m of msgs.values()) {
      try { await m.delete(); } catch {}
    }

    // Create ONE fresh queue window
    const embed = await buildQueueEmbed(client);
    const newMsg = await channel.send({
      content: '**NHL ’95 Game Queue**',
      embeds: [embed],
      components: [buildButtons()],
    });

    // Save the new ID
    client.queueMessageId = newMsg.id;
  }
}

// Handle button interactions
async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  // Check whether the persistent message exists BEFORE acknowledging the interaction.
  // If it's missing, recreate it first to avoid interaction conflicts.
  let persistentExists = true;
  try {
    if (!client.queueMessageId) throw new Error('no id');
    const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
    await channel.messages.fetch(client.queueMessageId);
  } catch (e) {
    persistentExists = false;
    // Recreate single persistent message (don't defer the interaction yet)
    try {
      const channel = await client.channels.fetch(QUEUE_CHANNEL_ID);
      // delete any stray messages so only one exists afterwards
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
    } catch (err) {
      console.error('❌ Failed to recreate persistent queue message before interaction:', err);
    }
  }

  try {
    // Fetch current ELO/Player mapping once (we use the same sheet reads as buildQueueEmbed)
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // PlayerMaster: map discordId -> playerName (col C)
    const pmRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PlayerMaster!A:C',
    });
    const pmData = pmRes.data.values || [];
    const idToPlayerName = {};
    for (const row of pmData) {
      const discord = row[0];
      const playerName = row[2]; // PlayerMaster column C
      if (discord && playerName) idToPlayerName[discord] = playerName;
    }

    // RawStandings: map playerName -> elo
    const rsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'RawStandings!A:AM',
    });
    const rsData = rsRes.data.values || [];
    const playerNameToElo = {};
    for (const row of rsData) {
      const playerName = row[0];
      const eloRaw = row[38];
      const elo = eloRaw ? parseInt(eloRaw, 10) : 1500;
      if (playerName) playerNameToElo[playerName] = elo;
    }

    // Resolve this user's playerName and elo
    const playerName = idToPlayerName[userId] || interaction.user.username;
    const resolvedElo = playerNameToElo[playerName] || 1500;

    if (interaction.customId === 'join_queue') {
      if (!queue.find(u => u.id === userId)) queue.push({ id: userId, name: playerName, elo: resolvedElo });
    } else if (interaction.customId === 'leave_queue') {
      queue = queue.filter(u => u.id !== userId);
    }

    // Now it's safe to acknowledge the interaction
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    } catch (e) {
      // ignore specific transient interaction errors
      if (e.code && e.code !== 10062) console.error('❌ Error deferring interaction:', e);
    }

    // Update the persistent queue message
    await sendOrUpdateQueueMessage(client);

  } catch (err) {
    console.error('❌ Error handling interaction:', err);
  }
}

// Reset queue channel: delete old messages, flush queue, send fresh persistent message
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
