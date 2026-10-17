#!/usr/bin/env node
// Execute the real realtime client in a hermetic browser/Firebase boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function boot({auth = {fails: false}, chatCache = false, blocked = false} = {}) {
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
  const windowListeners = new Map();
  const window = {
    location: {pathname: '/zephyy'},
    zephyyHasConvo: () => chatCache,
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    dispatchEvent: (event) => {
      events.push(event);
      (windowListeners.get(event.type) || []).forEach(fn => fn(event));
    },
  };
  const scripts = [], streams = [], intervals = [];
  // Status streams over Server-Sent Events; the SDK (stubbed here) is a script the client injects
  function EventSource(url) { this.url = url; this.handlers = {}; streams.push(this); }
  EventSource.prototype.addEventListener = function (type, fn) { this.handlers[type] = fn; };
  // The SDK exists once its scripts have loaded, as in a browser
  const firebase = {apps: [], initializeApp(config) { this.apps.push(config); }, database,
    auth: () => ({signInAnonymously: async () => {
      if (auth.fails) throw new Error('disabled');
      return {user: {uid: 'alice'}};
    }})};
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) {
      const el = {
        id,
        className: '',
        textContent: '',
        dataset: {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        classList: {
          add: (c) => { el.className = (el.className ? el.className + ' ' : '') + c; },
          remove: (c) => { el.className = el.className.replace(new RegExp('\\b' + c + '\\b', 'g'), '').trim(); },
          toggle: (c, force) => {},
        },
        querySelector: (sel) => {
          if (sel === '.st-svc-dot') {
            if (!el._dot) el._dot = { className: 'st-svc-dot loading' };
            return el._dot;
          }
          if (sel === '.st-svc-label') {
            if (!el._label) el._label = { className: 'st-svc-label loading', textContent: '—' };
            return el._label;
          }
          return null;
        },
      };
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const context = {window, EventSource,
    document: {
      readyState: 'complete',
      hidden: false,
      body: { dataset: {}, addEventListener: () => {} },
      addEventListener: () => {},
      getElementById,
      querySelectorAll: () => [],
      createElement: () => ({
        append: () => {},
        appendChild: () => {},
        setAttribute: () => {},
        classList: { add: () => {} },
        style: { setProperty: () => {} },
      }),
      head: {appendChild: (script) => {
        scripts.push(script.src);
        const part = script.src.match(/firebase-(\w+)-compat/)[1]; // each script brings its own piece
        if (part === 'app') context.firebase = {apps: firebase.apps, initializeApp: firebase.initializeApp};
        else context.firebase[part] = firebase[part];
        Promise.resolve().then(script.onload);
      }}},
    localStorage: {getItem: (k) => local.get(k), setItem: (k, v) => local.set(k, v)},
    crypto: {randomUUID: () => 'session_' + (++serial)},
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    fetch: async () => ({ok: true, json: async () => ({projectId: 'test'})}),
    prefersReducedMotion: false,
    haptic: () => {},
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    Date,
    console,
  };
  // Storage blocked (cookies off, some private windows): reading localStorage at all throws
  if (blocked) Object.defineProperty(context, 'localStorage', {get() { throw new Error('Access is denied for this document.'); }});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/zephyy-live.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/zephyy-pages.js'), 'utf8'), context);
  const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  await settle();
  return {window, events, updates, listeners, records, scripts, streams, settle, elements, intervals};
}

(async () => {
  const live = await boot();
  assert.equal(live.window.__zpStaleMs, 120000, 'exports unified STALE_MS');
  assert.deepEqual(live.scripts, [], 'a visitor who never chats loads no SDK');
  const [status] = live.streams;
  assert.match(status.url, /\/zephyy\/status\.json$/);
  const now = new Date().toISOString();
  status.handlers.put({data: JSON.stringify({path: '/', data: {
    lastHeartbeat: now,
    online: true,
    mood: 'calm',
    workingOn: 'Building tests',
    services: {ws: 'active', orb: 'active', gateway: 'active', embed: 'active', aether: 'active'},
  }})});
  assert.equal(live.elements.get('svc-dot-ws').className, 'zp-service-dot online', 'fresh service is online in profile');
  const wsCard = live.elements.get('svc-ws');
  assert.equal(wsCard.querySelector('.st-svc-dot').className, 'st-svc-dot online', 'fresh service is online on status page');
  assert.equal(wsCard.querySelector('.st-svc-label').textContent, 'active', 'fresh service label is active on status page');
  assert.equal(wsCard.querySelector('.st-svc-label').className, 'st-svc-label', 'fresh service label has no off class');
  assert.equal(live.elements.get('st-online-text').textContent, 'ONLINE');
  assert.equal(live.elements.get('gw-zephyy-status').textContent, 'online');
  assert.equal(live.elements.get('st-working-on').textContent, 'Building tests');
  assert.equal(live.elements.get('st-mood').textContent, 'calm');
  assert.equal(live.elements.get('st-beat-live-detail').textContent, 'All clear — services nominal. Heartbeat fresh.');

  // SHOULD 3: fresh beat with an inactive service reports degraded
  status.handlers.patch({data: JSON.stringify({path: '/services', data: {ws: 'inactive'}})});
  assert.equal(wsCard.querySelector('.st-svc-dot').className, 'st-svc-dot offline');
  assert.equal(wsCard.querySelector('.st-svc-label').textContent, 'inactive');
  assert.equal(live.elements.get('st-beat-live-detail').textContent, 'Degraded — one or more services inactive. Heartbeat fresh.', 'inactive service reports degraded, not all clear');

  // SHOULD 3: fresh beat with online:false reports gateway offline, not heartbeat stale
  status.handlers.patch({data: JSON.stringify({path: '/', data: {online: false}})});
  assert.equal(live.elements.get('st-beat-live-detail').textContent, 'Gateway offline — heartbeat fresh.', 'online:false reports gateway offline');
  assert.equal(live.elements.get('st-online-text').textContent, 'OFFLINE');

  // Restore online state and update mood
  status.handlers.patch({data: JSON.stringify({path: '/', data: {online: true}})});
  status.handlers.put({data: JSON.stringify({path: '/mood', data: 'focused'})});
  const latest = live.window.__zpLatestStatus;
  assert.equal(latest.online, true);
  assert.equal(latest.fresh, true);
  assert.deepEqual([latest.data.mood, latest.data.services.ws, latest.data.services.orb], ['focused', 'inactive', 'active'], 'puts replace, patches merge');
  status.handlers.patch({data: JSON.stringify({path: '/services', data: {orb: null}})});
  assert.equal('orb' in live.window.__zpLatestStatus.data.services, false, 'null removes a key, as in Firebase');

  // SHOULD 1 & 2: Stale document marks status card stale (offline dot, 'stale' text, 'off' class) and workingOn/mood stale
  const stale = new Date(Date.now() - 300000).toISOString();
  status.handlers.put({data: JSON.stringify({path: '/', data: {
    lastHeartbeat: stale,
    online: true,
    mood: 'focused',
    workingOn: 'Building tests',
    services: {ws: 'active', gateway: 'active'},
  }})});
  assert.equal(live.window.__zpLatestStatus.online, false, 'stale heartbeat marks offline');
  assert.equal(live.window.__zpLatestStatus.fresh, false, 'stale heartbeat marks fresh false');
  assert.equal(live.elements.get('svc-dot-ws').className, 'zp-service-dot offline', 'service dot gates on freshness');
  assert.equal(wsCard.querySelector('.st-svc-dot').className, 'st-svc-dot offline', 'stale status card dot is offline (fails if isFresh removed)');
  assert.equal(wsCard.querySelector('.st-svc-label').textContent, 'stale', 'stale status card label is stale (fails if isFresh removed)');
  assert.equal(wsCard.querySelector('.st-svc-label').className, 'st-svc-label off', 'stale status card label has off class (fails if isFresh removed)');
  assert.equal(live.elements.get('st-online-text').textContent, 'STALE');
  assert.equal(live.elements.get('gw-zephyy-status').textContent, 'stale');
  assert.equal(live.elements.get('st-working-on').textContent, 'Building tests (stale)', 'stale workingOn marked stale');
  assert.equal(live.elements.get('st-mood').textContent, 'focused (stale)', 'stale mood marked stale');
  assert.equal(live.elements.get('st-beat-live-detail').textContent, 'Heartbeat stale — gateway may be sleeping or restarting.');

  // NIT 3: Stale document without services transitions a green profile dot offline
  status.handlers.put({data: JSON.stringify({path: '/', data: {lastHeartbeat: now, online: true, services: {ws: 'active'}}})});
  assert.equal(live.elements.get('svc-dot-ws').className, 'zp-service-dot online', 'service dot is online when fresh');
  status.handlers.put({data: JSON.stringify({path: '/', data: {lastHeartbeat: stale, online: true}})});
  assert.equal(live.elements.get('svc-dot-ws').className, 'zp-service-dot offline', 'stale document without services transitions green dot offline (fails if guarded by data.services)');

  // SHOULD 1: Minute timer in zephyy-pages.js re-runs applyStatus and marks newly expired service stale
  const nearExpiry = new Date(Date.now() - 100000).toISOString(); // 100s old (< 120s threshold)
  status.handlers.put({data: JSON.stringify({path: '/', data: {lastHeartbeat: nearExpiry, online: true, services: {ws: 'active'}}})});
  assert.equal(wsCard.querySelector('.st-svc-dot').className, 'st-svc-dot online', 'active service is online initially before expiry');
  assert.equal(wsCard.querySelector('.st-svc-label').textContent, 'active');
  const origNow = Date.now;
  Date.now = () => origNow() + 30000; // advance clock by 30s => 130s old (> 120s threshold)
  try {
    const minuteTimer = live.intervals.find(i => i.ms === 60000);
    assert.ok(minuteTimer, 'minute timer registered at 60 s interval');
    minuteTimer.fn(); // fires the 60s timer which re-runs applyStatus()
    assert.equal(wsCard.querySelector('.st-svc-dot').className, 'st-svc-dot offline', 'minute timer transitions expired service dot to offline');
    assert.equal(wsCard.querySelector('.st-svc-label').textContent, 'stale', 'minute timer transitions expired service label to stale');
  } finally {
    Date.now = origNow;
  }

  status.handlers.put({data: JSON.stringify({path: '/', data: {lastHeartbeat: now, online: true, services: {ws: 'active'}}})});
  await live.window.__zpConnect();
  assert.equal(live.scripts.length, 3, 'the chat loads app, database and auth once');
  await live.window.__zpConnect();
  assert.equal(live.scripts.length, 3);
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
  const auth = {fails: true};
  const failed = await boot({auth, chatCache: true});
  assert.equal(failed.scripts.length, 3, 'a conversation going connects at load');
  assert.equal(failed.window.__zpRealtime, undefined);
  await assert.rejects(failed.window.__zpConnect(), /disabled/, 'a failed connect rejects');
  auth.fails = false;
  assert.ok(await failed.window.__zpConnect(), 'and the next ask tries again');
  assert.equal(failed.scripts.length, 3, 'without loading the SDK twice');
  const blocked = await boot({blocked: true});
  assert.ok(await blocked.window.__zpConnect(), 'storage blocked: the chat still connects');
  assert.ok(blocked.window.__zpRealtime.sessionId, 'with a session for this visit');
  console.log('PASS: no SDK until chat, status stream put/patch/null, one connection, auth wiring, atomic input, input limits, batched replies, dedupe, ordering, reset race, auth failure and retry, storage blocked');
})().catch(error => { console.error(error); process.exitCode = 1; });
