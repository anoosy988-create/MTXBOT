// MTX Bot v7.0 - Discord Moderation & Ticket System
// Built with MongoDB Atlas for persistent storage on Render
// Clean, maintainable code by a human developer

const {
    Client, GatewayIntentBits, Partials, PermissionsBitField,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    SlashCommandBuilder, ChannelType
} = require('discord.js');
const http = require('http');

const { WarningDB, ConfigDB, TicketDB } = require('./database.js');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COMMANDS = {
    BAN: 'باند', BAN2: 'تف', UNBAN: 'فك', KICK: 'برا',
    MUTE: 'تايم', UNMUTE: 'تكلم', WARN: 'تح',
    WARNINGS: 'تحذيرات', CLEARWARN: 'شيل',
    LOCK: 'ق', UNLOCK: 'ف', PURGE: 'م', SLOWMODE: 'سلو',
    GAMES: 'العاب', ROLE: 'ر'
};

const COLORS = {
    SUCCESS: 0x2ecc71,
    ERROR: 0xe74c3c,
    WARN: 0xf39c12,
    INFO: 0x3498db,
    LOG: 0x95a5a6
};

// ─────────────────────────────────────────────────────────────
// Embed Helpers - Clean and reusable
// ─────────────────────────────────────────────────────────────

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(COLORS.SUCCESS)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor(COLORS.ERROR)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function warnEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setColor(COLORS.WARN)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor(COLORS.INFO)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function logActionEmbed(action, moderator, target, reason = 'غير محدد', extra = {}) {
    const embed = new EmbedBuilder()
        .setTitle(`📝 ${action}`)
        .setColor(COLORS.INFO)
        .setTimestamp()
        .addFields(
            { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
            { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
            { name: '📌 السبب', value: reason, inline: false }
        )
        .setFooter({ text: 'MTX Bot' });

    for (const [key, value] of Object.entries(extra)) {
        embed.addFields({ name: key, value: String(value), inline: true });
    }
    return embed;
}

function logEventEmbed(title, description, color = COLORS.LOG, fields = []) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot - سجل الأحداث' });
    fields.forEach(f => embed.addFields(f));
    return embed;
}

// ─────────────────────────────────────────────────────────────
// Ticket System - Manages ticket state with MongoDB persistence
// ─────────────────────────────────────────────────────────────

class TicketSystem {
    constructor() {
        this.tickets = new Map();      // channelId -> ticket data
        this.configs = new Map();      // guildId -> config (cached)
        this.counters = {};            // guildId -> last ticket number
    }

    async load() {
        // Load all active tickets from MongoDB
        this.tickets = await TicketDB.getAll();

        // Load ticket counters per guild
        this.counters = await TicketDB.getCounters();

        console.log(`[MTX] Loaded ${this.tickets.size} tickets from database`);
    }

    // Get config for a guild (with caching)
    async getConfig(guildId) {
        if (!this.configs.has(guildId)) {
            const config = await ConfigDB.getTicketConfig(guildId);
            this.configs.set(guildId, config);
        }
        return this.configs.get(guildId);
    }

    // Refresh config cache (call after config changes)
    refreshConfig(guildId, config) {
        this.configs.set(guildId, config);
    }

    getOptions(guildId) {
        return this.configs.get(guildId)?.ticketOptions || [];
    }

    generateValue(label) {
        return label.trim().replace(/\s+/g, '_');
    }
}

// ─────────────────────────────────────────────────────────────
// Main Bot Class
// ─────────────────────────────────────────────────────────────

class MTXBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildPresences
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
        });

        this.ticketSystem = new TicketSystem();
        this.startTime = new Date();
        this.setupEvents();
    }

    setupEvents() {
        this.once('ready', () => this.onReady());
        this.on('messageCreate', m => this.onMessage(m));
        this.on('interactionCreate', i => this.onInteraction(i));
    }

    async onReady() {
        console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 MTX BOT v7.0 - ONLINE                   ║
    ║        MongoDB Atlas Persistent Storage           ║
    ║        Servers: ${this.guilds.cache.size.toString().padEnd(36)}║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
        `);

        await this.user.setPresence({
            activities: [{ name: '🎫 Tickets | .العاب', type: 3 }],
            status: 'online'
        });

        await this.ticketSystem.load();
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('setup-ticket')
                .setDescription('إعداد نظام التكتات')
                .addChannelOption(o => o
                    .setName('logs')
                    .setDescription('قناة اللوقات')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText))
                .addChannelOption(o => o
                    .setName('category')
                    .setDescription('كاتقوري التكتات')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildCategory))
                .addRoleOption(o => o
                    .setName('role')
                    .setDescription('رتبة المشرفين')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('ticket-panel')
                .setDescription('إنشاء لوحة التكتات'),

            new SlashCommandBuilder()
                .setName('add-option')
                .setDescription('إضافة خيار للتكتات')
                .addStringOption(o => o
                    .setName('label')
                    .setDescription('اسم الخيار')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('remove-option')
                .setDescription('حذف خيار')
                .addStringOption(o => o
                    .setName('label')
                    .setDescription('اسم الخيار')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('list-options')
                .setDescription('عرض الخيارات الحالية'),

            new SlashCommandBuilder()
                .setName('log')
                .setDescription('تحديد روم اللوق')
                .addChannelOption(o => o
                    .setName('channel')
                    .setDescription('روم اللوق')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)),

            new SlashCommandBuilder()
                .setName('status')
                .setDescription('حالة البوت')
        ];

        try {
            await this.application.commands.set(commands);
            console.log('[MTX] Slash commands registered');
        } catch (err) {
            console.error('[MTX] Failed to register slash commands:', err);
        }
    }

    // ─────────────────────────────────────────────────────────
    // Message Handler
    // ─────────────────────────────────────────────────────────

    async onMessage(message) {
        if (message.author.bot || !message.guild) return;
        await this.handleCommand(message);
    }

    async handleCommand(message) {
        const parts = message.content.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        const adminCommands = [
            COMMANDS.BAN, COMMANDS.BAN2, COMMANDS.UNBAN, COMMANDS.KICK,
            COMMANDS.MUTE, COMMANDS.UNMUTE, COMMANDS.WARN, COMMANDS.CLEARWARN,
            COMMANDS.LOCK, COMMANDS.UNLOCK, COMMANDS.PURGE, COMMANDS.SLOWMODE,
            COMMANDS.ROLE
        ];
        const allCommands = [...adminCommands, COMMANDS.WARNINGS, COMMANDS.GAMES];

        if (!allCommands.includes(cmd)) return;

        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator)
            || message.author.id === message.guild.ownerId;

        if (adminCommands.includes(cmd) && !isAdmin) {
            return message.reply({ embeds: [errorEmbed('صلاحيات', '⛔ بس الأدمن يقدر يستخدم هذا الأمر!')] });
        }

        switch (cmd) {
            case COMMANDS.BAN:
            case COMMANDS.BAN2: await this.cmdBan(message, args); break;
            case COMMANDS.UNBAN: await this.cmdUnban(message, args); break;
            case COMMANDS.KICK: await this.cmdKick(message, args); break;
            case COMMANDS.MUTE: await this.cmdMute(message, args); break;
            case COMMANDS.UNMUTE: await this.cmdUnmute(message, args); break;
            case COMMANDS.WARN: await this.cmdWarn(message, args); break;
            case COMMANDS.WARNINGS: await this.cmdWarnings(message, args); break;
            case COMMANDS.CLEARWARN: await this.cmdClearWarn(message, args); break;
            case COMMANDS.LOCK: await this.cmdLock(message, args); break;
            case COMMANDS.UNLOCK: await this.cmdUnlock(message, args); break;
            case COMMANDS.PURGE: await this.cmdPurge(message, args); break;
            case COMMANDS.SLOWMODE: await this.cmdSlowmode(message, args); break;
            case COMMANDS.GAMES: await this.cmdGames(message); break;
            case COMMANDS.ROLE: await this.cmdRole(message, args); break;
        }
    }

    // ─────────────────────────────────────────────────────────
    // Role Command
    // ─────────────────────────────────────────────────────────

    async cmdRole(message, args) {
        const member = message.mentions.members.first();
        if (!member) {
            return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو! مثال: ر @العضو اسم_الرتبة')] });
        }

        const roleArg = args.filter(a => !a.includes(member.id) && !a.startsWith('<@')).join(' ').trim();
        if (!roleArg) {
            return message.reply({ embeds: [errorEmbed('خطأ', 'اكتب اسم الرتبة أو ID! مثال: ر @العضو اونر')] });
        }

        // Find role by exact name, ID, or partial match
        let role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleArg.toLowerCase());
        if (!role && /^\d+$/.test(roleArg)) role = message.guild.roles.cache.get(roleArg);
        if (!role) role = message.guild.roles.cache.find(r => r.name.toLowerCase().includes(roleArg.toLowerCase()));

        if (!role) {
            return message.reply({ embeds: [errorEmbed('خطأ', `ما وجدت رتبة باسم "${roleArg}"!`)] });
        }

        // Check hierarchy
        if (message.author.id !== message.guild.ownerId) {
            if (role.position >= message.member.roles.highest.position) {
                return message.reply({ embeds: [errorEmbed('صلاحيات', '⛔ الرتبة أعلى من رتبتك!')] });
            }
        }

        const botMember = message.guild.members.me;
        if (botMember.roles.highest.position <= role.position) {
            return message.reply({ embeds: [errorEmbed('صلاحيات', '⛔ البوت ما يقدر يعطي هذه الرتبة!')] });
        }

        const hasRole = member.roles.cache.has(role.id);

        try {
            if (hasRole) {
                await member.roles.remove(role, `بواسطة ${message.author.tag}`);
                await message.reply({
                    embeds: [successEmbed('تم إزالة الرتبة', `**العضو:** ${member}\n⭐ **الرتبة:** ${role.name}\n🔧 **بواسطة:** ${message.author}`)]
                });
                await this.sendLog(message.guild, logEventEmbed('🔴 إزالة رتبة', `${message.author} أزال رتبة من ${member}!`, 0xe74c3c, [
                    { name: '👤 العضو', value: member.user.tag, inline: true },
                    { name: '⭐ الرتبة', value: role.name, inline: true },
                    { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                ]));
            } else {
                await member.roles.add(role, `بواسطة ${message.author.tag}`);
                await message.reply({
                    embeds: [successEmbed('تم إعطاء الرتبة', `**العضو:** ${member}\n⭐ **الرتبة:** ${role.name}\n🔧 **بواسطة:** ${message.author}`)]
                });
                await this.sendLog(message.guild, logEventEmbed('🟢 إعطاء رتبة', `${message.author} أعطى رتبة لـ ${member}!`, 0x2ecc71, [
                    { name: '👤 العضو', value: member.user.tag, inline: true },
                    { name: '⭐ الرتبة', value: role.name, inline: true },
                    { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                ]));
            }

            // DM notification
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle(hasRole ? '🔴 تم إزالة رتبة' : '🟢 تم إعطاؤك رتبة')
                    .setDescription(`لقد تم ${hasRole ? 'إزالة رتبة منك' : 'إعطاؤك رتبة'} في سيرفر **${message.guild.name}**`)
                    .addFields(
                        { name: '⭐ الرتبة', value: role.name, inline: true },
                        { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                    )
                    .setColor(hasRole ? 0xe74c3c : 0x2ecc71)
                    .setTimestamp()
                    .setFooter({ text: 'MTX Bot' });
                await member.send({ embeds: [dmEmbed] });
            } catch { /* DM failed, ignore */ }

        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    // ─────────────────────────────────────────────────────────
    // Interaction Handler (Slash Commands + Buttons + Modals)
    // ─────────────────────────────────────────────────────────

    async onInteraction(interaction) {
        const guildId = interaction.guildId;
        const ts = this.ticketSystem;

        // Slash Commands
        if (interaction.isCommand()) {
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: '❌ تحتاج صلاحية Administrator', ephemeral: true });
            }

            switch (interaction.commandName) {
                case 'setup-ticket':
                    await this.handleSetupTicket(interaction, guildId, ts);
                    break;
                case 'ticket-panel':
                    await this.handleTicketPanel(interaction, guildId, ts);
                    break;
                case 'add-option':
                    await this.handleAddOption(interaction, guildId, ts);
                    break;
                case 'remove-option':
                    await this.handleRemoveOption(interaction, guildId, ts);
                    break;
                case 'list-options':
                    await this.handleListOptions(interaction, guildId, ts);
                    break;
                case 'log':
                    await this.handleLogCommand(interaction, guildId);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
            }
            return;
        }

        // Ticket Select Menu
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
            await this.handleTicketSelect(interaction, guildId, ts);
            return;
        }

        // Ticket Buttons
        if (interaction.isButton()) {
            await this.handleTicketButton(interaction, ts);
            return;
        }

        // Add User Modal
        if (interaction.isModalSubmit() && interaction.customId === 'adduser_modal') {
            await this.handleAddUserModal(interaction, ts);
        }
    }

    // ─────────────────────────────────────────────────────────
    // Slash Command Handlers
    // ─────────────────────────────────────────────────────────

    async handleSetupTicket(interaction, guildId, ts) {
        const logs = interaction.options.getChannel('logs');
        const category = interaction.options.getChannel('category');
        const role = interaction.options.getRole('role');

        await ConfigDB.setTicketConfig(guildId, {
            logsId: logs.id,
            categoryId: category.id,
            roleId: role.id
        });

        ts.refreshConfig(guildId, {
            logsId: logs.id,
            categoryId: category.id,
            roleId: role.id,
            ticketOptions: ts.getOptions(guildId)
        });

        await this.sendLog(interaction.guild, logEventEmbed('⚙️ إعداد نظام التكتات', `${interaction.user} قام بإعداد نظام التكتات!`, 0x3498db, [
            { name: '📋 لوقات', value: `${logs}`, inline: true },
            { name: '📁 كاتقوري', value: `${category}`, inline: true },
            { name: '👮 رتبة', value: role.name, inline: true }
        ]));

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ تم إعداد نظام التكتات')
                .addFields(
                    { name: '📋 لوقات', value: `${logs}`, inline: true },
                    { name: '📁 كاتقوري', value: `${category}`, inline: true },
                    { name: '👮 رتبة', value: role.name, inline: true }
                )
                .setColor(0x00FF00)],
            ephemeral: true
        });
    }

    async handleTicketPanel(interaction, guildId, ts) {
        const config = await ts.getConfig(guildId);
        if (!config?.roleId) {
            return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
        }

        const options = ts.getOptions(guildId);
        if (options.length === 0) {
            return interaction.reply({ content: '❌ ما فيه خيارات! ضيف خيارات بـ /add-option', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر نوع التكت...')
                .addOptions(options)
        );

        await interaction.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎫 نظام التكتات')
                .setDescription('اختر من القائمة لفتح تكت')
                .setColor(0x00FF00)],
            components: [row]
        });

        await this.sendLog(interaction.guild, logEventEmbed('🎫 إنشاء لوحة تكتات', `${interaction.user} قام بإنشاء لوحة التكتات في ${interaction.channel}!`, 0x2ecc71, [
            { name: '📁 الروم', value: `${interaction.channel}`, inline: true }
        ]));

        return interaction.reply({ content: '✅ تم إنشاء اللوحة', ephemeral: true });
    }

    async handleAddOption(interaction, guildId, ts) {
        const label = interaction.options.getString('label');
        const value = ts.generateValue(label);

        const config = await ConfigDB.get(guildId);
        const currentOptions = config?.ticketOptions || [];

        if (currentOptions.length >= 25) {
            return interaction.reply({ content: '❌ الحد الأقصى 25 خيار', ephemeral: true });
        }
        if (currentOptions.find(o => o.value === value)) {
            return interaction.reply({ content: '❌ الخيار موجود مسبقاً', ephemeral: true });
        }

        await ConfigDB.addTicketOption(guildId, label, value);

        // Update cache
        if (!ts.configs.has(guildId)) ts.configs.set(guildId, {});
        const cached = ts.configs.get(guildId);
        if (!cached.ticketOptions) cached.ticketOptions = [];
        cached.ticketOptions.push({ label, value });

        await this.sendLog(interaction.guild, logEventEmbed('➕ إضافة خيار تكت', `${interaction.user} أضاف خيار تكت جديد!`, 0x2ecc71, [
            { name: '📝 الخيار', value: label, inline: true }
        ]));

        return interaction.reply({ content: `✅ تم إضافة **${label}**`, ephemeral: true });
    }

    async handleRemoveOption(interaction, guildId, ts) {
        const label = interaction.options.getString('label');
        const value = ts.generateValue(label);

        const config = await ConfigDB.get(guildId);
        if (!config?.ticketOptions?.length) {
            return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
        }

        const optionToRemove = config.ticketOptions.find(
            o => o.label === label || o.value === value || o.value === label
        );

        if (!optionToRemove) {
            return interaction.reply({ content: `❌ الخيار "${label}" غير موجود`, ephemeral: true });
        }

        await ConfigDB.removeTicketOption(guildId, optionToRemove.value);

        // Update cache
        const cached = ts.configs.get(guildId);
        if (cached?.ticketOptions) {
            cached.ticketOptions = cached.ticketOptions.filter(o => o.value !== optionToRemove.value);
        }

        await this.sendLog(interaction.guild, logEventEmbed('➖ حذف خيار تكت', `${interaction.user} حذف خيار تكت!`, 0xe74c3c, [
            { name: '📝 الخيار', value: optionToRemove.label, inline: true }
        ]));

        return interaction.reply({ content: `✅ تم حذف **${optionToRemove.label}**`, ephemeral: true });
    }

    async handleListOptions(interaction, guildId, ts) {
        const config = await ConfigDB.get(guildId);
        const opts = config?.ticketOptions || [];

        if (opts.length === 0) {
            return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
        }

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📋 الخيارات الحالية')
                .setDescription(opts.map((o, i) => `${i + 1}. **${o.label}**`).join('\n'))
                .setFooter({ text: `${opts.length}/25` })
                .setColor(0x0099FF)],
            ephemeral: true
        });
    }

    async handleLogCommand(interaction, guildId) {
        const channel = interaction.options.getChannel('channel');
        await ConfigDB.setLogChannel(guildId, channel.id);

        await interaction.reply({
            embeds: [successEmbed('إعدادات اللوق', `📋 **${channel}** تم تحديده كروم للوق!`)]
        });

        await this.sendLog(interaction.guild, logEventEmbed('📋 تحديد روم اللوق', `${interaction.user} حدد روم اللوق!`, 0x3498db, [
            { name: '📁 الروم', value: `${channel}`, inline: true }
        ]));
    }

    async handleStatus(interaction) {
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / 3600000);
        const mins = Math.floor((uptime % 3600000) / 60000);

        const embed = new EmbedBuilder()
            .setTitle('🤖 حالة MTX Bot')
            .setDescription(`**الحالة:** 🟢 Online\n**الوقت:** ${hours}س ${mins}د`)
            .setColor(COLORS.SUCCESS)
            .addFields({ name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ─────────────────────────────────────────────────────────
    // Ticket Select Menu Handler
    // ─────────────────────────────────────────────────────────

    async handleTicketSelect(interaction, guildId, ts) {
        const config = await ts.getConfig(guildId);
        if (!config?.roleId) {
            return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
        }

        // Check if user already has an open ticket
        const userTickets = [...ts.tickets.values()].filter(
            tk => tk.g === guildId && tk.owner === interaction.user.id
        );

        const openTickets = userTickets.filter(tk => {
            const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
            return interaction.guild.channels.cache.has(chId);
        });

        if (openTickets.length > 0) {
            const ticketChannels = openTickets.map(tk => {
                const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
                return `**#${tk.num}** (<#${chId}>)`;
            }).join('\n');

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ عندك تكت مفتوح بالفعل')
                    .setDescription(`يجب إغلاق التكت الأول قبل فتح واحد جديد:\n${ticketChannels}`)
                    .setColor(0xFF0000)],
                ephemeral: true
            });
        }

        const category = interaction.values[0];
        const label = ts.getOptions(guildId).find(o => o.value === category)?.label || category;
        const userId = interaction.user.id;

        const num = await ConfigDB.incrementTicketCounter(guildId);

        const channel = await interaction.guild.channels.create({
            name: `ticket-${num}`,
            type: ChannelType.GuildText,
            parent: config.categoryId || null,
            permissionOverwrites: [
                { id: guildId, deny: [PermissionsBitField.Flags.ViewChannel] },
                {
                    id: userId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },
                {
                    id: config.roleId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        });

        const ticketObj = { g: guildId, num, owner: userId, claimed: null, label, users: [userId] };
        ts.tickets.set(channel.id, ticketObj);
        await TicketDB.create(channel.id, guildId, num, userId, label);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim').setLabel('✋ استلام').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close').setLabel('🔴 إغلاق').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adduser').setLabel('➕ إضافة شخص').setStyle(ButtonStyle.Secondary)
        );

        await channel.send(`<@&${config.roleId}>`);
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎫 تكت جديد')
                .setDescription(`مرحباً ${interaction.user}`)
                .addFields(
                    { name: 'النوع', value: label, inline: true },
                    { name: 'صاحب التكت', value: interaction.user.tag, inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: `التكت #${num} | اضغط على الأزرار أدناه` })],
            components: [buttons]
        });

        const logsChannel = interaction.guild.channels.cache.get(config.logsId);
        if (logsChannel) {
            await logsChannel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🟢 تكت جديد')
                    .addFields(
                        { name: 'رقم', value: `#${num}`, inline: true },
                        { name: 'صاحب', value: interaction.user.tag, inline: true },
                        { name: 'القناة', value: `${channel}`, inline: true }
                    )
                    .setColor(0x00FF00)]
            });
        }

        return interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
    }

    // ─────────────────────────────────────────────────────────
    // Ticket Button Handlers
    // ─────────────────────────────────────────────────────────

    async handleTicketButton(interaction, ts) {
        const ticket = ts.tickets.get(interaction.channel.id);
        if (!ticket) {
            return interaction.reply({ content: '❌ ليست قناة تكت', ephemeral: true });
        }

        const config = await ts.getConfig(ticket.g);

        if (interaction.customId === 'claim') {
            await this.handleClaimTicket(interaction, ticket, ts);
        } else if (interaction.customId === 'close') {
            await this.handleCloseTicket(interaction, ticket, ts);
        } else if (interaction.customId === 'adduser') {
            await this.handleAddUserButton(interaction, ticket);
        }
    }

    async handleClaimTicket(interaction, ticket, ts) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
        }
        if (ticket.claimed) {
            return interaction.reply({ content: `⚠️ مستلم من <@${ticket.claimed}>`, ephemeral: true });
        }

        ticket.claimed = interaction.user.id;
        await TicketDB.update(interaction.channel.id, { claimed: interaction.user.id });

        await this.sendLog(interaction.guild, logEventEmbed('✋ استلام تكت', `${interaction.user} استلم التكت #${ticket.num}!`, 0x3498db, [
            { name: '🎫 التكت', value: `#${ticket.num}`, inline: true },
            { name: '👤 صاحب التكت', value: `<@${ticket.owner}>`, inline: true }
        ]));

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ تم الاستلام')
                .setDescription(`استلم التكت: ${interaction.user}`)
                .setColor(0x0099FF)]
        });
    }

    async handleCloseTicket(interaction, ticket, ts) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isClaimer = ticket.claimed && ticket.claimed === interaction.user.id;

        if (!isAdmin && !isClaimer) {
            return interaction.reply({
                content: '❌ بس الأدمن أو اللي استلم التكت يقدر يغلقه!',
                ephemeral: true
            });
        }

        const closedAt = new Date().toLocaleString('ar-SA');

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔴 تم الإغلاق')
                .setDescription(`أغلقه ${interaction.user.tag}`)
                .setColor(0xFF0000)]
        });

        // DM owner
        try {
            const owner = await this.users.fetch(ticket.owner);
            await owner.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🔴 تم إغلاق تكتك')
                    .setColor(0xFF0000)]
            });
        } catch { /* Ignore DM fail */ }

        await this.sendLog(interaction.guild, logEventEmbed('🔴 إغلاق تكت', `${interaction.user} أغلق التكت #${ticket.num}!`, 0xe74c3c, [
            { name: '🎫 التكت', value: `#${ticket.num}`, inline: true },
            { name: '👤 صاحب التكت', value: `<@${ticket.owner}>`, inline: true },
            { name: '🕐 الوقت', value: closedAt, inline: true }
        ]));

        setTimeout(async () => {
            await interaction.channel.delete().catch(() => { });
            ts.tickets.delete(interaction.channel.id);
            await TicketDB.delete(interaction.channel.id);
        }, 5000);
    }

    async handleAddUserButton(interaction, ticket) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isClaimer = ticket.claimed && ticket.claimed === interaction.user.id;

        if (!isAdmin && !isClaimer) {
            return interaction.reply({
                content: '❌ بس الأدمن أو اللي استلم التكت يقدر يضيف أشخاص!',
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('adduser_modal')
            .setTitle('إضافة شخص للتكت');

        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('uid')
                .setLabel('اكتب ID أو اسم المستخدم')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: @username أو 123456789')
        ));

        await interaction.showModal(modal);
    }

    // ─────────────────────────────────────────────────────────
    // Add User Modal Handler
    // ─────────────────────────────────────────────────────────

    async handleAddUserModal(interaction, ts) {
        const ticket = ts.tickets.get(interaction.channel.id);
        if (!ticket) {
            return interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
        }

        const input = interaction.fields.getTextInputValue('uid');
        let userId;

        try {
            if (input.startsWith('<@')) {
                userId = input.replace(/[<@!>]/g, '');
            } else if (!isNaN(input)) {
                userId = input;
            } else {
                const members = await interaction.guild.members.search({ query: input, limit: 1 });
                if (!members.size) {
                    return interaction.reply({ content: '❌ ما وجدت المستخدم', ephemeral: true });
                }
                userId = members.first()?.id;
            }

            if (ticket.users.includes(userId)) {
                return interaction.reply({ content: '⚠️ مضاف مسبقاً', ephemeral: true });
            }

            const user = await this.users.fetch(userId);

            await interaction.channel.permissionOverwrites.create(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            ticket.users.push(userId);
            await TicketDB.addUser(interaction.channel.id, userId);

            await this.sendLog(interaction.guild, logEventEmbed('➕ إضافة شخص للتكت', `${interaction.user} أضاف ${user.tag} للتكت #${ticket.num}!`, 0x2ecc71, [
                { name: '🎫 التكت', value: `#${ticket.num}`, inline: true },
                { name: '➕ المضاف', value: user.tag, inline: true }
            ]));

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ تمت الإضافة')
                    .setDescription(`تمت إضافة ${user.tag} للتكت`)
                    .setColor(0x00FF00)]
            });

        } catch (err) {
            console.error('[MTX] Error adding user to ticket:', err);
            await interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
        }
    }

    // ─────────────────────────────────────────────────────────
    // Admin Commands
    // ─────────────────────────────────────────────────────────

    async cmdBan(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });
        if (member.id === message.guild.ownerId) return message.reply({ embeds: [errorEmbed('خطأ', 'ما تقدر تبند الأونر!')] });
        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply({ embeds: [errorEmbed('خطأ', 'رتبته أعلى منك!')] });
        }

        const timeArg = args.find(a => /^\d+[dhms]$/.test(a));
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id)).join(' ') || 'غير محدد';

        try {
            await member.ban({ reason: `بواسطة ${message.author.tag}: ${reason}`, deleteMessageDays: 0 });

            // DM
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🔴 تم تبنيدك')
                    .setDescription(`لقد تم تبنيدك من سيرفر **${message.guild.name}**`)
                    .addFields(
                        { name: '📌 السبب', value: reason, inline: false },
                        { name: '⏰ الوقت', value: timeArg || 'دائم', inline: true },
                        { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                    )
                    .setColor(0xFF0000)
                    .setTimestamp()
                    .setFooter({ text: 'MTX Bot' });
                await member.send({ embeds: [dmEmbed] });
            } catch { }

            await message.reply({
                embeds: [successEmbed('تم التبنيد', `**العضو:** ${member}\n🆔 **الايدي:** \`${member.id}\`\n📌 **السبب:** ${reason}\n⏰ **الوقت:** ${timeArg || 'دائم'}\n🔧 **بواسطة:** ${message.author}`)]
            });

            await this.sendLog(message.guild, logActionEmbed('تبنيد', message.author, member.user, reason, { 'الوقت': timeArg || 'دائم' }));

            // Auto unban after duration
            if (timeArg) {
                const ms = this.parseTime(timeArg);
                if (ms) setTimeout(() => message.guild.members.unban(member.id, 'انتهاء الوقت').catch(() => { }), ms);
            }

        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdUnban(message, args) {
        const uid = args[0];
        if (!uid || !/^\d+$/.test(uid)) {
            return message.reply({ embeds: [errorEmbed('خطأ', 'حط ايدي صحيح!')] });
        }

        try {
            const user = await this.users.fetch(uid);
            await message.guild.members.unban(user, `بواسطة ${message.author.tag}`);
            message.reply({ embeds: [successEmbed('تم فك الباند', `**${user.tag}** تم فك الباند عنه!`)] });
            await this.sendLog(message.guild, logActionEmbed('فك باند', message.author, user, 'فك الباند'));
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdKick(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });
        if (member.id === message.guild.ownerId) return message.reply({ embeds: [errorEmbed('خطأ', 'ما تقدر تطرد الأونر!')] });

        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';

        try {
            // DM before kick
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('👢 تم طردك')
                    .setDescription(`لقد تم طردك من سيرفر **${message.guild.name}**`)
                    .addFields(
                        { name: '📌 السبب', value: reason, inline: false },
                        { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                    )
                    .setColor(0xFF6B00)
                    .setTimestamp()
                    .setFooter({ text: 'MTX Bot' });
                await member.send({ embeds: [dmEmbed] });
            } catch { }

            await member.kick(`بواسطة ${message.author.tag}: ${reason}`);
            message.reply({ embeds: [successEmbed('تم الطرد', `**${member}** تم طرده!\n📌 **السبب:** ${reason}`)] });
            await this.sendLog(message.guild, logActionEmbed('طرد', message.author, member.user, reason));

        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdMute(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });

        const timeArg = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id) && !a.startsWith('<@')).join(' ') || 'غير محدد';
        const ms = this.parseTime(timeArg);

        if (!ms) return message.reply({ embeds: [errorEmbed('خطأ', 'صيغة غير صحيحة! استخدم: 1h, 30m, 1d, 10s')] });

        try {
            // DM
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🔇 تم كتمك')
                    .setDescription(`لقد تم كتمك في سيرفر **${message.guild.name}**`)
                    .addFields(
                        { name: '📌 السبب', value: reason, inline: false },
                        { name: '⏰ المدة', value: timeArg, inline: true },
                        { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                    )
                    .setColor(0xFFA500)
                    .setTimestamp()
                    .setFooter({ text: 'MTX Bot' });
                await member.send({ embeds: [dmEmbed] });
            } catch { }

            await member.timeout(ms, `بواسطة ${message.author.tag}: ${reason}`);
            message.reply({ embeds: [successEmbed('تم الكتم', `**${member}** تم كتمه!\n⏰ **المدة:** ${timeArg}\n📌 **السبب:** ${reason}`)] });
            await this.sendLog(message.guild, logActionEmbed('كتم', message.author, member.user, reason, { 'المدة': timeArg }));

        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdUnmute(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });

        try {
            await member.timeout(null, `بواسطة ${message.author.tag}`);
            message.reply({ embeds: [successEmbed('تم فك الكتم', `**${member}** يقدر يتكلم الحين! 🎉`)] });
            await this.sendLog(message.guild, logActionEmbed('فك كتم', message.author, member.user, 'فك الكتم'));
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdWarn(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });

        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';
        const result = await WarningDB.add(member.id, message.guild.id, reason, message.author);
        const warnNumber = result.total;

        // DM
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('⚠️ تم تحذيرك')
                .setDescription(`لقد تم تحذيرك في سيرفر **${message.guild.name}**`)
                .addFields(
                    { name: '📌 السبب', value: reason, inline: false },
                    { name: '🔢 رقم التحذير', value: `#${warnNumber}`, inline: true },
                    { name: '🔧 المسؤول', value: message.author.tag, inline: true }
                )
                .setColor(0xFFA500)
                .setTimestamp()
                .setFooter({ text: 'MTX Bot' });
            await member.send({ embeds: [dmEmbed] });
        } catch { }

        await message.reply({
            embeds: [warnEmbed('تم التحذير', `**${member}**\n📌 **السبب:** ${reason}\n🔢 **رقم التحذير:** #${warnNumber}\n🔧 **بواسطة:** ${message.author}`)]
        });

        await this.sendLog(message.guild, logActionEmbed('تحذير', message.author, member.user, reason, { 'رقم التحذير': `#${warnNumber}` }));
    }

    async cmdWarnings(message, args) {
        const member = message.mentions.members.first() || message.member;
        const warnings = await WarningDB.get(member.id, message.guild.id);

        if (warnings.length === 0) {
            return message.reply({ embeds: [infoEmbed('تحذيرات', `**${member}** — ما عنده تحذيرات! ✅`)] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ تحذيرات ${member.user.tag}`)
            .setColor(COLORS.WARN)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `إجمالي التحذيرات: ${warnings.length}` })
            .setTimestamp();

        warnings.forEach((warn, index) => {
            const date = new Date(warn.timestamp).toLocaleString('ar-SA', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            embed.addFields({
                name: `⚠️ تحذير #${index + 1}`,
                value: `📌 **السبب:** ${warn.reason}\n🔧 **المسؤول:** ${warn.moderatorTag}\n🕐 **الوقت:** ${date}`,
                inline: false
            });
        });

        await message.reply({ embeds: [embed] });
    }

    async cmdClearWarn(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply({ embeds: [errorEmbed('خطأ', 'منشن العضو!')] });

        const index = parseInt(args.find(a => /^\d+$/.test(a) && !a.includes(member.id)));

        if (index && index > 0) {
            const success = await WarningDB.remove(member.id, message.guild.id, index - 1);
            if (success) {
                message.reply({ embeds: [successEmbed('تم المسح', `🗑️ تم مسح التحذير رقم **${index}** لـ **${member}**!`)] });
                await this.sendLog(message.guild, logActionEmbed('مسح تحذير', message.author, member.user, `مسح تحذير رقم ${index}`));
            } else {
                message.reply({ embeds: [errorEmbed('خطأ', `ما فيه تحذير رقم **${index}**!`)] });
            }
        } else {
            await WarningDB.clear(member.id, message.guild.id);
            message.reply({ embeds: [successEmbed('تم المسح', `🗑️ تم مسح جميع تحذيرات **${member}**!`)] });
            await this.sendLog(message.guild, logActionEmbed('مسح تحذيرات', message.author, member.user, 'مسح'));
        }
    }

    async cmdLock(message, args) {
        let channel = message.mentions.channels.first();
        if (!channel && args[0]) {
            const match = args[0].match(/\d+/);
            if (match) channel = message.guild.channels.cache.get(match[0]);
        }
        channel = channel || message.channel;

        const botPerms = channel.permissionsFor(message.guild.members.me);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({ embeds: [errorEmbed('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply({ embeds: [successEmbed('تم القفل', `🔒 **${channel}** تم قفله!`)] });
            await this.sendLog(message.guild, logActionEmbed('قفل روم', message.author, message.author, 'قفل', { 'الروم': channel.toString() }));
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdUnlock(message, args) {
        let channel = message.mentions.channels.first();
        if (!channel && args[0]) {
            const match = args[0].match(/\d+/);
            if (match) channel = message.guild.channels.cache.get(match[0]);
        }
        channel = channel || message.channel;

        const botPerms = channel.permissionsFor(message.guild.members.me);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({ embeds: [errorEmbed('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
            message.reply({ embeds: [successEmbed('تم الفتح', `🔓 **${channel}** تم فتحه!`)] });
            await this.sendLog(message.guild, logActionEmbed('فتح روم', message.author, message.author, 'فتح', { 'الروم': channel.toString() }));
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdPurge(message, args) {
        const amount = parseInt(args[0]) || 10;
        if (amount > 100) return message.reply({ embeds: [errorEmbed('خطأ', 'الحد الأقصى 100!')] });
        if (amount < 1) return message.reply({ embeds: [errorEmbed('خطأ', 'الحد الأدنى 1!')] });

        try {
            const deleted = await message.channel.bulkDelete(amount + 1, true);
            const msg = await message.reply({ embeds: [successEmbed('تم المسح', `🗑️ تم مسح **${deleted.size - 1}** رسالة!`)] });
            setTimeout(() => msg.delete().catch(() => { }), 3000);
            await this.sendLog(message.guild, logActionEmbed('مسح رسائل', message.author, message.author, 'مسح', { 'العدد': deleted.size - 1 }));
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdSlowmode(message, args) {
        const sec = parseInt(args[0]) || 0;
        if (isNaN(sec) || sec < 0) {
            return message.reply({ embeds: [errorEmbed('خطأ', 'حط رقم صحيح! مثال: سلو 10')] });
        }

        try {
            await message.channel.setRateLimitPerUser(sec);
            const embed = sec === 0
                ? successEmbed('تم إيقاف التبطيء', `**${message.channel}** التبطيء متوقف! ✅`)
                : successEmbed('تم التبطيء', `**${message.channel}** تم تبطيئه لـ **${sec}** ثانية! 🐢`);
            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply({ embeds: [errorEmbed('خطأ', err.message)] });
        }
    }

    async cmdGames(message) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_roulette').setLabel('🎲 روليت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_mafia').setLabel('🕵️ مافيا').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('game_castle').setLabel('🏰 كاستل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('game_tictactoe').setLabel('⚔️ تكت تو').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle('🎮 قائمة الألعاب الجماعية')
            .setDescription('اختر لعبة من القائمة!')
            .setColor(COLORS.SUCCESS)
            .setFooter({ text: `طلبت بواسطة ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await message.reply({ embeds: [embed], components: [row] });
    }

    // ─────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────

    parseTime(str) {
        if (!str) return null;
        const match = str.match(/^(\d+)([dhms])$/);
        if (!match) return null;

        const value = parseInt(match[1]);
        switch (match[2]) {
            case 'd': return value * 86400000;
            case 'h': return value * 3600000;
            case 'm': return value * 60000;
            case 's': return value * 1000;
            default: return null;
        }
    }

    async sendLog(guild, embed) {
        const chId = await ConfigDB.getLogChannel(guild.id);
        if (!chId) return;
        const ch = guild.channels.cache.get(chId);
        if (ch) {
            try { await ch.send({ embeds: [embed] }); } catch { }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Keep-Alive Server (for Render)
// ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html dir="rtl">
<head><title>MTX Bot</title><style>
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
</body></html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[MTX] Keep-alive server running on port ${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// Start the bot
// ─────────────────────────────────────────────────────────────

const bot = new MTXBot();
bot.login(process.env.TOKEN).catch(err => {
    console.error('[MTX] Fatal error:', err);
    process.exit(1);
});
