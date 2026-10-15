'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./config');

const STATE_FILE = path.join(DATA_DIR, 'state.json');

function newToken() {
  return crypto.randomBytes(16).toString('base64url');
}

function loadState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    state = {};
  }
  if (typeof state.token !== 'string' || state.token.length < 16) {
    state.token = newToken();
    state.createdAt = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }
  return state;
}

function tokenMatches(expected, given) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { loadState, tokenMatches, STATE_FILE };
