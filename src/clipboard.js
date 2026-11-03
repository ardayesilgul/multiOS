'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { DATA_DIR } = require('./config');

const CLIP_EXE = path.join(__dirname, 'native', 'multios-clip.exe');
const CACHE_DIR = path.join(DATA_DIR, 'clip_cache');

const events = new EventEmitter();
let child = null;
let latest = null;
let stopping = false;
let restartTimer = null;
let writeQueue = Promise.resolve();
let queuedWrites = 0;
let generation = 0;
let revision = Date.now();
const pending = new Map();
const settingsPath = path.join(DATA_DIR, 'clipboard-settings.json');
let paused = false;
try { paused = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).paused === true; } catch {}

function failure(message, status = 503) { return Object.assign(new Error(message), { status }); }
function getStatus() { return { paused, revision, available: !!child && !child.killed && child.stdin.writable && !child.stdin.destroyed, busy: queuedWrites > 0 }; }
function setPaused(value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(settingsPath + '.tmp', JSON.stringify({ paused: value }));
  fs.renameSync(settingsPath + '.tmp', settingsPath);
  paused = value;
  revision = Math.max(revision + 1, Date.now());
  if (paused) { stop(); latest = null; events.emit('change', null); }
  else start();
  events.emit('status', getStatus());
}
function rejectPending(error) {
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear();
}
const clearedPath = path.join(DATA_DIR, 'cleared-clipboard.json');
let clearedFingerprint = null;
try { clearedFingerprint = JSON.parse(fs.readFileSync(clearedPath, 'utf8')); } catch {}

function fingerprint(item) {
  if (!item) return null;
  return crypto.createHash('sha256').update(item.type === 'image' ? fs.readFileSync(item.path) : item.text).digest('hex');
}

function publish(item) {
  if (paused || stopping) return;
  if (clearedFingerprint && fingerprint(item) === clearedFingerprint) return;
  resetCleared();
  latest = item;
  events.emit('change', latest);
}

function clear() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (latest) clearedFingerprint = fingerprint(latest);
  fs.writeFileSync(clearedPath, JSON.stringify(clearedFingerprint));
  latest = null;
  events.emit('change', null);
}

function resetCleared() {
  if (!clearedFingerprint) return;
  clearedFingerprint = null;
  fs.writeFileSync(clearedPath, 'null');
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function start() {
  if (paused || child || process.env.MULTIOS_DISABLE_CLIPBOARD === '1') return;
  stopping = false;
  if (!fs.existsSync(CLIP_EXE)) {
    console.error(`multios-clip.exe bulunamadi: ${CLIP_EXE}`);
    return;
  }

  ensureCacheDir();

  try {
    child = spawn(CLIP_EXE, [CACHE_DIR], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch (err) {
    console.error(`Clipboard helper baslatilamadi: ${err.message}`);
    return;
  }

  const source = child;
  child.stdin.on('error', () => { if (child === source) rejectPending(failure('Pano bağlantısı kesildi.')); });
  let buf = '';
  child.stdout.on('data', (chunk) => {
    if (child !== source || stopping || paused) return;
    buf += chunk.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop(); // keep remainder

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'set_ok' || msg.type === 'set_err') {
          const job = pending.get(msg.id);
          if (job) {
            pending.delete(msg.id); clearTimeout(job.timer);
            if (msg.type === 'set_ok') job.resolve();
            else job.reject(failure('Windows panosuna yazılamadı. Yeniden deneyin.'));
          }
        } else if (msg.type === 'text') {
          const text = Buffer.from(msg.payload, 'base64').toString('utf8');
          const item = {
            type: 'text',
            text,
            snippet: msg.snippet,
            ts: msg.ts || Date.now(),
          };
          publish(item);
        } else if (msg.type === 'image') {
          const item = {
            type: 'image',
            path: msg.path,
            size: msg.size,
            width: msg.width,
            height: msg.height,
            ts: msg.ts || Date.now(),
          };
          publish(item);
        }
      } catch (e) {
        // malformed line
      }
    }
  });

  function disconnected() {
    if (child !== source) return;
    child = null;
    rejectPending(failure('Pano bağlantısı kesildi. Yeniden deneyin.'));
    if (!stopping && !paused) { clearTimeout(restartTimer); restartTimer = setTimeout(start, 2000).unref(); }
  }
  child.on('exit', disconnected);
  child.on('error', error => { console.error('Clipboard helper:', error.message); disconnected(); });

  // initial pull
  setTimeout(() => {
    if (child && child.stdin) {
      child.stdin.write('GET\n');
    }
  }, 250);
}

function getLatest() {
  return paused ? null : latest;
}

function writeClipboard(command, payload, item) {
  if (queuedWrites >= 8) return Promise.reject(failure('Pano meşgul. Biraz bekleyip yeniden deneyin.', 429));
  queuedWrites++;
  const acceptedGeneration = generation;
  const write = writeQueue.then(async () => {
    if (paused || generation !== acceptedGeneration) throw failure('Pano paylaşımı bilgisayarda duraklatıldı.', 423);
    const process = child;
    if (!process || process.killed || !process.stdin.writable)
      throw failure('Windows panosu kullanılamıyor. Bilgisayarda multiOS uygulamasını kontrol edin.');
    const id = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        process.kill();
        reject(failure('Windows panosu yanıt vermedi. Yeniden deneyin.'));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
      process.stdin.write(`${command} ${id} ${Buffer.from(payload, 'utf8').toString('base64')}\n`, error => {
        if (!error) return;
        const job = pending.get(id);
        if (job) { pending.delete(id); clearTimeout(timer); reject(failure('Pano bağlantısı kesildi.')); }
      });
    });
    if (paused || process !== child) throw failure('Pano paylaşımı durduruldu.', 423);
    publish({ ...item, ts: Date.now() });
    return true;
  });
  const result = write.finally(() => { queuedWrites--; });
  writeQueue = result.catch(() => {});
  return result;
}

function setText(text) {
  if (typeof text !== 'string' || !text.trim()) return Promise.reject(failure('Bir metin yazın.', 400));
  return writeClipboard('SET_TEXT', text, { type: 'text', text, snippet: text.slice(0, 80).replace(/[\r\n]+/g, ' ') });
}

function setImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return Promise.reject(failure('Görsel bulunamadı.', 400));
  return writeClipboard('SET_IMAGE', filePath, { type: 'image', path: filePath, size: fs.statSync(filePath).size });
}

function stop() {
  generation++;
  stopping = true;
  clearTimeout(restartTimer);
  rejectPending(failure('Pano paylaşımı durduruldu.', 423));
  if (child) {
    try { child.kill(); } catch {}
    child = null;
  }
}

module.exports = {
  start,
  stop,
  getLatest,
  setText,
  setImage,
  clear,
  events,
  getStatus,
  setPaused,
};
