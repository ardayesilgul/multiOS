'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const busboy = require('busboy');
const QRCode = require('qrcode');

const cfg = require('./config');
const { loadState, tokenMatches } = require('./state');
const { getLanAddress } = require('./network');
const { startMdns } = require('./mdns');
const storage = require('./storage');
const transfers = require('./transfers');
const clipboard = require('./clipboard');
const outbound = require('./outbound');
const media = require('./media');

const SILENT = process.argv.includes('--silent');
const state = loadState();
let shutdownServer = () => {};

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

// ---------------------------------------------------------------- helpers

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const sseClients = new Set();
function broadcastSse(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch {}
  }
}

clipboard.events.on('change', (item) => {
  broadcastSse('clipboard', item);
});

outbound.bus.on('staged', (file) => {
  broadcastSse('outbound', { action: 'staged', file });
});

outbound.bus.on('removed', (data) => {
  broadcastSse('outbound', { action: 'removed', id: data.id });
});

outbound.bus.on('cleared', () => {
  broadcastSse('outbound', { action: 'cleared' });
});

// Desktop-only endpoints: must come from this machine AND carry a local Host
// header (blocks DNS-rebinding pages from reading the pairing token).
function isDesktopRequest(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false;
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  return LOCAL_HOSTS.has(host);
}

function isReceivedFile(filePath) {
  if (storage.isInside(cfg.DROP_DIR, filePath)) return true;
  const wanted = path.resolve(filePath).toLowerCase();
  return transfers.list().some(t => t.files.some(f => f.path && path.resolve(f.path).toLowerCase() === wanted));
}

