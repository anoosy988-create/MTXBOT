// mtx bot - my own protection bot
// dont copy this shit

const client = new discord.Client({
    intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.GuildMembers,
        discord.GatewayIntentBits.MessageContent,
        discord.GatewayIntentBits.GuildModeration
    ]
});

const prefix = '.';

// db
let db = {};
try {
    db = JSON.parse(fs.readFileSync('./db.json'));
} catch (err) {
    db = { warns: {}, prot: {} };
    fs.writeFileSync('./db.json', JSON.stringify(db));
}

function save() {
    fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
}

function emb(color, title, desc) {
    return new discord.EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
}

function isAdmin(m) {
    return m.permissions.has(discord.PermissionsBitField.Flags.Administrator) || m.id === m.guild.ownerId;
}

// tracker for anti nuke
const actions = new Map();

function track(gid, uid, type) {
    const key = gid + '_' + uid;
    const now = Date.now();
    
    if (!actions.has(key)) actions.set(key, {});
    const data = actions.get(key);
    
    if (!data[type]) data[type] = [];
    data[type].push(now);
    
    // remove old (10 seconds)
    data[type] = data[type].filter(t => now - t < 10000);
    
    return data[type].length;
}

// punishment
async function nukePunish(guild, userId, reason) {
    console.log('NUKE: ' + userId + ' - ' + reason);
    
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    
    // remove all roles
    try {
        for (const r of member.roles.cache.values()) {
            if (r.name !== '@everyone' && r.editable) {
                await member.roles.remove(r);
            }
        }
    } catch (e) {
        console.log('cant remove roles: ' + e.message);
    }
    
    // ban
    try {
        await guild.members.ban(userId, { reason: 'MTX: ' + reason, deleteMessageDays: 0 });
    } catch (e) {
        console.log('ban failed: ' + e.message);
        try {
            await member.kick('MTX: ' + reason);
        } catch (e2) {
            console.log('kick also failed: ' + e2.message);
        }
    }
    
    // notify owner
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
        owner.send('🚨 Nuke detected!\nUser: <@' + userId + '>\nReason: ' + reason).catch(() => {});
    }
}

// ==================== ANTI NUKE EVENTS ====================

// channel delete (audit log)
client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.ChannelDelete }).catch(() => null);
    if (!logs) return;
    
    const entry = logs.entries.first();
    if (!entry) return;
    
    const user = entry.executor;
    if (user.id === client.user.id) return;
    if (isAdmin(await channel.guild.members.fetch(user.id).catch(() => null))) return;
    
    const count = track(channel.guild.id, user.id, 'delch');
    console.log(user.tag + ' deleted channel (' + count + '/10)');
    
    if (count >= 10) {
        await nukePunish(channel.guild, user.id, 'deleted ' + count + ' channels');
    }
});

// channel create (audit log)
client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.ChannelCreate }).catch(() => null);
    if (!logs) return;
    
    const entry = logs.entries.first();
    if (!entry) return;
    
    const user = entry.executor;
    if (user.id === client.user.id) return;
    if (isAdmin(await channel.guild.members.fetch(user.id).catch(() => null))) return;
    
    const count = track(channel.guild.id, user.id, 'mkch');
    console.log(user.tag + ' created channel (' + count + '/10)');
    
    if (count >= 10) {
        await nukePunish(channel.guild, user.id, 'created ' + count + ' channels');
    }
});

// role delete
client.on('roleDelete', async role => {
    const logs = await role.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.RoleDelete }).catch(() => null);
    if (!logs) return;
    
    const entry = logs.entries.first();
    if (!entry) return;
    
    const user = entry.executor;
    if (user.id === client.user.id) return;
    if (isAdmin(await role.guild.members.fetch(user.id).catch(() => null))) return;
    
    const count = track(role.guild.id, user.id, 'delrl');
    console.log(user.tag + ' deleted role (' + count + '/10)');
    
    if (count >= 10) {
        await nukePunish(role.guild, user.id, 'deleted ' + count + ' roles');
    }
});

