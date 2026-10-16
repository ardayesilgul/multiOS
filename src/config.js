'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'multiOS';
const APP_SLUG = 'multios';
const APP_VERSION = require('../package.json').version;

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const dataDir = process.env.MULTIOS_DATA_DIR || path.join(appData, APP_NAME);
const defaultDropDir = path.join(os.homedir(), 'Downloads', APP_NAME);
const shortcutUrl = process.env.MULTIOS_SHORTCUT_URL || 'https://www.icloud.com/shortcuts/73bf54d1bfc74ac1a0f248b9bd378d9a';
let savedDropDir;
try {
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'receive-folder.json'), 'utf8'));
  if (typeof saved.path === 'string' && path.isAbsolute(saved.path)) savedDropDir = saved.path;
} catch { /* first launch */ }

module.exports = {
  APP_NAME,
  APP_SLUG,
  APP_VERSION,
  PORT: Number(process.env.MULTIOS_PORT) || 5050,
  MDNS_HOST: `${APP_SLUG}.local`,
  DATA_DIR: dataDir,
  DEFAULT_DROP_DIR: defaultDropDir,
  DROP_DIR: process.env.MULTIOS_DROP_DIR || savedDropDir || defaultDropDir,
  RESTORE_DROP_FILES: !!process.env.MULTIOS_DROP_DIR || !savedDropDir || savedDropDir === defaultDropDir,
  STAGED_DIR: process.env.MULTIOS_STAGED_DIR || path.join(appData, APP_NAME, 'staged'),
  SHORTCUT_URL: /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i.test(shortcutUrl) ? shortcutUrl : '',
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  PROJECT_ROOT: path.join(__dirname, '..'),
};