function clientLabel(req) {
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

const templateCache = new Map();
function renderTemplate(file, vars) {
  let tpl = templateCache.get(file);
  if (!tpl) {
    tpl = fs.readFileSync(path.join(cfg.PUBLIC_DIR, file), 'utf8');
    if (process.env.MULTIOS_DEV !== '1') templateCache.set(file, tpl);
  }
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(html);
}

function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function urls() {
  const lan = getLanAddress();
  const ipBase = `http://${lan.address}:${cfg.PORT}`;
  const hostBase = `http://${cfg.MDNS_HOST}:${cfg.PORT}`;
  return {
    lan,
    ipBase,
    hostBase,
    pairUrl: `${ipBase}/pair?t=${state.token}`,
    uploadHost: `${hostBase}/api/upload?t=${state.token}`,
    uploadIp: `${ipBase}/api/upload?t=${state.token}`,
    clipboardHost: `${hostBase}/api/clipboard?t=${state.token}`,
    clipboardIp: `${ipBase}/api/clipboard?t=${state.token}`,
  };
}

// ---------------------------------------------------------------- upload

function finishFile(slot, fileStream) {
  slot.stream = fileStream;
  const task = new Promise((resolve, reject) => {
    fileStream.on('error', reject);
    fileStream.on('close', () => {
      try {
        if (slot.cancelled || !fileStream.writableFinished) {
          try { fs.unlinkSync(slot.part); } catch {}
          throw new Error('Dosya aktarimi tamamlanmadi');
        }
        fs.renameSync(slot.part, slot.full);
        slot.completed = true;
        resolve({ name: slot.name, path: slot.full, size: fs.statSync(slot.full).size });
      } catch (e) {
        reject(e);
      } finally {
        slot.release();
      }
    });
  });
  task.catch(() => {});
  return task;
}

function cleanupSlots(slots) {
  for (const s of slots) {
    s.cancelled = true;
    if (s.stream) s.stream.destroy();
    try { fs.unlinkSync(s.part); } catch { /* not created or already moved */ }
    if (s.completed) { try { fs.unlinkSync(s.full); } catch {} }
    s.release();
  }
}

function handleUpload(req, res, query) {
  const tokenOk = tokenMatches(state.token, query.get('t'));
  if (!tokenOk && !isDesktopRequest(req)) {
    sendJson(res, 401, { ok: false, error: 'Gecersiz eslesme anahtari' });
    return;
  }

  const total = Number(req.headers['content-length']) || null;
  const tracker = transfers.begin({ id: crypto.randomUUID(), total, from: clientLabel(req) });
  const slots = [];
  const pending = [];
  let received = 0;
  let finished = false;

  req.on('data', (chunk) => {
    received += chunk.length;
    tracker.progress(received);
  });

  const fail = (status, message) => {
    if (finished) return;
    finished = true;
    tracker.fail(message);
    cleanupSlots(slots);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: message });
    log(`Aktarim basarisiz (${clientLabel(req)}): ${message}`);
  };

  req.on('aborted', () => fail(499, 'Baglanti istemci tarafindan kesildi'));
  req.on('error', (e) => fail(400, e.message));

  const succeed = (files) => {
    if (finished) return;
    finished = true;
    tracker.done(files);
    sendJson(res, 200, {
      ok: true,
      count: files.length,
      savedFolder: path.basename(cfg.DROP_DIR),
      savedTo: cfg.DROP_DIR,
      files: files.map((f) => ({ name: f.name, size: f.size })),
    });
    const bytes = files.reduce((s, f) => s + f.size, 0);
    log(`Alindi: ${files.length} dosya, ${(bytes / 1048576).toFixed(1)} MB <- ${clientLabel(req)}`);
  };

  const contentType = String(req.headers['content-type'] || '');

  // Mode A: multipart/form-data (Shortcuts "Form" body, Safari <input type=file>).
  if (/^multipart\/form-data/i.test(contentType)) {
    let bb;
    try {
      bb = busboy({ headers: req.headers, defParamCharset: 'utf8', preservePath: false });
    } catch (e) {
      fail(400, e.message);
      return;
    }

    bb.on('file', (_field, stream, info) => {
      const name = storage.resolveName(info.filename, info.mimeType);
      const slot = storage.reserve(cfg.DROP_DIR, name);
      slots.push(slot);
      tracker.addName(slot.name);
      const out = fs.createWriteStream(slot.part);
      pending.push(finishFile(slot, out));
      stream.pipe(out);
    });

    bb.on('error', (e) => fail(400, e.message));
    bb.on('close', () => {
      Promise.all(pending)
        .then((files) => {
          if (!files.length) {
            fail(400, 'Istekte dosya bulunamadi');
            return;
          }
          succeed(files);
        })
        .catch((e) => fail(500, e.message));
    });

    req.pipe(bb);
    return;
  }

  // Mode B: raw body (Shortcuts "File" body). Name from ?name= or X-Filename.
  const headerName = req.headers['x-filename'] ? decodeURIComponent(String(req.headers['x-filename'])) : '';
  const name = storage.resolveName(query.get('name') || headerName, contentType);
  const slot = storage.reserve(cfg.DROP_DIR, name);
  slots.push(slot);
  tracker.addName(slot.name);
  const out = fs.createWriteStream(slot.part);
  const done = finishFile(slot, out);
  req.pipe(out);
  req.on('end', () => {
    done
      .then((file) => {
        if (file.size === 0) {
          try { fs.unlinkSync(file.path); } catch { /* ignore */ }
          fail(400, 'Bos dosya');
          return;
        }
        succeed([file]);
      })
      .catch((e) => fail(500, e.message));
  });
}

// ---------------------------------------------------------------- desktop API

transfers.bus.on('transfer', (t) => {
  broadcastSse('transfer', t);
});
transfers.bus.on('history-cleared', () => broadcastSse('history-cleared', {}));

setInterval(() => {
  for (const res of sseClients) res.write(': keepalive\n\n');
}, 20000).unref();

async function handleStatus(res) {
  const u = urls();
  const qrSvg = await QRCode.toString(u.pairUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#F4F4F5', light: '#00000000' },
  });
  sendJson(res, 200, {
    app: cfg.APP_NAME,
    version: cfg.APP_VERSION,
    port: cfg.PORT,
    host: cfg.MDNS_HOST,
    ip: u.lan.address,
    iface: u.lan.name,
    pairUrl: u.pairUrl,
    uploadHost: u.uploadHost,
    uploadIp: u.uploadIp,
    clipboardHost: u.clipboardHost,
    clipboardIp: u.clipboardIp,
    dropDir: cfg.DROP_DIR,
    defaultDropDir: cfg.DEFAULT_DROP_DIR,
    qrSvg,
    clipboard: clipboard.getLatest(),
    transfers: transfers.list(),
    outbound: outbound.list(),
  });
}

