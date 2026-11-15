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
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'video/quicktime': 'mov',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-7z-compressed': '7z',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
  'application/gzip': 'gz',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'text/html': 'html',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/epub+zip': 'epub',
  'text/vcard': 'vcf',
  'text/x-vcard': 'vcf',
  'text/calendar': 'ics',
};

const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub': 'application/epub+zip',
  '.vcf': 'text/vcard; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
};

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function extFromMime(mime) {
  if (!mime) return '';
  return MIME_EXT[String(mime).split(';')[0].trim().toLowerCase()] || '';
}

function mimeFromName(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = path.extname(String(filename)).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
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

module.exports = { resolveName, reserve, isInside, extFromMime, mimeFromName };
