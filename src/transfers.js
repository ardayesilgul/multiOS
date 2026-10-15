'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const MAX_RECENT = 50;
const PROGRESS_INTERVAL_MS = 100;

const bus = new EventEmitter();
const recent = []; // newest first
const historyPath = path.join(cfg.DATA_DIR, 'transfers.json');
const ignoredPath = path.join(cfg.DATA_DIR, 'cleared-transfers.json');
let ignored = {};
try { ignored = JSON.parse(fs.readFileSync(ignoredPath, 'utf8')); } catch {}
try {
  const saved = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  recent.push(...saved.filter(t => t.state === 'done' || t.state === 'failed').slice(0, MAX_RECENT));
} catch { /* first launch */ }

function persist() {
  try {
    fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
    fs.writeFileSync(`${historyPath}.tmp`, JSON.stringify(recent.filter(t => t.state !== 'active').map(snapshot)));
    fs.renameSync(`${historyPath}.tmp`, historyPath);
  } catch (e) { console.error('Aktarim gecmisi kaydedilemedi:', e.message); }
}

function publish(t) {
  bus.emit('transfer', snapshot(t));
}

function snapshot(t) {
  return {
    id: t.id,
    state: t.state,
    from: t.from,
    names: t.names.slice(),
    files: t.files.slice(),
    received: t.received,
    total: t.total,
    speed: t.speed,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    error: t.error,
  };
}

// Tracks one HTTP upload. All numbers come from bytes actually read off the
// socket; nothing here is simulated.
function begin({ id, total, from }) {
  const t = {
    id,
    state: 'active',
    from,
    names: [],
    files: [],
    received: 0,
    total,
    speed: 0,
    startedAt: Date.now(),
    endedAt: null,
    error: null,
  };
  recent.unshift(t);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;

  let lastEmit = 0;
  let lastBytes = 0;
  let lastTime = t.startedAt;

  publish(t);

  return {
    addName(name) {
      t.names.push(name);
      publish(t);
    },
    progress(received) {
      t.received = received;
      const now = Date.now();
      if (now - lastEmit < PROGRESS_INTERVAL_MS) return;
      const dt = (now - lastTime) / 1000;
      if (dt > 0) t.speed = Math.round((received - lastBytes) / dt);
      lastBytes = received;
      lastTime = now;
      lastEmit = now;
      publish(t);
    },
    done(files) {
      t.state = 'done';
      t.files = files;
      t.endedAt = Date.now();
      t.received = Math.max(t.received, files.reduce((s, f) => s + f.size, 0));
      const secs = (t.endedAt - t.startedAt) / 1000;
      t.speed = secs > 0 ? Math.round(t.received / secs) : 0;
      publish(t);
      persist();
    },
    fail(message) {
      if (t.state !== 'active') return;
      t.state = 'failed';
      t.error = message;
      t.endedAt = Date.now();
      publish(t);
      persist();
    },
  };
}

function list() {
  return recent.map(snapshot);
}

function restoreFiles(dir) {
  try {
    const known = new Set(recent.flatMap(t => t.files || []).map(f => f.path));
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!entry.isFile() || known.has(full) || /\.(multios-part|part)$/i.test(entry.name)) continue;
      const stat = fs.statSync(full);
      if (ignored[full] === `${stat.size}:${stat.mtimeMs}`) continue;
      recent.push({ id: `disk:${entry.name}`, state: 'done', from: '', names: [entry.name], files: [{ name: entry.name, path: full, size: stat.size }], received: stat.size, total: stat.size, speed: 0, startedAt: stat.mtimeMs, endedAt: stat.mtimeMs, error: null });
    }
    recent.sort((a, b) => b.startedAt - a.startedAt);
    recent.length = Math.min(recent.length, MAX_RECENT);
    persist();
  } catch (e) { console.error('Gelen dosyalar okunamadi:', e.message); }
}

function clear() {
  // Remember the existing files so startup recovery does not resurrect cleared history.
  if (cfg.RESTORE_DROP_FILES) {
    for (const entry of fs.readdirSync(cfg.DROP_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || /\.(multios-part|part)$/i.test(entry.name)) continue;
      const full = path.join(cfg.DROP_DIR, entry.name);
      const stat = fs.statSync(full);
      ignored[full] = `${stat.size}:${stat.mtimeMs}`;
    }
  }
  fs.writeFileSync(`${ignoredPath}.tmp`, JSON.stringify(ignored));
  fs.renameSync(`${ignoredPath}.tmp`, ignoredPath);
  for (let i = recent.length - 1; i >= 0; i--) if (recent[i].state !== 'active') recent.splice(i, 1);
  persist();
  bus.emit('history-cleared');
}

module.exports = { begin, list, bus, restoreFiles, clear };
