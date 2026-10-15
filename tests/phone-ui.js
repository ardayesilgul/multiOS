'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'multios-ui-'));
const results = path.join(root, 'test-results');
fs.mkdirSync(results, { recursive: true });
(async () => {
  const server = spawn(process.execPath, ['src/server.js', '--silent'], {
    cwd: root, windowsHide: true, stdio: 'ignore', env: { ...process.env,
      MULTIOS_PORT: '15050', MULTIOS_DATA_DIR: path.join(data, 'data'), MULTIOS_DROP_DIR: path.join(data, 'received'),
      MULTIOS_STAGED_DIR: path.join(data, 'staged'), MULTIOS_DISABLE_CLIPBOARD: '1', MULTIOS_DISABLE_MDNS: '1' },
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (server.exitCode != null) throw new Error('UI test server exited');
      try { if ((await fetch('http://127.0.0.1:15050/api/status')).ok) { ready = true; break; } } catch {}
      await delay(100);
    }
    if (!ready) throw new Error('UI test server startup timeout');
    browser = await chromium.launch({ channel: process.env.MULTIOS_BROWSER_CHANNEL || undefined, headless: true });
    const png = fs.readFileSync(path.join(root, 'assets', 'multios.png'));
    for (const route of ['/api/upload?name=received.png', '/api/outbound/stage?name=outbound.png']) {
      assert.equal((await fetch('http://127.0.0.1:15050' + route, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })).status, 200);
    }
    await fetch('http://127.0.0.1:15050/api/clipboard/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'UI test clipboard' }) });
    const status = await (await fetch('http://127.0.0.1:15050/api/status')).json();
    const token = new URL(status.pairUrl).searchParams.get('t');
    for (const [width, theme] of [[390,'light'],[390,'dark'],[320,'light'],[768,'light']]) {
      const context = await browser.newContext({ viewport:{width,height:844}, colorScheme:theme, reducedMotion:'reduce' });
      await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedSetupAddress = text; } } }));
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:15050/pair?t=' + token);
      await page.getByText('Gönderime hazır', {exact:true}).waitFor();
      await page.locator('.phone-outbound-thumb').first().waitFor();
      await page.waitForFunction(() => { const img=document.querySelector('.phone-outbound-thumb');return img&&img.complete&&img.naturalWidth>0; });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'horizontal overflow');
      const heading = await page.locator('.outbound-heading h2').boundingBox();
      const clear = await page.locator('#clearOutbound').boundingBox();
      assert.ok(heading.x + heading.width <= clear.x, 'outbound heading overlaps clear button');
      await page.screenshot({path:path.join(results,`phone-${width}-${theme}.png`),fullPage:true});
      await page.getByRole('link', { name: 'Pano', exact: true }).click();
      assert.equal(new URL(page.url()).hash, '#clipboardSection');
      assert.equal(await page.locator('#phoneSendInput').isVisible(),true);
      await page.getByText('Paylaş menüsü kurulumu', {exact:true}).click();
      assert.equal(await page.getByRole('link', { name: 'Kestirmeyi ekle' }).getAttribute('href'), 'https://www.icloud.com/shortcuts/73bf54d1bfc74ac1a0f248b9bd378d9a');
      assert.ok(await page.locator('#copy').evaluate(el => !!(el.compareDocumentPosition(document.getElementById('installShortcut')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'copy step must precede installation');
      await page.locator('#copy').click();
      assert.equal(await page.evaluate(() => window.copiedSetupAddress), await page.locator('#url').textContent());
      assert.ok((await page.locator('#copyStatus').textContent()).includes('kurulum sorusuna'));
      await page.locator('#seg button[data-mode="ip"]').click();
      assert.equal(await page.locator('#seg button[data-mode="ip"]').getAttribute('aria-pressed'), 'true');
      assert.ok((await page.locator('#addressHint').textContent()).includes('IP değişirse'));
      await page.locator('#copy').click();
      const ipAddress = new URL(await page.evaluate(() => window.copiedSetupAddress));
      assert.equal(ipAddress.hostname, status.ip);
      assert.equal(ipAddress.searchParams.get('t'), token);
      await page.locator('#seg button[data-mode="host"]').click();
      assert.ok((await page.locator('#addressHint').textContent()).includes('Önerilen'));
      await page.locator('#copy').click();
      const hostnameAddress = new URL(await page.evaluate(() => window.copiedSetupAddress));
      assert.equal(hostnameAddress.hostname, 'multios.local');
      assert.equal(hostnameAddress.searchParams.get('t'), token);
      if (width === 320) {
        await page.evaluate(() => {
          navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); };
          document.execCommand = () => false;
        });
        await page.locator('#copy').click();
        assert.ok((await page.locator('#copyStatus').textContent()).includes('Otomatik kopyalanamadı'));
        assert.equal(await page.locator('#copy').textContent(), 'Adresi kopyala');
      }
      console.log(`PASS shortcut setup ${width}px ${theme}: copy first, installation question, hostname/IP guidance`);
      await page.getByText('Kestirmeyi elle oluştur', { exact: true }).click();
      await page.screenshot({ path: path.join(results, `setup-${width}-${theme}.png`), fullPage: true });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'expanded overflow');
      assert.deepEqual(errors,[]);
      if (width === 768) {
        await page.getByText('Gönderim geçmişi', {exact:true}).click();
        await page.locator('#clearReceived').click();
        await page.getByText('Geçmiş boş', { exact:true }).waitFor();
        await page.locator('#clearClipboard').click();
        await page.getByText('Bilgisayarda bir metin veya görsel kopyaladığınızda burada görünür.', { exact:true }).waitFor();
        assert.equal(await page.locator('#phoneClipCopy').isDisabled(), true);
        assert.equal(await page.locator('#clearClipboard').isDisabled(), true);
        await page.locator('#clearOutbound').click();
        await page.locator('#outboundEmpty').waitFor({state:'visible'});
        assert.equal(await page.locator('#clearOutbound').isDisabled(), true);
        console.log('PASS phone received, outbound and clipboard clear controls');
      }
      console.log(`PASS phone ${width}px ${theme}: thumbnail, panels, no overflow or script errors`);
      if (width===390 && theme==='light') {
        assert.equal(await page.locator('#phoneSendBtn').isDisabled(), true);
        await page.locator('#phoneClipCopy').click();
        assert.ok((await page.locator('#clipFeedback').textContent()).includes('telefon panosuna'));
        const message = 'Birinci satır...\nİkinci satır ve bağlantı: https://example.com';
        await page.locator('#phoneSendInput').fill(message);
        await page.locator('#phoneSendBtn').click();
        await page.getByText('Metin Windows panosuna gönderildi.', { exact: true }).waitFor();
        assert.equal((await (await fetch('http://127.0.0.1:15050/api/clipboard?t=' + token)).json()).item.text, message);
        await page.locator('#phoneClipCopy').click();
        assert.equal(await page.evaluate(() => window.copiedSetupAddress), message, 'text containing ellipsis is copyable');
        await page.route('**/api/clipboard?*', route => route.request().method() === 'POST'
          ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Bilgisayar meşgul' }) }) : route.continue());
        await page.locator('#phoneSendInput').fill('Gönderilemeyen metin korunmalı');
        await page.locator('#phoneSendBtn').click();
        await page.getByText('Bilgisayar meşgul', { exact: true }).waitFor();
        assert.equal(await page.locator('#phoneSendInput').inputValue(), 'Gönderilemeyen metin korunmalı');
        assert.equal(await page.locator('#phoneSendBtn').isEnabled(), true);
        await page.unroute('**/api/clipboard?*');
        await page.locator('#phoneSendBtn').click();
        await page.getByText('Metin Windows panosuna gönderildi.', { exact: true }).waitFor();
        await page.waitForFunction(() => document.getElementById('phoneSendInput').value === '');
        await page.locator('#phoneClipPhotoInput').setInputFiles(path.join(root, 'assets', 'multios.png'));
        await page.getByText('Görsel Windows panosuna gönderildi.', { exact: true }).waitFor();
        assert.ok(!(await page.locator('#phoneClipText').textContent()).includes('undefined'));
        assert.equal(await page.locator('#phoneClipCopy').isVisible(), false);
        assert.equal(await page.locator('#phoneClipDownload').isVisible(), true);
        await page.locator('#photos').setInputFiles(path.join(root,'assets','multios.png'));
        await page.locator('#saveBadge.show').waitFor();
        assert.ok((await page.locator('#savedLocation').textContent()).includes(status.dropDir));
        assert.equal(await page.locator('#photos').isEnabled(), true);
        await page.route('**/api/upload?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Bilgisayar meşgul' }) }));
        await page.locator('#file').setInputFiles(path.join(root,'assets','multios.png'));
        await page.locator('#retryUpload').waitFor({ state: 'visible' });
        assert.ok((await page.locator('#pSub').textContent()).includes('Bilgisayar meşgul'));
        await page.unroute('**/api/upload?*');
        await page.locator('#retryUpload').click();
        await page.locator('#saveBadge.show').waitFor();
        assert.equal(await page.locator('#retryUpload').isVisible(), false);
        await page.screenshot({ path: path.join(results, 'phone-upload-and-clipboard.png'), fullPage: true });
        const [download] = await Promise.all([page.waitForEvent('download'),page.locator('.phone-outbound-dl').first().click()]);
        await download.saveAs(path.join(results,'downloaded.png'));
        console.log('PASS photo/file upload and retry; clipboard copy, multiline text, error recovery and image feedback');
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    if (server.exitCode == null) {
      const closed = once(server, 'exit');
      try { await fetch('http://127.0.0.1:15050/api/shutdown', { method: 'POST' }); } catch { server.kill(); }
      await closed;
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
