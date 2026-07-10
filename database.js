// ═══════════════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات - MongoDB + Mongoose
// ═══════════════════════════════════════════════════════════════

const mongoose = require('mongoose');

// الاتصال بـ MongoDB
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

// ═══════════════════════════════════════
// 📋 سكيما التحذيرات
// ═══════════════════════════════════════

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

const WarnModel = mongoose.model('Warning', warnSchema);

// ═══════════════════════════════════════
// 📋 سكيما الحماية
// ═══════════════════════════════════════

const protectionSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    protectedUsers: [{ type: String }],
    suspiciousBots: [{ type: String }],
    logChannelId: { type: String, default: null }
}, { timestamps: true });

const ProtectionModel = mongoose.model('Protection', protectionSchema);

// ═══════════════════════════════════════
// 🔧 دوال التحذيرات
// ═══════════════════════════════════════

class WarningDB {
    
    // إضافة تحذير
    static async addWarning(userId, guildId, reason, moderator) {
        let record = await WarnModel.findOne({ userId, guildId });
        
        if (!record) {
            record = new WarnModel({ userId, guildId, warnings: [], totalWarnings: 0 });
        }
        
        record.warnings.push({
            reason,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            timestamp: new Date()
        });
        
        record.totalWarnings = record.warnings.length;
        await record.save();
        
        return {
            total: record.totalWarnings,
            record: record
        };
    }

    // جلب التحذيرات
    static async getWarnings(userId, guildId) {
        const record = await WarnModel.findOne({ userId, guildId });
        return record ? record.warnings : [];
    }

    // مسح التحذيرات
    static async clearWarnings(userId, guildId) {
        await WarnModel.findOneAndDelete({ userId, guildId });
    }

    // مسح تحذير واحد
    static async removeWarning(userId, guildId, index) {
        const record = await WarnModel.findOne({ userId, guildId });
        if (!record || index < 0 || index >= record.warnings.length) return null;
        
        record.warnings.splice(index, 1);
        record.totalWarnings = record.warnings.length;
        await record.save();
        return record;
    }

    // تسجيل الميوت التلقائي
    static async setAutoMuted(userId, guildId) {
        await WarnModel.findOneAndUpdate(
            { userId, guildId },
            { autoMuted: true, lastAutoMute: new Date() },
            { upsert: true }
        );
    }
}

// ═══════════════════════════════════════
// 🔧 دوال الحماية
// ═══════════════════════════════════════

class ProtectionDB {
    
    static async isProtected(guildId, userId) {
        const data = await ProtectionModel.findOne({ guildId });
        return data?.protectedUsers?.includes(userId) || false;
    }

    static async addProtected(guildId, userId) {
        await ProtectionModel.findOneAndUpdate(
            { guildId },
            { $addToSet: { protectedUsers: userId } },
            { upsert: true, new: true }
        );
    }

    static async removeProtected(guildId, userId) {
        await ProtectionModel.findOneAndUpdate(
            { guildId },
            { $pull: { protectedUsers: userId } },
            { new: true }
        );
    }

    static async isEnabled(guildId) {
        const data = await ProtectionModel.findOne({ guildId });
        return data?.enabled !== false;
    }

    static async setEnabled(guildId, enabled) {
        await ProtectionModel.findOneAndUpdate(
            { guildId },
            { enabled },
            { upsert: true, new: true }
        );
    }

    static async setLogChannel(guildId, channelId) {
        await ProtectionModel.findOneAndUpdate(
            { guildId },
            { logChannelId: channelId },
            { upsert: true, new: true }
        );
    }

    static async getLogChannel(guildId) {
        const data = await ProtectionModel.findOne({ guildId });
        return data?.logChannelId || null;
    }
}

module.exports = {
    connectDatabase,
    WarningDB,
    ProtectionDB,
    WarnModel,
    ProtectionModel
};
