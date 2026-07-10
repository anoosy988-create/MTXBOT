const fs = require('fs');
const FILE = 'data.json';

function load() {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE));
    return { warnings: {}, protection: {} };
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// warnings
async function addWarn(uid, gid, reason, mod) {
    const data = load();
    if (!data.warnings[uid]) data.warnings[uid] = {};
    if (!data.warnings[uid][gid]) data.warnings[uid][gid] = [];
    data.warnings[uid][gid].push({ reason, modId: mod.id, modTag: mod.tag, time: new Date().toISOString() });
    save(data);
    return data.warnings[uid][gid].length;
}

async function getWarns(uid, gid) {
    const data = load();
    return data.warnings[uid]?.[gid] || [];
}

async function clearWarns(uid, gid) {
    const data = load();
    if (data.warnings[uid]) delete data.warnings[uid][gid];
    save(data);
}

async function delWarn(uid, gid, idx) {
    const data = load();
    if (!data.warnings[uid]?.[gid]) return null;
    data.warnings[uid][gid].splice(idx, 1);
    save(data);
    return data.warnings[uid][gid];
}

// protection
async function isProt(gid, uid) {
    const data = load();
    return data.protection[gid]?.protectedUsers?.includes(uid) || false;
}

async function addProt(gid, uid) {
    const data = load();
    if (!data.protection[gid]) data.protection[gid] = { enabled: true, protectedUsers: [], logChannel: null };
    if (!data.protection[gid].protectedUsers.includes(uid)) data.protection[gid].protectedUsers.push(uid);
    save(data);
}

async function remProt(gid, uid) {
    const data = load();
    if (data.protection[gid]) data.protection[gid].protectedUsers = data.protection[gid].protectedUsers.filter(id => id !== uid);
    save(data);
}

async function protOn(gid) {
    const data = load();
    if (!data.protection[gid]) return true;
    return data.protection[gid].enabled !== false;
}

async function setProt(gid, on) {
    const data = load();
    if (!data.protection[gid]) data.protection[gid] = { enabled: true, protectedUsers: [], logChannel: null };
    data.protection[gid].enabled = on;
    save(data);
}

async function setLog(gid, ch) {
    const data = load();
    if (!data.protection[gid]) data.protection[gid] = { enabled: true, protectedUsers: [], logChannel: null };
    data.protection[gid].logChannel = ch;
    save(data);
}

async function getLog(gid) {
    const data = load();
    return data.protection[gid]?.logChannel || null;
}

async function connectDB() {
    console.log('json db ready');
}

module.exports = {
    connectDB,
    addWarn, getWarns, clearWarns, delWarn,
    isProt, addProt, remProt,
    protOn, setProt, setLog, getLog
};
