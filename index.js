const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    Collection,
    AuditLogEvent,
    ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const CONFIG = {
    CMDS: {
        BAN: 'باند',
        UNBAN: 'تف',
        KICK: 'بنعالي',
        MUTE: 'اسكت',
        UNMUTE: 'تكلم',
        WARN: 'تحذير',
        LOCK: 'ق',
        UNLOCK: 'ف',
        PURGE: 'م',
        SLOWMODE: 'بطي',
        PROTECTION: 'حماية',
        GAMES: 'العاب'
    },
    PROTECTION: {
        SPAM_THRESHOLD: 5,        // عدد الرسائل
        SPAM_WINDOW: 3000,        // 3 ثواني بالملي
        SPAM_MUTE_HOURS: 6,       // ساعات الميوت
        LINK_MUTE_MINUTES: 30,    // دقايق ميوت الروابط
        NUKE_REPEAT: 10           // عدد مرات الهجوم المضاد
    },
    
    COLORS: {
        SUCCESS: 0x2ecc71,
        ERROR: 0xe74c3c,
        WARN: 0xf39c12,
        INFO: 0x3498db,
        PROTECTION: 0x9b59b6,
        GOLD: 0xffd700
    }
};

class Database {
    constructor(filename = 'hawk_data.json') {
        this.filename = filename;
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(this.filename)) {
            return JSON.parse(fs.readFileSync(this.filename, 'utf8'));
        }
        return {
            warnings: {},
            protection: {},
            logs: {},
            settings: {},
            games: {}
        };
    }

    save() {
        fs.writeFileSync(this.filename, JSON.stringify(this.data, null, 2), 'utf8');
    }

    getWarnings(userId) {
        return this.data.warnings[userId] || [];
    }

    addWarning(userId, reason, moderator) {
        if (!this.data.warnings[userId]) this.data.warnings[userId] = [];
        this.data.warnings[userId].push({
            reason,
            moderator,
            time: new Date().toISOString()
        });
        this.save();
    }

    clearWarnings(userId) {
        delete this.data.warnings[userId];
        this.save();
    }

    isProtected(guildId, userId) {
        const guild = this.data.protection[guildId];
        return guild?.protectedUsers?.includes(userId) || false;
    }

    addProtected(guildId, userId) {
        if (!this.data.protection[guildId]) {
            this.data.protection[guildId] = { enabled: true, protectedUsers: [], suspiciousBots: [] };
        }
        if (!this.data.protection[guildId].protectedUsers.includes(userId)) {
            this.data.protection[guildId].protectedUsers.push(userId);
            this.save();
        }
    }

    removeProtected(guildId, userId) {
        if (this.data.protection[guildId]) {
            this.data.protection[guildId].protectedUsers = 
                this.data.protection[guildId].protectedUsers.filter(id => id !== userId);
            this.save();
        }
    }

    setLogChannel(guildId, channelId) {
        this.data.logs[guildId] = channelId;
        this.save();
    }

    getLogChannel(guildId) {
        return this.data.logs[guildId] || null;
    }

    isProtectionEnabled(guildId) {
        return this.data.protection[guildId]?.enabled !== false;
    }
}

const db = new Database();

class Embeds {
    static success(title, description) {
        return new EmbedBuilder()
            .setTitle(`✅ | ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.SUCCESS)
            .setTimestamp();
    }

    static error(title, description) {
        return new EmbedBuilder()
            .setTitle(`❌ | ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.ERROR)
            .setTimestamp();
    }

    static warn(title, description) {
        return new EmbedBuilder()
            .setTitle(`⚠️ | ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.WARN)
            .setTimestamp();
    }

    static info(title, description) {
        return new EmbedBuilder()
            .setTitle(`ℹ️ | ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.INFO)
            .setTimestamp();
    }

