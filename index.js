// MTX Bot - Anti Nuke System
// Real programmer code, not AI trash

const discord = require('discord.js');
const fs = require('fs');

const client = new discord.Client({
    intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.GuildMembers,
        discord.GatewayIntentBits.MessageContent,
        discord.GatewayIntentBits.GuildModeration,
        discord.GatewayIntentBits.GuildPresences
    ]
});

const PREFIX = '.';

// limits
const LIMITS = {
    CHANNEL_DELETE: 10,    // مسح/إنشاء 10 رومات
    BAN_MEMBERS: 5,        // بند 5 أشخاص
    ROLE_DELETE: 10,       // مسح 10 رولات
    KICK_MEMBERS: 10,      // كيك 10
    TIME_WINDOW: 10000     // 10 ثواني
};

// tracker: { userId: { action: count, timestamp: [] } }
const tracker = new Map();

// simple db
let db = { warnings: {}, protection: {} };
try { db = JSON.parse(fs.readFileSync('./db.json', 'utf8')); } catch {}
function saveDb() { fs.writeFileSync('./db.json', JSON.stringify(db, null, 2)); }

function embed(color, title, desc) {
    return new discord.EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setTimestamp();
}

function canMod(member) {
    return member.permissions.has(discord.PermissionsBitField.Flags.Administrator) || member.id === member.guild.ownerId;
}

// --- ANTI NUKE CORE ---

function trackAction(guildId, userId, action) {
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    
    if (!tracker.has(key)) tracker.set(key, {});
    const data = tracker.get(key);
    
    if (!data[action]) data[action] = [];
    data[action].push(now);
    
    // clean old
    data[action] = data[action].filter(t => now - t <= LIMITS.TIME_WINDOW);
    
    return data[action].length;
}

async function punish(guild, member, reason) {
    console.log(`[MTX NUKE] Punishing ${member.user.tag} for: ${reason}`);
    
    // 1. remove all roles
    try {
        for (const role of member.roles.cache.values()) {
            if (role.name !== '@everyone' && role.editable) {
                await member.roles.remove(role).catch(() => {});
            }
        }
        console.log(`[MTX NUKE] Roles removed`);
    } catch (e) {
        console.log(`[MTX NUKE] Remove roles failed: ${e.message}`);
    }
    
    // 2. ban
    try {
        await guild.members.ban(member.id, { 
            reason: `MTX Anti-Nuke: ${reason}`, 
            deleteMessageDays: 0 
        });
        console.log(`[MTX NUKE] Banned`);
    } catch (e) {
        console.log(`[MTX NUKE] Ban failed: ${e.message}`);
        
        // try kick if ban fails
        try {
            await member.kick(`MTX Anti-Nuke: ${reason}`);
            console.log(`[MTX NUKE] Kicked instead`);
        } catch (e2) {}
    }
    
    // 3. notify owner
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
        const emb = embed(0xff0000, '🚨 Anti-Nuke Triggered!', 
            `**User:** ${member} (\`${member.id}\`)\n` +
            `**Reason:** ${reason}\n` +
            `**Time:** ${new Date().toLocaleString('ar-SA')}\n\n` +
            `**Actions taken:**\n` +
            `✅ Roles removed\n` +
            `✅ Banned/Kicked`
        );
        owner.send({ embeds: [emb] }).catch(() => {});
    }
}

// --- EVENTS ---

// channel create
client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.ChannelCreate });
    const entry = logs.entries.first();
    if (!entry) return;
    
    const executor = entry.executor;
    if (executor.id === client.user.id) return;
    if (canMod(await channel.guild.members.fetch(executor.id).catch(() => null))) return;
    
    const count = trackAction(channel.guild.id, executor.id, 'channelCreate');
    console.log(`[MTX] ${executor.tag} created channel (${count}/${LIMITS.CHANNEL_DELETE})`);
    
    if (count >= LIMITS.CHANNEL_DELETE) {
        await punish(channel.guild, await channel.guild.members.fetch(executor.id), `Created ${count} channels in 10s`);
    }
});

