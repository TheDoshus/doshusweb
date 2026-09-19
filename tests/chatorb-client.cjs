#!/usr/bin/env node
// Execute the real realtime client in a hermetic browser/Firebase boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function boot({authFails = false} = {}) {
  const events = [], updates = [], listeners = new Map(), records = new Map();
  const handles = new Map();
  let serial = 0;
  function ref(name) {
    if (handles.has(name)) return handles.get(name);
    const handle = {
      on: (event, callback) => { listeners.set(name, callback); },
      off: () => listeners.delete(name),
      once: async () => ({exists: () => records.has(name), val: () => records.get(name)}),
      set: async (data) => { records.set(name, data); updates.push([name, data]); },
      update: async (data) => { updates.push([name, data]); },
      push: () => ({key: 'input_' + (++serial)}),
      orderByChild: () => handle,
      limitToLast: () => handle,
      child: (child) => ref(name + '/' + child),
    };
    handles.set(name, handle);
    return handle;
  }
  const database = () => ({ref});
  database.ServerValue = {TIMESTAMP: {'.sv': 'timestamp'}};
  const local = new Map();
  const window = {location: {pathname: '/zephyy'},
    dispatchEvent: (event) => events.push(event)};
  const context = {window, firebase: {initializeApp: () => {}, database,
    auth: () => ({signInAnonymously: async () => {
      if (authFails) throw new Error('disabled');
      return {user: {uid: 'alice'}};
    }})},
    document: {readyState: 'complete', getElementById: () => null},
    localStorage: {getItem: (k) => local.get(k), setItem: (k, v) => local.set(k, v)},
    crypto: {randomUUID: () => 'session_' + (++serial)},
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    fetch: async () => ({ok: true, json: async () => ({projectId: 'test'})}),
    setTimeout: (fn) => Promise.resolve().then(fn), console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/zephyy-realtime.js'), 'utf8'), context);
  for (let i = 0; i < 15; i++) await Promise.resolve();
  return {window, events, updates, listeners, records};
}

(async () => {
  const live = await boot();
  const api = live.window.__zpRealtime;
  assert.ok(api, 'auth success wires the real chat API');
  const base = 'zephyy/chat/ownedSessions/' + api.sessionId;
  assert.equal(live.records.get(base).owner, 'alice');
  await api.sendMessage('first');
  const update = live.updates.at(-1)[1];
  assert.ok(update.updatedAt, 'activity index is updated in the same write as input');
  assert.ok(Object.keys(update).some(k => k.startsWith('messages/')));
  await assert.rejects(api.sendMessage('x'.repeat(2001)));
  const callback = live.listeners.get(base + '/messages');
  const batch = {reply_z: {role: 'assistant', content: 'earlier', timestamp: 1000, model: 'm1'},
    reply_a: {role: 'assistant', content: 'later', timestamp: 2000, model: 'm2'}};
  callback({val: () => batch});
  callback({val: () => batch});
  assert.deepEqual(live.events.filter(e => e.type === 'zephyy-msg').map(e => e.detail.content), ['earlier', 'later']);
  const pending = api.sendMessage('old session');
  api.resetSession();
  await assert.rejects(pending, /Session changed/);
  callback({val: () => ({rogue: {role: 'assistant', content: 'stale', timestamp: 3000}})});
  assert.equal(live.events.filter(e => e.type === 'zephyy-msg').length, 2, 'old listener cannot inject after reset');
  const failed = await boot({authFails: true});
  assert.equal(failed.window.__zpRealtime, undefined);
  assert.ok(failed.events.some(e => e.type === 'zephyy-chat-error'));
  console.log('PASS: auth wiring, atomic input, input limits, batched replies, dedupe, ordering, reset race, auth failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
