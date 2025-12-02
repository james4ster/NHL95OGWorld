// welcome.js
// League Material channel ID: 1197185335248031784
// Rules channel ID:  1196274672367575040
// Edwardo Juarez userID: 1398030768072167525
// TickleBot userID: 1394409621229408296

export function handleGuildMemberAdd(client) {
  client.on('guildMemberAdd', async (member) => {
    const welcomeChannelId = '1433072805225828493';
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const message = `
🧷 Welcome to the NHL95 Online Circuit... <@${member.id}>! You've just made the best decision of your life.

Here's some info to get you started:

📝 You're starting point should be here: <#1433072699789545565>  - This is where you will find the **SETUP INSTRUCTIONS**, as well as other general information, recommended controllers, etc.  

❓If you have any questions, post them in the Help channel:  <#1435623708759949312>

🕹️ You can grab the ROM from here: <#1433490791271104512> — you'll also find the link to the Google Sheet in there. To get edit access, DM your email to **TicklePuss**.

PYGs...
    `;

    channel.send(message).catch(console.error);

  });
}
