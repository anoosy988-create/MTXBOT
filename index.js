const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const { connectDB, addWarn, getWarns, clearWarns, delWarn, isProt, addProt, remProt, protOn, setProt, setLog, getLog } = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

const PREFIX = '.';
let startTime;

const green = 0x2ecc71;
const red = 0xe74c3c;
const yellow = 0xf39c12;
const blue = 0x3498db;
const purple = 0x9b59b6;

function embed(color, title, desc) {
    return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setTimestamp();
}

async function sendLog(guild, e) {
    const chId = await getLog(guild.id);
    if (!chId) return;
    const ch = guild.channels.cache.get(chId);
    if (ch) ch.send({ embeds: [e] }).catch(() => {});
}

function parseTime(s) {
    if (!s) return null;
    const num = parseInt(s);
    const unit = s.slice(-1);
    if (unit === 'd') return num * 24 * 60 * 60 * 1000;
    if (unit === 'h') return num * 60 * 60 * 1000;
    if (unit === 'm') return num * 60 * 1000;
    if (unit === 's') return num * 1000;
    return null;
}

const spamMap = new Map();
const linkRegex = /https?:\/\/[^\s]+/gi;

client.on('ready', async () => {
    startTime = Date.now();
    console.log(`bot online: ${client.user.tag}`);
    console.log(`guilds: ${client.guilds.cache.size}`);
    
    client.user.setPresence({
        activities: [{ name: 'MTX | .العاب', type: 3 }],
        status: 'dnd'
    });
    
    const cmds = [
        new SlashCommandBuilder().setName('لوق').setDescription('set log channel').addChannelOption(o => o.setName('channel').setDescription('log channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
        new SlashCommandBuilder().setName('حالة').setDescription('bot status')
    ];
    try {
        await client.application.commands.set(cmds);
    } catch (err) {
        console.log('slash cmd err:', err.message);
    }
});

client.on('guildMemberAdd', async member => {
    if (!member.user.bot) return;
    const guild = member.guild;
    let owner;
    try {
        owner = await guild.fetchOwner();
    } catch (err) {
        console.log('fetch owner err:', err.message);
        return;
    }
    
    const enabled = await protOn(guild.id);
    if (!enabled) return;
    
    try {
        const logs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
        const entry = logs.entries.first();
        if (!entry) return;
        
        const inviter = entry.executor;
        if (inviter.id === owner.id) return;
        if (await isProt(guild.id, inviter.id)) return;
        
        await member.kick('unauthorized bot');
        console.log(`kicked bot ${member.user.tag} added by ${inviter.tag}`);
        
        const kickEmbed = embed(purple, '🛡️ bot kicked', `bot ${member.user.tag} was kicked\nadded by: ${inviter}\ntime: ${new Date().toLocaleString()}`);
        owner.send({ embeds: [kickEmbed] }).catch(() => {});
        sendLog(guild, kickEmbed);
        
        await guild.members.ban(inviter, { reason: 'added unauthorized bot', deleteMessageDays: 0 });
        console.log(`banned ${inviter.tag} for adding bot`);
        
        const banEmbed = embed(purple, '🛡️ user banned', `${inviter} was banned for adding bot ${member.user.tag}`);
        owner.send({ embeds: [banEmbed] }).catch(() => {});
        sendLog(guild, banEmbed);
        
    } catch (err) {
        console.log('anti bot err:', err.message);
    }
});

client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.guild) return;
    
    const isAdmin = msg.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isOwner = msg.author.id === msg.guild.ownerId;
    const isStarter = isAdmin || isOwner;
    
    if (!isAdmin) {
        const now = Date.now();
        let userSpam = spamMap.get(msg.author.id) || [];
        userSpam = userSpam.filter(t => now - t <= 3000);
        userSpam.push(now);
        spamMap.set(msg.author.id, userSpam);
        
        if (userSpam.length >= 5) {
            try {
                await msg.member.timeout(21600000, 'spam');
                const m = await msg.channel.send({ embeds: [embed(yellow, '⚠️ muted for spam', `${msg.author} muted 6 hours for spamming`)] });
                setTimeout(() => m.delete().catch(() => {}), 10000);
                sendLog(msg.guild, embed(blue, '📝 auto mute', `user: ${msg.author}\nreason: spam\nmod: bot`));
            } catch (err) {
                console.log('spam mute err:', err.message);
            }
            return;
        }
    }
    
    if (!isAdmin && !isOwner) {
        if (linkRegex.test(msg.content)) {
            try {
                await msg.delete();
                await msg.member.timeout(1800000, 'posted link');
                const m = await msg.channel.send({ embeds: [embed(yellow, '⚠️ muted for link', `${msg.author} muted 30min for posting links`)] });
                setTimeout(() => m.delete().catch(() => {}), 10000);
                sendLog(msg.guild, embed(blue, '📝 auto mute', `user: ${msg.author}\nreason: link\nmod: bot`));
            } catch (err) {
                console.log('link mute err:', err.message);
            }
            return;
        }
    }
    
    if (!msg.content.startsWith(PREFIX)) return;
    
    const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift();
    
    if (cmd === 'باند') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.باند @user [time] reason')] });
        if (target.id === msg.guild.ownerId) return msg.reply({ embeds: [embed(red, '❌ no', 'cant ban owner')] });
        const timeArg = args.find(a => /^\d+[dhms]$/.test(a));
        let reason = args.filter(a => a !== timeArg && !a.includes(target.id)).join(' ');
        if (!reason) reason = 'no reason';
        try {
            await target.ban({ reason: `by ${msg.author.tag}: ${reason}`, deleteMessageDays: 0 });
            msg.reply({ embeds: [embed(green, '✅ banned', `${target} banned\nreason: ${reason}\ntime: ${timeArg || 'permanent'}`)] });
            sendLog(msg.guild, embed(blue, '📝 ban', `target: ${target}\nmod: ${msg.author}\nreason: ${reason}`));
            if (timeArg) {
                const ms = parseTime(timeArg);
                if (ms) setTimeout(() => msg.guild.members.unban(target.id, 'time expired').catch(() => {}), ms);
            }
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'تف') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const uid = args[0];
        if (!uid || !/^\d+$/.test(uid)) return msg.reply({ embeds: [embed(red, '❌ usage', '.تف userid')] });
        try {
            const user = await client.users.fetch(uid);
            await msg.guild.members.unban(user, `by ${msg.author.tag}`);
            msg.reply({ embeds: [embed(green, '✅ unbanned', `${user.tag} unbanned`)] });
            sendLog(msg.guild, embed(blue, '📝 unban', `target: ${user}\nmod: ${msg.author}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'بنعالي') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.بنعالي @user reason')] });
        let reason = args.filter(a => !a.includes(target.id)).join(' ');
        if (!reason) reason = 'no reason';
        try {
            await target.kick(`by ${msg.author.tag}: ${reason}`);
            msg.reply({ embeds: [embed(green, '✅ kicked', `${target} kicked\nreason: ${reason}`)] });
            sendLog(msg.guild, embed(blue, '📝 kick', `target: ${target}\nmod: ${msg.author}\nreason: ${reason}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'اسكت') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.اسكت @user [time] reason')] });
        const timeArg = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        let reason = args.filter(a => a !== timeArg && !a.includes(target.id)).join(' ');
        if (!reason) reason = 'no reason';
        const ms = parseTime(timeArg);
        if (!ms) return msg.reply({ embeds: [embed(red, '❌ bad time', 'use format: 1h, 30m, 1d')] });
        try {
            await target.timeout(ms, `by ${msg.author.tag}: ${reason}`);
            msg.reply({ embeds: [embed(green, '✅ muted', `${target} muted\n duration: ${timeArg}\nreason: ${reason}`)] });
            sendLog(msg.guild, embed(blue, '📝 mute', `target: ${target}\nmod: ${msg.author}\nreason: ${reason}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'تكلم') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.تكلم @user')] });
        try {
            await target.timeout(null, `by ${msg.author.tag}`);
            msg.reply({ embeds: [embed(green, '✅ unmuted', `${target} can talk now`)] });
            sendLog(msg.guild, embed(blue, '📝 unmute', `target: ${target}\nmod: ${msg.author}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'تحذير') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.تحذير @user reason')] });
        let reason = args.filter(a => !a.includes(target.id)).join(' ');
        if (!reason) reason = 'no reason';
        
        const count = await addWarn(target.id, msg.guild.id, reason, msg.author);
        
        if (count >= 5) {
            try {
                await target.timeout(172800000, 'reached 5 warnings');
                await clearWarns(target.id, msg.guild.id);
                msg.reply({ embeds: [embed(yellow, '⚠️ auto mute!', `${target} got 5 warnings and muted 2 days\nwarnings cleared`)] });
                sendLog(msg.guild, embed(blue, '📝 auto mute', `target: ${target}\nreason: 5 warnings\nmod: bot`));
            } catch (err) {
                msg.reply({ embeds: [embed(red, '❌ auto mute failed', err.message)] });
            }
            return;
        }
        
        msg.reply({ embeds: [embed(yellow, '⚠️ warned', `${target} warned\nreason: ${reason}\ncount: ${count}/5`)] });
        sendLog(msg.guild, embed(blue, '📝 warn', `target: ${target}\nmod: ${msg.author}\nreason: ${reason}`));
    }
    
    else if (cmd === 'تحذيرات') {
        const target = msg.mentions.members.first() || msg.member;
        const warnings = await getWarns(target.id, msg.guild.id);
        if (!warnings.length) return msg.reply({ embeds: [embed(blue, 'ℹ️ clean', `${target} has no warnings`)] });
        
        let text = '';
        for (let i = 0; i < warnings.length; i++) {
            const w = warnings[i];
            text += `\`${i + 1}.\` ${w.reason}\nby <@${w.modId}> | ${new Date(w.time).toLocaleDateString()}\n\n`;
        }
        
        const e = new EmbedBuilder()
            .setTitle(`warnings for ${target.user.tag}`)
            .setDescription(text)
            .setColor(yellow)
            .setFooter({ text: `${warnings.length}/5 warnings | 5 = 2 day mute` });
        
        msg.reply({ embeds: [e] });
    }
    
    else if (cmd === 'مسح_تحذير') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const target = msg.mentions.members.first();
        if (!target) return msg.reply({ embeds: [embed(red, '❌ usage', '.مسح_تحذير @user [number]')] });
        const num = parseInt(args.find(a => /^\d+$/.test(a)));
        
        if (num && num > 0) {
            const res = await delWarn(target.id, msg.guild.id, num - 1);
            if (!res) return msg.reply({ embeds: [embed(red, '❌ not found', 'invalid warning number')] });
            msg.reply({ embeds: [embed(green, '✅ deleted', `warning #${num} for ${target} removed`)] });
        } else {
            await clearWarns(target.id, msg.guild.id);
            msg.reply({ embeds: [embed(green, '✅ cleared', `all warnings for ${target} cleared`)] });
        }
        sendLog(msg.guild, embed(blue, '📝 clear warns', `target: ${target}\nmod: ${msg.author}`));
    }
    
    else if (cmd === 'ق') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const ch = msg.mentions.channels.first() || msg.channel;
        try {
            await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
            msg.reply({ embeds: [embed(green, '✅ locked', `🔒 ${ch} locked`)] });
            sendLog(msg.guild, embed(blue, '📝 lock', `channel: ${ch}\nmod: ${msg.author}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'ف') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const ch = msg.mentions.channels.first() || msg.channel;
        try {
            await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
            msg.reply({ embeds: [embed(green, '✅ unlocked', `🔓 ${ch} unlocked`)] });
            sendLog(msg.guild, embed(blue, '📝 unlock', `channel: ${ch}\nmod: ${msg.author}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'م') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const amt = parseInt(args[0]) || 10;
        if (amt > 100) return msg.reply({ embeds: [embed(red, '❌ too many', 'max 100 messages')] });
        try {
            const deleted = await msg.channel.bulkDelete(amt + 1, true);
            const m = await msg.reply({ embeds: [embed(green, '✅ purged', `🗑️ ${deleted.size - 1} messages deleted`)] });
            setTimeout(() => m.delete().catch(() => {}), 3000);
            sendLog(msg.guild, embed(blue, '📝 purge', `count: ${deleted.size - 1}\nchannel: ${msg.channel}\nmod: ${msg.author}`));
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'بطي') {
        if (!isStarter) return msg.reply({ embeds: [embed(red, '❌ no perms', 'starter only')] });
        const sec = parseInt(args[0]) || 0;
        try {
            await msg.channel.setRateLimitPerUser(sec);
            if (sec === 0) {
                msg.reply({ embeds: [embed(green, '✅ slowmode off', `${msg.channel} slowmode disabled`)] });
            } else {
                msg.reply({ embeds: [embed(green, '✅ slowmode set', `${msg.channel} slowmode ${sec}s`)] });
            }
        } catch (err) {
            msg.reply({ embeds: [embed(red, '❌ error', err.message)] });
        }
    }
    
    else if (cmd === 'حماية') {
        if (!isOwner) return msg.reply({ embeds: [embed(red, '❌ owner only', 'only server owner can use this')] });
        const action = args[0];
        const target = msg.mentions.members.first();
        
        if (action === 'on' || action === 'تفعيل') {
            await setProt(msg.guild.id, true);
            msg.reply({ embeds: [embed(green, '✅ protection on', 'protection enabled')] });
        }
        else if (action === 'off' || action === 'تعطيل') {
            await setProt(msg.guild.id, false);
            msg.reply({ embeds: [embed(green, '✅ protection off', 'protection disabled')] });
        }
        else if ((action === 'add' || action === 'اضافة') && target) {
            await addProt(msg.guild.id, target.id);
            msg.reply({ embeds: [embed(green, '✅ protected', `${target} added to protection list`)] });
        }
        else if ((action === 'remove' || action === 'ازالة') && target) {
            await remProt(msg.guild.id, target.id);
            msg.reply({ embeds: [embed(green, '✅ unprotected', `${target} removed from protection list`)] });
        }
        else {
            msg.reply({ embeds: [embed(blue, 'ℹ️ usage', '.حماية [on/off/add/remove] @user')] });
        }
    }
    
    else if (cmd === 'العاب') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_roulette').setLabel('🎲 روليت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_mafia').setLabel('🕵️ مافيا').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('game_castle').setLabel('🏰 كاستل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('game_ttt').setLabel('⚔️ تكت تو').setStyle(ButtonStyle.Secondary)
        );
        
        msg.reply({
            embeds: [new EmbedBuilder().setTitle('🎮 games').setDescription('choose a game').setColor(green)],
            components: [row]
        });
    }
});

client.on('interactionCreate', async i => {
    if (!i.isButton()) return;
    if (!i.customId.startsWith('game_')) return;
    
    const game = i.customId.replace('game_', '');
    
    if (game === 'roulette') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('🎲 روليت').setDescription('bet on numbers 0-36, colors, odd/even').setColor(0xe74c3c).addFields({ name: 'players', value: '2+', inline: true })], ephemeral: true });
    }
    else if (game === 'mafia') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('🕵️ مافيا').setDescription('villagers vs mafia, needs game master').setColor(0x2c3e50).addFields({ name: 'players', value: '6-16', inline: true })], ephemeral: true });
    }
    else if (game === 'castle') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('🏰 كاستل').setDescription('2 teams fight for the castle').setColor(0x9b59b6).addFields({ name: 'players', value: '10+', inline: true })], ephemeral: true });
    }
    else if (game === 'ttt') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('⚔️ تكت تو').setDescription('classic XO game').setColor(0x34495e).addFields({ name: 'players', value: '2', inline: true })], ephemeral: true });
    }
});

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    
    const isAdmin = i.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isOwner = i.user.id === i.guild.ownerId;
    const isStarter = isAdmin || isOwner;
    
    if (i.commandName === 'لوق') {
        if (!isStarter) return i.reply({ embeds: [embed(red, '❌ no perms', 'starter only')], ephemeral: true });
        const ch = i.options.getChannel('channel');
        await setLog(i.guildId, ch.id);
        i.reply({ embeds: [embed(green, '✅ log set', `${ch} is now the log channel`)] });
    }
    else if (i.comma