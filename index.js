// ╔═══════════════════════════════════════════════════════════════════════╗
// ║                                                                       ║
// ║   ███╗   ███╗████████╗██╗  ██╗    ██████╗  ██████╗ ████████╗         ║
// ║   ████╗ ████║╚══██╔══╝╚██╗██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝         ║
// ║   ██╔████╔██║   ██║    ╚███╔╝     ██████╔╝██║   ██║   ██║            ║
// ║   ██║╚██╔╝██║   ██║    ██╔██╗     ██╔══██╗██║   ██║   ██║            ║
// ║   ██║ ╚═╝ ██║   ██║   ██╔╝ ██╗    ██████╔╝╚██████╔╝   ██║            ║
// ║   ╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝            ║
// ║                                                                       ║
// ║   🤖 MTX PROTECTION BOT v4.1 - FULL FIX                              ║
// ║   صناعة مبرمج محترف - نظام حماية وإدارة متكامل                       ║
// ║   Discord.js v14 | MongoDB | Node.js 18+                           ║
// ║                                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════╝

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

const mongoose = require('mongoose');
const http = require('http');

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ الإعدادات الرئيسية
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
    PREFIX: '.',
    
    CMDS: {
        BAN: 'باند',
        UNBAN: 'تف',
        KICK: 'بنعالي',
        MUTE: 'اسكت',
        UNMUTE: 'تكلم',
        WARN: 'تحذير',
        WARNINGS: 'تحذيرات',
        CLEARWARN: 'مسح_تحذير',
        LOCK: 'ق',
        UNLOCK: 'ف',
        PURGE: 'م',
        SLOWMODE: 'بطي',
        PROTECTION: 'حماية',
        GAMES: 'العاب'
    },
    
    PROTECTION: {
        SPAM_THRESHOLD: 5,
        SPAM_WINDOW: 3000,
        SPAM_MUTE_HOURS: 6,
        LINK_MUTE_MINUTES: 30,
        WARN_LIMIT: 5,
        WARN_MUTE_DAYS: 2
    },
    
    COLORS: {
        SUCCESS: 0x2ecc71,
        ERROR: 0xe74c3c,
        WARN: 0xf39c12,
        INFO: 0x3498db,
        PROTECTION: 0x9b59b6,
        GOLD: 0xffd700,
        DARK: 0x2c3e50
    }
};

// ═══════════════════════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات - MongoDB
// ═══════════════════════════════════════════════════════════════════════

const warnSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    warnings: [{
        reason: { type: String, default: 'غير محدد' },
        moderatorId: { type: String, required: true },
        moderatorTag: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    totalWarnings: { type: Number, default: 0 },
    autoMuted: { type: Boolean, default: false },
    lastAutoMute: { type: Date, default: null }
}, { timestamps: true });

warnSchema.index({ userId: 1, guildId: 1 }, { unique: true });

const protectionSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    protectedUsers: [{ type: String }],
    suspiciousBots: [{ type: String }],
    logChannelId: { type: String, default: null }
}, { timestamps: true });

