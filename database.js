// MTX Bot - MongoDB Database Layer
// Simple, clean, and reliable persistent storage for Render hosting

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('[MTX DB] Error: MONGODB_URI environment variable is not set');
    process.exit(1);
}

// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
    .then(() => console.log('[MTX DB] Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('[MTX DB] Connection failed:', err.message);
        process.exit(1);
    });

// ─────────────────────────────────────────────────────────────
// Warning Schema - Stores user warnings per guild
// ─────────────────────────────────────────────────────────────

const warningSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    reason: { type: String, default: 'غير محدد' },
    moderatorId: { type: String, required: true },
    moderatorTag: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

warningSchema.index({ userId: 1, guildId: 1 });
const Warning = mongoose.model('Warning', warningSchema);

// ─────────────────────────────────────────────────────────────
// Guild Config Schema - Stores settings per server
// ─────────────────────────────────────────────────────────────

const configSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    logChannel: { type: String, default: null },
    ticketCategoryId: { type: String, default: null },
    ticketLogsId: { type: String, default: null },
    ticketRoleId: { type: String, default: null },
    ticketOptions: [{ label: String, value: String }],
    ticketCounter: { type: Number, default: 0 }
});

const GuildConfig = mongoose.model('GuildConfig', configSchema);

// ─────────────────────────────────────────────────────────────
// Ticket Schema - Stores active tickets
// ─────────────────────────────────────────────────────────────

const ticketSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true, index: true },
    number: { type: Number, required: true },
    ownerId: { type: String, required: true },
    claimedBy: { type: String, default: null },
    label: { type: String, default: '' },
    addedUsers: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

ticketSchema.index({ guildId: 1, ownerId: 1 });
const Ticket = mongoose.model('Ticket', ticketSchema);

// ─────────────────────────────────────────────────────────────
// Warning Database Operations
// ─────────────────────────────────────────────────────────────

class WarningDB {
    async get(userId, guildId) {
        const docs = await Warning.find({ userId, guildId }).sort({ createdAt: 1 }).lean();
        return docs.map(d => ({
            reason: d.reason,
            moderatorId: d.moderatorId,
            moderatorTag: d.moderatorTag,
            timestamp: d.createdAt.getTime()
        }));
    }

    async add(userId, guildId, reason, moderator) {
        await Warning.create({
            userId,
            guildId,
            reason,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag
        });
        const total = await Warning.countDocuments({ userId, guildId });
        return { total };
    }

    async remove(userId, guildId, index) {
        const docs = await Warning.find({ userId, guildId }).sort({ createdAt: 1 });
        if (index < 0 || index >= docs.length) return false;
        await Warning.deleteOne({ _id: docs[index]._id });
        return true;
    }

    async clear(userId, guildId) {
        await Warning.deleteMany({ userId, guildId });
    }
}

// ─────────────────────────────────────────────────────────────
// Guild Config Operations
// ─────────────────────────────────────────────────────────────

class ConfigDB {
    async get(guildId) {
        return await GuildConfig.findOne({ guildId }).lean();
    }

    async setLogChannel(guildId, channelId) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: { logChannel: channelId } },
            { upsert: true }
        );
    }

    async getLogChannel(guildId) {
        const doc = await GuildConfig.findOne({ guildId }).lean();
        return doc?.logChannel || null;
    }

    async setTicketConfig(guildId, { logsId, categoryId, roleId }) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: { ticketLogsId: logsId, ticketCategoryId: categoryId, ticketRoleId: roleId } },
            { upsert: true }
        );
    }

    async getTicketConfig(guildId) {
        const doc = await GuildConfig.findOne({ guildId }).lean();
        if (!doc) return null;
        return {
            logsId: doc.ticketLogsId,
            categoryId: doc.ticketCategoryId,
            roleId: doc.ticketRoleId,
            ticketOptions: doc.ticketOptions || []
        };
    }

    async addTicketOption(guildId, label, value) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $push: { ticketOptions: { label, value } } },
            { upsert: true }
        );
    }

    async removeTicketOption(guildId, value) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $pull: { ticketOptions: { value } } }
        );
    }

    async getTicketCounter(guildId) {
        const doc = await GuildConfig.findOne({ guildId }).lean();
        return doc?.ticketCounter || 0;
    }

    async incrementTicketCounter(guildId) {
        const doc = await GuildConfig.findOneAndUpdate(
            { guildId },
            { $inc: { ticketCounter: 1 } },
            { upsert: true, new: true }
        );
        return doc.ticketCounter;
    }
}

// ─────────────────────────────────────────────────────────────
// Ticket Operations
// ─────────────────────────────────────────────────────────────

class TicketDB {
    async getAll() {
        const docs = await Ticket.find().lean();
        const map = new Map();
        docs.forEach(d => {
            map.set(d.channelId, {
                g: d.guildId,
                num: d.number,
                owner: d.ownerId,
                claimed: d.claimedBy,
                label: d.label,
                users: d.addedUsers
            });
        });
        return map;
    }

    async get(channelId) {
        const doc = await Ticket.findOne({ channelId }).lean();
        if (!doc) return null;
        return {
            g: doc.guildId,
            num: doc.number,
            owner: doc.ownerId,
            claimed: doc.claimedBy,
            label: doc.label,
            users: doc.addedUsers
        };
    }

    async getByUser(guildId, ownerId) {
        const docs = await Ticket.find({ guildId, ownerId }).lean();
        return docs.map(d => ({
            channelId: d.channelId,
            num: d.number,
            owner: d.ownerId,
            claimed: d.claimedBy,
            label: d.label,
            users: d.addedUsers
        }));
    }

    async create(channelId, guildId, number, ownerId, label) {
        await Ticket.create({
            channelId,
            guildId,
            number,
            ownerId,
            label,
            addedUsers: [ownerId]
        });
    }

    async update(channelId, updates) {
        const setObj = {};
        if (updates.claimed !== undefined) setObj.claimedBy = updates.claimed;
        if (updates.label !== undefined) setObj.label = updates.label;

        await Ticket.findOneAndUpdate({ channelId }, { $set: setObj });
    }

    async addUser(channelId, userId) {
        await Ticket.findOneAndUpdate(
            { channelId },
            { $addToSet: { addedUsers: userId } }
        );
    }

    async delete(channelId) {
        await Ticket.deleteOne({ channelId });
    }

    async getCounters() {
        const docs = await GuildConfig.find().lean();
        const counters = {};
        docs.forEach(d => {
            if (d.ticketCounter) counters[d.guildId] = d.ticketCounter;
        });
        return counters;
    }
}

module.exports = {
    WarningDB: new WarningDB(),
    ConfigDB: new ConfigDB(),
    TicketDB: new TicketDB()
};
