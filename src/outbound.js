'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const cfg = require('./config');
const storage = require('./storage');

const bus = new EventEmitter();
const items = new Map();
const indexPath = path.join(cfg.STAGED_DIR, 'index.json');
try {
  for (const item of JSON.parse(fs.readFileSync(indexPath, 'utf8'))) {
    if (storage.isInside(cfg.STAGED_DIR, item.path) && fs.existsSync(item.path)) items.set(item.id, item);
  }
} catch { /* first launch */ }

// Older versions staged files without an index. Recover only our UUID-prefixed files.
try {
  let recovered = false;
  for (const entry of fs.readdirSync(cfg.STAGED_DIR, { withFileTypes: true })) {
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/i.exec(entry.name);
    if (!entry.isFile() || !match || entry.name.endsWith('.part') || items.has(match[1])) continue;
    const filePath = path.join(cfg.STAGED_DIR, entry.name);
    const stat = fs.statSync(filePath);
    items.set(match[1], { id: match[1], name: match[2], path: filePath, size: stat.size, mimeType: 'application/octet-stream', stagedAt: stat.mtimeMs });
    recovered = true;
  }
  if (recovered) persist();
} catch { /* no old queue */ }

function persist() {
  ensureDir();
  fs.writeFileSync(`${indexPath}.tmp`, JSON.stringify([...items.values()]));
  fs.renameSync(`${indexPath}.tmp`, indexPath);
}

function ensureDir() {
  fs.mkdirSync(cfg.STAGED_DIR, { recursive: true });
}

function stage({ name: rawName, stream, size = null, mimeType = '' }) {
  ensureDir();
  const id = crypto.randomUUID();
  const name = storage.resolveName(rawName, mimeType);
  const filePath = path.join(cfg.STAGED_DIR, `${id}_${name}`);

  return new Promise((resolve, reject) => {
    const partPath = `${filePath}.part`;
    const out = fs.createWriteStream(partPath);
    let bytes = 0;
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      stream.unpipe(out);
      out.destroy();
      reject(err);
    };

    stream.on('data', (c) => { bytes += c.length; });
    stream.on('error', fail);
    stream.on('aborted', () => fail(new Error('Aktarim kesildi')));
    out.on('error', fail);

    out.on('close', () => {
      if (failed || !out.writableFinished) {
        try { fs.unlinkSync(partPath); } catch {}
        return;
      }
      const realSize = bytes;
      if (size != null && size !== bytes) {
        try { fs.unlinkSync(partPath); } catch {}
        reject(new Error('Dosya eksik alindi'));
        return;
      }
      const item = {
        id,
        name,
        path: filePath,
        size: realSize,
        mimeType: mimeType || 'application/octet-stream',
        stagedAt: Date.now(),
      };
      try {
        fs.renameSync(partPath, filePath);
        items.set(id, item);
        persist();
      } catch (err) {
        items.delete(id);
        try { fs.unlinkSync(filePath); } catch {}
        reject(err);
        return;
      }
      bus.emit('staged', toPublic(item));
      resolve(toPublic(item));
    });

    stream.pipe(out);
  });
}

function toPublic(item) {
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    mimeType: item.mimeType,
    stagedAt: item.stagedAt,
    thumbnailUrl: `/api/outbound/thumbnail/${item.id}`,
  };
}

function list() {
  return Array.from(items.values()).map(toPublic);
}

function get(id) {
  return items.get(id) || null;
}

function remove(id) {
  const item = items.get(id);
  if (!item) return false;
  if (fs.existsSync(item.path)) fs.unlinkSync(item.path);
  items.delete(id);
  persist();
  bus.emit('removed', { id });
  return true;
}

function clear() {
  try {
    for (const item of items.values()) {
      if (fs.existsSync(item.path)) fs.unlinkSync(item.path);
      items.delete(item.id);
    }
  } finally {
    persist();
    bus.emit('cleared');
  }
}

module.exports = {
  bus,
  stage,
  list,
  get,
  remove,
  clear,
};
