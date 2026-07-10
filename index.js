// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  🤖 MTX PROTECTION BOT v5.1 - CLEAN FIX                               ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const { 
    Client, GatewayIntentBits, Partials, PermissionsBitField, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    SlashCommandBuilder, AuditLogEvent, ChannelType
} = require('discord.js');
const http = require('http');
const { WarningDB, ProtectionDB } = require('./database');

const CONFIG = {
    CMDS: {
        BAN: 'باند', UNBAN: 'تف', KICK: 'بنعالي', MUTE: 'اسكت', UNMUTE: 'تكلم',
        WARN: 'تحذير', WARNINGS: 'تحذيرات', CLEARWARN: 'مسح_تحذير',
        LOCK: 'ق', UNLOCK: 'ف', PURGE: 'م', SLOWMODE: 'بطي',
        PROTECTION: 'حماية', GAMES: 'العاب'
    },
    PROTECTION: {
        SPAM_THRESHOLD: 5, SPAM_WINDOW: 3000, SPAM_MUTE_HOURS: 6,
        LINK_MUTE_MINUTES: 30, WARN_LIMIT: 5, WARN_MUTE_DAYS: 2
    },
    COLORS: {
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, WARN: 0xf39c12,
        INFO: 0x3498db, PROTECTION: 0x9b59b6
    }
};

