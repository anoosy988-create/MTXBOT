// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  📁 MTX Database System - MongoDB Atlas (Persistent on Render)       ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ [MTX DB] MONGODB_URI not set! Set it in environment variables.');
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ [MTX DB] Connected to MongoDB Atlas');
}).catch(err => {
    console.error('❌ [MTX DB] MongoDB connection error:', err.message);
    process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Warning Schema
// ═══════════════════════════════════════════════════════════════════════

const WarningSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    reason: { type: String, default: 'غير محدد' },
    moderatorId: { type: String, required: true },
    moderatorTag: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

WarningSchema.index({ userId: 1, guildId: 1 });

const WarningModel = mongoose.model('Warning', WarningSchema);

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ Config Schema (log channels, ticket settings)
// ═══════════════════════════════════════════════════════════════════════

const ConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    logChannel: { type: String, default: null },
    ticketCategoryId: { type: String, default: null },
    ticketLogsId: { type: String, default: null },
    ticketRoleId: { type: String, default: null },
    ticketOptions: [{ label: String, value: String }],
    ticketCounter: { type: Number, default: 0 }
});

const ConfigModel = mongoose.model('Config', ConfigSchema);

// ═══════════════════════════════════════════════════════════════════════
// 🎫 Ticket Schema
// ═══════════════════════════════════════════════════════════════════════

const TicketSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    num: { type: Number, required: true },
    owner: { type: String, required: true },
    claimed: { type: String, default: null },
    label: { type: String, default: '' },
    users: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

TicketSchema.index({ guildId: 1 });
TicketSchema.index({ owner: 1 });

const TicketModel = mongoose.model('Ticket', TicketSchema);

// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Warning Database
// ═══════════════════════════════════════════════════════════════════════

class WarningDatabase {
    async getWarnings(userId, guildId) {
        const docs = await WarningModel.find({ userId, guildId }).sort({ timestamp: 1 }).lean();
        return docs.map(d => ({
            reason: d.reason,
            moderatorId: d.moderatorId,
            moderatorTag: d.moderatorTag,
            timestamp: d.timestamp.getTime()
        }));
    }

    async addWarning(userId, guildId, reason, moderator) {
        await WarningModel.create({
            userId,
            guildId,
            reason,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag
        });
        const total = await WarningModel.countDocuments({ userId, guildId });
        return { total };
    }

    async removeWarning(userId, guildId, index) {
        const docs = await WarningModel.find({ userId, guildId }).sort({ timestamp: 1 });
        if (index < 0 || index >= docs.length) return false;
        await WarningModel.deleteOne({ _id: docs[index]._id });
        return true;
    }

    async clearWarnings(userId, guildId) {
        await WarningModel.deleteMany({ userId, guildId });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ Config Database
// ═══════════════════════════════════════════════════════════════════════

class ConfigDatabase {
    async _getOrCreate(guildId) {
        let doc = await ConfigModel.findOne({ guildId });
        if (!doc) {
            doc = await ConfigModel.create({ guildId });
        }
        return doc;
    }

    async getLogChannel(guildId) {
        const doc = await ConfigModel.findOne({ guildId }).lean();
        return doc?.logChannel || null;
    }

    async setLogChannel(guildId, channelId) {
        await ConfigModel.findOneAndUpdate(
            { guildId },
            { $set: { logChannel: channelId } },
            { upsert: true, new: true }
        );
    }

    async getTicketConfig(guildId) {
        const doc = await ConfigModel.findOne({ guildId }).lean();
        if (!doc) return null;
        return {
            logsId: doc.ticketLogsId,
            categoryId: doc.ticketCategoryId,
            roleId: doc.ticketRoleId,
            ticketOptions: doc.ticketOptions || []
        };
    }

    async setTicketConfig(guildId, config) {
        await ConfigModel.findOneAndUpdate(
            { guildId },
            { $set: {
                ticketLogsId: config.logsId,
                ticketCategoryId: config.categoryId,
                ticketRoleId: config.roleId
            }},
            { upsert: true, new: true }
        );
    }

    async getTicketOptions(guildId) {
        const doc = await ConfigModel.findOne({ guildId }).lean();
        return doc?.ticketOptions || [];
    }

    async addTicketOption(guildId, label, value) {
        await ConfigModel.findOneAndUpdate(
            { guildId },
            { $push: { ticketOptions: { label, value } }},
            { upsert: true, new: true }
        );
    }

    async removeTicketOption(guildId, value) {
        await ConfigModel.findOneAndUpdate(
            { guildId },
            { $pull: { ticketOptions: { value } }},
            { new: true }
        );
    }

    async getTicketCounter(guildId) {
        const doc = await ConfigModel.findOne({ guildId }).lean();
        return doc?.ticketCounter || 0;
    }

    async incrementTicketCounter(guildId) {
        const doc = await ConfigModel.findOneAndUpdate(
            { guildId },
            { $inc: { ticketCounter: 1 } },
            { upsert: true, new: true }
        );
        return doc.ticketCounter;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎫 Ticket Database
// ═══════════════════════════════════════════════════════════════════════

class TicketDatabase {
    async getAllTickets() {
        const docs = await TicketModel.find().lean();
        const map = new Map();
        const data = {};
        docs.forEach(d => {
            const obj = {
                g: d.guildId,
                num: d.num,
                owner: d.owner,
                claimed: d.claimed,
                label: d.label,
                users: d.users
            };
            map.set(d.channelId, obj);
            data[d.channelId] = obj;
        });
        return { map, data };
    }

    async getTicket(channelId) {
        const doc = await TicketModel.findOne({ channelId }).lean();
        if (!doc) return null;
        return {
            g: doc.guildId,
            num: doc.num,
            owner: doc.owner,
            claimed: doc.claimed,
            label: doc.label,
            users: doc.users
        };
    }

    async getUserTickets(guildId, userId) {
        const docs = await TicketModel.find({ guildId, owner: userId }).lean();
        return docs.map(d => ({
            channelId: d.channelId,
            num: d.num,
            owner: d.owner,
            claimed: d.claimed,
            label: d.label,
            users: d.users
        }));
    }

    async createTicket(channelId, guildId, num, owner, label) {
        await TicketModel.create({
            channelId,
            guildId,
            num,
            owner,
            label,
            users: [owner]
        });
    }

    async updateTicket(channelId, updates) {
        await TicketModel.findOneAndUpdate(
            { channelId },
            { $set: updates },
            { new: true }
        );
    }

    async addUserToTicket(channelId, userId) {
        await TicketModel.findOneAndUpdate(
            { channelId },
            { $addToSet: { users: userId } },
            { new: true }
        );
    }

    async deleteTicket(channelId) {
        await TicketModel.deleteOne({ channelId });
    }

    async getCounters() {
        const docs = await ConfigModel.find().lean();
        const counters = {};
        docs.forEach(d => {
            if (d.ticketCounter) counters[d.guildId] = d.ticketCounter;
        });
        return counters;
    }
}

module.exports = {
    WarningDB: new WarningDatabase(),
    ConfigDB: new ConfigDatabase(),
    TicketDB: new TicketDatabase()
};
