// welcome.js
// League Material channel ID: 1197185335248031784
// Rules channel ID:  1196274672367575040
// Edwardo Juarez userID: 1398030768072167525
// TickleBot userID: 1394409621229408296

export function handleGuildMemberAdd(client) {
  client.on('guildMemberAdd', async (member) => {
    const welcomeChannelId = '1197193529059979475';
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const message = `
🐺 PNPL nerds, a new geek has joined! Welcome to the league, <@${member.id}>! You've just made the best decision of your life.

My name is Ed. I love dragons, the movie *Nyad*, and Pearl Jam.

Listen... here's some info to get you started:

📝 You can find the league rules here: <#1196274672367575040>  
🕹️ You can grab the ROM from here: <#1197185335248031784> — you'll also find the link to the Google Sheet in there. To get edit access, DM your email to **TicklePuss**.

PYGs...
    `;

    channel.send(message).catch(console.error);

  });
}
