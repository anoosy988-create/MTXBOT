// ╔═══════════════════════════════════════════════════════════════╗
// ║  🤖 MTX BOT v3.0 - بوت الحماية والإدارة المتقدم             ║
// ║  MongoDB Database | Discord.js v14                            ║
// ╚═══════════════════════════════════════════════════════════════╝

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    SlashCommandBuilder,
    AuditLogEvent,
    ChannelType
} = require('discord.js');

const { connectDatabase, WarningDB, ProtectionDB } = require('./database');

// ═══════════════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    CMDS: {
        BAN: 'باند', UNBAN: 'تف', KICK: 'بنعالي',
        MUTE: 'اسكت', UNMUTE: 'تكلم', WARN: 'تحذير',
        LOCK: 'ق', UNLOCK: 'ف', PURGE: 'م',
        SLOWMODE: 'بطي', PROTECTION: 'حماية',
        GAMES: 'العاب', WARNINGS: 'تحذيرات', CLEARWARN: 'مسح_تحذير'
    },
    PROTECTION: {
        SPAM_THRESHOLD: 5,
        SPAM_WINDOW: 3000,
        SPAM_MUTE_HOURS: 6,
        LINK_MUTE_MINUTES: 30,
        WARN_LIMIT: 5,           // 5 تحذيرات
        WARN_MUTE_DAYS: 2        // يومين ميوت
    },
    COLORS: {
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c,
        WARN: 0xf39c12, INFO: 0x3498db,
        PROTECTION: 0x9b59b6
    }
};

// ═══════════════════════════════════════════════════════════════
// 🎨 الإمبدات
// ═══════════════════════════════════════════════════════════════