// channel delete
client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.ChannelDelete });
    const entry = logs.entries.first();
    if (!entry) return;
    
    const executor = entry.executor;
    if (executor.id === client.user.id) return;
    if (canMod(await channel.guild.members.fetch(executor.id).catch(() => null))) return;
    
    const count = trackAction(channel.guild.id, executor.id, 'channelDelete');
    console.log(`[MTX] ${executor.tag} deleted channel (${count}/${LIMITS.CHANNEL_DELETE})`);
    
    if (count >= LIMITS.CHANNEL_DELETE) {
        await punish(channel.guild, await channel.guild.members.fetch(executor.id), `Deleted ${count} channels in 10s`);
    }
});

// role delete
client.on('roleDelete', async role => {
    const logs = await role.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.RoleDelete });
    const entry = logs.entries.first();
    if (!entry) return;
    
    const executor = entry.executor;
    if (executor.id === client.user.id) return;
    if (canMod(await role.guild.members.fetch(executor.id).catch(() => null))) return;
    
    const count = trackAction(role.guild.id, executor.id, 'roleDelete');
    console.log(`[MTX] ${executor.tag} deleted role (${count}/${LIMITS.ROLE_DELETE})`);
    
    if (count >= LIMITS.ROLE_DELETE) {
        await punish(role.guild, await role.guild.members.fetch(executor.id), `Deleted ${count} roles in 10s`);
    }
});

// ban
client.on('guildBanAdd', async ban => {
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.MemberBanAdd });
    const entry = logs.entries.first();
    if (!entry) return;
    
    const executor = entry.executor;
    if (executor.id === client.user.id) return;
    if (canMod(await ban.guild.members.fetch(executor.id).catch(() => null))) return;
    
    const count = trackAction(ban.guild.id, executor.id, 'ban');
    console.log(`[MTX] ${executor.tag} banned user (${count}/${LIMITS.BAN_MEMBERS})`);
    
    if (count >= LIMITS.BAN_MEMBERS) {
        await punish(ban.guild, await ban.guild.members.fetch(executor.id), `Banned ${count} users in 10s`);
    }
});

// kick
client.on('guildMemberRemove', async member => {
    const logs = await member.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.MemberKick });
    const entry = logs.entries.first();
    if (!entry || entry.target.id !== member.id) return;
    
    const executor = entry.executor;
    if (executor.id === client.user.id) return;
    if (canMod(await member.guild.members.fetch(executor.id).catch(() => null))) return;
    
    const count = trackAction(member.guild.id, executor.id, 'kick');
    console.log(`[MTX] ${executor.tag} kicked user (${count}/${LIMITS.KICK_MEMBERS})`);
    
    if (count >= LIMITS.KICK_MEMBERS) {
        await punish(member.guild, await member.guild.members.fetch(executor.id), `Kicked ${count} users in 10s`);
    }
});

// bot add = instant ban
client.on('guildMemberAdd', async member => {
    if (!member.user.bot) return;
    
    await new Promise(r => setTimeout(r, 500));
    
    const logs = await member.guild.fetchAuditLogs({ limit: 1, type: discord.AuditLogEvent.BotAdd });
    const entry = logs.entries.first();
    if (!entry) return;
    
    const adder = entry.executor;
    if (adder.id === client.user.id) return;
    if (canMod(await member.guild.members.fetch(adder.id).catch(() => null))) return;
    
    console.log(`[MTX] Bot added by ${adder.tag} - INSTANT BAN`);
    
    // ban adder
    await punish(member.guild, await member.guild.members.fetch(adder.id), 'Added unauthorized bot');
    
    // kick bot
    await member.kick('MTX: unauthorized').catch(() => {});
});

// --- COMMANDS ---

