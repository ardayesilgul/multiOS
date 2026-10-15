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
const clearedPath = path.join(DATA_DIR, 'cleared-clipboard.json');
let clearedFingerprint = null;
try { clearedFingerprint = JSON.parse(fs.readFileSync(clearedPath, 'utf8')); } catch {}

function fingerprint(item) {
  if (!item) return null;
  return crypto.createHash('sha256').update(item.type === 'image' ? fs.readFileSync(item.path) : item.text).digest('hex');
}

function publish(item) {
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

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop(); // keep remainder

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'text') {
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

  child.on('exit', () => {
    child = null;
    // auto restart after brief pause if process is alive
    if (!stopping) restartTimer = setTimeout(start, 2000).unref();
  });
  child.on('error', err => console.error('Clipboard helper:', err.message));

  // initial pull
  setTimeout(() => {
    if (child && child.stdin) {
      child.stdin.write('GET\n');
    }
  }, 250);
}

function getLatest() {
  return latest;
}

function setText(text) {
  if (!text) return false;
  resetCleared();
  latest = {
    type: 'text',
    text: String(text),
    snippet: String(text).slice(0, 80).replace(/[\r\n]+/g, ' '),
    ts: Date.now(),
  };
  events.emit('change', latest);

  if (child && child.stdin) {
    const b64 = Buffer.from(String(text), 'utf8').toString('base64');
    child.stdin.write(`SET_TEXT ${b64}\n`);
    return true;
  }
  return false;
}

function setImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    resetCleared();
    const stat = fs.statSync(filePath);
    latest = {
      type: 'image',
      path: filePath,
      size: stat.size,
      ts: Date.now(),
    };
    events.emit('change', latest);

    if (child && child.stdin) {
      child.stdin.write(`SET_IMAGE ${filePath}\n`);
      return true;
    }
  } catch {}
  return false;
}

function stop() {
  stopping = true;
  clearTimeout(restartTimer);
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
};
