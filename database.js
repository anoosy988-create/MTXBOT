// db stuff
const mongoose = require('mongoose');

// connect
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('db ok');
    } catch (err) {
        console.log('db error:', err);
        process.exit(1);
    }
}

// warn schema
const warnSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    warnings: [{
        reason: String,
        modId: String,
        modTag: String,
        time: { type: Date, default: Date.now }
    }],
    count: { type: Number, default: 0 }
});

const protSchema = new mongoose.Schema({
    guildId: String,
    enabled: { type: Boolean, default: true },
    protectedUsers: [String],
    logChannel: String
});

const Warn = mongoose.model('warn', warnSchema);
const Prot = mongoose.model('prot', protSchema);

// db funcs
async function addWarn(uid, gid, reason, mod) {
    let d = await Warn.findOne({ userId: uid, guildId: gid });
    if (!d) {
        d = new Warn({ userId: uid, guildId: gid, warnings: [] });
    }
    d.warnings.push({
        reason: reason,
        modId: mod.id,
        modTag: mod.tag
    });
    d.count = d.warnings.length;
    await d.save();
    return d.count;
}

async function getWarns(uid, gid) {
    const d = await Warn.findOne({ userId: uid, guildId: gid });
    return d ? d.warnings : [];
}

async function clearWarns(uid, gid) {
    await Warn.findOneAndDelete({ userId: uid, guildId: gid });
}

async function delWarn(uid, gid, idx) {
    const d = await Warn.findOne({ userId: uid, guildId: gid });
    if (!d) return null;
    if (idx < 0 || idx >= d.warnings.length) return null;
    d.warnings.splice(idx, 1);
    d.count = d.warnings.length;
    await d.save();
    return d;
}

// protection
async function isProtected(gid, uid) {
    const d = await Prot.findOne({ guildId: gid });
    if (!d) return false;
    return d.protectedUsers.includes(uid);
}

async function addProtected(gid, uid) {
    let d = await Prot.findOne({ guildId: gid });
    if (!d) {
        d = new Prot({ guildId: gid, protectedUsers: [] });
    }
    if (!d.protectedUsers.includes(uid)) {
        d.protectedUsers.push(uid);
        await d.save();
    }
}

async function removeProtected(gid, uid) {
    await Prot.findOneAndUpdate(
        { guildId: gid },
        { $pull: { protectedUsers: uid } }
    );
}

async function protEnabled(gid) {
    const d = await Prot.findOne({ guildId: gid });
    if (!d) return true;
    return d.enabled;
}

async function setProt(gid, on) {
    let d = await Prot.findOne({ guildId: gid });
    if (!d) {
        d = new Prot({ guildId: gid });
    }
    d.enabled = on;
    await d.save();
}

async function setLog(gid, ch) {
    let d = await Prot.findOne({ guildId: gid });
    if (!d) {
        d = new Prot({ guildId: gid });
    }
    d.logChannel = ch;
    await d.save();
}

async function getLog(gid) {
    const d = await Prot.findOne({ guildId: gid });
    return d ? d.logChannel : null;
}

module.exports = {
    connectDB,
    addWarn, getWarns, clearWarns, delWarn,
    isProtected, addProtected, removeProtected,
    protEnabled, setProt, setLog, getLog
};