    static protection(title, description) {
        return new EmbedBuilder()
            .setTitle(`🛡️ | ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.PROTECTION)
            .setTimestamp();
    }

    static logAction(action, moderator, target, reason = 'غير محدد', extra = {}) {
        const embed = new EmbedBuilder()
            .setTitle(`📝 سجل إداري | ${action}`)
            .setColor(CONFIG.COLORS.INFO)
            .setTimestamp()
            .addFields(
                { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
                { name: '📌 السبب', value: reason, inline: false }
            )
            .setFooter({ text: 'Hawk Shield Protection System', iconURL: moderator.guild.iconURL() });

        for (const [key, value] of Object.entries(extra)) {
            embed.addFields({ name: key, value: String(value), inline: true });
        }

        return embed;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ نظام الحماية المتقدم
// ═══════════════════════════════════════════════════════════════

class ProtectionSystem {
    constructor(client) {
        this.client = client;
        this.spamTracker = new Map(); // userId -> [{timestamp}]
        this.linkRegex = /https?:\/\/[^\s]+/gi;
    }

    async sendLog(guild, embed) {
        const logChannelId = db.getLogChannel(guild.id);
        if (!logChannelId) return;
        
        const channel = guild.channels.cache.get(logChannelId);
        if (channel) {
            try {
                await channel.send({ embeds: [embed] });
            } catch (e) {
                console.error('[Hawk Shield] خطأ في إرسال اللوق:', e);
            }
        }
    }

    async checkBotEntry(member) {
        if (!member.user.bot) return;
        
        const guild = member.guild;
        const owner = await guild.fetchOwner();
        
        if (!db.isProtectionEnabled(guild.id)) return;

        try {
            const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = auditLogs.entries.first();
            
            if (!entry) return;
            
            const adder = entry.executor;
            
            // إذا كان الشخص محمي أو الأونر
            if (db.isProtected(guild.id, adder.id) || adder.id === owner.id) return;

            // طرد البوت
            await member.kick('🛡️ Hawk Shield: بوت مشبوه - المستخدم غير مصرح له');
            
            const embed = Embeds.protection(
                'تم طرد بوت مشبوه!',
                `**تم اكتشاف بوت مشبوه وطرده تلقائياً**\n\n` +
                `👤 **الشخص اللي ضاف البوت:** ${adder} (\`${adder.id}\`)\n` +
                `🤖 **اسم البوت:** ${member.user.tag} (\`${member.id}\`)\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}\n` +
                `⚡ **الإجراء:** تم الطرد الفوري`
            );
            
            await owner.send({ embeds: [embed] });
            await this.sendLog(guild, embed);

            // باند الشخص
            await guild.members.ban(adder, { 
                reason: '🛡️ Hawk Shield: محاولة إضافة بوت غير مصرح بها',
                deleteMessageDays: 0 
            });

            const banEmbed = Embeds.protection(
                'تم تبنيد شخص حاول إضافة بوت!',
                `**تم تبنيد الشخص تلقائياً**\n\n` +
                `👤 **الشخص:** ${adder} (\`${adder.id}\`)\n` +
                `🤖 **البوت:** ${member.user.tag}\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}\n` +
                `🚫 **الإجراء:** تم التبنيد`
            );
            
            await owner.send({ embeds: [banEmbed] });
            await this.sendLog(guild, banEmbed);

        } catch (e) {
            console.error('[Hawk Shield] خطأ في الحماية:', e);
        }
    }

    async checkSpam(message) {
        if (message.author.bot || message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        
        const userId = message.author.id;
        const now = Date.now();
        
        if (!this.spamTracker.has(userId)) {
            this.spamTracker.set(userId, []);
        }
        
        const timestamps = this.spamTracker.get(userId);
        timestamps.push(now);
        
        // تنظيف القديم
        const recent = timestamps.filter(t => now - t <= CONFIG.PROTECTION.SPAM_WINDOW);
        this.spamTracker.set(userId, recent);
        
        if (recent.length >= CONFIG.PROTECTION.SPAM_THRESHOLD) {
            try {
                const duration = CONFIG.PROTECTION.SPAM_MUTE_HOURS * 60 * 60 * 1000;
                await message.member.timeout(duration, '🛡️ Hawk Shield: سبام مفرط');
                
                const embed = Embeds.warn(
                    'تم كتم المستخدم',
                    `**${message.author} تم كتمه بسبب السبام**\n` +
                    `⏰ **المدة:** ${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات\n` +
                    `📊 **عدد الرسائل:** ${recent.length} رسائل في ${CONFIG.PROTECTION.SPAM_WINDOW / 1000} ثواني`
                );
                
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 10000);
                
                await this.sendLog(message.guild, Embeds.logAction(
                    'كتم تلقائي (سبام)', 
                    this.client.user, 
                    message.author, 
                    'سبام مفرط',
                    { 'المدة': `${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات` }
                ));
                
                return true;
            } catch (e) {
                console.error('[Hawk Shield] خطأ في كتم السبام:', e);
            }
        }
        
        return false;
    }

