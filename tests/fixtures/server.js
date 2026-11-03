'use strict';
const path = require('node:path');
const processes = require('node:child_process');
const fs = require('node:fs');
const spawn = processes.spawn;
const server = path.resolve(process.argv[2] || 'src/server.js');
processes.spawn = function (file, args, options) {
  if (path.basename(file).toLowerCase() === 'multios-clip.exe')
    return spawn(process.execPath, [path.join(__dirname, 'clipboard.js')], options);
  return spawn(file, args, options);
};
const network = require(path.join(path.dirname(server), 'network'));
const originalAddress = network.getLanAddress;
const networkFile = path.join(process.env.MULTIOS_DATA_DIR, 'test-network.json');
const override = () => fs.existsSync(networkFile) ? JSON.parse(fs.readFileSync(networkFile, 'utf8')) : null;
network.getLanAddress = () => { const data = override(); return data ? data.lan : originalAddress(); };
if (!process.argv.includes('--real-network'))
  network.getNetworkProfile = async () => { const data = override(); return data ? data.profile : { category: 'Private', firewall: true }; };
require(server);