const cmds = {
    باند: async (msg, args) => {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        const reason = args.filter(a => !a.includes(m.id)).join(' ') || 'no reason';
        await m.ban({ reason, deleteMessageDays: 0 });
        msg.reply(`banned ${m}`);
    },
    
    تف: async (msg, args) => {
        const id = args[0];
        if (!id) return msg.reply('provide id');
        await msg.guild.members.unban(id);
        msg.reply('unbanned');
    },
    
    بنعالي: async (msg, args) => {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        await m.kick('kicked');
        msg.reply(`kicked ${m}`);
    },
    
    اسكت: async (msg, args) => {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        const time = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        const ms = time.endsWith('h') ? parseInt(time)*3600000 : time.endsWith('d') ? parseInt(time)*86400000 : parseInt(time)*60000;
        await m.timeout(ms, 'muted');
        msg.reply(`muted ${m} for ${time}`);
    },
    
    تكلم: async (msg, args) => {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        await m.timeout(null);
        msg.reply(`unmuted ${m}`);
    },
    
    تحذير: async (msg, args) => {
        const m = msg.mentions.members.first();
        if (!m) return msg.reply('mention someone');
        const reason = args.filter(a => !a.includes(m.id)).join(' ') || 'no reason';
        
        const key = `${msg.guild.id}_${m.id}`;
        if (!db.warnings[key]) db.warnings[key] = [];
        db.warnings[key].push({ reason, mod: msg.author.id, time: Date.now() });
        saveDb();
        
        const count = db.warnings[key].length;
        if (count >= 5) {
            await m.timeout(2*24*3600000, '5 warnings');
            msg.reply(`${m} muted 2 days for 5 warnings`);
            delete db.warnings[key];
            saveDb();
            return;
        }
        msg.reply(`${m} warned (${count}/5)`);
    },
    
    ق: async (msg, args) => {
        const ch = msg.mentions.channels.first() || msg.channel;
        await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        msg.reply(`locked ${ch}`);
    },
    
    ف: async (msg, args) => {
        const ch = msg.mentions.channels.first() || msg.channel;
        await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        msg.reply(`unlocked ${ch}`);
    },
    
    م: async (msg, args) => {
        const n = parseInt(args[0]) || 10;
        if (n > 100) return msg.reply('max 100');
        const deleted = await msg.channel.bulkDelete(n + 1, true);
        const m = await msg.reply(`deleted ${deleted.size - 1}`);
        setTimeout(() => m.delete(), 3000);
    },
    
    العاب: async (msg, args) => {
        const row = new discord.ActionRowBuilder().addComponents(
            new discord.ButtonBuilder().setCustomId('roulette').setLabel('🎲 روليت').setStyle(discord.ButtonStyle.Success),
            new discord.ButtonBuilder().setCustomId('mafia').setLabel('🕵️ مافيا').setStyle(discord.ButtonStyle.Danger),
            new discord.ButtonBuilder().setCustomId('castle').setLabel('🏰 كاستل').setStyle(discord.ButtonStyle.Primary),
            new discord.ButtonBuilder().setCustomId('tictactoe').setLabel('⚔️ تكت تو').setStyle(discord.ButtonStyle.Secondary)
        );
        msg.reply({ embeds: [embed(0x2ecc71, 'ألعاب', 'اختر لعبة')], components: [row] });
    }
};

client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.guild) return;
    if (!msg.content.startsWith(PREFIX)) return;
    
    const args = msg.content.slice(1).trim().split(/\s+/);
    const cmd = args.shift();
    
    if (!cmds[cmd]) return;
    if (!canMod(msg.member) && cmd !== 'العاب') return msg.reply('no perms');
    
    try {
        await cmds[cmd](msg, args);
    } catch (e) {
        console.error(`cmd ${cmd} failed:`, e);
        msg.reply(`error: ${e.message}`);
    }
});

client.on('interactionCreate', async i => {
    if (!i.isButton()) return;
    const games = {
        roulette: { title: '🎲 روليت', desc: 'لعبة الحظ', color: 0xe74c3c },
        mafia: { title: '🕵️ مافيا', desc: 'لعبة الغموض', color: 0x2c3e50 },
        castle: { title: '🏰 كاستل', desc: 'حرب القلاع', color: 0x9b59b6 },
        tictactoe: { title: '⚔️ تكت تو', desc: 'XO', color: 0x34495e }
    };
    const g = games[i.customId];
    if (g) i.reply({ embeds: [embed(g.color, g.title, g.desc)], ephemeral: true });
});

// keep alive
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MTX running');
}).listen(process.env.PORT || 3000);

client.on('ready', () => {
    console.log(`MTX online | ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: 'MTX Anti-Nuke', type: 3 }], status: 'online' });
});

client.login(process.env.TOKEN).catch(e => {
    console.error('login failed:', e);
    process.exit(1);
});
