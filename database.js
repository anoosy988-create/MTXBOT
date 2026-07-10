// ═══════════════════════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات المحلية - JSON File
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// ═══════════════════════════════════════════════════════════════════════
// 📊 نظام التخزين
// ═══════════════════════════════════════════════════════════════════════

class LocalDatabase {
    constructor() {
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(DATA_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            } catch (e) {
                console.error('[MTX DB] خطأ في قراءة الملف:', e);
                return this.getDefaultData();
            }
        }
        return this.getDefaultData();
    }

    getDefaultData() {
        return {
            warnings: {},
            protection: {},
            settings: {}
        };
    }

    save() {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error('[MTX DB] خطأ في حفظ الملف:', e);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ⚠️ التحذيرات
    // ═══════════════════════════════════════════════════════════════════

    getWarnings(userId, guildId) {
        const key = `${guildId}_${userId}`;
        const record = this.data.warnings[key];
        return record ? record.warnings : [];
    }

    addWarning(userId, guildId, reason, moderator) {
        const key = `${guildId}_${userId}`;
        
        if (!this.data.warnings[key]) {
            this.data.warnings[key] = {
                warnings: [],
                totalWarnings: 0
            };
        }

        this.data.warnings[key].warnings.push({
            reason,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            timestamp: new Date().toISOString()
        });

        this.data.warnings[key].totalWarnings = this.data.warnings[key].warnings.length;
        this.save();

        return {
            total: this.data.warnings[key].totalWarnings,
            record: this.data.warnings[key]
        };
    }

    clearWarnings(userId, guildId) {
        const key = `${guildId}_${userId}`;
        delete this.data.warnings[key];
        this.save();
    }

    removeWarning(userId, guildId, index) {
        const key = `${guildId}_${userId}`;
        const record = this.data.warnings[key];
        if (!record || index < 0 || index >= record.warnings.length) return null;

        record.warnings.splice(index, 1);
        record.totalWarnings = record.warnings.length;
        
        if (record.totalWarnings === 0) {
            delete this.data.warnings[key];
        }
        
        this.save();
        return record;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🛡️ الحماية
    // ═══════════════════════════════════════════════════════════════════

    isProtected(guildId, userId) {
        const data = this.data.protection[guildId];
        return data?.protectedUsers?.includes(userId) || false;
    }

    addProtected(guildId, userId) {
        if (!this.data.protection[guildId]) {
            this.data.protection[guildId] = {
                enabled: true,
                protectedUsers: [],
                logChannelId: null
            };
        }
        if (!this.data.protection[guildId].protectedUsers.includes(userId)) {
            this.data.protection[guildId].protectedUsers.push(userId);
            this.save();
        }
    }

    removeProtected(guildId, userId) {
        const data = this.data.protection[guildId];
        if (data) {
            data.protectedUsers = data.protectedUsers.filter(id => id !== userId);
            this.save();
        }
    }

    isEnabled(guildId) {
        const data = this.data.protection[guildId];
        return data?.enabled !== false;
    }

    setEnabled(guildId, enabled) {
        if (!this.data.protection[guildId]) {
            this.data.protection[guildId] = {
                enabled: enabled,
                protectedUsers: [],
                logChannelId: null
            };
        } else {
            this.data.protection[guildId].enabled = enabled;
        }
        this.save();
    }

    setLogChannel(guildId, channelId) {
        if (!this.data.protection[guildId]) {
            this.data.protection[guildId] = {
                enabled: true,
                protectedUsers: [],
                logChannelId: channelId
            };
        } else {
            this.data.protection[guildId].logChannelId = channelId;
        }
        this.save();
    }

    getLogChannel(guildId) {
        return this.data.protection[guildId]?.logChannelId || null;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 📤 تصدير
// ═══════════════════════════════════════════════════════════════════════

const db = new LocalDatabase();

module.exports = {
    db,
    WarningDB: {
        getWarnings: (userId, guildId) => db.getWarnings(userId, guildId),
        addWarning: (userId, guildId, reason, moderator) => db.addWarning(userId, guildId, reason, moderator),
        clearWarnings: (userId, guildId) => db.clearWarnings(userId, guildId),
        removeWarning: (userId, guildId, index) => db.removeWarning(userId, guildId, index)
    },
    ProtectionDB: {
        isProtected: (guildId, userId) => db.isProtected(guildId, userId),
        addProtected: (guildId, userId) => db.addProtected(guildId, userId),
        removeProtected: (guildId, userId) => db.removeProtected(guildId, userId),
        isEnabled: (guildId) => db.isEnabled(guildId),
        setEnabled: (guildId, enabled) => db.setEnabled(guildId, enabled),
        setLogChannel: (guildId, channelId) => db.setLogChannel(guildId, channelId),
        getLogChannel: (guildId) => db.getLogChannel(guildId)
    }
};
