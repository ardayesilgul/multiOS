'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { DATA_DIR } = require('./config');

const MEDIA_EXE = path.join(__dirname, 'native', 'multios-media.exe');
const THUMB_CACHE_DIR = path.join(DATA_DIR, 'thumb_cache');

function ensureThumbDir() {
  fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

function getCacheKey(filePath, mtimeMs, maxDim) {
  const hash = crypto.createHash('sha256').update(`${filePath}:${mtimeMs}:${maxDim}`).digest('hex').slice(0, 16);
  return path.join(THUMB_CACHE_DIR, `thumb_${hash}.png`);
}

function getThumbnail(filePath, maxDim = 128) {
  return new Promise((resolve) => {
    if (!fs.existsSync(MEDIA_EXE) || !fs.existsSync(filePath)) {
      return resolve(null);
    }

    let mtime = 0;
    try {
      mtime = fs.statSync(filePath).mtimeMs;
    } catch {
      return resolve(null);
    }

    ensureThumbDir();
    const cachePath = getCacheKey(filePath, mtime, maxDim);

    if (fs.existsSync(cachePath)) {
      return resolve({ ok: true, path: cachePath, cached: true });
    }

    execFile(MEDIA_EXE, ['thumb', filePath, cachePath, String(maxDim)], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err) {
        return resolve(null);
      }
      try {
        const res = JSON.parse(stdout.trim());
        if (res.ok) {
          return resolve({ ok: true, path: cachePath, width: res.width, height: res.height, type: res.type });
        }
      } catch {}
      resolve(null);
    });
  });
}

module.exports = { getThumbnail };