function handleOutboundStage(req, res, query) {
  const contentType = String(req.headers['content-type'] || '');

  if (/^multipart\/form-data/i.test(contentType)) {
    let bb;
    try {
      bb = busboy({ headers: req.headers, defParamCharset: 'utf8', preservePath: false });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
      return;
    }

    const staged = [];
    const pending = [];

    bb.on('file', (_field, stream, info) => {
      pending.push(
        outbound.stage({
          name: info.filename,
          stream,
          mimeType: info.mimeType,
        }).then((item) => staged.push(item))
      );
    });

    bb.on('error', (e) => sendJson(res, 400, { ok: false, error: e.message }));
    bb.on('close', () => {
      Promise.all(pending)
        .then(() => {
          if (!staged.length) {
            sendJson(res, 400, { ok: false, error: 'Istekte dosya bulunamadi' });
            return;
          }
          broadcastSse('toast', staged.length > 1 ? `${staged.length} dosya iPhone için hazırlandı` : `${staged[0].name} iPhone için hazırlandı`);
          sendJson(res, 200, { ok: true, count: staged.length, files: staged });
        })
        .catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
    });

    req.pipe(bb);
    return;
  }

  // Raw body
  const headerName = req.headers['x-filename'] ? decodeURIComponent(String(req.headers['x-filename'])) : '';
  const rawName = query.get('name') || headerName || 'dosya';
  outbound.stage({
    name: rawName,
    stream: req,
    size: Number(req.headers['content-length']) || null,
    mimeType: contentType,
  }).then((item) => {
    broadcastSse('toast', `${item.name} iPhone için hazırlandı`);
    sendJson(res, 200, { ok: true, count: 1, files: [item] });
  }).catch((e) => {
    sendJson(res, 500, { ok: false, error: e.message });
  });
}

function revealInExplorer(target) {
  const safe = path.resolve(target);
  spawn('explorer.exe', [`/select,${safe}`], { detached: true, stdio: 'ignore' }).unref();
}

function openFolder(dir) {
  const safe = path.resolve(dir);
  fs.mkdirSync(safe, { recursive: true });
  spawn('explorer.exe', [safe], { detached: true, stdio: 'ignore' }).unref();
}