    async checkLinks(message) {
        if (message.author.bot) return false;
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        if (message.author.id === message.guild.ownerId) return false;

        if (this.linkRegex.test(message.content)) {
            try {
                await message.delete();
                
                const duration = CONFIG.PROTECTION.LINK_MUTE_MINUTES * 60 * 1000;
                await message.member.timeout(duration, '🛡️ Hawk Shield: إرسال روابط');
                
                const embed = Embeds.warn(
                    'تم كتم المستخدم',
                    `**${message.author} تم كتمه بسبب إرسال روابط**\n` +
                    `⏰ **المدة:** ${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة\n` +
                    `🔗 **الرابط:** تم حذفه`
                );
                
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 10000);
                
                await this.sendLog(message.guild, Embeds.logAction(
                    'كتم تلقائي (روابط)',
                    this.client.user,
                    message.author,
                    'إرسال روابط',
                    { 'المدة': `${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة` }
                ));
                
                return true;
            } catch (e) {
                console.error('[Hawk Shield] خطأ في كتم الروابط:', e);
            }
        }
        
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎮 نظام الإيفنتات
// ═══════════════════════════════════════════════════════════════

class EventSystem {
    constructor() {
        this.activeGames = new Map(); // channelId -> game
    }

    createGameEmbed() {
        return new EmbedBuilder()
            .setTitle('🎮 قائمة الألعاب الجماعية')
            .setDescription(
                '**اختر لعبة من القائمة التالية:**\n\n' +
                '🎲 **روليت** - لعبة الحظ والأرقام\n' +
                '🕵️ **مافيا** - لعبة الغموض والخداع\n' +
                '🏰 **كاستل** - حرب القلاع\n' +
                '⚔️ **تكت تو** - XO الكلاسيكية\n\n' +
                'اضغط على الزر للتفاصيل!'
            )
            .setColor(CONFIG.COLORS.SUCCESS)
            .setTimestamp()
            .setFooter({ text: 'Hawk Shield Events System' });
    }

    createRouletteEmbed() {
        return new EmbedBuilder()
            .setTitle('🎲 لعبة الروليت')
            .setDescription(
                '**قوانين اللعبة:**\n' +
                '1. كل لاعب يختار رقم من 0-36\n' +
                '2. الدوران يبدأ وينتظر النتيجة\n' +
                '3. اللي يفوز ياخذ الجائزة!\n\n' +
                '**أنواع الرهانات:**\n' +
                '• `رقم [0-36]` - رقم محدد (x36)\n' +
                '• `لون احمر/اسود` - اللون (x2)\n' +
                '• `فردي/زوجي` - فردي أو زوجي (x2)\n' +
                '• `نصف اول/ثاني` - النصف (x2)'
            )
            .setColor(0xe74c3c)
            .addFields(
                { name: '🎯 الأرقام', value: '0-36', inline: true },
                { name: '👥 اللاعبين', value: '2+', inline: true }
            );
    }

    createMafiaEmbed() {
        return new EmbedBuilder()
            .setTitle('🕵️ لعبة المافيا')
            .setDescription(
                '**قوانين اللعبة:**\n' +
                '1. توزيع الأدوار (مواطنين، مافيا، شرطي، دكتور)\n' +
                '2. الليلة: المافيا تختار ضحية\n' +
                '3. النهار: التصويت على المشتبه بهم'
            )
            .setColor(0x2c3e50)
            .addFields(
                { name: '👥 اللاعبين', value: '6-16', inline: true },
                { name: '⏱️ المدة', value: '20-40 دقيقة', inline: true }
            )
            .setFooter({ text: 'تحتاج مقدم (Game Master)' });
    }