// ban
client.on('guildBanAdd', async ban => {
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.MemberBanAdd }).catch(() => null);
    if (!logs) return;
    
    const entry = logs.entries.first();
    if (!entry) return;
    
    const user = entry.executor;
    if (user.id === client.user.id) return;
    if (isAdmin(await ban.guild.members.fetch(user.id).catch(() => null))) return;
    
    const count = track(ban.guild.id, user.id, 'ban');
    console.log(user.tag + ' banned (' + count + '/5)');
    
    if (count >= 5) {
        await nukePunish(ban.guild, user.id, 'banned ' + count + ' users');
    }
});

// kick
client.on('guildMemberRemove', async member => {
    const logs = await member.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.MemberKick }).catch(() => null);
    if (!logs) return;
    
    const entry = logs.entries.first();
    if (!entry || entry.target.id !== member.id) return;
    
    const user = entry.executor;
    if (user.id === client.user.id) return;
    if (isAdmin(await member.guild.members.fetch(user.id).catch(() => null))) return;
    
    const count = track(member.guild.id, user.id, 'kick');
    console.log(user.tag + ' kicked (' + count + '/10)');
    
    if (count >= 10) {
        await nukePunish(member.guild, user.id, 'kicked ' + count + ' users');
    }
});

// bot added
client.on('guildMemberAdd', async member => {
    if (!member.user.bot) return;
    
    setTimeout(async () => {
        const logs = await member.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.BotAdd }).catch(() => null);
        if (!logs) return;
        
        const entry = logs.entries.first();
        if (!entry) return;
        
        const adder = entry.executor;
        if (adder.id === client.user.id) return;
        if (isAdmin(await member.guild.members.fetch(adder.id).catch(() => null))) return;
        
        console.log('BOT ADDED: ' + adder.tag);
        
        await nukePunish(member.guild, adder.id, 'added bot ' + member.user.tag);
        member.kick('unauthorized').catch(() => {});
    }, 500);
});

// ==================== SLASH COMMAND BLOCKER ====================
// THIS IS THE IMPORTANT PART - BLOCKS NUKE SLASH COMMANDS

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const user = interaction.user;
    const member = interaction.member;
    const guild = interaction.guild;
    
    // admin bypass
    if (isAdmin(member)) return;
    
    // dangerous commands that nuke bots use
    const dangerousCommands = [
        'delete', 'nuke', 'destroy', 'clear', 'purge',
        'banall', 'kickall', 'massban', 'masskick',
        'deletechannels', 'deleteroles', 'delete-rooms', 'delete-roles',
        'add-room', 'createchannels', 'spam', 'raid'
    ];
    
    const cmdName = interaction.commandName.toLowerCase();
    
    // check if command is dangerous
    const isDangerous = dangerousCommands.some(d => cmdName.includes(d));
    
    if (isDangerous) {
        console.log('DANGEROUS SLASH COMMAND: ' + cmdName + ' by ' + user.tag);
        
        // block the command
        try {
            await interaction.reply({ content: 'This command is blocked by MTX protection.', ephemeral: true });
        } catch (e) {
            // if already replied, ignore
        }
        
        // track this as nuke action
        const count = track(guild.id, user.id, 'slash');
        console.log(user.tag + ' used dangerous slash (' + count + '/3)');
        
        // instant ban on first dangerous command
        await nukePunish(guild, user.id, 'used dangerous slash command: ' + cmdName);
        
        return;
    }
});

// ==================== COMMANDS ====================

