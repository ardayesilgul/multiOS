'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const testDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'multios-api-'));
const drop = path.join(testDir, 'received');
const staged = path.join(testDir, 'staged');
const base = 'http://127.0.0.1:15051';
let server;
async function start(dropOverride = true) {
  const env = { ...process.env, MULTIOS_PORT: '15051', MULTIOS_DATA_DIR: path.join(testDir, 'data'), MULTIOS_DROP_DIR: drop, MULTIOS_STAGED_DIR: staged, MULTIOS_DISABLE_CLIPBOARD: '1', MULTIOS_DISABLE_MDNS: '1' };
  if (!dropOverride) delete env.MULTIOS_DROP_DIR;
  server = spawn(process.execPath, ['src/server.js', '--silent'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env,
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/api/status'); if (r.ok) return; } catch {}
    if (server.exitCode != null) throw new Error('Server exited');
    await delay(100);
  }
  throw new Error('Server startup timeout');
}
async function stop() {
  if (!server || server.exitCode != null) return;
  const closed = once(server, 'exit');
  try { await fetch(base + '/api/shutdown', { method: 'POST' }); }
  catch { server.kill(); }
  await closed;
}
async function request(url, options) { const response = await fetch(base + url, options); assert.equal(response.status, 200, url); return response.json(); }
async function test(name, fn) { await fn(); console.log('PASS ' + name); }
async function foreign(url, method = 'GET', body = '') {
  return new Promise((resolve, reject) => { const req = http.request(base + url, { method, headers: { Host: 'phone.example:15051' } }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, bytes: Buffer.concat(chunks) }));
  }); req.on('error', reject); req.end(body); });
}
(async () => {
  fs.mkdirSync(drop, { recursive: true }); fs.mkdirSync(staged, { recursive: true });
  const legacyId = require('node:crypto').randomUUID();
  fs.writeFileSync(path.join(drop, 'legacy-photo.png'), fs.readFileSync(path.join(root, 'assets', 'multios.png')));
  fs.writeFileSync(path.join(staged, legacyId + '_legacy-outbound.png'), fs.readFileSync(path.join(root, 'assets', 'multios.png')));
  await start();
  const status = await request('/api/status');
  const token = new URL(status.pairUrl).searchParams.get('t');
  const png = fs.readFileSync(path.join(root, 'assets', 'multios.png'));
  await test('existing received files are recovered without a history index', async () => { assert.ok(status.transfers.some(t => t.files.some(f => f.name === 'legacy-photo.png'))); });
  await test('old UUID-prefixed outbound files are recovered without a queue index', async () => { assert.ok(status.outbound.some(f => f.id === legacyId && f.name === 'legacy-outbound.png')); });
  await test('pair QR is a real PNG', async () => {
    const r = await fetch(base + '/api/pair/qr'); assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()).subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  });
  await test('photo share multipart preserves bytes and resolves duplicate names', async () => {
    const body = new FormData(); body.append('file', new Blob([png], { type:'image/png' }), 'photo.png'); body.append('file', new Blob([png], { type:'image/png' }), 'photo.png');
    const j = await request('/api/upload?t=' + token, { method:'POST', body }); assert.equal(j.count, 2); assert.notEqual(j.files[0].name, j.files[1].name);
    for (const file of j.files) assert.deepEqual(fs.readFileSync(path.join(drop, file.name)), png);
  });
  await test('unpaired devices cannot upload or modify the clipboard', async () => {
    for (const route of ['/api/upload?name=unauthorized.txt', '/api/clipboard']) {
      assert.equal((await foreign(route, 'POST')).status, 401);
      assert.equal((await foreign(route + (route.includes('?') ? '&' : '?') + 't=invalid', 'POST')).status, 401);
    }
    assert.equal(fs.existsSync(path.join(drop, 'unauthorized.txt')), false);
  });
  await test('paired phone uploads and clipboard updates work without re-pairing', async () => {
    assert.equal((await foreign('/api/upload?name=paired.txt&t=' + token, 'POST', 'paired phone')).status, 200);
    assert.equal((await foreign('/api/clipboard?t=' + token, 'POST', 'paired clipboard')).status, 200);
    assert.equal((await request('/api/clipboard?t=' + token)).item.text, 'paired clipboard');
  });
  await test('removed desktop features are no longer served', async () => {
    for (const route of ['/api/autostart', '/api/shortcut', '/api/file/convert', '/api/file/preview']) {
      assert.equal((await fetch(base + route)).status, 404);
      assert.equal((await fetch(base + route, { method: 'POST' })).status, 404);
    }
    assert.ok(!(await (await fetch(base + '/')).text()).includes('<html'));
  });
  await test('foreign browser origins cannot access local APIs', async () => {
    for (const headers of [{ Origin: 'https://example.com' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      assert.equal((await fetch(base + '/api/status', { headers })).status, 403);
      assert.equal((await fetch(base + '/api/clipboard?t=' + token, { method: 'POST', headers, body: 'blocked' })).status, 403);
    }
    assert.equal((await fetch(base + '/api/status', { headers: { Origin: base } })).status, 200);
  });
  const outbound = await request('/api/outbound/stage?name=outbound.png', { method:'POST', headers:{'Content-Type':'image/png'}, body:png });
  const id = outbound.files[0].id;
  await test('phone thumbnail uses file ID and validates token', async () => {
    assert.equal(outbound.files[0].path, undefined);
    assert.equal((await foreign('/api/outbound/thumbnail/' + id)).status, 401);
    const r = await foreign('/api/outbound/thumbnail/' + id + '?t=' + token); assert.equal(r.status, 200); assert.ok(r.bytes.length > 100);
  });
  await test('aborted uploads leave no partial files and server stays healthy', async () => {
    await new Promise(resolve => {
      const req = http.request(base + '/api/upload?name=aborted.bin', { method:'POST', headers:{'Content-Length':10000000} });
      req.on('error', () => resolve()); req.write(Buffer.alloc(64000)); setTimeout(() => req.destroy(), 100);
    });
    await delay(300); assert.ok(!fs.existsSync(path.join(drop,'aborted.bin'))); assert.ok(!fs.readdirSync(drop).some(f=>f.endsWith('.multios-part'))); await request('/api/status');
  });
  await test('outbound queue and completed history survive service restart', async () => {
    await stop(); await start();
    const s = await request('/api/status'); assert.equal(new URL(s.pairUrl).searchParams.get('t'), token); assert.ok(s.outbound.some(f=>f.id===id)); assert.ok(s.transfers.some(t=>t.state==='done'&&t.files.some(f=>f.name==='photo.png')));
    const r = await fetch(base + '/api/outbound/download/' + id + '?t=' + token); assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
  });
  await test('phone page and Apple token stylesheet render without unresolved templates', async () => {
    const r = await fetch(base + '/pair?t=' + token); const html=await r.text(); assert.equal(r.status,200); assert.ok(!html.includes('{{')); assert.ok(html.includes('secondary-panel')); assert.ok(html.includes('https://www.icloud.com/shortcuts/73bf54d1bfc74ac1a0f248b9bd378d9a')); assert.equal((await fetch(base+'/assets/apple-tokens.css')).status,200);
  });
  await test('phone clear endpoints require pairing authorization', async () => {
    for (const route of ['/api/transfers/clear','/api/clipboard/clear','/api/outbound/clear']) {
      const response = await foreign(route, 'POST'); assert.equal(response.status,401);
    }
  });
  await test('clipboard images are complete before publication and reject multiple files', async () => {
    const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), 'clipboard.png');
    await request('/api/clipboard?t=' + token, { method: 'POST', body });
    const image = await request('/api/clipboard?t=' + token);
    assert.equal(image.item.type, 'image');
    assert.deepEqual(fs.readFileSync(image.item.path), png);
    const multiple = new FormData();
    for (const name of ['one.png', 'two.png']) multiple.append('file', new Blob([png], { type: 'image/png' }), name);
    assert.equal((await fetch(base + '/api/clipboard?t=' + token, { method: 'POST', body: multiple })).status, 400);
    await delay(100);
    assert.equal((await request('/api/clipboard?t=' + token)).item.path, image.item.path);
    assert.ok(!fs.readdirSync(path.join(testDir, 'data', 'clip_cache')).some(f => f.endsWith('.multios-part')));
  });
  await test('clipboard record can be cleared repeatedly without changing the OS clipboard', async () => {
    await request('/api/clipboard?t='+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'isolated clipboard test'})});
    await request('/api/clipboard/clear?t='+token,{method:'POST'});
    const fingerprint = JSON.parse(fs.readFileSync(path.join(testDir,'data','cleared-clipboard.json'),'utf8'));
    assert.ok(fingerprint);
    await request('/api/clipboard/clear?t='+token,{method:'POST'});
    assert.equal(JSON.parse(fs.readFileSync(path.join(testDir,'data','cleared-clipboard.json'),'utf8')),fingerprint);
    assert.equal((await request('/api/clipboard?t='+token)).item,null);
  });
  await test('cleared received history stays empty after restart and original files are preserved', async () => {
    const before = fs.readFileSync(path.join(drop,'photo.png'));
    await request('/api/transfers/clear?t='+token,{method:'POST'});
    assert.equal((await request('/api/transfers?t='+token)).transfers.length,0);
    await stop();await start();assert.equal((await request('/api/transfers?t='+token)).transfers.length,0);
    assert.deepEqual(fs.readFileSync(path.join(drop,'photo.png')),before);
    await request('/api/upload?name=new-after-clear.txt',{method:'POST',body:'new'});
    assert.equal((await request('/api/transfers?t='+token)).transfers.length,1);
  });
  await test('outbound clear removes staged copies, preserves originals and stays empty after restart', async () => {
    await request('/api/outbound/clear?t='+token,{method:'POST'});
    assert.equal((await request('/api/outbound?t='+token)).files.length,0);assert.deepEqual(fs.readFileSync(path.join(root,'assets','multios.png')),png);
    await stop();await start();assert.equal((await request('/api/outbound?t='+token)).files.length,0);
  });
  await test('custom receive folder handles new files and persists without losing earlier history', async () => {
    const chosen = path.join(testDir, 'Desktop-like-folder');
    fs.mkdirSync(chosen);
    fs.writeFileSync(path.join(chosen, 'unrelated.txt'), 'already on desktop');
    assert.equal((await foreign('/api/receive-folder', 'POST')).status, 404);
    const changed = await request('/api/receive-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: chosen }) });
    assert.equal(changed.dropDir, chosen);
    await request('/api/upload?name=chosen.txt', { method: 'POST', body: 'saved in chosen folder' });
    assert.equal(fs.readFileSync(path.join(chosen, 'chosen.txt'), 'utf8'), 'saved in chosen folder');
    assert.equal((await request('/api/status')).dropDir, chosen);
    assert.ok(!(await request('/api/status')).transfers.some(t => t.files.some(f => f.name === 'unrelated.txt')));
    const older = await fetch(base + '/api/file/thumbnail?path=' + encodeURIComponent(path.join(drop, 'new-after-clear.txt')));
    assert.equal(older.status, 200);
    await stop(); await start(false);
    assert.equal((await request('/api/status')).dropDir, chosen);
    assert.ok(!(await request('/api/status')).transfers.some(t => t.files.some(f => f.name === 'unrelated.txt')));
    await request('/api/upload?name=after-restart.txt', { method: 'POST', body: 'persistent' });
    assert.equal(fs.readFileSync(path.join(chosen, 'after-restart.txt'), 'utf8'), 'persistent');
  });
  console.log('All checks passed. Test data: ' + testDir);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(stop);