class Embeds {
    static success(title, description) {
        return new EmbedBuilder().setTitle(`✅ | ${title}`).setDescription(description).setColor(CONFIG.COLORS.SUCCESS).setTimestamp();
    }
    static error(title, description) {
        return new EmbedBuilder().setTitle(`❌ | ${title}`).setDescription(description).setColor(CONFIG.COLORS.ERROR).setTimestamp();
    }
    static warn(title, description) {
        return new EmbedBuilder().setTitle(`⚠️ | ${title}`).setDescription(description).setColor(CONFIG.COLORS.WARN).setTimestamp();
    }
    static info(title, description) {
        return new EmbedBuilder().setTitle(`ℹ️ | ${title}`).setDescription(description).setColor(CONFIG.COLORS.INFO).setTimestamp();
    }
    static protection(title, description) {
        return new EmbedBuilder().setTitle(`🛡️ | ${title}`).setDescription(description).setColor(CONFIG.COLORS.PROTECTION).setTimestamp();
    }
    static logAction(action, moderator, target, reason = 'غير محدد', extra = {}) {
        const embed = new EmbedBuilder()
            .setTitle(`📝 سجل إداري | ${action}`)
            .setColor(CONFIG.COLORS.INFO).setTimestamp()
            .addFields(
                { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
                { name: '📌 السبب', value: reason, inline: false }
            )
            .setFooter({ text: 'MTX Protection System' });
        for (const [k, v] of Object.entries(extra)) embed.addFields({ name: k, value: String(v), inline: true });
        return embed;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ نظام الحماية
// ═══════════════════════════════════════════════════════════════

class ProtectionSystem {
    constructor(client) { this.client = client; this.spamTracker = new Map(); this.linkRegex = /https?:\/\/[^\s]+/gi; }
    
    async sendLog(guild, embed) {
        const chId = await ProtectionDB.getLogChannel(guild.id);
        if (!chId) return;
        const ch = guild.channels.cache.get(chId);
        if (ch) try { await ch.send({ embeds: [embed] }); } catch(e) {}
    }

    async checkBotEntry(member) {
        if (!member.user.bot) return;
        const guild = member.guild, owner = await guild.fetchOwner();
        if (!(await ProtectionDB.isEnabled(guild.id))) return;
        
        try {
            const logs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (!entry) return;
            const adder = entry.executor;
            if (await ProtectionDB.isProtected(guild.id, adder.id) || adder.id === owner.id) return;

            await member.kick('🛡️ MTX: بوت مشبوه');
            const embed = Embeds.protection('تم طرد بوت مشبوه!',
                `**تم اكتشاف بوت مشبوه وطرده تلقائياً**\n\n` +
                `👤 **الشخص اللي ضاف البوت:** ${adder} (\`${adder.id}\`)\n` +
                `🤖 **اسم البوت:** ${member.user.tag} (\`${member.id}\`)\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}\n` +
                `⚡ **الإجراء:** تم الطرد الفوري`
            );
            await owner.send({ embeds: [embed] });
            await this.sendLog(guild, embed);

            await guild.members.ban(adder, { reason: '🛡️ MTX: محاولة إضافة بوت غير مصرح بها', deleteMessageDays: 0 });
            const banEmbed = Embeds.protection('تم تبنيد شخص حاول إضافة بوت!',
                `**تم تبنيد الشخص تلقائياً**\n\n` +
                `👤 **الشخص:** ${adder} (\`${adder.id}\`)\n` +
                `🤖 **البوت:** ${member.user.tag}\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}`
            );
            await owner.send({ embeds: [banEmbed] });
            await this.sendLog(guild, banEmbed);
        } catch(e) { console.error('[MTX] خطأ:', e); }
    }

    async checkSpam(message) {
        if (message.author.bot || message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        const uid = message.author.id, now = Date.now();
        if (!this.spamTracker.has(uid)) this.spamTracker.set(uid, []);
        const ts = this.spamTracker.get(uid); ts.push(now);
        const recent = ts.filter(t => now - t <= CONFIG.PROTECTION.SPAM_WINDOW);
        this.spamTracker.set(uid, recent);
        
        if (recent.length >= CONFIG.PROTECTION.SPAM_THRESHOLD) {
            try {
                await message.member.timeout(CONFIG.PROTECTION.SPAM_MUTE_HOURS * 3600000, '🛡️ MTX: سبام مفرط');
                const embed = Embeds.warn('تم كتم المستخدم',
                    `**${message.author} تم كتمه بسبب السبام**\n⏰ **المدة:** ${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات\n📊 **الرسائل:** ${recent.length}`
                );
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(()=>{}), 10000);
                await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (سبام)', this.client.user, message.author, 'سبام مفرط', {المدة: `${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات`}));
                return true;
            } catch(e) {}
        }
        return false;
    }

    async checkLinks(message) {
        if (message.author.bot) return false;
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        if (message.author.id === message.guild.ownerId) return false;
        if (!this.linkRegex.test(message.content)) return false;
        
        try {
            await message.delete();
            await message.member.timeout(CONFIG.PROTECTION.LINK_MUTE_MINUTES * 60000, '🛡️ MTX: إرسال روابط');
            const embed = Embeds.warn('تم كتم المستخدم',
                `**${message.author} تم كتمه بسبب إرسال روابط**\n⏰ **المدة:** ${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة`
            );
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(()=>{}), 10000);
            await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (روابط)', this.client.user, message.author, 'إرسال روابط', {المدة: `${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة`}));
            return true;
        } catch(e) { return false; }
    }
}

// ═══════════════════════════════════════════════════════════════
// 🤖 البوت
// ═══════════════════════════════════════════════════════════════

class MTXBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
        });
        this.protection = new ProtectionSystem(this);
        this.startTime = new Date();
        this.setupEvents();
    }

    setupEvents() {
        this.once('ready', () => this.onReady());
        this.on('messageCreate', (m) => this.onMessage(m));
        this.on('guildMemberAdd', (m) => this.onMemberAdd(m));
        this.on('interactionCreate', (i) => this.onInteraction(i));
    }

    async onReady() {
        console.log(`\n╔═══════════════════════════════════════╗\n║     🤖 MTX BOT v3.0                    ║\n║     متصل بـ MongoDB!                   ║\n║     السيرفرات: ${this.guilds.cache.size}                      ║\n╚═══════════════════════════════════════╝\n`);
        await this.user.setPresence({ activities: [{ name: '🛡️ MTX | .العاب', type: 3 }], status: 'dnd' });
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const cmds = [
            new SlashCommandBuilder().setName('لوق').setDescription('تحديد روم اللوق')
                .addChannelOption(o => o.setName('channel').setDescription('روم اللوق').setRequired(true).addChannelTypes(ChannelType.GuildText)),
            new SlashCommandBuilder().setName('حالة').setDescription('حالة البوت')
        ];
        try { await this.application.commands.set(cmds); } catch(e) {}
    }

    async onMessage(message) {
        if (message.author.bot || !message.guild) return;
        if (await this.protection.checkSpam(message)) return;
        if (await this.protection.checkLinks(message)) return;
        await this.handleCommand(message);
    }

    async onMemberAdd(member) { if (member.user.bot) await this.protection.checkBotEntry(member); }

    async onInteraction(i) {
        if (i.isButton() && i.customId.startsWith('game_')) {
            const game = i.customId.replace('game_', '');
            const embeds = {
                roulette: new EmbedBuilder().setTitle('🎲 روليت').setDescription('لعبة الحظ!').setColor(0xe74c3c),
                mafia: new EmbedBuilder().setTitle('🕵️ مافيا').setDescription('لعبة الغموض!').setColor(0x2c3e50),
                castle: new EmbedBuilder().setTitle('🏰 كاستل').setDescription('حرب القلاع!').setColor(0x9b59b6),
                tictactoe: new EmbedBuilder().setTitle('⚔️ تكت تو').setDescription('XO!').setColor(0x34495e)
            };
            if (embeds[game]) await i.reply({ embeds: [embeds[game]], ephemeral: true });
        }
        if (i.isChatInputCommand()) await this.handleSlash(i);
    }

    async handleSlash(i) {
        const isStarter = i.member.permissions.has(PermissionsBitField.Flags.Administrator) || i.user.id === i.guild.ownerId;
        if (i.commandName === 'لوق') {
            if (!isStarter) return i.reply({ embeds: [Embeds.error('صلاحيات', 'بس الستيرتر!')], ephemeral: true });
            const ch = i.options.getChannel('channel');
            await ProtectionDB.setLogChannel(i.guildId, ch.id);
            await i.reply({ embeds: [Embeds.success('إعدادات اللوق', `📋 **${ch}** تم تحديده!`)] });
        }
        if (i.commandName === 'حالة') {
            const uptime = new Date() - this.startTime;
            const h = Math.floor(uptime/3600000), m = Math.floor((uptime%3600000)/60000);
            const embed = new EmbedBuilder().setTitle('🤖 حالة MTX').setDescription(`**الحالة:** 🟢 شغال\n**الوقت:** ${h}س ${m}د`).setColor(CONFIG.COLORS.SUCCESS)
                .addFields(
                    {name: '🛡️ الحماية', value: (await ProtectionDB.isEnabled(i.guildId))?'مفعلة':'معطلة', inline: true},
                    {name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true}
                );
            await i.reply({ embeds: [embed] });
        }
    }

    // ═══════════════════════════════════════
    // 🔧 الأوامر التقليدية
    // ═══════════════════════════════════════

    async handleCommand(message) {
        const content = message.content.trim();
        if (!content.startsWith('.')) return;
        const args = content.slice(1).trim().split(/\s+/);
        const cmd = args.shift();
        const isStarter = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || message.author.id === message.guild.ownerId;
        const isOwner = message.author.id === message.guild.ownerId;

        switch(cmd) {
            case CONFIG.CMDS.BAN: if(!isStarter)return this.noPerm(message); await this.cmdBan(message,args); break;
            case CONFIG.CMDS.UNBAN: if(!isStarter)return this.noPerm(message); await this.cmdUnban(message,args); break;
            case CONFIG.CMDS.KICK: if(!isStarter)return this.noPerm(message); await this.cmdKick(message,args); break;
            case CONFIG.CMDS.MUTE: if(!isStarter)return this.noPerm(message); await this.cmdMute(message,args); break;
            case CONFIG.CMDS.UNMUTE: if(!isStarter)return this.noPerm(message); await this.cmdUnmute(message,args); break;
            case CONFIG.CMDS.WARN: if(!isStarter)return this.noPerm(message); await this.cmdWarn(message,args); break;
            case CONFIG.CMDS.WARNINGS: await this.cmdWarnings(message,args); break;
            case CONFIG.CMDS.CLEARWARN: if(!isStarter)return this.noPerm(message); await this.cmdClearWarn(message,args); break;
            case CONFIG.CMDS.LOCK: if(!isStarter)return this.noPerm(message); await this.cmdLock(message,args); break;
            case CONFIG.CMDS.UNLOCK: if(!isStarter)return this.noPerm(message); await this.cmdUnlock(message,args); break;
            case CONFIG.CMDS.PURGE: if(!isStarter)return this.noPerm(message); await this.cmdPurge(message,args); break;
            case CONFIG.CMDS.SLOWMODE: if(!isStarter)return this.noPerm(message); await this.cmdSlowmode(message,args); break;
            case CONFIG.CMDS.PROTECTION: if(!isOwner)return message.reply({embeds:[Embeds.error('خطأ','بس الأونر!')]}); await this.cmdProtection(message,args); break;
            case CONFIG.CMDS.GAMES: await this.cmdGames(message); break;
        }
    }

    noPerm(m) { return m.reply({embeds:[Embeds.error('صلاحيات','بس الستيرتر يقدر يستخدم هذا الأمر!')]}); }

    // ═══════════════════════════════════════
    // 🚫 باند
    // ═══════════════════════════════════════
    async cmdBan(m, args) {
        const member = m.mentions.members.first();
        if(!member) return m.reply({embeds:[Embeds.error('خطأ','منشن العضو!')]});
        if(member.id===m.guild.ownerId) return m.reply({embeds:[Embeds.error('خطأ','ما تقدر تبند الأونر!')]});
        const timeArg = args.find(a=>/^\d+[dhms]$/.test(a));
        const reason = args.filter(a=>a!==timeArg&&!a.includes(member.id)).join(' ')||'غير محدد';
        try {
            await member.ban({reason:`بواسطة ${m.author.tag}: ${reason}`,deleteMessageDays:0});
            m.reply({embeds:[Embeds.success('تم التبنيد',`**${member}** تم تبنيده!\n📌 السبب: ${reason}\n⏰ الوقت: ${timeArg||'دائم'}`)]});
            await this.protection.sendLog(m.guild, Embeds.logAction('تبنيد',m.author,member.user,reason,{الوقت:timeArg||'دائم'}));
            if(timeArg){const ms=this.parseTime(timeArg);if(ms)setTimeout(()=>m.guild.members.unban(member.id,'انتهاء الوقت').catch(()=>{}),ms);}
        } catch(e){m.reply({embeds:[Embeds.error('خطأ',e.message)]});}
    }

    // ═══════════════════════════════════════
    // 🔓 فك باند
    // ═══════════════════════════════════════
    async cmdUnban(m, args) {
        const uid = args[0];
        if(!uid||!/^\d+$/.test(uid)) return m.reply({embeds:[Embeds.error('خطأ','حط ايدي العضو!')]});
        try {
            const user = await this.users.fetch(uid);
            await m.guild.members.unban(user,`بواسطة ${m.author.tag}`);
            m.reply({embeds:[Embeds.success('تم فك الباند',`**${user.tag}** تم فك الباند عنه!`)]});
            await this.protection.sendLog(m.guild, Embeds.logAction('فك باند',m.author,user,'فك الباند'));
        } catch(e){m.reply({embeds:[Embeds.error('خطأ',e.message)]});}
    }

    // ═══════════════════════════════════════
    // 👢 طرد
    // ═══════════════════════════════════════
    async cmdKick(m, args) {
        const member = m.mentions.members.first();
        if(!member) return m.reply({embeds:[Embeds.error('خطأ','منشن العضو!')]});
        const reason = args.filter(a=>!a.includes(member.id)).join(' ')||'غير محدد';
        try {
            await member.kick(`بواسطة ${m.author.tag}: ${reason}`);
            m.reply({embeds:[Embeds.success('تم الطرد',`**${member}** تم طرده!\n📌 السبب: ${reason}`)]});
            await this.protection.sendLog(m.guild, Embeds.logAction('طرد',m.author,member.user,reason));
        } catch(e){m.reply({embeds:[Embeds.error('خطأ',e.message)]});}
    }

    // ═══════════════════════════════════════
    // 🔇 كتم
    // ═══════════════════════════════════════
    async cmdMute(m, args) {
        const member = m.mentions.members.first();
        if(!member) return m.reply({embeds:[Embeds.error('خطأ','منشن العضو!')]});
        const timeArg = args.find(a=>/^\d+[dhms]$/.test(a))||'1h';
        const reason = args.filter(a=>a!==timeArg&&!a.includes(member.id)).join(' ')||'غير محدد';
        const ms = this.parseTime(timeArg);
        if(!ms) return m.reply({embeds:[Embeds.error('خطأ','صيغة الوقت غير صحيحة! (1h, 30m, 1d)')]});
        try {
            await member.timeout(ms,`بواسطة ${m.author.tag}: ${reason}`);
            m.reply({embeds:[Embeds.success('تم الكتم',`**${member}** تم كتمه!\n⏰ المدة: ${timeArg}\n📌 السبب: ${reason}`)]});
            await this.protection.sendLog(m.guild, Embeds.logAction('كتم',m.author,member.user,reason,{المدة:timeArg}));
        } catch(e){m.reply({embeds:[Embeds.error('خطأ',e.message)]});}
    }

    // ═══════════════════════════════════════
    // 🔊 فك كتم
    // ═══════════════════════════════════════
    async cmdUnmute(m, args) {
        const member = m.mentions.members.first();
        if(!member) return m.reply({embeds:[Embeds.error('خطأ','منشن العضو!')]});
        try {
            await member.timeout(null,`بواسطة ${m.author.tag}`);
            m.reply({embeds:[Embeds.success('تم فك الكتم',`**${member}** يقدر يتكلم الحين!`)]});
            await this.protection.sendLog(m.guild, Embeds.logAction('فك كتم',m.author,member.user,'فك الكتم'));
        } catch(e){m.reply({embeds:[Embeds.error('خطأ',e.message)]});}
    }

    // ═══════════════════════════════════════
    // ⚠️ تحذير - النظام الجديد (5 = يومين ميوت)
    // ═══════════════════════════════════════
    async cmdWarn(m, args) {
        const member = m.mentions.members.first();
        if(!member) return m.reply({embeds:[Embeds.error('خطأ','منشن العضو!')]});
        const reason = args.filter(a=>!a.includes(member.id)).join(' ')||'غير محدد';

        const result = await WarningDB.addWarning(member.id, m.guild.id, reason, m.author);
        const warnings = await WarningDB.getWarnings(member.id, m.guild.id);

        // إذا وصل 5 تحذيرات = ميوت يومين
        if (result.total >= CONFIG.PROTECTION.WARN_LIMIT) {
            const muteDuration = CONFIG.PROTECTION.WARN_MUTE_DAYS * 24 * 60 * 60 * 1000; // يومين بالملي
            try {
                await member.timeout(muteDuration, `🛡️ MTX: وصل ${CONFIG.PROTECTION.WARN_LIMIT} تحذيرات - ميوت تلقائي ${CONFIG.PROTECTION.WARN_MUTE_DAYS} يوم`);
                await WarningDB.setAutoMuted(member.id, m.guild.id);
                
                const autoMuteEmbed = Embeds.warn('🚫 ميوت تلقائي!',
                    `**${member}** وصل **${CONFIG.PROTECTION.WARN_LIMIT}**