class Embeds {
    static success(title, description) {
        return new EmbedBuilder().setTitle(`✅ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.SUCCESS).setTimestamp().setFooter({ text: 'MTX Protection System' });
    }
    static error(title, description) {
        return new EmbedBuilder().setTitle(`❌ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.ERROR).setTimestamp().setFooter({ text: 'MTX Protection System' });
    }
    static warn(title, description) {
        return new EmbedBuilder().setTitle(`⚠️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.WARN).setTimestamp().setFooter({ text: 'MTX Protection System' });
    }
    static info(title, description) {
        return new EmbedBuilder().setTitle(`ℹ️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.INFO).setTimestamp().setFooter({ text: 'MTX Protection System' });
    }
    static protection(title, description) {
        return new EmbedBuilder().setTitle(`🛡️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.PROTECTION).setTimestamp().setFooter({ text: 'MTX Protection System' });
    }
    static logAction(action, moderator, target, reason = 'غير محدد', extra = {}) {
        const embed = new EmbedBuilder().setTitle(`📝 سجل إداري ┃ ${action}`)
            .setColor(CONFIG.COLORS.INFO).setTimestamp()
            .addFields(
                { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
                { name: '📌 السبب', value: reason, inline: false }
            ).setFooter({ text: 'MTX Protection System' });
        for (const [key, value] of Object.entries(extra)) {
            embed.addFields({ name: key, value: String(value), inline: true });
        }
        return embed;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ PROTECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════

class ProtectionSystem {
    constructor(client) {
        this.client = client;
        this.spamTracker = new Map();
        this.linkRegex = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/gi;
        this.recentJoins = new Map();
        this.channelTracker = new Map();
        this.roleTracker = new Map();
        this.NUKE_THRESHOLD = 5;
        this.NUKE_WINDOW = 10000;
        this.globalChannelChanges = [];
    }

    async sendLog(guild, embed) {
        const chId = ProtectionDB.getLogChannel(guild.id);
        if (!chId) return;
        const ch = guild.channels.cache.get(chId);
        if (ch) try { await ch.send({ embeds: [embed] }); } catch(e) {}
    }

    // BOT PROTECTION
    async checkBotEntry(member) {
        if (!member.user.bot) return;
        const guild = member.guild;
        await new Promise(r => setTimeout(r, 2000));
        if (!ProtectionDB.isEnabled(guild.id)) return;

        try {
            const owner = await guild.fetchOwner().catch(() => null);
            if (!owner) return;
            const botMember = guild.members.me;
            if (!botMember) return;
            const canKick = botMember.permissions.has(PermissionsBitField.Flags.KickMembers);
            const canBan = botMember.permissions.has(PermissionsBitField.Flags.BanMembers);

            let adder = null;
            try {
                const logs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.BotAdd });
                const entry = logs.entries.find(e => e.target?.id === member.id && (Date.now() - e.createdTimestamp < 10000));
                if (entry) adder = entry.executor;
            } catch(e) {}

            const isProtected = adder ? ProtectionDB.isProtected(guild.id, adder.id) : false;
            const isOwner = adder ? adder.id === owner.id : false;
            if (isProtected || isOwner) return;

            if (canKick) {
                await member.kick('🛡️ MTX: بوت مشبوه - غير مصرح').catch(() => {});
            }

            const embed = Embeds.protection('🚨 تم طرد بوت مشبوه!',
                `**تم اكتشاف بوت مشبوه وطرده تلقائياً**\n\n` +
                `🤖 **اسم البوت:** ${member.user.tag} (\`${member.id}\`)\n` +
                `👤 **الشخص اللي ضافه:** ${adder ? `${adder} (\`${adder.id}\`)` : 'غير معروف'}\n` +
                `⏰ **الوقت:** ${new Date().toLocaleString('ar-SA')}`
            );
            try { await owner.send({ embeds: [embed] }).catch(() => {}); } catch(e) {}
            await this.sendLog(guild, embed);

            if (adder && adder.id !== owner.id && canBan) {
                await guild.members.ban(adder.id, { reason: '🛡️ MTX: محاولة إضافة بوت غير مصرح بها', deleteMessageDays: 0 }).catch(() => {});
            }
        } catch(e) {
            console.error('[MTX PROTECTION] خطأ:', e);
        }
    }

    // SPAM PROTECTION
    async checkSpam(message) {
        if (message.author.bot) return false;
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        if (message.author.id === message.guild.ownerId) return false;

        const uid = message.author.id, now = Date.now();
        if (!this.spamTracker.has(uid)) this.spamTracker.set(uid, []);
        const ts = this.spamTracker.get(uid);
        ts.push(now);
        const recent = ts.filter(t => now - t <= CONFIG.PROTECTION.SPAM_WINDOW);
        this.spamTracker.set(uid, recent);
        if (recent.length === 0) this.spamTracker.delete(uid);

        if (recent.length >= CONFIG.PROTECTION.SPAM_THRESHOLD) {
            const botMember = message.guild.members.me;
            if (!botMember?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return false;
            try {
                const messages = await message.channel.messages.fetch({ limit: 10 });
                const spamMessages = messages.filter(m => m.author.id === uid && now - m.createdTimestamp <= CONFIG.PROTECTION.SPAM_WINDOW);
                if (spamMessages.size > 0) await message.channel.bulkDelete(spamMessages, true).catch(() => {});
                await message.member.timeout(CONFIG.PROTECTION.SPAM_MUTE_HOURS * 3600000, '🛡️ MTX: سبام مفرط');
                const embed = Embeds.warn('🚨 تم كتم المستخدم (سبام)',
                    `**${message.author}** تم كتمه بسبب السبام المفرط!\n\n` +
                    `⏰ **المدة:** ${CONFIG.PROTECTION.SPAM_MUTE_HOURS} ساعات\n` +
                    `📊 **الرسائل:** ${recent.length} في ${CONFIG.PROTECTION.SPAM_WINDOW / 1000} ثواني`
                );
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 15000);
                await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (سبام)', this.client.user, message.author, 'سبام مفرط'));
                this.spamTracker.delete(uid);
                return true;
            } catch(e) { console.error('[MTX SPAM] خطأ:', e.message); }
        }
        return false;
    }

    // LINK PROTECTION
    async checkLinks(message) {
        if (message.author.bot) return false;
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        if (message.author.id === message.guild.ownerId) return false;
        if (!this.linkRegex.test(message.content)) return false;

        const botMember = message.guild.members.me;
        const canDelete = botMember?.permissions.has(PermissionsBitField.Flags.ManageMessages);
        const canTimeout = botMember?.permissions.has(PermissionsBitField.Flags.ModerateMembers);

        try {
            if (canDelete) await message.delete();
            if (canTimeout) await message.member.timeout(CONFIG.PROTECTION.LINK_MUTE_MINUTES * 60000, '🛡️ MTX: إرسال روابط');
            const embed = Embeds.warn('🚨 تم كتم المستخدم (روابط)',
                `**${message.author}** تم كتمه بسبب إرسال روابط!\n\n` +
                `⏰ **المدة:** ${CONFIG.PROTECTION.LINK_MUTE_MINUTES} دقيقة`
            );
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => {}), 15000);
            await this.sendLog(message.guild, Embeds.logAction('كتم تلقائي (روابط)', this.client.user, message.author, 'إرسال روابط'));
            return true;
        } catch(e) { console.error('[MTX LINKS] خطأ:', e.message); return false; }
    }

    // NUKE HELPERS
    _getChannelTracker(userId) {
        if (!this.channelTracker.has(userId)) this.channelTracker.set(userId, { creates: [], deletes: [], updates: [] });
        return this.channelTracker.get(userId);
    }
    _getRoleTracker(userId) {
        if (!this.roleTracker.has(userId)) this.roleTracker.set(userId, { creates: [], deletes: [], updates: [] });
        return this.roleTracker.get(userId);
    }
    _cleanOldActions(tracker, now) {
        tracker.creates = tracker.creates.filter(t => now - t <= this.NUKE_WINDOW);
        tracker.deletes = tracker.deletes.filter(t => now - t <= this.NUKE_WINDOW);
        tracker.updates = tracker.updates.filter(t => now - t <= this.NUKE_WINDOW);
        return tracker.creates.length === 0 && tracker.deletes.length === 0 && tracker.updates.length === 0;
    }

    // CHANNEL NUKE
    async checkChannelCreate(channel, executor) {
        const guild = channel.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        const now = Date.now();
        this.globalChannelChanges.push({ timestamp: now, guildId: guild.id, type: 'create' });
        this.globalChannelChanges = this.globalChannelChanges.filter(c => now - c.timestamp <= this.NUKE_WINDOW && c.guildId === guild.id);

        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const tracker = this._getChannelTracker(executor.id);
        tracker.creates.push(now);
        if (this._cleanOldActions(tracker, now)) this.channelTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} أنشأ روم | إجمالي: ${tracker.creates.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.creates.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'إنشاء رومات بكثرة', tracker);
        return false;
    }

    async checkChannelDelete(channel, executor) {
        const guild = channel.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        const now = Date.now();
        this.globalChannelChanges.push({ timestamp: now, guildId: guild.id, type: 'delete' });
        this.globalChannelChanges = this.globalChannelChanges.filter(c => now - c.timestamp <= this.NUKE_WINDOW && c.guildId === guild.id);

        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const tracker = this._getChannelTracker(executor.id);
        tracker.deletes.push(now);
        if (this._cleanOldActions(tracker, now)) this.channelTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} حذف روم | إجمالي: ${tracker.deletes.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.deletes.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'حذف رومات بكثرة', tracker);
        return false;
    }

    async checkChannelUpdate(channel, executor) {
        const guild = channel.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const now = Date.now();
        const tracker = this._getChannelTracker(executor.id);
        tracker.updates.push(now);
        if (this._cleanOldActions(tracker, now)) this.channelTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} عدل روم | إجمالي: ${tracker.updates.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.updates.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'تعديل رومات بكثرة', tracker);
        return false;
    }

    // ROLE NUKE
    async checkRoleCreate(role, executor) {
        const guild = role.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const now = Date.now();
        const tracker = this._getRoleTracker(executor.id);
        tracker.creates.push(now);
        if (this._cleanOldActions(tracker, now)) this.roleTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} أنشأ رول | إجمالي: ${tracker.creates.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.creates.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'إنشاء رولات بكثرة', tracker);
        return false;
    }

    async checkRoleDelete(role, executor) {
        const guild = role.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const now = Date.now();
        const tracker = this._getRoleTracker(executor.id);
        tracker.deletes.push(now);
        if (this._cleanOldActions(tracker, now)) this.roleTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} حذف رول | إجمالي: ${tracker.deletes.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.deletes.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'حذف رولات بكثرة', tracker);
        return false;
    }

    async checkRoleUpdate(role, executor) {
        const guild = role.guild;
        if (!ProtectionDB.isEnabled(guild.id)) return false;
        if (!executor || executor.bot || executor.id === guild.ownerId || ProtectionDB.isProtected(guild.id, executor.id)) return false;

        const now = Date.now();
        const tracker = this._getRoleTracker(executor.id);
        tracker.updates.push(now);
        if (this._cleanOldActions(tracker, now)) this.roleTracker.delete(executor.id);

        console.log(`[MTX NUKE] ${executor.tag} عدل رول | إجمالي: ${tracker.updates.length}/${this.NUKE_THRESHOLD}`);
        if (tracker.updates.length >= this.NUKE_THRESHOLD) return await this._punishNuker(guild, executor, 'تعديل رولات بكثرة', tracker);
        return false;
    }

    // PUNISH
    async _punishNuker(guild, executor, reason, tracker) {
        console.log(`[MTX NUKE] 🚨 نيوك مكتشف! ${executor.tag} | ${reason}`);
        const botMember = guild.members.me;
        if (!botMember) return false;
        const canBan = botMember.permissions.has(PermissionsBitField.Flags.BanMembers);

        if (executor && canBan) {
            await guild.members.ban(executor.id, { reason: `🛡️ MTX NUKE: ${reason}`, deleteMessageDays: 1 }).catch(e => 
                console.error(`[MTX NUKE] ما قدرت أبنيد: ${e.message}`)
            );
        }

        const embed = Embeds.protection('🚨 NUKE ATTACK تم إكتشافه!',
            `**تم اكتشاف محاولة نيوك**\n\n` +
            `👤 **المهاجم:** ${executor} (\`${executor.id}\`)\n` +
            `📌 **السبب:** ${reason}\n` +
            `📊 **الإحصائيات:**\n` +
            `├ إنشاء: ${tracker.creates.length}\n` +
            `├ حذف: ${tracker.deletes.length}\n` +
            `└ تعديل: ${tracker.updates.length}\n` +
            `⏰ **الوقت:** ${this.NUKE_WINDOW / 1000} ثواني\n` +
            `🚫 **الإجراء:** ${executor ? 'تم التبنيد' : 'إنذار فقط'}`
        );

        const logChId = ProtectionDB.getLogChannel(guild.id);
        const logCh = logChId ? guild.channels.cache.get(logChId) : null;
        if (logCh) try { await logCh.send({ embeds: [embed] }); } catch(e) {}

        const systemCh = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(botMember)?.has(PermissionsBitField.Flags.SendMessages));
        if (systemCh) try { await systemCh.send({ embeds: [embed] }); } catch(e) {}

        try { const owner = await guild.fetchOwner(); await owner.send({ embeds: [embed] }).catch(() => {}); } catch(e) {}

        if (executor) {
            this.channelTracker.delete(executor.id);
            this.roleTracker.delete(executor.id);
        }
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🤖 MAIN BOT CLASS
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

        // NUKE PROTECTION EVENTS
        this.on('channelCreate', (ch) => this.onChannelCreate(ch));
        this.on('channelDelete', (ch) => this.onChannelDelete(ch));
        this.on('channelUpdate', (oldCh, newCh) => this.onChannelUpdate(oldCh, newCh));
        this.on('roleCreate', (role) => this.onRoleCreate(role));
        this.on('roleDelete', (role) => this.onRoleDelete(role));
        this.on('roleUpdate', (oldRole, newRole) => this.onRoleUpdate(oldRole, newRole));
    }

    async onReady() {
        console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 MTX BOT v5.1 - ONLINE                   ║
    ║        الحالة: 🟢 أخضر (Online)                  ║
    ║        المخزن: 📁 محلي (JSON)                    ║
    ║        السيرفرات: ${this.guilds.cache.size.toString().padEnd(27)}║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
        `);
        await this.user.setPresence({
            activities: [{ name: '🛡️ الحماية | العاب للإيفنتات', type: 3 }],
            status: 'online'
        });
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const cmds = [
            new SlashCommandBuilder()
                .setName('log')
                .setDescription('تحديد روم اللوق')
                .addChannelOption(o => 
                    o.setName('channel').setDescription('روم اللوق').setRequired(true)
                     .addChannelTypes(ChannelType.GuildText)
                ),
            new SlashCommandBuilder().setName('status').setDescription('حالة البوت')
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
            return;
        }
        const guild = member.guild;
        const now = Date.now();
        if (!this.protection.recentJoins.has(guild.id)) this.protection.recentJoins.set(guild.id, []);
        const joins = this.protection.recentJoins.get(guild.id);
        joins.push(now);
        const recentJoins = joins.filter(t => now - t <= 10000);
        this.protection.recentJoins.set(guild.id, recentJoins);
        if (recentJoins.length >= 5) console.log(`[MTX RAID] 🚨 Raid محتمل! ${recentJoins.length} دخول في 10 ثواني`);
    }

    // CHANNEL EVENTS
    async onChannelCreate(channel) {
        if (!channel.guild) return;
        let executor = null;
        try {
            const logs = await channel.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelCreate });
            const entry = logs.entries.find(e => e.target?.id === channel.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkChannelCreate(channel, executor);
    }

    async onChannelDelete(channel) {
        if (!channel.guild) return;
        let executor = null;
        try {
            const logs = await channel.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelDelete });
            const entry = logs.entries.find(e => e.target?.id === channel.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkChannelDelete(channel, executor);
    }

    async onChannelUpdate(oldChannel, newChannel) {
        if (!oldChannel.guild) return;
        let executor = null;
        try {
            const logs = await oldChannel.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelUpdate });
            const entry = logs.entries.find(e => e.target?.id === oldChannel.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkChannelUpdate(newChannel, executor);
    }

    // ROLE EVENTS
    async onRoleCreate(role) {
        if (!role.guild) return;
        let executor = null;
        try {
            const logs = await role.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleCreate });
            const entry = logs.entries.find(e => e.target?.id === role.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkRoleCreate(role, executor);
    }

    async onRoleDelete(role) {
        if (!role.guild) return;
        let executor = null;
        try {
            const logs = await role.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleDelete });
            const entry = logs.entries.find(e => e.target?.id === role.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkRoleDelete(role, executor);
    }

    async onRoleUpdate(oldRole, newRole) {
        if (!oldRole.guild) return;
        let executor = null;
        try {
            const logs = await oldRole.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleUpdate });
            const entry = logs.entries.find(e => e.target?.id === oldRole.id);
            if (entry && (Date.now() - entry.createdTimestamp <= 10000)) executor = entry.executor;
        } catch(e) {}
        await this.protection.checkRoleUpdate(newRole, executor);
    }

    // COMMANDS
    async handleCommand(message) {
        const content = message.content.trim();
        const parts = content.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        console.log(`[MTX CMD] "${cmd}" from ${message.author.tag} in #${message.channel.name}`);

        const adminCmds = [CONFIG.CMDS.BAN, CONFIG.CMDS.UNBAN, CONFIG.CMDS.KICK, CONFIG.CMDS.MUTE, CONFIG.CMDS.UNMUTE,
            CONFIG.CMDS.WARN, CONFIG.CMDS.CLEARWARN, CONFIG.CMDS.LOCK, CONFIG.CMDS.UNLOCK,
            CONFIG.CMDS.PURGE, CONFIG.CMDS.SLOWMODE, CONFIG.CMDS.PROTECTION];
        const allCmds = [...adminCmds, CONFIG.CMDS.WARNINGS, CONFIG.CMDS.GAMES];
        if (!allCmds.includes(cmd)) return;

        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                         message.author.id === message.guild.ownerId;
        if (adminCmds.includes(cmd) && !isAdmin) {
            return message.reply({ embeds: [Embeds.error('صلاحيات', '⛔ بس الأدمن يقدر يستخدم هذا الأمر!')] });
        }

        switch(cmd) {
            case CONFIG.CMDS.BAN: await this.cmdBan(message, args); break;
            case CONFIG.CMDS.UNBAN: await this.cmdUnban(message, args); break;
            case CONFIG.CMDS.KICK: await this.cmdKick(message, args); break;
            case CONFIG.CMDS.MUTE: await this.cmdMute(message, args); break;
            case CONFIG.CMDS.UNMUTE: await this.cmdUnmute(message, args); break;
            case CONFIG.CMDS.WARN: await this.cmdWarn(message, args); break;
            case CONFIG.CMDS.WARNINGS: await this.cmdWarnings(message, args); break;
            case CONFIG.CMDS.CLEARWARN: await this.cmdClearWarn(message, args); break;
            case CONFIG.CMDS.LOCK: await this.cmdLock(message, args); break;
            case CONFIG.CMDS.UNLOCK: await this.cmdUnlock(message, args); break;
            case CONFIG.CMDS.PURGE: await this.cmdPurge(message, args); break;
            case CONFIG.CMDS.SLOWMODE: await this.cmdSlowmode(message, args); break;
            case CONFIG.CMDS.PROTECTION: await this.cmdProtection(message, args); break;
            case CONFIG.CMDS.GAMES: await this.cmdGames(message); break;
        }
    }

    async handleSlash(i) {
        const isAdmin = i.member.permissions.has(PermissionsBitField.Flags.Administrator) || i.user.id === i.guild.ownerId;
        if (i.commandName === 'log') {
            if (!isAdmin) return i.reply({ embeds: [Embeds.error('صلاحيات', 'بس الأدمن!')], ephemeral: true });
            const ch = i.options.getChannel('channel');
            ProtectionDB.setLogChannel(i.guildId, ch.id);
            await i.reply({ embeds: [Embeds.success('إعدادات اللوق', `📋 **${ch}** تم تحديده كروم للوق!`)] });
        }
        if (i.commandName === 'status') {
            const uptime = new Date() - this.startTime;
            const h = Math.floor(uptime / 3600000), m = Math.floor((uptime % 3600000) / 60000);
            const embed = new EmbedBuilder().setTitle('🤖 حالة MTX Bot')
                .setDescription(`**الحالة:** 🟢 Online\n**الوقت:** ${h}س ${m}د`).setColor(CONFIG.COLORS.SUCCESS)
                .addFields(
                    { name: '🛡️ الحماية', value: ProtectionDB.isEnabled(i.guildId) ? '✅ مفعلة' : '❌ معطلة', inline: true },
                    { name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true },
                    { name: '📋 روم اللوق', value: ProtectionDB.getLogChannel(i.guildId) ? `<#${ProtectionDB.getLogChannel(i.guildId)}>` : 'غير محدد', inline: true }
                ).setTimestamp();
            await i.reply({ embeds: [embed] });
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

    // ADMIN COMMANDS
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
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnban(m, args) {
        const uid = args[0];
        if (!uid || /^\d+$/.test(uid)) return m.reply({ embeds: [Embeds.error('خطأ', 'حط ايدي صحيح!')] });
        try {
            const user = await this.users.fetch(uid);
            await m.guild.members.unban(user, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الباند', `**${user.tag}** تم فك الباند عنه!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فك باند', m.author, user, 'فك الباند'));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdKick(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        if (member.id === m.guild.ownerId) return m.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تطرد الأونر!')] });
        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';
        try {
            await member.kick(`بواسطة ${m.author.tag}: ${reason}`);
            m.reply({ embeds: [Embeds.success('تم الطرد', `**${member}** تم طرده!\n📌 **السبب:** ${reason}`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('طرد', m.author, member.user, reason));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

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
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnmute(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        try {
            await member.timeout(null, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الكتم', `**${member}** يقدر يتكلم الحين! 🎉`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فك كتم', m.author, member.user, 'فك الكتم'));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';
        const result = WarningDB.addWarning(member.id, m.guild.id, reason, m.author);
        if (result.total >= CONFIG.PROTECTION.WARN_LIMIT) {
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
                WarningDB.clearWarnings(member.id, m.guild.id);
            } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
            return;
        }
        const embed = Embeds.warn('تم التحذير',
            `**${member}**\n📌 **السبب:** ${reason}\n⚠️ **التحذيرات:** ${result.total}/${CONFIG.PROTECTION.WARN_LIMIT}\n🔧 **بواسطة:** ${m.author}`
        );
        await m.reply({ embeds: [embed] });
        await this.protection.sendLog(m.guild, Embeds.logAction('تحذير', m.author, member.user, reason, { 'العدد': `${result.total}/${CONFIG.PROTECTION.WARN_LIMIT}` }));
    }

    async cmdWarnings(m, args) {
        const member = m.mentions.members.first() || m.member;
        const warnings = WarningDB.getWarnings(member.id, m.guild.id);
        if (warnings.length === 0) return m.reply({ embeds: [Embeds.info('نظيف ✅', `**${member}** ما عنده ولا تحذير!`)] });
        const warnList = warnings.map((w, i) => 
            `\`${i + 1}.\` **${w.reason}**\n├ 👤 <@${w.moderatorId}>\n└ 🕐 ${new Date(w.timestamp).toLocaleString('ar-SA')}`
        ).join('\n\n');
        const embed = new EmbedBuilder().setTitle(`⚠️ تحذيرات ${member.user.tag}`).setDescription(warnList)
            .setColor(CONFIG.COLORS.WARN).setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `${warnings.length}/${CONFIG.PROTECTION.WARN_LIMIT} | بعد ${CONFIG.PROTECTION.WARN_LIMIT} = ميوت ${CONFIG.PROTECTION.WARN_MUTE_DAYS} يوم` }).setTimestamp();
        await m.reply({ embeds: [embed] });
    }

    async cmdClearWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        const index = parseInt(args.find(a => /^\d+$/.test(a)));
        const warnings = WarningDB.getWarnings(member.id, m.guild.id);
        if (warnings.length === 0) return m.reply({ embeds: [Embeds.error('خطأ', 'ما عنده تحذيرات!')] });
        if (index && index > 0) {
            if (index > warnings.length) return m.reply({ embeds: [Embeds.error('خطأ', `رقم غير موجود! عنده بس ${warnings.length}`)] });
            WarningDB.removeWarning(member.id, m.guild.id, index - 1);
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح التحذير رقم **${index}**!`)] });
        } else {
            WarningDB.clearWarnings(member.id, m.guild.id);
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح جميع تحذيرات **${member}**!`)] });
        }
        await this.protection.sendLog(m.guild, Embeds.logAction('مسح تحذيرات', m.author, member.user, 'مسح'));
    }

    async cmdLock(m, args) {
        let ch = m.mentions.channels.first();
        if (!ch && args[0]) { const idMatch = args[0].match(/\d+/); if (idMatch) ch = m.guild.channels.cache.get(idMatch[0]); }
        ch = ch || m.channel;
        const botMember = m.guild.members.me;
        const botPerms = ch.permissionsFor(botMember);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) return m.reply({ embeds: [Embeds.error('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false });
            m.reply({ embeds: [Embeds.success('تم القفل', `🔒 **${ch}** تم قفله!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('قفل روم', m.author, m.author, 'قفل', { 'الروم': ch.toString() }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnlock(m, args) {
        let ch = m.mentions.channels.first();
        if (!ch && args[0]) { const idMatch = args[0].match(/\d+/); if (idMatch) ch = m.guild.channels.cache.get(idMatch[0]); }
        ch = ch || m.channel;
        const botMember = m.guild.members.me;
        const botPerms = ch.permissionsFor(botMember);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) return m.reply({ embeds: [Embeds.error('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: true });
            m.reply({ embeds: [Embeds.success('تم الفتح', `🔓 **${ch}** تم فتحه!`)] });
            await this.protection.sendLog(m.guild, Embeds.logAction('فتح روم', m.author, m.author, 'فتح', { 'الروم': ch.toString() }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdPurge(m, args) {
        const amount = parseInt(args[0]) || 10;
        if (amount > 100) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأقصى 100!')] });
        if (amount < 1) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأدنى 1!')] });
        try {
            const deleted = await m.channel.bulkDelete(amount + 1, true);
            const msg = await m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح **${deleted.size - 1}** رسالة!`)] });
            setTimeout(() => msg.delete().catch(() => {}), 3000);
            await this.protection.sendLog(m.guild, Embeds.logAction('مسح رسائل', m.author, m.author, 'مسح', { 'العدد': deleted.size - 1 }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdSlowmode(m, args) {
        const sec = parseInt(args[0]) || 0;
        if (sec < 0) return m.reply({ embeds: [Embeds.error('خطأ', 'لازم 0 أو أكثر!')] });
        try {
            await m.channel.setRateLimitPerUser(sec);
            const embed = sec === 0 
                ? Embeds.success('تم إيقاف التبطيء', `**${m.channel}** التبطيء متوقف! ✅`)
                : Embeds.success('تم التبطيء', `**${m.channel}** تم تبطيئه لـ **${sec}** ثانية! 🐢`);
            m.reply({ embeds: [embed] });
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdProtection(m, args) {
        const action = args[0];
        const member = m.mentions.members.first();
        const gid = m.guild.id;
        if (action === 'تفعيل' || action === 'on') {
            ProtectionDB.setEnabled(gid, true);
            return m.reply({ embeds: [Embeds.success('الحماية', '✅ تم التفعيل!')] });
        }
        if (action === 'تعطيل' || action === 'off') {
            ProtectionDB.setEnabled(gid, false);
            return m.reply({ embeds: [Embeds.success('الحماية', '❌ تم التعطيل!')] });
        }
        if ((action === 'اضافة' || action === 'add') && member) {
            ProtectionDB.addProtected(gid, member.id);
            return m.reply({ embeds: [Embeds.success('الحماية', `🛡️ **${member}** تمت الإضافة!`)] });
        }
        if ((action === 'ازالة' || action === 'remove') && member) {
            ProtectionDB.removeProtected(gid, member.id);
            return m.reply({ embeds: [Embeds.success('الحماية', `🛡️ **${member}** تمت الإزالة!`)] });
        }
        m.reply({ embeds: [Embeds.info('الاستخدام', 
            '`حماية تفعيل` - تفعيل\n' +
            '`حماية تعطيل` - تعطيل\n' +
            '`حماية اضافة @عضو` - إضافة\n' +
            '`حماية ازالة @عضو` - إزالة'
        )] });
    }

    async cmdGames(m) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_roulette').setLabel('🎲 روليت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_mafia').setLabel('🕵️ مافيا').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('game_castle').setLabel('🏰 كاستل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('game_tictactoe').setLabel('⚔️ تكت تو').setStyle(ButtonStyle.Secondary)
        );
        const embed = new EmbedBuilder().setTitle('🎮 قائمة الألعاب الجماعية').setDescription('اختر لعبة من القائمة!')
            .setColor(CONFIG.COLORS.SUCCESS).setFooter({ text: `طلبت بواسطة ${m.author.tag}`, iconURL: m.author.displayAvatarURL() }).setTimestamp();
        await m.reply({ embeds: [embed], components: [row] });
    }

    parseTime(str) {
        if (!str) return null;
        const match = str.match(/^(\d+)([dhms])$/);
        if (!match) return null;
        const value = parseInt(match[1]);
        switch(match[2]) {
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
        <head><title>MTX Bot</title>
        <style>
            body { background: #0a0a0a; color: #2ecc71; font-family: 'Segoe UI', sans-serif; 
                   display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { font-size: 3em; margin-bottom: 10px; }
            .status { background: #1a1a1a; padding: 20px 40px; border-radius: 15px; border: 2px solid #2ecc71; }
            .online { color: #2ecc71; font-size: 1.5em; }
        </style></head>
        <body>
            <div class="container">
                <h1>🤖 MTX Bot</h1>
                <div class="status">
                    <p class="online">🟢 Online</p>
                    <p>البوت شغال بنجاح!</p>
                </div>
            </div>
        </body></html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 [MTX] Keep-Alive Server شغال على البورت ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════
// 🏃 START
// ═══════════════════════════════════════════════════════════════════════

const bot = new MTXBot();

async function start() {
    await bot.login(process.env.TOKEN);
}

start().catch(err => {
    console.error('❌ [MTX] خطأ فادح:', err);
    process.exit(1);
});