client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.guild) return;
    if (!msg.content.startsWith(prefix)) return;
    
    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    if (!isAdmin(msg.member) && cmd !== 'العاب') return msg.reply('no perms');
    
    if (cmd === 'باند') {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        m.ban({ reason: 'banned by ' + msg.author.tag, deleteMessageDays: 0 });
        msg.reply('banned ' + m);
    }
    
    else if (cmd === 'تف') {
        const id = args[0];
        if (!id) return msg.reply('give id');
        msg.guild.members.unban(id);
        msg.reply('unbanned');
    }
    
    else if (cmd === 'بنعالي') {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        m.kick('kicked by ' + msg.author.tag);
        msg.reply('kicked ' + m);
    }
    
    else if (cmd === 'اسكت') {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        const time = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        let ms;
        if (time.endsWith('h')) ms = parseInt(time) * 3600000;
        else if (time.endsWith('d')) ms = parseInt(time) * 86400000;
        else if (time.endsWith('m')) ms = parseInt(time) * 60000;
        else ms = parseInt(time) * 1000;
        m.timeout(ms, 'muted by ' + msg.author.tag);
        msg.reply('muted ' + m + ' for ' + time);
    }
    
    else if (cmd === 'تكلم') {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        m.timeout(null);
        msg.reply('unmuted ' + m);
    }
    
    else if (cmd === 'تحذير') {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        const reason = args.filter(a => !a.includes(m.id)).join(' ') || 'no reason';
        
        const key = msg.guild.id + '_' + m.id;
        if (!db.warns[key]) db.warns[key] = [];
        db.warns[key].push({ reason, mod: msg.author.id, time: Date.now() });
        save();
        
        const count = db.warns[key].length;
        if (count >= 5) {
            m.timeout(2 * 24 * 3600000, '5 warnings');
            msg.reply(m + ' muted 2 days for 5 warnings');
            delete db.warns[key];
            save();
            return;
        }
        msg.reply(m + ' warned (' + count + '/5)');
    }
    
    else if (cmd === 'ق') {
        const ch = msg.mentions.channels.first() || msg.channel;
        ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        msg.reply('locked ' + ch);
    }
    
    else if (cmd === 'ف') {
        const ch = msg.mentions.channels.first() || msg.channel;
        ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        msg.reply('unlocked ' + ch);
    }
    
    else if (cmd === 'م') {
        const n = parseInt(args[0]) || 10;
        if (n > 100) return msg.reply('max 100');
        const del = await msg.channel.bulkDelete(n + 1, true);
        const m = await msg.reply('deleted ' + (del.size - 1));
        setTimeout(() => m.delete(), 3000);
    }
    
    else if (cmd === 'العاب') {
        const row = new discord.ActionRowBuilder().addComponents(
            new discord.ButtonBuilder().setCustomId('rl').setLabel('🎲 روليت').setStyle(discord.ButtonStyle.Success),
            new discord.ButtonBuilder().setCustomId('mf').setLabel('🕵️ مافيا').setStyle(discord.ButtonStyle.Danger),
            new discord.ButtonBuilder().setCustomId('cs').setLabel('🏰 كاستل').setStyle(discord.ButtonStyle.Primary),
            new discord.ButtonBuilder().setCustomId('tt').setLabel('⚔️ تكت تو').setStyle(discord.ButtonStyle.Secondary)
        );
        msg.reply({ embeds: [emb(0x2ecc71, 'Games', 'choose a game')], components: [row] });
    }
});

// button handler for games
client.on('interactionCreate', async i => {
    if (!i.isButton()) return;
    const games = {
        rl: { t: '🎲 روليت', d: 'game of luck', c: 0xe74c3c },
        mf: { t: '🕵️ مافيا', d: 'deception game', c: 0x2c3e50 },
        cs: { t: '🏰 كاستل', d: 'castle war', c: 0x9b59b6 },
        tt: { t: '⚔️ تكت تو', d: 'classic XO', c: 0x34495e }
    };
    const g = games[i.customId];
    if (g) i.reply({ embeds: [emb(g.c, g.t, g.d)], ephemeral: true });
});

// keep alive
const http = require('http');
http.createServer((req, res) => {
    res.end('mtx running');
}).listen(process.env.PORT || 3000);

client.on('ready', () => {
    console.log('MTX online - ' + client.user.tag);
    client.user.setPresence({ activities: [{ name: 'MTX Anti-Nuke', type: 3 }], status: 'online' });
});

client.login(process.env.TOKEN).catch(err => {
    console.log('login failed: ' + err);
    process.exit(1);
});
