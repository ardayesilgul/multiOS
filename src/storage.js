'use strict';

const fs = require('fs');
const path = require('path');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/quicktime': 'mov',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
};

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function extFromMime(mime) {
  if (!mime) return '';
  return MIME_EXT[String(mime).split(';')[0].trim().toLowerCase()] || '';
}

function sanitize(raw) {
  let name = String(raw || '').normalize('NFC').split(/[\\/]/).pop();
  name = name.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
  const ext = path.extname(name);
  let base = name.slice(0, name.length - ext.length);
  if (WIN_RESERVED.test(base)) base = `_${base}`;
  if (base.length > 180) base = base.slice(0, 180);
  return base ? base + ext : '';
}

function timestampName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `multiOS_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function resolveName(filename, mime) {
  let name = sanitize(filename);
  if (!name) name = timestampName();
  if (!path.extname(name)) {
    const ext = extFromMime(mime);
    if (ext) name += `.${ext}`;
  }
  return name;
}

// Names reserved by in-flight uploads, so two parallel uploads of "image.jpg"
// never write to the same file.
const reserved = new Set();

function reserve(dir, desired) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(desired);
  const base = desired.slice(0, desired.length - ext.length);
  for (let i = 0; i < 10000; i += 1) {
    const candidate = i === 0 ? desired : `${base} (${i})${ext}`;
    const full = path.join(dir, candidate);
    const key = full.toLowerCase();
    if (reserved.has(key) || fs.existsSync(full)) continue;
    reserved.add(key);
    return {
      name: candidate,
      full,
      part: `${full}.multios-part`,
      release: () => reserved.delete(key),
    };
  }
  throw new Error('Uygun dosya adi bulunamadi');
}

function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { resolveName, reserve, isInside, extFromMime };