const WarnModel = mongoose.model('Warning', warnSchema);
const ProtectionModel = mongoose.model('Protection', protectionSchema);

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ [MTX] متصل بـ MongoDB بنجاح!');
    } catch (err) {
        console.error('❌ [MTX] خطأ في الاتصال بـ MongoDB:', err);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎨 نظام الإمبدات الاحترافي
// ═══════════════════════════════════════════════════════════════════════

class Embeds {
    static success(title, description) {
        return new EmbedBuilder()
            .setTitle(`✅ ┃ ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.SUCCESS)
            .setTimestamp()
            .setFooter({ text: 'MTX Protection System', iconURL: 'https://cdn.discordapp.com/emojis/852937459965460500.png' });
    }

    static error(title, description) {
        return new EmbedBuilder()
            .setTitle(`❌ ┃ ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.ERROR)
            .setTimestamp()
            .setFooter({ text: 'MTX Protection System' });
    }

    static warn(title, description) {
        return new EmbedBuilder()
            .setTitle(`⚠️ ┃ ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.WARN)
            .setTimestamp()
            .setFooter({ text: 'MTX Protection System' });
    }

    static info(title, description) {
        return new EmbedBuilder()
            .setTitle(`ℹ️ ┃ ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.INFO)
            .setTimestamp()
            .setFooter({ text: 'MTX Protection System' });
    }

    static protection(title, description) {
        return new EmbedBuilder()
            .setTitle(`🛡️ ┃ ${title}`)
            .setDescription(description)
            .setColor(CONFIG.COLORS.PROTECTION)
            .setTimestamp()
            .setFooter({ text: 'MTX Protection System' });
    }

    static logAction(action, moderator, target, reason = 'غير محدد', extra = {}) {
        const embed = new EmbedBuilder()
            .setTitle(`📝 سجل إداري ┃ ${action}`)
            .setColor(CONFIG.COLORS.INFO)
            .setTimestamp()
            .addFields(
                { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
                { name: '📌 السبب', value: reason, inline: false }
            )
            .setFooter({ text: 'MTX Protection System', iconURL: moderator.guild?.iconURL() || undefined });

        for (const [key, value] of Object.entries(extra)) {
            embed.addFields({ name: key, value: String(value), inline: true });
        }
        return embed;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ نظام الحماية المتقدم - المُصلح
// ═══════════════════════════════════════════════════════════════════════

class ProtectionSystem {
    constructor(client) {
        this.client = client;
        this.spamTracker = new Map();
        this.linkRegex = /https?:\/\/[^\s]+/gi;
    }

    async sendLog(guild, embed) {
        const data = await ProtectionModel.findOne({ guildId: guild.id });
        if (!data?.logChannelId) return;
        const ch = guild.channels.cache.get(data.logChannelId);
        if (ch) try { await ch.send({ embeds: [embed] }); } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔒 الحماية من البوتات المشبوهة - مُصلح بالكامل
    // ═══════════════════════════════════════════════════════════════════
    async checkBotEntry(member) {
        console.log(`[MTX DEBUG] ====== دخل عضو جديد ======`);
        console.log(`[MTX DEBUG] الاسم: ${member.user.tag}`);
        console.log(`[MTX DEBUG] بوت: ${member.user.bot}`);
        console.log(`[MTX DEBUG] السيرفر: ${member.guild.name}`);
        
        if (!member.user.bot) {
            console.log(`[MTX DEBUG] مو بوت، نتجاهل`);
            return;
        }

        console.log(`[MTX DEBUG] ✅ هذا بوت! نبدأ الفحص...`);

        const guild = member.guild;

        // ننتظر شوي عشان Audit Log يتسجل
        await new Promise(resolve => setTimeout(resolve, 1500));

        // نجيب إعدادات الحماية
        let data = await ProtectionModel.findOne({ guildId: guild.id });
        if (!data) {
            data = await ProtectionModel.create({ guildId: guild.id, enabled: true, protectedUsers: [] });
            console.log(`[MTX DEBUG] ✅ سويت إعدادات افتراضية للسيرفر`);
        }

        if (data.enabled === false) {
            console.log(`[MTX DEBUG] ❌ الحماية معطلة في هذا السيرفر`);
            return;
        }

        console.log(`[MTX DEBUG] ✅ الحماية مفعلة`);

        try {
            const owner = await guild.fetchOwner();
            console.log(`[MTX DEBUG] مالك السيرفر: ${owner.tag}`);

            // نجيب Audit Log
            let adder = null;
            let auditFound = false;

            try {
                console.log(`[MTX DEBUG] نجيب Audit Logs...`);
                const logs = await guild.fetchAuditLogs({ 
                    limit: 10, 
                    type: AuditLogEvent.BotAdd 
                });
                
                console.log(`[MTX DEBUG] لقينا ${logs.entries.size} Audit Log`);
                
                // ندور على البوت المضاف
                const entry = logs.entries.find(e => {
                    console.log(`[MTX DEBUG] نفحص: target=${e.target?.id}, member=${member.id}`);
                    return e.target?.id === member.id;
                });

                if (entry) {
                    adder = entry.executor;
                    auditFound = true;
                    console.log(`[MTX DEBUG] ✅ لقينا مين ضاف البوت: ${adder?.tag}`);
                } else {
                    console.log(`[MTX DEBUG] ❌ ما لقينا Audit Log للبوت هذا`);
                }
            } catch(e) {
                console.log(`[MTX DEBUG] ❌ خطأ في Audit Log: ${e.message}`);
            }

            // إذا ما لقينا مين ضافه، نستخدم fallback
            if (!adder) {
                console.log(`[MTX DEBUG] نستخدم fallback - نفترض إن الشخص غير معروف`);
            }

            // نتحقق إذا الشخص محمي
            const isProtected = adder ? (data.protectedUsers || []).includes(adder.id) : false;
            const isOwner = adder ? adder.id === owner.id : false;

            console.log(`[MTX DEBUG] adder: ${adder?.tag || 'غير معروف'}`);
            console.log(`[MTX DEBUG] isProtected: ${isProtected}`);
            console.log(`[MTX DEBUG] isOwner: ${isOwner}`);

            if (isProtected || isOwner) {
                console.log(`[MTX DEBUG] ✅ الشخص محمي، ما نسوي شي`);
                return;
            }

            console.log(`[MTX DEBUG] 🚨 الشخص غير محمي! نبدأ الإجراءات...`);

            // طرد البوت
            try {
                await member.kick('🛡️ MTX: بوت مشبوه - غير مصرح');
                console.log(`[MTX DEBUG] ✅ البوت تم طرده`);
            } catch(e) {
                console.error(`[MTX DEBUG] ❌ ما قدرت أطرد البوت: ${e.message}`);
                return;
            }

            // رسالة للأونر
            const embed = Embeds.protection('تم طرد بوت مشبوه!',
                `**تم اكتشاف بوت مشبوه وطرده تلقائياً**\n\n` +
                `🤖 **اسم البوت:** ${member.user.tag} (\`${member.id}\`)\n` +
                `👤 **الشخص اللي ضافه:** ${adder ? `${adder} (\`${adder.id}\`)` : 'غير معروف (تم الكشف عبر النظام)'}\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}\n` +
                `⚡ **الإجراء:** تم الطرد الفوري\n\n` +
                `📝 **ملاحظة:** إذا تبي تسمح ببوت معين، استخدم:\n` +
                `\`.حماية اضافة @الشخص\``
            );

            try {
                await owner.send({ embeds: [embed] });
                console.log(`[MTX DEBUG] ✅ رسالة وصلت للأونر`);
            } catch(e) {
                console.log(`[MTX DEBUG] ❌ ما قدرت أرسل للأونر: ${e.message}`);
            }

            await this.sendLog(guild, embed);

            // باند الشخص اللي ضافه
            if (adder && adder.id !== owner.id) {
                try {
                    await guild.members.ban(adder.id, { 
                        reason: '🛡️ MTX: محاولة إضافة بوت غير مصرح بها', 
                        deleteMessageDays: 0 
                    });

                    const banEmbed = Embeds.protection('تم تبنيد شخص حاول إضافة بوت!',
                        `**تم تبنيد الشخص تلقائياً**\n\n` +
                        `👤 **الشخص:** ${adder} (\`${adder.id}\`)\n` +
                        `🤖 **البوت:** ${member.user.tag}\n` +
                        `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}\n` +
                        `🚫 **الإجراء:** تم التبنيد`
                    );

                    try {
                        await owner.send({ embeds: [banEmbed] });
                    } catch(e) {}

                    await this.sendLog(guild, banEmbed);
                    console.log(`[MTX DEBUG] ✅ الشerson تم تبنيده`);
                } catch(e) {
                    console.error(`[MTX DEBUG] ❌ ما قدرت أبنيد الشخص: ${e.message}`);
                }
            }

        } catch(e) {
            console.error(`[MTX DEBUG] ❌ خطأ عام:`, e);
        }
        
        console.log(`[MTX DEBUG] ====== انتهى الفحص ======\n`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🚨 الحماية من السبام
    // ═══════════════════════════════════════════════════════════════════
    async checkSpam(message) {
        if (message.author.bot || message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        
        const uid = message.author.id, now = Date.now();
        if (!this.spamTracker.has(uid)) this.spamTracker.set(uid, []);
        
        const ts = this.spamTracker.get(uid);
        ts.push(now);
        const recent = ts.filter(t => now - t <= CONFIG.PROTECTION.SPAM_WINDOW);
        this.spamTracker.set(uid, recent);

        if (recent.length >= CONFIG.PROTECTION.SPAM_THRESHOLD) {
            try {
                await message.member.timeout(CONFIG.PROTECTION.SPAM_MUTE_HOURS * 3600000, '🛡️ MTX: سبام مفرط');
                
                const embed = Embeds.warn('تم كتم المستخدم',
                    `**${message.author} تم كتمه بسبب السبام**\n` +
                    `⏰ **المدة:** ${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات\n` +
                    `📊 **الرسائل:** ${recent.length} في ${CONFIG.PROTECTION.SPAM_WINDOW / 1000} ثواني`
                );
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 10000);
                
                await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (سبام)', this.client.user, message.author, 'سبام مفرط', { 'المدة': `${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات` }));
                return true;
            } catch(e) {
                console.error('[MTX] خطأ في كتم السبام:', e);
            }
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔗 الحماية من الروابط
    // ═══════════════════════════════════════════════════════════════════
    async checkLinks(message) {
        if (message.author.bot) return false;
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        if (message.author.id === message.guild.ownerId) return false;
        if (!this.linkRegex.test(message.content)) return false;

        try {
            await message.delete();
            await message.member.timeout(CONFIG.PROTECTION.LINK_MUTE_MINUTES * 60000, '🛡️ MTX: إرسال روابط');
            
            const embed = Embeds.warn('تم كتم المستخدم',
                `**${message.author} تم كتمه بسبب إرسال روابط**\n` +
                `⏰ **المدة:** ${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة\n` +
                `🔗 **الرابط:** تم حذفه`
            );
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => {}), 10000);
            
            await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (روابط)', this.client.user, message.author, 'إرسال روابط', { 'المدة': `${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة` }));
            return true;
        } catch(e) {
            console.error('[MTX] خطأ في كتم الروابط:', e);
            return false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🤖 البوت الرئيسي
// ═══════════════════════════════════════════════════════════════════════

class MTXBot extends Client {
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
        console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 MTX BOT v4.1 - ONLINE                   ║
    ║        الحالة: 🟢 أخضر (Online)                  ║
    ║        السيرفرات: ${this.guilds.cache.size.toString().padEnd(27)}║
    ║        المستخدمين: ${this.users.cache.size.toString().padEnd(26)}║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
        `);

        await this.user.setPresence({
            activities: [{ 
                name: '🛡️ الحماية | .العاب للإيفنتات', 
                type: 3 
            }],
            status: 'online'
        });

        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const cmds = [
            new SlashCommandBuilder()
                .setName('لوق')
                .setDescription('تحديد روم اللوق')
                .addChannelOption(o => 
                    o.setName('channel')
                     .setDescription('روم اللوق')
                     .setRequired(true)
                     .addChannelTypes(ChannelType.GuildText)
                ),
            new SlashCommandBuilder()
                .setName('حالة')
                .setDescription('حالة البوت')
        ];

        try {
            await this.application.commands.set(cmds);
            console.log('✅ [MTX] تم تسجيل السلاش كوماندات');
        } catch(e) {
            console.error('❌ [MTX] خطأ في السلاش كوماندات:', e);
        }
    }

    async onMessage(message) {
        if (message.author.bot || !message.guild) return;
        if (await this.protection.checkSpam(message)) return;
        if (await this.protection.checkLinks(message)) return;
        await this.handleCommand(message);
    }

    async onMemberAdd(member) {
        if (member.user.bot) {
            console.log(`[MTX] بوت دخل السيرفر: ${member.user.tag}`);
            await this.protection.checkBotEntry(member);
        }
    }

    async onInteraction(i) {
        if (i.isButton() && i.customId.startsWith('game_')) {
            const game = i.customId.replace('game_', '');
            const embeds = {
                roulette: new EmbedBuilder().setTitle('🎲 روليت').setDescription('**لعبة الحظ والأرقام**\n\nاختر رقم من 0-36 واربح!').setColor(0xe74c3c)
                    .addFields({ name: '👥 اللاعبين', value: '2+', inline: true }, { name: '💰 المكافأة', value: 'x36', inline: true }),
                mafia: new EmbedBuilder().setTitle('🕵️ مافيا').setDescription('**لعبة الغموض والخداع**\n\nمواطنين ضد المافيا - من يفوز؟').setColor(0x2c3e50)
                    .addFields({ name: '👥 اللاعبين', value: '6-16', inline: true }, { name: '⏱️ المدة', value: '20-40 دقيقة', inline: true }),
                castle: new EmbedBuilder().setTitle('🏰 كاستل').setDescription('**حرب القلاع**\n\nفريقين يتنافسون على احتلال القلعة!').setColor(0x9b59b6)
                    .addFields({ name: '👥 اللاعبين', value: '10+ (5 ضد 5)', inline: true }),
                tictactoe: new EmbedBuilder().setTitle('⚔️ تكت تو').setDescription('**XO الكلاسيكية**\n\nلعبة ذكاء بسيطة مع صديقك!').setColor(0x34495e)
                    .addFields({ name: '👥 اللاعبين', value: '2', inline: true })
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
            await ProtectionModel.findOneAndUpdate(
                { guildId: i.guildId },
                { logChannelId: ch.id },
                { upsert: true, new: true }
            );
            await i.reply({ embeds: [Embeds.success('إعدادات اللوق', `📋 **${ch}** تم تحديده كروم للوق!`)] });
        }

        if (i.commandName === 'حالة') {
            const uptime = new Date() - this.startTime;
            const h = Math.floor(uptime / 3600000);
            const m = Math.floor((uptime % 3600000) / 60000);
            const data = await ProtectionModel.findOne({ guildId: i.guildId });
            
            const embed = new EmbedBuilder()
                .setTitle('🤖 حالة MTX Bot')
                .setDescription(`**الحالة:** 🟢 Online\n**الوقت:** ${h}س ${m}د`)
                .setColor(CONFIG.COLORS.SUCCESS)
                .addFields(
                    { name: '🛡️ الحماية', value: data?.enabled !== false ? '✅ مفعلة' : '❌ معطلة', inline: true },
                    { name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true },
                    { name: '👥 المستخدمين', value: String(this.users.cache.size), inline: true },
                    { name: '📋 روم اللوق', value: data?.logChannelId ? `<#${data.logChannelId}>` : 'غير محدد', inline: true }
                )
                .setTimestamp();
            await i.reply({ embeds: [embed] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔧 نظام الأوامر التقليدية
    // ═══════════════════════════════════════════════════════════════════

    async handleCommand(message) {
        const content = message.content.trim();
        if (!content.startsWith(CONFIG.PREFIX)) return;

        const args = content.slice(1).trim().split(/\s+/);
        const cmd = args.shift();

        const isStarter = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                         message.author.id === message.guild.ownerId;
        const isOwner = message.author.id === message.guild.ownerId;

        switch(cmd) {
            case CONFIG.CMDS.BAN: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdBan(message, args); 
                break;
            case CONFIG.CMDS.UNBAN: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdUnban(message, args); 
                break;
            case CONFIG.CMDS.KICK: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdKick(message, args); 
                break;
            case CONFIG.CMDS.MUTE: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdMute(message, args); 
                break;
            case CONFIG.CMDS.UNMUTE: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdUnmute(message, args); 
                break;
            case CONFIG.CMDS.WARN: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdWarn(message, args); 
                break;
            case CONFIG.CMDS.WARNINGS: 
                await this.cmdWarnings(message, args); 
                break;
            case CONFIG.CMDS.CLEARWARN: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdClearWarn(message, args); 
                break;
            case CONFIG.CMDS.LOCK: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdLock(message, args); 
                break;
            case CONFIG.CMDS.UNLOCK: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdUnlock(message, args); 
                break;
            case CONFIG.CMDS.PURGE: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdPurge(message, args); 
                break;
            case CONFIG.CMDS.SLOWMODE: 
                if (!isStarter) return this.noPerm(message); 
                await this.cmdSlowmode(message, args); 
                break;
            case CONFIG.CMDS.PROTECTION: 
                if (!isOwner) return message.reply({ embeds: [Embeds.error('خطأ', 'بس مالك السيرفر!')] }); 
                await this.cmdProtection(message, args); 
                break;
            case CONFIG.CMDS.GAMES: 
                await this.cmdGames(message); 
                break;
        }
    }

    noPerm(m) {
        return m.reply({ embeds: [Embeds.error('صلاحيات', '⛔ بس الستيرتر يقدر يستخدم هذا الأمر!')] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🚫 باند
    // ═══════════════════════════════════════════════════════════════════
    async cmdBan(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        if (member.id === m.guild.ownerId) return m.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تبند الأونر!')] });
        if (member.roles.highest.position >= m.member.roles.highest.position && m.author.id !== m.guild.ownerId) {
            return m.reply({ embeds: [Embeds.error('خطأ', 'رتبته أعلى منك!')] });
        }

        const timeArg = args.find(a => /^\d+[dhms]$/.test(a));
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id)).join(' ') || 'غير محدد';

        try {
            await member.ban({ reason: `بواسطة ${m.author.tag}: ${reason}`, deleteMessageDays: 0 });
            
            const embed = Embeds.success('تم التبنيد',
                `**العضو:** ${member}\n🆔 **الايدي:** \`${member.id}\`\n📌 **السبب:** ${reason}\n⏰ **الوقت:** ${timeArg || 'دائم'}\n🔧 **بواسطة:** ${m.author}`
            );
            await m.reply({ embeds: [embed] });

            await this.protection.sendLog(m.guild, Embeds.logAction('تبنيد', m.author, member.user, reason, { 'الوقت': timeArg || 'دائم' }));

            if (timeArg) {
                const ms = this.parseTime(timeArg);
                if (ms) setTimeout(() => m.guild.members.unban(member.id, 'انتهاء الوقت').catch(() => {}), ms);
            }
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔓 فك باند
    // ═══════════════════════════════════════════════════════════════════
    async cmdUnban(m, args) {
        const uid = args[0];
        if (!uid || !/^\d+$/.test(uid)) return m.reply({ embeds: [Embeds.error('خطأ', 'حط ايدي صحيح!')] });

        try {
            const user = await this.users.fetch(uid);
            await m.guild.members.unban(user, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الباند', `**${user.tag}** تم فك الباند عنه!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فك باند', m.author, user, 'فك الباند'));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 👢 طرد
    // ═══════════════════════════════════════════════════════════════════
    async cmdKick(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        if (member.id === m.guild.ownerId) return m.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تطرد الأونر!')] });

        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';

        try {
            await member.kick(`بواسطة ${m.author.tag}: ${reason}`);
            m.reply({ embeds: [Embeds.success('تم الطرد', `**${member}** تم طرده!\n📌 **السبب:** ${reason}`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('طرد', m.author, member.user, reason));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔇 كتم
    // ═══════════════════════════════════════════════════════════════════
    async cmdMute(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        const timeArg = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id)).join(' ') || 'غير محدد';

        const ms = this.parseTime(timeArg);
        if (!ms) return m.reply({ embeds: [Embeds.error('خطأ', 'صيغة غير صحيحة! استخدم: 1h, 30m, 1d')] });

        try {
            await member.timeout(ms, `بواسطة ${m.author.tag}: ${reason}`);
            m.reply({ embeds: [Embeds.success('تم الكتم', `**${member}** تم كتمه!\n⏰ **المدة:** ${timeArg}\n📌 **السبب:** ${reason}`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('كتم', m.author, member.user, reason, { 'المدة': timeArg }));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔊 فك كتم
    // ═══════════════════════════════════════════════════════════════════
    async cmdUnmute(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        try {
            await member.timeout(null, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الكتم', `**${member}** يقدر يتكلم الحين! 🎉`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فك كتم', m.author, member.user, 'فك الكتم'));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ⚠️ تحذير - 5 = يومين ميوت
    // ═══════════════════════════════════════════════════════════════════
    async cmdWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';

        let record = await WarnModel.findOne({ userId: member.id, guildId: m.guild.id });
        if (!record) {
            record = new WarnModel({ userId: member.id, guildId: m.guild.id, warnings: [], totalWarnings: 0 });
        }

        record.warnings.push({
            reason,
            moderatorId: m.author.id,
            moderatorTag: m.author.tag,
            timestamp: new Date()
        });
        record.totalWarnings = record.warnings.length;
        await record.save();

        // 5 تحذيرات = ميوت يومين
        if (record.totalWarnings >= CONFIG.PROTECTION.WARN_LIMIT) {
            const muteMs = CONFIG.PROTECTION.WARN_MUTE_DAYS * 24 * 60 * 60 * 1000;
            try {
                await member.timeout(muteMs, `🛡️ MTX: وصل ${CONFIG.PROTECTION.WARN_LIMIT} تحذيرات`);
                
                const autoEmbed = Embeds.warn('🚫 ميوت تلقائي!',
                    `**${member}** وصل **${CONFIG.PROTECTION.WARN_LIMIT}** تحذيرات!\n\n` +
                    `⏰ **العقوبة:** ميوت **${CONFIG.PROTECTION.WARN_MUTE_DAYS} يومين**\n` +
                    `📌 **السبب:** تجاوز الحد المسموح\n` +
                    `🗑️ **التحذيرات:** تم مسحها`
                );
                await m.reply({ embeds: [autoEmbed] });
                await this.protection.sendLog(m.guild, Embeds.logAction('ميوت تلقائي', m.author, member.user, '5 تحذيرات', { 'المدة': `${CONFIG.PROTECTION.WARN_MUTE_DAYS} يومين` }));

                await WarnModel.findOneAndDelete({ userId: member.id, guildId: m.guild.id });
            } catch(e) {
                m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
            }
            return;
        }

        const embed = Embeds.warn('تم التحذير',
            `**${member}**\n📌 **السبب:** ${reason}\n⚠️ **التحذيرات:** ${record.totalWarnings}/${CONFIG.PROTECTION.WARN_LIMIT}\n🔧 **بواسطة:** ${m.author}`
        );
        await m.reply({ embeds: [embed] });
        await this.protection.sendLog(m.guild, Embeds.logAction('تحذير', m.author, member.user, reason, { 'العدد': `${record.totalWarnings}/${CONFIG.PROTECTION.WARN_LIMIT}` }));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 📋 عرض التحذيرات
    // ═══════════════════════════════════════════════════════════════════
    async cmdWarnings(m, args) {
        const member = m.mentions.members.first() || m.member;
        const record = await WarnModel.findOne({ userId: member.id, guildId: m.guild.id });

        if (!record || record.warnings.length === 0) {
            return m.reply({ embeds: [Embeds.info('نظيف ✅', `**${member}** ما عنده ولا تحذير!`)] });
        }

        const warnList = record.warnings.map((w, i) => 
            `\`${i + 1}.\` **${w.reason}**\n├ 👤 <@${w.moderatorId}>\n└ 🕐 ${new Date(w.timestamp).toLocaleString('ar-SA')}`
        ).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ تحذيرات ${member.user.tag}`)
            .setDescription(warnList)
            .setColor(CONFIG.COLORS.WARN)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `${record.warnings.length}/${CONFIG.PROTECTION.WARN_LIMIT} | بعد ${CONFIG.PROTECTION.WARN_LIMIT} = ميوت ${CONFIG.PROTECTION.WARN_MUTE_DAYS} يوم` })
            .setTimestamp();

        await m.reply({ embeds: [embed] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🗑️ مسح تحذير
    // ═══════════════════════════════════════════════════════════════════
    async cmdClearWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });

        const index = parseInt(args.find(a => /^\d+$/.test(a)));
        const record = await WarnModel.findOne({ userId: member.id, guildId: m.guild.id });

        if (!record || record.warnings.length === 0) {
            return m.reply({ embeds: [Embeds.error('خطأ', 'ما عنده تحذيرات!')] });
        }

        if (index && index > 0) {
            if (index > record.warnings.length) {
                return m.reply({ embeds: [Embeds.error('خطأ', `رقم غير موجود! عنده بس ${record.warnings.length}`)] });
            }
            record.warnings.splice(index - 1, 1);
            record.totalWarnings = record.warnings.length;
            await record.save();
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح التحذير رقم **${index}**! الآن: **${record.totalWarnings}**`)] });
        } else {
            await WarnModel.findOneAndDelete({ userId: member.id, guildId: m.guild.id });
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح جميع تحذيرات **${member}**!`)] });
        }

        await this.protection.sendLog(m.guild, Embeds.logAction('مسح تحذيرات', m.author, member.user, 'مسح'));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔒 قفل
    // ═══════════════════════════════════════════════════════════════════
    async cmdLock(m, args) {
        const ch = m.mentions.channels.first() || m.channel;
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false });
            m.reply({ embeds: [Embeds.success('تم القفل', `🔒 **${ch}** تم قفله!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('قفل روم', m.author, m.author, 'قفل', { 'الروم': ch.toString() }));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔓 فتح
    // ═══════════════════════════════════════════════════════════════════
    async cmdUnlock(m, args) {
        const ch = m.mentions.channels.first() || m.channel;
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: true });
            m.reply({ embeds: [Embeds.success('تم الفتح', `🔓 **${ch}** تم فتحه!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فتح روم', m.author, m.author, 'فتح', { 'الروم': ch.toString() }));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🗑️ مسح
    // ═══════════════════════════════════════════════════════════════════
    async cmdPurge(m, args) {
        const amount = parseInt(args[0]) || 10;
        if (amount > 100) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأقصى 100!')] });
        if (amount < 1) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأدنى 1!')] });

        try {
            const deleted = await m.channel.bulkDelete(amount + 1, true);
            const msg = await m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح **${deleted.size - 1}** رسالة!`)] });
            setTimeout(() => msg.delete().catch(() => {}), 3000);
            await this.protection.sendLog(m.guild, Embeds.logAction('مسح رسائل', m.author, m.author, 'مسح', { 'العدد': deleted.size - 1 }));
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🐢 تبطيء
    // ═══════════════════════════════════════════════════════════════════
    async cmdSlowmode(m, args) {
        const sec = parseInt(args[0]) || 0;
        if (sec < 0) return m.reply({ embeds: [Embeds.error('خطأ', 'لازم 0 أو أكثر!')] });

        try {
            await m.channel.setRateLimitPerUser(sec);
            const embed = sec === 0 
                ? Embeds.success('تم إيقاف التبطيء', `**${m.channel}** التبطيء متوقف! ✅`)
                : Embeds.success('تم التبطيء', `**${m.channel}** تم تبطيئه لـ **${sec}** ثانية! 🐢`);
            m.reply({ embeds: [embed] });
        } catch(e) {
            m.reply({ embeds: [Embeds.error('خطأ', e.message)] });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🛡️ إدارة الحماية
    // ═══════════════════════════════════════════════════════════════════
    async cmdProtection(m, args) {
        const action = args[0];
        const member = m.mentions.members.first();
        const gid = m.guild.id;

        if (action === 'تفعيل' || action === 'on') {
            await ProtectionModel.findOneAndUpdate({ guildId: gid }, { enabled: true }, { upsert: true, new: true });
            return m.reply({ embeds: [Embeds.success('الحماية', '✅ تم التفعيل!')] });
        }

        if (action === 'تعطيل' || action === 'off') {
            await ProtectionModel.findOneAndUpdate({ guildId: gid }, { enabled: false }, { upsert: true, new: true });
            return m.reply({ embeds: [Embeds.success('الحماية', '❌ تم التعطيل!')] });
        }

        if ((action === 'اضافة' || action === 'add') && member) {
            await ProtectionModel.findOneAndUpdate({ guildId: gid }, { $addToSet: { protectedUsers: member.id } }, { upsert: true, new: true });
            return m.reply({ embeds: [Embeds.success('الحماية', `🛡️ **${member}** تمت الإضافة!`)] });
        }

        if ((action === 'ازالة' || action === 'remove') && member) {
            await ProtectionModel.findOneAndUpdate({ guildId: gid }, { $pull: { protectedUsers: member.id } }, { new: true });
            return m.reply({ embeds: [Embeds.success('الحماية', `🛡️ **${member}** تمت الإزالة!`)] });
        }

        m.reply({ embeds: [Embeds.info('الاستخدام', 
            '`.حماية تفعيل` - تفعيل\n' +
            '`.حماية تعطيل` - تعطيل\n' +
            '`.حماية اضافة @عضو` - إضافة\n' +
            '`.حماية ازالة @عضو` - إزالة'
        )] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🎮 العاب
    // ═══════════════════════════════════════════════════════════════════
    async cmdGames(m) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_roulette').setLabel('🎲 روليت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_mafia').setLabel('🕵️ مافيا').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('game_castle').setLabel('🏰 كاستل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('game_tictactoe').setLabel('⚔️ تكت تو').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle('🎮 قائمة الألعاب الجماعية')
            .setDescription('اختر لعبة من القائمة!')
            .setColor(CONFIG.COLORS.SUCCESS)
            .setFooter({ text: `طلبت بواسطة ${m.author.tag}`, iconURL: m.author.displayAvatarURL() })
            .setTimestamp();

        await m.reply({ embeds: [embed], components: [row] });
    }

    parseTime(str) {
        if (!str) return null;
        const match = str.match(/^(\d+)([dhms])$/);
        if (!match) return null;
        const value = parseInt(match[1]);
        const unit = match[2];
        switch(unit) {
            case 'd': return value * 86400000;
            case 'h': return value * 3600000;
            case 'm': return value * 60000;
            case 's': return value * 1000;
            default: return null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🌐 Keep-Alive Server
// ═══════════════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <title>MTX Bot</title>
            <style>
                body { background: #0a0a0a; color: #2ecc71; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { text-align: center; }
                h1 { font-size: 3em; margin-bottom: 10px; }
                .status { background: #1a1a1a; padding: 20px 40px; border-radius: 15px; border: 2px solid #2ecc71; }
                .online { color: #2ecc71; font-size: 1.5em; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 MTX Bot</h1>
                <div class="status">
                    <p class="online">🟢 Online</p>
                    <p>البوت شغال بنجاح!</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 [MTX] Keep-Alive Server شغال على البورت ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════
// 🏃 التشغيل
// ═══════════════════════════════════════════════════════════════════════

const bot = new MTXBot();

async function start() {
    await connectDatabase();
    await bot.login(process.env.TOKEN);
}

start().catch(err => {
    console.error('❌ [MTX] خطأ فادح:', err);
    process.exit(1);
});