    createCastleEmbed() {
        return new EmbedBuilder()
            .setTitle('🏰 لعبة القلعة (Castle)')
            .setDescription(
                '**فريقين يتنافسون على احتلال القلعة**\n\n' +
                '**القوانين:**\n' +
                '1. تقسيم اللاعبين لفريقين\n' +
                '2. كل فريق يدافع عن قلعته ويهاجم الثانية\n' +
                '3. الفريق اللي يحتل القلعة يفوز'
            )
            .setColor(0x9b59b6)
            .addFields(
                { name: '👥 اللاعبين', value: '10+ (5 ضد 5)', inline: true }
            );
    }

    createTicTacToeEmbed() {
        return new EmbedBuilder()
            .setTitle('⚔️ تكت تو (Tic Tac Toe)')
            .setDescription('**لعبة XO الكلاسيكية**\n\nاضغط على الزر لبدء لعبة مع صديقك!')
            .setColor(0x34495e)
            .addFields(
                { name: '👥 اللاعبين', value: '2', inline: true }
            );
    }
}

const eventSystem = new EventSystem();

// ═══════════════════════════════════════════════════════════════
// 🤖 البوت الرئيسي
// ═══════════════════════════════════════════════════════════════

class HawkShield extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildPresences
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
        });

        this.protection = new ProtectionSystem(this);
        this.commands = new Collection();
        this.startTime = new Date();
        
        this.setupEvents();
    }

    setupEvents() {
        this.once('ready', () => this.onReady());
        this.on('messageCreate', (msg) => this.onMessage(msg));
        this.on('guildMemberAdd', (member) => this.onMemberAdd(member));
        this.on('interactionCreate', (interaction) => this.onInteraction(interaction));
    }

    async onReady() {
        console.log(`
        ╔═══════════════════════════════════════╗
        ║     🦅 HAWK SHIELD v3.0              ║
        ║     تم التشغيل بنجاح!                ║
        ║                                       ║
        ║     البوت: ${this.user.tag}          ║
        ║     الايدي: ${this.user.id}          ║
        ║     السيرفرات: ${this.guilds.cache.size}  ║
        ╚═══════════════════════════════════════╝
        `);

        await this.user.setPresence({
            activities: [{ 
                name: '🛡️ الحماية | .العاب للإيفنتات', 
                type: 3 // WATCHING
            }],
            status: 'dnd'
        });

        // تسجيل السلاش كوماندات
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('لوق')
                .setDescription('تحديد روم اللوق')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('روم اللوق')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                ),
            new SlashCommandBuilder()
                .setName('حالة')
                .setDescription('حالة البوت')
        ];

        try {
            await this.application.commands.set(commands);
            console.log('[Hawk Shield] ✅ تم تسجيل السلاش كوماندات');
        } catch (e) {
            console.error('[Hawk Shield] خطأ في تسجيل السلاش كوماندات:', e);
        }
    }

    async onMessage(message) {
        if (message.author.bot || !message.guild) return;

        // التحقق من السبام
        if (await this.protection.checkSpam(message)) return;
        
        // التحقق من الروابط
        if (await this.protection.checkLinks(message)) return;

        // معالجة الأوامر
        await this.handleCommand(message);
    }

    async onMemberAdd(member) {
        if (member.user.bot) {
            await this.protection.checkBotEntry(member);
        }
    }

    async onInteraction(interaction) {
        if (interaction.isButton()) {
            await this.handleButton(interaction);
        } else if (interaction.isChatInputCommand()) {
            await this.handleSlashCommand(interaction);
        }
    }

    async handleCommand(message) {
        const content = message.content.trim();
        if (!content.startsWith('.')) return;

        const args = content.slice(1).trim().split(/\s+/);
        const cmd = args.shift();

        // التحقق من صلاحيات الستيرتر
        const isStarter = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                         message.author.id === message.guild.ownerId;

        switch (cmd) {
            // ═══════════════════════════════════════
            // 🚫 باند
            // ═══════════════════════════════════════
            case CONFIG.CMDS.BAN:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdBan(message, args);
                break;

            // ═══════════════════════════════════════
            // 🔓 فك باند
            // ═══════════════════════════════════════
            case CONFIG.CMDS.UNBAN:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdUnban(message, args);
                break;

            // ═══════════════════════════════════════
            // 👢 طرد
            // ═══════════════════════════════════════
            case CONFIG.CMDS.KICK:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdKick(message, args);
                break;

            // ═══════════════════════════════════════
            // 🔇 كتم
            // ═══════════════════════════════════════
            case CONFIG.CMDS.MUTE:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdMute(message, args);
                break;

            // ═══════════════════════════════════════
            // 🔊 فك كتم
            // ═══════════════════════════════════════
            case CONFIG.CMDS.UNMUTE:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdUnmute(message, args);
                break;

            // ═══════════════════════════════════════
            // ⚠️ تحذير
            // ═══════════════════════════════════════
            case CONFIG.CMDS.WARN:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdWarn(message, args);
                break;

            // ═══════════════════════════════════════
            // 🔒 قفل روم
            // ═══════════════════════════════════════
            case CONFIG.CMDS.LOCK:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdLock(message, args);
                break;

            // ═══════════════════════════════════════
            // 🔓 فتح روم
            // ═══════════════════════════════════════
            case CONFIG.CMDS.UNLOCK:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdUnlock(message, args);
                break;

            // ═══════════════════════════════════════
            // 🗑️ مسح رسائل
            // ═══════════════════════════════════════
            case CONFIG.CMDS.PURGE:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdPurge(message, args);
                break;

            // ═══════════════════════════════════════
            // 🐢 تبطيء
            // ═══════════════════════════════════════
            case CONFIG.CMDS.SLOWMODE:
                if (!isStarter) return this.sendNoPerm(message);
                await this.cmdSlowmode(message, args);
                break;

            // ═══════════════════════════════════════
            // 🛡️ الحماية
            // ═══════════════════════════════════════
            case CONFIG.CMDS.PROTECTION:
                if (message.author.id !== message.guild.ownerId) {
                    return message.reply({ embeds: [Embeds.error('خطأ', 'بس مالك السيرفر يقدر يستخدم هذا الأمر!')] });
                }
                await this.cmdProtection(message, args);
                break;

            // ═══════════════════════════════════════
            // 🎮 العاب
            // ═══════════════════════════════════════
            case CONFIG.CMDS.GAMES:
                await this.cmdGames(message);
                break;
        }
    }

    sendNoPerm(message) {
        return message.reply({ 
            embeds: [Embeds.error('صلاحيات', 'ما عندك صلاحية! بس الستيرتر يقدر يستخدم هذا الأمر.')] 
        });
    }

    // ═══════════════════════════════════════
    // 🚫 أمر الباند
    // ═══════════════════════════════════════
    async cmdBan(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        if (member.id === message.guild.ownerId) {
            return message.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تبند مالك السيرفر!')] });
        }

        if (member.roles.highest.position >= message.member.roles.highest.position && 
            message.author.id !== message.guild.ownerId) {
            return message.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تبنيد شخص رتبته أعلى منك!')] });
        }

        const timeArg = args.find(arg => /^\d+[dhms]$/.test(arg));
        const reason = args.filter(arg => arg !== timeArg && !arg.includes(member.id)).join(' ') || 'غير محدد';

        try {
            await member.ban({ reason: `بواسطة ${message.author.tag}: ${reason}`, deleteMessageDays: 0 });
            
            const embed = Embeds.success('تم التبنيد', 
                `**${member}** تم تبنيده!\n📌 **السبب:** ${reason}\n⏰ **الوقت:** ${timeArg || 'دائم'}`
            );
            await message.reply({ embeds: [embed] });

            // سجل
            await this.protection.sendLog(message.guild, Embeds.logAction(
                'تبنيد', message.author, member.user, reason, { 'الوقت': timeArg || 'دائم' }
            ));

            // إذا فيه وقت
            if (timeArg) {
                const ms = this.parseTime(timeArg);
                if (ms) {
                    setTimeout(async () => {
                        try {
                            await message.guild.members.unban(member.id, 'انتهاء وقت الباند');
                        } catch (e) {}
                    }, ms);
                }
            }

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', `ما قدرت أبنيده: ${e.message}`)] });
        }
    }

    // ═══════════════════════════════════════
    // 🔓 فك باند
    // ═══════════════════════════════════════
    async cmdUnban(message, args) {
        const userId = args[0];
        if (!userId || !/^\d+$/.test(userId)) {
            return message.reply({ embeds: [Embeds.error('خطأ', 'حط ايدي العضو!')] });
        }

        try {
            const user = await this.users.fetch(userId);
            await message.guild.members.unban(user, `بواسطة ${message.author.tag}`);
            
            const embed = Embeds.success('تم فك الباند', `**${user.tag}** تم فك الباند عنه!`);
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'فك باند', message.author, user, 'فك الباند'
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', `ما قدرت أفك الباند: ${e.message}`)] });
        }
    }

    // ═══════════════════════════════════════
    // 👢 طرد
    // ═══════════════════════════════════════
    async cmdKick(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        if (member.id === message.guild.ownerId) {
            return message.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تطرد مالك السيرفر!')] });
        }

        const reason = args.filter(arg => !arg.includes(member.id)).join(' ') || 'غير محدد';

        try {
            await member.kick(`بواسطة ${message.author.tag}: ${reason}`);
            
            const embed = Embeds.success('تم الطرد', `**${member}** تم طرده!\n📌 **السبب:** ${reason}`);
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'طرد', message.author, member.user, reason
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', `ما قدرت أطرده: ${e.message}`)] });
        }
    }

    // ═══════════════════════════════════════
    // 🔇 كتم
    // ═══════════════════════════════════════
    async cmdMute(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        const timeArg = args.find(arg => /^\d+[dhms]$/.test(arg)) || '1h';
        const reason = args.filter(arg => arg !== timeArg && !arg.includes(member.id)).join(' ') || 'غير محدد';

        const ms = this.parseTime(timeArg);
        if (!ms) return message.reply({ embeds: [Embeds.error('خطأ', 'صيغة الوقت غير صحيحة! (مثال: 1h, 30m, 1d)')] });

        try {
            await member.timeout(ms, `بواسطة ${message.author.tag}: ${reason}`);
            
            const embed = Embeds.success('تم الكتم', 
                `**${member}** تم كتمه!\n⏰ **المدة:** ${timeArg}\n📌 **السبب:** ${reason}`
            );
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'كتم', message.author, member.user, reason, { 'المدة': timeArg }
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', `ما قدرت أكتمه: ${e.message}`)] });
        }
    }

    // ═══════════════════════════════════════
    // 🔊 فك كتم
    // ═══════════════════════════════════════
    async cmdUnmute(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        try {
            await member.timeout(null, `بواسطة ${message.author.tag}`);
            
            const embed = Embeds.success('تم فك الكتم', `**${member}** يقدر يتكلم الحين!`);
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'فك كتم', message.author, member.user, 'فك الكتم'
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', `ما قدرت أفك الكتم: ${e.message}`)] });
        }
    }

    // ═══════════════════════════════════════
    // ⚠️ تحذير
    // ═══════════════════════════════════════
    async cmdWarn(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        const reason = args.filter(arg => !arg.includes(member.id)).join(' ') || 'غير محدد';

        db.addWarning(member.id, reason, message.author.id);
        const warnings = db.getWarnings(member.id);

        const embed = Embeds.warn('تم التحذير', 
            `**${member}** تم تحذيره!\n📌 **السبب:** ${reason}\n⚠️ **عدد التحذيرات:** ${warnings.length}`
        );
        await message.reply({ embeds: [embed] });

        // 3 تحذيرات = باند
        if (warnings.length >= 3) {
            try {
                await member.ban({ reason: 'وصل 3 تحذيرات', deleteMessageDays: 0 });
                await message.channel.send({ 
                    embeds: [Embeds.error('تم التبنيد التلقائي', `**${member}** وصل 3 تحذيرات وتم تبنيده!`)] 
                });
                db.clearWarnings(member.id);
            } catch (e) {}
        }

        await this.protection.sendLog(message.guild, Embeds.logAction(
            'تحذير', message.author, member.user, reason, { 'عدد التحذيرات': warnings.length }
        ));
    }

    // ═══════════════════════════════════════
    // 🔒 قفل روم
    // ═══════════════════════════════════════
    async cmdLock(message, args) {
        const channel = message.mentions.channels.first() || message.channel;
        
        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { 
                SendMessages: false 
            });
            
            const embed = Embeds.success('تم القفل', `🔒 **${channel}** تم قفله!`);
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'قفل روم', message.author, message.author, 'قفل الروم', { 'الروم': channel.toString() }
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════
    // 🔓 فتح روم
    // ═══════════════════════════════════════
    async cmdUnlock(message, args) {
        const channel = message.mentions.channels.first() || message.channel;
        
        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { 
                SendMessages: true 
            });
            
            const embed = Embeds.success('تم الفتح', `🔓 **${channel}** تم فتحه!`);
            await message.reply({ embeds: [embed] });

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'فتح روم', message.author, message.author, 'فتح الروم', { 'الروم': channel.toString() }
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════
    // 🗑️ مسح رسائل
    // ═══════════════════════════════════════
    async cmdPurge(message, args) {
        const amount = parseInt(args[0]) || 10;
        if (amount > 100) return message.reply({ embeds: [Embeds.error('خطأ', 'الحد الأقصى 100 رسالة!')] });

        try {
            const deleted = await message.channel.bulkDelete(amount + 1, true);
            
            const embed = Embeds.success('تم المسح', `🗑️ تم مسح **${deleted.size - 1}** رسالة!`);
            const msg = await message.reply({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => {}), 3000);

            await this.protection.sendLog(message.guild, Embeds.logAction(
                'مسح رسائل', message.author, message.author, 'مسح رسائل', 
                { 'العدد': deleted.size - 1, 'الروم': message.channel.toString() }
            ));

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════
    // 🐢 تبطيء
    // ═══════════════════════════════════════
    async cmdSlowmode(message, args) {
        const seconds = parseInt(args[0]) || 0;
        
        try {
            await message.channel.setRateLimitPerUser(seconds);
            
            const embed = seconds === 0 
                ? Embeds.success('تم إيقاف التبطيء', `**${message.channel}** التبطيء متوقف!`)
                : Embeds.success('تم التبطيء', `**${message.channel}** تم تبطيئه لـ **${seconds}** ثانية!`);
            
            await message.reply({ embeds: [embed] });

        } catch (e) {
            message.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════
    // 🛡️ إدارة الحماية
    // ═══════════════════════════════════════
    async cmdProtection(message, args) {
        const action = args[0];
        const member = message.mentions.members.first();
        const guildId = message.guild.id;

        if (action === 'تفعيل' || action === 'on') {
            if (!db.data.protection[guildId]) {
                db.data.protection[guildId] = { enabled: true, protectedUsers: [], suspiciousBots: [] };
            } else {
                db.data.protection[guildId].enabled = true;
            }
            db.save();
            return message.reply({ embeds: [Embeds.success('الحماية', '✅ تم تفعيل نظام الحماية!')] });
        }

        if (action === 'تعطيل' || action === 'off') {
            if (!db.data.protection[guildId]) {
                db.data.protection[guildId] = { enabled: false, protectedUsers: [], suspiciousBots: [] };
            } else {
                db.data.protection[guildId].enabled = false;
            }
            db.save();
            return message.reply({ embeds: [Embeds.success('الحماية', '❌ تم تعطيل نظام الحماية!')] });
        }

        if ((action === 'اضافة' || action === 'add') && member) {
            db.addProtected(guildId, member.id);
            return message.reply({ 
                embeds: [Embeds.success('الحماية', `🛡️ **${member}** تم إضافته لقائمة الحماية!`)] 
            });
        }

        if ((action === 'ازالة' || action === 'remove') && member) {
            db.removeProtected(guildId, member.id);
            return message.reply({ 
                embeds: [Embeds.success('الحماية', `🛡️ **${member}** تم إزالته من قائمة الحماية!`)] 
            });
        }

        message.reply({ 
            embeds: [Embeds.info('الاستخدام', '`.حماية [تفعيل/تعطيل/اضافة/ازالة] @عضو`')] 
        });
    }

    // ═══════════════════════════════════════
    // 🎮 قائمة الألعاب
    // ═══════════════════════════════════════
    async cmdGames(message) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('game_roulette')
                .setLabel('🎲 روليت')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('game_mafia')
                .setLabel('🕵️ مافيا')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('game_castle')
                .setLabel('🏰 كاستل')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('game_tictactoe')
                .setLabel('⚔️ تكت تو')
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = eventSystem.createGameEmbed();
        embed.setFooter({ text: `طلبت بواسطة ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

        await message.reply({ embeds: [embed], components: [row] });
    }

    // ═══════════════════════════════════════
    // 🎮 معالجة الأزرار
    // ═══════════════════════════════════════
    async handleButton(interaction) {
        if (!interaction.customId.startsWith('game_')) return;

        const game = interaction.customId.replace('game_', '');
        let embed;

        switch (game) {
            case 'roulette':
                embed = eventSystem.createRouletteEmbed();
                break;
            case 'mafia':
                embed = eventSystem.createMafiaEmbed();
                break;
            case 'castle':
                embed = eventSystem.createCastleEmbed();
                break;
            case 'tictactoe':
                embed = eventSystem.createTicTacToeEmbed();
                break;
        }

        if (embed) {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // ═══════════════════════════════════════
    // 🔧 السلاش كوماندات
    // ═══════════════════════════════════════
    async handleSlashCommand(interaction) {
        const isStarter = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                         interaction.user.id === interaction.guild.ownerId;

        if (interaction.commandName === 'لوق') {
            if (!isStarter) {
                return interaction.reply({ 
                    embeds: [Embeds.error('صلاحيات', 'بس الستيرتر يقدر يستخدم هذا الأمر!')], 
                    ephemeral: true 
                });
            }

            const channel = interaction.options.getChannel('channel');
            db.setLogChannel(interaction.guildId, channel.id);
            
            await interaction.reply({ 
                embeds: [Embeds.success('إعدادات اللوق', `📋 **${channel}** تم تحديده كروم للوق!`)] 
            });
        }

        if (interaction.commandName === 'حالة') {
            const uptime = new Date() - this.startTime;
            const hours = Math.floor(uptime / 3600000);
            const minutes = Math.floor((uptime % 3600000) / 60000);

            const embed = new EmbedBuilder()
                .setTitle('🦅 حالة Hawk Shield')
                .setDescription(`**الحالة:** 🟢 شغال\n**الوقت:** ${hours}س ${minutes}د`)
                .setColor(CONFIG.COLORS.SUCCESS)
                .addFields(
                    { name: '🛡️ الحماية', value: db.isProtectionEnabled(interaction.guildId) ? 'مفعلة' : 'معطلة', inline: true },
                    { name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true }
                );
            
            await interaction.reply({ embeds: [embed] });
        }
    }

    // ═══════════════════════════════════════
    // ⏱️ تحويل الوقت
    // ═══════════════════════════════════════
    parseTime(timeStr) {
        if (!timeStr) return null;
        const match = timeStr.match(/^(\d+)([dhms])$/);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 'd': return value * 24 * 60 * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'm': return value * 60 * 1000;
            case 's': return value * 1000;
            default: return null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 🏃 التشغيل
// ═══════════════════════════════════════════════════════════════

const bot = new HawkShield();

client.login(process.env.TOKEN)

bot.login(TOKEN).catch(err => {
    console.error('[Hawk Shield] ❌ خطأ في تسجيل الدخول:', err);
    process.exit(1);
});