'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
fs.mkdirSync(results, { recursive: true });

async function verify(theme, appRoot, port) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'multios-native-'));
  const env = { ...process.env, MULTIOS_PORT: String(port), MULTIOS_DATA_DIR: path.join(data, 'data'),
    MULTIOS_DROP_DIR: path.join(data, 'received'), MULTIOS_STAGED_DIR: path.join(data, 'staged'), MULTIOS_DISABLE_MDNS: '1' };
  delete env.MULTIOS_DISABLE_CLIPBOARD;
  const serverArgs = [path.join(root, 'tests/fixtures/server.js'), path.join(appRoot, 'src/server.js'), '--silent'];
  if (process.argv.includes('--real-network')) serverArgs.push('--real-network');
  const server = spawn(process.execPath, serverArgs, { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  const exited = once(server, 'exit');
  let app;
  try {
    let ready = false;
    for (let i = 0; i < 70; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/status`)).ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error('Native test service exited');
      await delay(100);
    }
    if (!ready) throw new Error('Native test service startup timeout');
    const output = path.join(results, `native-${theme}-${port}.png`);
    for (const suffix of ['.error.txt', '.checks.txt']) fs.rmSync(output + suffix, { force: true });
    const args = ['--show', '--small', '--capture', output, '--verify'];
    if (theme === 'dark') args.push('--dark');
    app = spawn(path.join(appRoot, 'src/native/multios-tray.exe'), args, { cwd: root, env, windowsHide: true, stdio: 'ignore' });
    await Promise.race([once(app, 'exit'), delay(45000, null, { ref: false }).then(() => { throw new Error('Native test timed out'); })]);
    if (fs.existsSync(output + '.error.txt')) throw new Error(fs.readFileSync(output + '.error.txt', 'utf8'));
    const checks = fs.readFileSync(output + '.checks.txt', 'utf8');
    await exited;
    let stopped = false;
    try { await fetch(`http://127.0.0.1:${port}/api/status`); } catch { stopped = true; }
    if (!stopped) throw new Error('Service remained running after tray exit');
    console.log(`PASS ${theme}: ${checks}; service stopped`);
  } finally {
    if (app && app.exitCode === null) app.kill();
    if (server.exitCode === null) { server.kill(); await exited; }
  }
}

(async () => {
  const appRoot = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : root;
  for (const [i, theme] of ['light', 'dark'].entries()) await verify(theme, appRoot, 15120 + i);
})().catch(error => { console.error(error); process.exitCode = 1; });