function openFile(target) {
  const safe = path.resolve(target);
  spawn('explorer.exe', [safe], { detached: true, stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------- router

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    const origin = req.headers.origin;
    if (p.startsWith('/api/') && (req.headers['sec-fetch-site'] === 'cross-site' ||
        (origin && origin !== `http://${req.headers.host}`))) {
      return sendJson(res, 403, { ok: false, error: 'Cross-origin requests are not allowed' });
    }
    if (p === '/assets/apple-tokens.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      fs.createReadStream(path.join(cfg.PUBLIC_DIR, 'apple-tokens.css')).pipe(res);
      return;
    }
    // --- Static brand icons
    if (p === '/apple-touch-icon.png' || p === '/apple-touch-icon-precomposed.png' || p === '/assets/multios.png') {
      const iconPath = path.join(cfg.PROJECT_ROOT || path.join(__dirname, '..'), 'assets', 'multios.png');
      if (fs.existsSync(iconPath)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        fs.createReadStream(iconPath).pipe(res);
        return undefined;
      }
    }

    if (p === '/favicon.ico') {
      const icoPath = path.join(cfg.PROJECT_ROOT || path.join(__dirname, '..'), 'assets', 'multios.ico');
      if (fs.existsSync(icoPath)) {
        res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
        fs.createReadStream(icoPath).pipe(res);
        return undefined;
      }
    }

    // --- Phone-facing (LAN, token protected)
    if (p === '/api/transfers' && req.method === 'GET') {
      if (!isDesktopRequest(req) && !tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      return sendJson(res, 200, { ok: true, transfers: transfers.list().map(t => ({
        id: t.id, state: t.state, names: t.names, received: t.received,
        files: t.files.map(f => ({ name: f.name, size: f.size })), error: t.error,
      })) });
    }
    if (p === '/api/transfers/clear' && req.method === 'POST') {
      if (!isDesktopRequest(req) && !tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      transfers.clear();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/clipboard/clear' && req.method === 'POST') {
      if (!isDesktopRequest(req) && !tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      clipboard.clear();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/upload' && req.method === 'POST') return handleUpload(req, res, url.searchParams);

    if (p === '/api/ping' && req.method === 'GET') {
      if (!tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      return sendJson(res, 200, { ok: true, app: cfg.APP_NAME, version: cfg.APP_VERSION });
    }

    if (p === '/api/clipboard' && req.method === 'GET') {
      if (!tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      return sendJson(res, 200, { ok: true, item: clipboard.getLatest() });
    }

    if (p === '/api/clipboard' && req.method === 'POST') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!tokenOk) return sendJson(res, 401, { ok: false });
      const contentType = String(req.headers['content-type'] || '');

      if (/^multipart\/form-data/i.test(contentType)) {
        const slots = [];
        const pending = [];
        let finished = false;
        const fail = (code, message) => {
          if (finished) return;
          finished = true;
          cleanupSlots(slots);
          if (!res.destroyed) sendJson(res, code, { ok: false, error: message });
        };
        let bb;
        try {
          bb = busboy({ headers: req.headers, defParamCharset: 'utf8', preservePath: false,
            limits: { files: 1, fileSize: 50 * 1024 * 1024 } });
        } catch {
          return sendJson(res, 400, { ok: false, error: 'Geçersiz görsel isteği' });
        }
        const clipCache = path.join(cfg.DATA_DIR, 'clip_cache');
        fs.mkdirSync(clipCache, { recursive: true });
        req.on('aborted', () => fail(400, 'Görsel aktarımı kesildi'));
        req.on('error', () => fail(400, 'Görsel aktarımı kesildi'));
        bb.on('file', (_field, stream, info) => {
          const ext = path.extname(info.filename).toLowerCase();
          if (finished || !['.png', '.jpg', '.jpeg', '.heic', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(ext)) {
            stream.resume();
            fail(400, 'Bir görsel dosyası seçin');
            return;
          }
          const slot = storage.reserve(clipCache, `clip_phone_${crypto.randomUUID()}${ext}`);
          slots.push(slot);
          stream.on('limit', () => fail(413, 'Pano görseli en fazla 50 MB olabilir'));
          stream.on('error', () => fail(400, 'Görsel aktarımı kesildi'));
          const output = fs.createWriteStream(slot.part);
          pending.push(finishFile(slot, output));
          stream.pipe(output);
        });
        bb.on('filesLimit', () => fail(400, 'Panoya tek bir görsel gönderin'));
        bb.on('error', () => fail(400, 'Görsel aktarımı tamamlanamadı'));
        bb.on('close', async () => {
          try {
            const files = await Promise.all(pending);
            if (finished) return;
            if (files.length !== 1) return fail(400, 'Görsel alınamadı');
            clipboard.setImage(files[0].path);
            finished = true;
            broadcastSse('toast', "iPhone'dan panoya görsel kopyalandı");
            sendJson(res, 200, { ok: true, type: 'image' });
          } catch { fail(400, 'Görsel kaydedilemedi'); }
        });
        req.pipe(bb);
        return;
      }

      let text = '';
      if (contentType.includes('application/json')) {
        const body = await readJsonBody(req);
        text = body.text || '';
      } else {
        text = await new Promise((resolve) => {
          let buf = '';
          req.on('data', (c) => {
            buf += c.toString('utf8');
            if (Buffer.byteLength(buf) > 64 * 1024) { req.destroy(); resolve(''); }
          });
          req.on('aborted', () => resolve(''));
          req.on('error', () => resolve(''));
          req.on('end', () => resolve(buf));
        });
      }
      if (text) {
        clipboard.setText(text);
        broadcastSse('toast', "iPhone'dan pano güncellendi");
        log(`Pano güncellendi <- ${clientLabel(req)}`);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/clipboard/image' && req.method === 'GET') {
      if (!tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      const item = clipboard.getLatest();
      if (item && item.type === 'image' && fs.existsSync(item.path)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        fs.createReadStream(item.path).pipe(res);
        return undefined;
      }
      return sendJson(res, 404, { ok: false, error: 'Panoda gorsel yok' });
    }

    if (p === '/pair' && req.method === 'GET') {
      if (!tokenMatches(state.token, url.searchParams.get('t'))) {
        return sendText(res, 401, 'Eslesme baglantisi gecersiz. Bilgisayardaki QR kodu yeniden okutun.');
      }
      const u = urls();
      return sendHtml(res, renderTemplate('pair.html', {
        APP_NAME: cfg.APP_NAME,
        TOKEN: state.token,
        SHORTCUT_INSTALL: cfg.SHORTCUT_URL ? `<p><a id="installShortcut" class="chip shortcut-link" href="${cfg.SHORTCUT_URL}" target="_blank" rel="noopener noreferrer">Kestirmeyi ekle</a></p>` : '',
        UPLOAD_HOST: u.uploadHost,
        UPLOAD_IP: u.uploadIp,
        CLIPBOARD_HOST: u.clipboardHost,
        CLIPBOARD_IP: u.clipboardIp,
        PC_NAME: require('os').hostname(),
        INITIAL_OUTBOUND: JSON.stringify(outbound.list()).replace(/</g, '\\u003c'),
      }));
    }

    if (p === '/api/outbound' && req.method === 'GET') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      return sendJson(res, 200, { ok: true, files: outbound.list() });
    }

    if (p.startsWith('/api/outbound/thumbnail/') && req.method === 'GET') {
      if (!isDesktopRequest(req) && !tokenMatches(state.token, url.searchParams.get('t'))) return sendJson(res, 401, { ok: false });
      const item = outbound.get(p.slice('/api/outbound/thumbnail/'.length));
      const thumb = item && await media.getThumbnail(item.path, 256);
      if (!thumb || !fs.existsSync(thumb.path)) return sendJson(res, 404, { ok: false });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      fs.createReadStream(thumb.path).pipe(res);
      return;
    }

    if (p.startsWith('/api/outbound/download/') && req.method === 'GET') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      const id = p.slice('/api/outbound/download/'.length);
      const file = outbound.get(id);
      if (!file || !fs.existsSync(file.path)) {
        return sendJson(res, 404, { ok: false, error: 'Dosya bulunamadı' });
      }
      const encoded = encodeURIComponent(file.name);
      res.writeHead(200, {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': file.size,
        'Content-Disposition': `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file.path).pipe(res);
      broadcastSse('toast', `Dosya indirildi: ${file.name}`);
      log(`Dosya indirildi (${clientLabel(req)}): ${file.name}`);
      return undefined;
    }

    if (p === '/api/outbound/stage' && req.method === 'POST') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      return handleOutboundStage(req, res, url.searchParams);
    }

    if (p === '/api/outbound/remove' && req.method === 'POST') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      const body = await readJsonBody(req);
      if (body.id && outbound.remove(body.id)) {
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { ok: false, error: 'Dosya bulunamadi' });
    }

    if (p === '/api/outbound/clear' && req.method === 'POST') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      outbound.clear();
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/events' && req.method === 'GET') {
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return undefined;
    }

    // --- Desktop-only (loopback + local Host)
    if (!isDesktopRequest(req)) return sendText(res, 404, 'Not found');

    if (p === '/' && req.method === 'GET') return sendText(res, 200, 'multiOS runs in the native Windows application. Open the iPhone page using its QR code.');

    if (p === '/api/status' && req.method === 'GET') return handleStatus(res);

    if (p === '/api/shutdown' && req.method === 'POST') {
      sendJson(res, 200, { ok: true });
      setImmediate(shutdownServer);
      return;
    }

    if (p === '/api/pair/qr' && req.method === 'GET') {
      const png = await QRCode.toBuffer(urls().pairUrl, { width: 360, margin: 2 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(png);
    }

    if (p === '/api/clipboard/set' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (typeof body.text === 'string' && body.text) {
        clipboard.setText(body.text);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { ok: false });
    }

    if (p === '/api/receive-folder' && req.method === 'POST') {
      if (transfers.list().some(t => t.state === 'active')) {
        return sendJson(res, 409, { ok: false, error: 'Dosya aktarımı sürerken klasör değiştirilemez' });
      }
      const body = await readJsonBody(req);
      if (typeof body.path !== 'string' || !path.isAbsolute(body.path)) {
        return sendJson(res, 400, { ok: false, error: 'Geçerli bir klasör seçin' });
      }
      const selected = path.resolve(body.path);
      try {
        if (selected === cfg.DEFAULT_DROP_DIR) fs.mkdirSync(selected, { recursive: true });
        if (!fs.statSync(selected).isDirectory()) throw new Error('Klasör bulunamadı');
        const probe = path.join(selected, `.multios-write-${crypto.randomUUID()}`);
        const fd = fs.openSync(probe, 'wx');
        fs.closeSync(fd);
        fs.unlinkSync(probe);
        fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
        const setting = path.join(cfg.DATA_DIR, 'receive-folder.json');
        fs.writeFileSync(`${setting}.tmp`, JSON.stringify({ path: selected }));
        fs.renameSync(`${setting}.tmp`, setting);
        cfg.DROP_DIR = selected;
        cfg.RESTORE_DROP_FILES = selected === cfg.DEFAULT_DROP_DIR;
        return sendJson(res, 200, { ok: true, dropDir: selected });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: 'Bu klasör kullanılamıyor: ' + e.message });
      }
    }

    if (p === '/api/file/open' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const filePath = body.path;
      const isValid = filePath && (
        isReceivedFile(filePath) ||
        storage.isInside(cfg.DATA_DIR, filePath) ||
        storage.isInside(outbound.stagedDir, filePath)
      ) && fs.existsSync(filePath);
      if (!isValid) {
        log(`Dosya acilamadi, gecersiz: ${filePath}`);
        return sendJson(res, 404, { ok: false, error: 'Dosya bulunamadı' });
      }
      log(`Dosya aciliyor: ${filePath}`);
      openFile(filePath);
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/reveal' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const filePath = body.path;
      const isValid = filePath && (
        isReceivedFile(filePath) ||
        storage.isInside(cfg.DATA_DIR, filePath) ||
        storage.isInside(outbound.stagedDir, filePath)
      ) && fs.existsSync(filePath);
      if (!isValid) {
        log(`Klasorde gosterilemedi, gecersiz: ${filePath}`);
        return sendJson(res, 400, { ok: false });
      }
      log(`Klasorde secili gosteriliyor: ${filePath}`);
      revealInExplorer(filePath);
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/open-folder' && req.method === 'POST') {
      log(`Klasor aciliyor: ${cfg.DROP_DIR}`);
      openFolder(cfg.DROP_DIR);
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/file/thumbnail' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      const tokenOk = tokenMatches(state.token, url.searchParams.get('t'));
      if (!isDesktopRequest(req) && !tokenOk) return sendJson(res, 401, { ok: false });

      const isValid = filePath && (
        isReceivedFile(filePath) ||
        storage.isInside(cfg.DATA_DIR, filePath) ||
        storage.isInside(outbound.stagedDir, filePath)
      ) && fs.existsSync(filePath);

      if (!isValid) return sendJson(res, 404, { ok: false, error: 'Dosya bulunamadı' });

      const thumb = await media.getThumbnail(filePath, 128);
      if (thumb && thumb.ok && fs.existsSync(thumb.path)) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        });
        fs.createReadStream(thumb.path).pipe(res);
        return undefined;
      }
      return sendJson(res, 404, { ok: false, error: 'Önizleme üretilemedi' });
    }

    return sendText(res, 404, 'Not found');
  } catch (err) {
    log(`Istek hatasi ${p}: ${err.message}`);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Sunucu hatasi' });
    return undefined;
  }
});

// Large phone videos can take minutes; never time out an active upload.
server.requestTimeout = 0;
server.headersTimeout = 60000;
server.keepAliveTimeout = 5000;

function openDesktopWindow() {
  const child = spawn(path.join(__dirname, 'native', 'multios-tray.exe'), ['--show'], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.on('error', e => log(`Pencere acilamadi: ${e.message}`));
  child.unref();
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`Port ${cfg.PORT} zaten kullaniliyor; muhtemelen ${cfg.APP_NAME} calisiyor. Pencere aciliyor.`);
    if (!SILENT) openDesktopWindow();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  log(`Sunucu hatasi: ${err.message}`);
  process.exit(1);
});

server.listen(cfg.PORT, '0.0.0.0', () => {
  fs.mkdirSync(cfg.DROP_DIR, { recursive: true });
  if (cfg.RESTORE_DROP_FILES) transfers.restoreFiles(cfg.DROP_DIR);
  fs.mkdirSync(cfg.STAGED_DIR, { recursive: true });
  const u = urls();
  const mdns = process.env.MULTIOS_DISABLE_MDNS === '1' ? { stop() {} } : startMdns({ hostname: cfg.MDNS_HOST, getAddress: () => getLanAddress().address, log });
  if (process.env.MULTIOS_DISABLE_CLIPBOARD !== '1') clipboard.start();

  log(`${cfg.APP_NAME} ${cfg.APP_VERSION} hazir`);
  log(`Yerel ag     : ${u.ipBase}  (${u.lan.name})`);
  log(`mDNS         : ${u.hostBase}`);
  log(`Kayit klasoru: ${cfg.DROP_DIR}`);
  log(`Eslesme      : ${u.pairUrl}`);

  if (!SILENT) openDesktopWindow();

  const shutdown = () => {
    clipboard.stop();
    mdns.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  shutdownServer = shutdown;
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
