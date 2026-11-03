'use strict';
const readline = require('node:readline');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const [command, id, encoded] = line.split(' ');
  if (!command.startsWith('SET_')) return;
  const value = Buffer.from(encoded, 'base64').toString('utf8');
  if (value === 'test:helper-exit') return process.exit(1);
  if (value === 'test:helper-timeout') return;
  process.stdout.write(JSON.stringify({ type: 'set_ok', id: 'unrelated-request' }) + '\n');
  const type = value === 'test:helper-error' ? 'set_err' : 'set_ok';
  setTimeout(() => process.stdout.write(JSON.stringify({ type, id }) + '\n'), 150);
});
