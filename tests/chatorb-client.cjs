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

  testMemeCatalogChecks();
  await testMemeAndStarters();
  await testProposalCards();
  await testFiveArchitecturalRepros();

  console.log('PASS: no SDK until chat, status stream put/patch/null, one connection, auth wiring, atomic input, input limits, batched replies, dedupe, ordering, reset race, auth failure and retry, storage blocked, meme rendering, page-aware starters, adversarial defense, proposal cards & suggestions contract, full orb lifecycle & mutant verification');
})().catch(error => { console.error(error); process.exitCode = 1; });

function testMemeCatalogChecks() {
  const checkPath = path.join(__dirname, '../scripts/check.js');
  const catalogPath = path.join(__dirname, '../public/assets/memes/meme-catalog.json');
  const listPath = path.join(__dirname, '../public/assets/memes/meme-list.json');
  const source = fs.readFileSync(checkPath, 'utf8');
  const localRequire = require('node:module').createRequire(checkPath);
  function checkMutation(target, mutate) {
    const fakeFs = Object.assign({}, fs, { readFileSync(file, ...args) {
      const result = fs.readFileSync(file, ...args);
      if (path.resolve(String(file)) !== target) return result;
      const copy = JSON.parse(String(result));
      mutate(copy);
      return JSON.stringify(copy);
    }});
    const context = { require: (name) => name === 'fs' ? fakeFs : localRequire(name),
      module: { exports: {} }, __dirname: path.dirname(checkPath), console, process };
    vm.runInNewContext(source, context, { filename: checkPath });
    return context.module.exports.CHECKS['meme catalog is well-formed']();
  }
  const mutations = [
    [listPath, (x) => { x[0] = '/assets/memes/nonexistent.webp'; }],
    [catalogPath, (x) => { x.items[0].tags = ['invented-tag']; }],
    [catalogPath, (x) => { x.items[0].extra = 'not in canonical schema'; }],
    [catalogPath, (x) => { x.items[0] = null; }],
    [catalogPath, (x) => { x.items = []; }]
  ];
  assert.equal(checkMutation(catalogPath, () => {}).length, 0, 'unmodified generated catalog passes');
  const rejected = mutations.map(([target, mutate]) => checkMutation(target, mutate).length > 0);
  assert.deepEqual(rejected, mutations.map(() => true), 'complete catalog/list drift is rejected without writing project data');
}

function buildHarness(sourceCode) {
  const elements = new Map();
  const activeObservers = [];

  function notifyMutation(target, type, attrName) {
    for (const obs of activeObservers) {
      if (obs.target === target && type === 'attributes' && obs.options && obs.options.attributes) {
        if (!obs.options.attributeFilter || obs.options.attributeFilter.includes(attrName)) {
          obs.callback([{ target, type: 'attributes', attributeName: attrName }]);
        }
      }
    }
  }

  function makeEl(id, tag = 'div') {
    const children = [];
    const listeners = {};
    const el = {
      _id: id,
      parentNode: null,
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      attributes: {},
      style: {},
      children: children,
      childNodes: children,
      listeners,
      value: '',
      disabled: false,
      get id() { return el._id; },
      set id(v) { el._id = v; elements.set(v, el); },
      get textContent() {
        if (el._textContent !== undefined) return el._textContent;
        if (children.length > 0) return children.map(c => c.textContent).join('');
        return '';
      },
      set textContent(val) {
        el._textContent = String(val);
        children.length = 0;
      },
      get firstChild() { return children[0] || null; },
      get lastChild() { return children[children.length - 1] || null; },
      set innerHTML(val) {
        el._innerHTML = val;
        if (typeof val === 'string' && val.includes('zp-thinking-text')) {
          const span = makeEl('thinking_text_' + Math.random(), 'span');
          span.className = 'zp-thinking-text';
          el.appendChild(span);
        }
      },
      get innerHTML() { return el._innerHTML || ''; },
      setAttribute: (k, v) => {
        el.attributes[k] = String(v);
        if (k.startsWith('data-')) el.dataset[k.slice(5)] = String(v);
      },
      getAttribute: (k) => el.attributes[k] || (el.dataset && el.dataset[k.replace(/^data-/, '')] !== undefined ? el.dataset[k.replace(/^data-/, '')] : null),
      classList: {
        add: (c) => {
          if (!el.classList.contains(c)) {
            el.className = (el.className ? el.className + ' ' : '') + c;
            notifyMutation(el, 'attributes', 'class');
          }
        },
        remove: (c) => {
          if (el.classList.contains(c)) {
            el.className = el.className.replace(new RegExp('\\b' + c + '\\b', 'g'), '').trim();
            notifyMutation(el, 'attributes', 'class');
          }
        },
        contains: (c) => el.className.split(/\s+/).includes(c),
        toggle: (c, force) => {
          const has = el.classList.contains(c);
          const add = force !== undefined ? force : !has;
          if (add) el.classList.add(c); else el.classList.remove(c);
          return el.classList.contains(c);
        }
      },
      appendChild: (ch) => {
        if (ch.parentNode) ch.parentNode.removeChild(ch);
        children.push(ch);
        ch.parentNode = el;
        return ch;
      },
      prepend: (ch) => {
        if (ch.parentNode) ch.parentNode.removeChild(ch);
        children.unshift(ch);
        ch.parentNode = el;
        return ch;
      },
      insertBefore: (ch, ref) => {
        if (ch.parentNode) ch.parentNode.removeChild(ch);
        const idx = children.indexOf(ref);
        if (idx >= 0) children.splice(idx, 0, ch);
        else children.push(ch);
        ch.parentNode = el;
        return ch;
      },
      removeChild: (ch) => {
        const idx = children.indexOf(ch);
        if (idx >= 0) {
          children.splice(idx, 1);
          ch.parentNode = null;
        }
        return ch;
      },
      remove: () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      },
      addEventListener: (type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      },
      click: () => {
        if (el.disabled) return;
        (listeners.click || []).forEach(fn => fn({ isTrusted: true, stopPropagation: () => {} }));
      },
      focus: () => {}
    };

    function matchNode(node, sel) {
      if (!node || !node.tagName) return false;
      sel = sel.trim();
      if (sel.startsWith('#')) return node.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const parts = sel.split(/\[|\:/);
        const cls = parts[0].slice(1);
        if (!node.classList.contains(cls)) return false;
        if (sel.includes('[data-content]')) return node.dataset && node.dataset.content !== undefined;
        return true;
      }
      const attrM = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=([^\]]+))?\]$/);
      if (attrM) {
        const val = node.getAttribute(attrM[1]);
        if (attrM[2] !== undefined) return val === attrM[2].replace(/^["']|["']$/g, '');
        return val !== null;
      }
      return node.tagName.toLowerCase() === sel.toLowerCase();
    }

    function queryAll(root, sel) {
      const res = [];
      const tokens = sel.trim().split(/\s+/);
      if (tokens.length > 1) {
        let current = [root];
        for (const tok of tokens) {
          const next = [];
          for (const c of current) next.push(...queryAll(c, tok));
          current = next;
        }
        return current;
      }
      function walk(node) {
        if (!node.childNodes) return;
        for (const child of node.childNodes) {
          if (matchNode(child, sel)) res.push(child);
          walk(child);
        }
      }
      walk(root);
      return res;
    }

    el.querySelector = (sel) => queryAll(el, sel)[0] || null;
    el.querySelectorAll = (sel) => queryAll(el, sel);
    if (id) elements.set(id, el);
    return el;
  }

  const orb = makeEl('zp-orb-demo');
  const panel = makeEl('zp-chat-panel');
  const closeBtn = makeEl('zp-chat-close');
  const messagesEl = makeEl('zp-chat-messages');
  const inputEl = makeEl('zp-chat-input', 'input');
  const sendBtn = makeEl('zp-chat-send', 'button');
  const backdrop = makeEl('zp-chat-backdrop');
  const welcomeMsg = makeEl('zp-welcome-msg');
  welcomeMsg.className = 'zp-chat-msg zp-chat-msg-bot zp-chat-welcome';
  messagesEl.appendChild(welcomeMsg);

  const windowListeners = new Map();
  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  const timers = [];
  const win = {
    location: { pathname: '/', href: 'https://doshus.net/' },
    addEventListener: (t, fn) => {
      if (!windowListeners.has(t)) windowListeners.set(t, []);
      windowListeners.get(t).push(fn);
    },
    dispatchEvent: (evt) => {
      const list = windowListeners.get(evt.type) || [];
      for (const fn of list) fn(evt);
      return true;
    },
    haptic: () => {},
    zephyyWhorl: () => '<svg></svg>',
    __zpConnect: null
  };

  const doc = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeEl('auto_' + Math.random(), tag),
    addEventListener: () => {},
    body: makeEl('body')
  };

  const ctx = {
    window: win, document: doc, console, navigator: { maxTouchPoints: 0 },
    URL, Date,
    setTimeout: (fn, ms) => { const t = { fn, ms: ms || 0, id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimeout: (id) => { const idx = timers.findIndex(t => t.id === id); if (idx >= 0) timers.splice(idx, 1); },
    setInterval: () => {},
    localStorage,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    MutationObserver: function(callback) {
      this.callback = callback;
      this.observe = (target, options = {}) => { activeObservers.push({ target, options, callback }); };
      this.disconnect = () => {};
    }
  };

  function drainTimers() { while (timers.length > 0) { timers.shift().fn(); } }

  vm.runInNewContext(sourceCode, ctx);

  return {
    win,
    doc,
    elements,
    orb,
    panel,
    messagesEl,
    inputEl,
    sendBtn,
    localStorage,
    drainTimers,
    CustomEvent: ctx.CustomEvent
  };
}

async function testMemeAndStarters() {
  const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');
  const h = buildHarness(orbSource);

  assert.ok(h.win.__zpTest, 'zephyy-orb.js exports __zpTest');
  const { renderContent, parseMediaUrl, getOrderedStarters } = h.win.__zpTest;

  // 1. Stash image markdown -> rendered as canonical RELATIVE path, neutral stash attribution, NO "Generated by Zephyy", NO "Copy prompt"
  const stashImgHtml = renderContent('Here is a meme: ![A cool cat](https://doshus.net/assets/memes/20230607_060826.webp)');
  assert.match(stashImgHtml, /<img src="\/assets\/memes\/20230607_060826\.webp"/, 'stash image rendered as canonical relative path');
  assert.match(stashImgHtml, /alt="A cool cat"/);
  assert.match(stashImgHtml, /<span class="zp-chat-stash-desc">A cool cat<\/span>/, 'stash image visible description rendered');
  assert.match(stashImgHtml, /<span>Doshus\.NET Meme Stash<\/span>/);
  assert.doesNotMatch(stashImgHtml, /Generated by Zephyy/);
  assert.doesNotMatch(stashImgHtml, /Copy prompt/);
  assert.doesNotMatch(stashImgHtml, /data-zpli/);

  // 2. Stash video markdown -> <video controls playsinline preload="metadata"> rendered as canonical relative path, NO autoplay, NO auto-unmute
  const stashVidHtml = renderContent('Watch this: ![Funny dog](https://doshus.net/assets/memes/1687785524275.mp4)');
  assert.match(stashVidHtml, /<video controls playsinline preload="metadata" class="zp-chat-video zp-chat-stash-video" src="\/assets\/memes\/1687785524275\.mp4" aria-label="Funny dog">/, 'stash video rendered as canonical relative path with controls');
  assert.doesNotMatch(stashVidHtml, /autoplay/i);
  assert.doesNotMatch(stashVidHtml, /muted/i);
  assert.match(stashVidHtml, /<span class="zp-chat-stash-desc">Funny dog<\/span>/, 'stash video visible description rendered');
  assert.match(stashVidHtml, /<span>Doshus\.NET Meme Stash<\/span>/);
  assert.doesNotMatch(stashVidHtml, /Generated by Zephyy/);
  assert.doesNotMatch(stashVidHtml, /Copy prompt/);

  // 3. Percent-encoded filenames with parentheses and brackets
  const encodedHtml = renderContent('![Instagram](https://doshus.net/assets/memes/Screenshot_20260226_053636_Instagram%281%29.webp)');
  assert.match(encodedHtml, /Screenshot_20260226_053636_Instagram%281%29\.webp/);
  assert.match(encodedHtml, /<span class="zp-chat-stash-desc">Instagram<\/span>/);
  assert.match(encodedHtml, /<span>Doshus\.NET Meme Stash<\/span>/);

  const bracketHtml = renderContent('![Bracket](https://doshus.net/assets/memes/clip%5B1%5D.mp4)');
  assert.match(bracketHtml, /<video controls playsinline preload="metadata"/);
  assert.match(bracketHtml, /clip%5B1%5D\.mp4/);
  assert.match(bracketHtml, /aria-label="Bracket"/);
  assert.match(bracketHtml, /<span class="zp-chat-stash-desc">Bracket<\/span>/);
  assert.match(bracketHtml, /<span>Doshus\.NET Meme Stash<\/span>/);

  // Relative path /assets/memes/...
  const relImgHtml = renderContent('![Local](/assets/memes/20230607_060826.webp)');
  assert.match(relImgHtml, /<img src="\/assets\/memes\/20230607_060826\.webp"/);
  assert.match(relImgHtml, /<span>Doshus\.NET Meme Stash<\/span>/);

  // Preview domain host (doshusweb--preview.web.app) -> rendered as canonical relative path for media-src 'self'
  h.win.location.origin = 'https://doshusweb--preview-12345.web.app';
  const prevImgHtml = renderContent('![Preview](https://doshusweb--preview-12345.web.app/assets/memes/20230607_060826.webp)');
  assert.match(prevImgHtml, /<img src="\/assets\/memes\/20230607_060826\.webp"/, 'preview host rendered as canonical relative path');
  assert.match(prevImgHtml, /<span>Doshus\.NET Meme Stash<\/span>/);
  h.win.location.origin = 'https://doshus.net';

  // 4. Generated image (non-stash) -> retains "Generated by Zephyy", data-zpli for lightbox, and "Copy prompt"
  const genDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const genHtml = renderContent('Here is your art: ![Cosmic glow](' + genDataUri + ')');
  assert.match(genHtml, /<span>Generated by Zephyy<\/span>/);
  assert.match(genHtml, /data-zpli="zpli\d+"/);
  assert.match(genHtml, /<button type="button" class="zp-chat-img-copy" data-zpli="zpli\d+">Copy prompt<\/button>/);

  // Safe extensionless HTTP image renders in generated image branch
  const extlessHtml = renderContent('![Starfield](https://example.com/render?prompt=starfield)');
  assert.match(extlessHtml, /<img src="https:\/\/example\.com\/render\?prompt=starfield"/);
  assert.match(extlessHtml, /<span>Generated by Zephyy<\/span>/);

  assert.equal(parseMediaUrl('/assets/memes/100%25.webp')?.url, '/assets/memes/100%25.webp', 'encoded literal percent remains a valid filename');
  const signedImage = 'https://example.com/render?sig=a%2Fb%252Fc&note=..%5C';
  assert.equal(parseMediaUrl(signedImage)?.url, signedImage, 'opaque signed query is not decoded or path-validated');

  // 5. Adversarial tests:
  // Defect 1: Attacker .web.app host -> rejected
  const evilWebApp = renderContent('![evil](https://unrelated-attacker.web.app/assets/memes/clip.mp4)');
  assert.doesNotMatch(evilWebApp, /<figure/);
  assert.doesNotMatch(evilWebApp, /<video/);
  assert.doesNotMatch(evilWebApp, /<img/);

  // Userinfo and unowned ports -> rejected
  const userInfoHtml = renderContent('![userinfo](https://user:pass@doshus.net/assets/memes/clip.mp4)');
  assert.doesNotMatch(userInfoHtml, /<figure/);
  assert.doesNotMatch(userInfoHtml, /<video/);

  const unownedPortHtml = renderContent('![port](https://doshus.net:8443/assets/memes/clip.mp4)');
  assert.doesNotMatch(unownedPortHtml, /<figure/);
  assert.doesNotMatch(unownedPortHtml, /<video/);

  // Defect 2: Traversal attacks rejected at canonical URL gate before either branch
  const relTrav1 = renderContent('![hack](/assets/memes/%2e%2E/%2e%2E/private.mp4)');
  assert.doesNotMatch(relTrav1, /<figure/);
  assert.doesNotMatch(relTrav1, /<video/);
  assert.doesNotMatch(relTrav1, /<img/);

  const relTrav2 = renderContent('![hack](/assets/memes/%2e%2e%2fprivate.mp4)');
  assert.doesNotMatch(relTrav2, /<figure/);
  assert.doesNotMatch(relTrav2, /<video/);

  const relTrav3 = renderContent('![hack](/assets/memes/%252e%252e/private.mp4)');
  assert.doesNotMatch(relTrav3, /<figure/);
  assert.doesNotMatch(relTrav3, /<video/);

  // Absolute traversal must NOT fall into generated image branch
  const absTrav = renderContent('![hack](https://evil.com/../traversal.jpg)');
  assert.doesNotMatch(absTrav, /<figure/);
  assert.doesNotMatch(absTrav, /<img/);

  const slashTrav = renderContent('![hack](https://doshus.net/assets/memes/foo\\bar.jpg)');
  assert.doesNotMatch(slashTrav, /<figure/);
  assert.doesNotMatch(slashTrav, /<img/);

  // Javascript URI attack: javascript:alert(1) -> NOT rendered as media
  const jsHtml = renderContent('![xss](javascript:alert(1))');
  assert.doesNotMatch(jsHtml, /<figure/);
  assert.doesNotMatch(jsHtml, /<img/);

  // Arbitrary external video: https://evil.com/video.mp4 -> NOT rendered as video
  const extVidHtml = renderContent('![bad video](https://evil.com/video.mp4)');
  assert.doesNotMatch(extVidHtml, /<video/);

  // Data video URI: data:video/mp4;base64,... -> NOT rendered
  const dataVidHtml = renderContent('![data vid](data:video/mp4;base64,AAAA)');
  assert.doesNotMatch(dataVidHtml, /<video/);

  // XSS injection in alt text: properly escaped
  const xssAltHtml = renderContent('![<script>alert("xss")</script>](https://doshus.net/assets/memes/20230607_060826.webp)');
  assert.doesNotMatch(xssAltHtml, /<script>/);
  assert.match(xssAltHtml, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);

  // Malicious quoted alt text: quotes and tags remain escaped in both aria-label and visible caption
  const malAltHtml = renderContent('!["quote" & <script>alert(1)</script>](https://doshus.net/assets/memes/1687785524275.mp4)');
  assert.doesNotMatch(malAltHtml, /<script>/);
  assert.match(malAltHtml, /aria-label="&quot;quote&quot; &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(malAltHtml, /<span class="zp-chat-stash-desc">&quot;quote&quot; &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/);

  // 6. Page-aware starters:
  h.win.location.pathname = '/';
  const homeStarters = getOrderedStarters().map(s => s.label);
  assert.equal(homeStarters.length, 6);
  assert.ok(homeStarters.includes('Make a Printmon theme'));
  assert.ok(homeStarters.includes('Money, minus the myths'));
  assert.ok(homeStarters.includes('Give me a quick game'));
  assert.ok(homeStarters.includes('Show me something wild'));
  assert.ok(homeStarters.includes('Find me a tech shortcut'));
  assert.ok(homeStarters.includes('Send me a meme'));

  h.win.location.pathname = '/financehub';
  assert.equal(getOrderedStarters()[0].label, 'Money, minus the myths');

  h.win.location.pathname = '/nexus';
  assert.equal(getOrderedStarters()[0].label, 'Find me a tech shortcut');

  h.win.location.pathname = '/thelounge';
  assert.equal(getOrderedStarters()[0].label, 'Give me a quick game');

  h.win.location.pathname = '/amazon/printmon/gallery';
  assert.equal(getOrderedStarters()[0].label, 'Make a Printmon theme');

  // 7. Defect 5: Driving Actual Open, Send, Forget through harness
  let sends = [];
  let resets = 0;
  h.win.__zpConnect = async () => ({
    sendMessage: async (txt) => { sends.push(txt); },
    loadHistory: async () => ({ exists: () => false }),
    resetSession: () => { resets++; }
  });

  // A. DRIVE ACTUAL OPEN VIA orb.click()
  assert.equal(h.panel.classList.contains('open'), false, 'panel initially closed');
  h.orb.click(); // Triggers togglePanel()
  assert.equal(h.panel.classList.contains('open'), true, 'panel opened after click');
  h.drainTimers();
  for (let i = 0; i < 20; i++) await Promise.resolve();

  // PROVE ZERO SEND ON OPEN
  assert.equal(sends.length, 0, 'ZERO send/model calls made on opening panel');

  // B. DRIVE FIRST SEND WITHOUT NAME
  const startersRow = h.messagesEl.querySelector('#zp-starters-row');
  assert.ok(startersRow, 'starters row rendered');
  assert.equal(h.messagesEl.querySelector('#zp-name-input-row'), null, 'no name gate in UI');

  const memeBtn = startersRow.querySelector('[data-starter="meme"]');
  assert.ok(memeBtn, 'meme starter chip found');
  memeBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(sends, ['Send me a meme'], 'first send executes immediately with starter text without forcing a name prompt');

  // C. DRIVE FORGET
  h.localStorage.setItem('zp-visitor-id', 'visitor-xyz-789');
  h.localStorage.setItem('zp-chat-cache', JSON.stringify([{ role: 'user', content: 'hello' }]));
  assert.ok(h.messagesEl.querySelectorAll('.zp-chat-msg-user').length > 0, 'user messages exist in DOM before forget');

  h.win.dispatchEvent(new h.CustomEvent('zephyy-ctrl', { detail: { visitorForget: true } }));
  h.drainTimers();
  for (let i = 0; i < 20; i++) await Promise.resolve();

  // PROVE FORGET CLEARS IDENTITY, UI, AND RESET STATE
  assert.equal(h.localStorage.getItem('zp-visitor-id'), null, 'forget removes visitor ID from localStorage');
  assert.equal(h.localStorage.getItem('zp-chat-cache'), null, 'forget removes cached chat from localStorage');
  assert.equal(h.messagesEl.querySelectorAll('.zp-chat-msg-user').length, 0, 'forget clears user messages from UI');
  assert.equal(h.messagesEl.firstChild, h.elements.get('zp-welcome-msg'), 'welcome message restored to head');
  assert.ok(resets > 0, 'forget executes rt.resetSession()');

  // Mutants count only when the intended behavioral assertion fails.
  // Harness/setup/runtime errors must propagate as failed verification.
  async function requireBehaviorFailure(exercise, message) {
    await assert.rejects(exercise, (error) => error instanceof assert.AssertionError &&
      error.code === 'ERR_ASSERTION' && error.message.split('\n')[0] === message);
  }
  for (const error of [new Error('setup crash'), new assert.AssertionError({ message: 'setup assertion' })]) {
    await assert.rejects(() => requireBehaviorFailure(async () => { throw error; }, 'ZERO send on open'), assert.AssertionError);
  }

  const mutant1Code = orbSource.replace('function togglePanel() {', 'function togglePanel() { send("mutant rogue send");');
  assert.notEqual(mutant1Code, orbSource, 'model-send mutation was inserted');
  await requireBehaviorFailure(async () => {
    const mh1 = buildHarness(mutant1Code);
    const sends = [];
    mh1.win.__zpConnect = async () => ({
      sendMessage: async (m) => { sends.push(m); },
      loadHistory: async () => ({ exists: () => false }),
      resetSession: () => {}
    });
    mh1.orb.click();
    mh1.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(sends.length, 0, 'ZERO send on open');
  }, 'ZERO send on open');

  const mutant2Code = orbSource.replace('if (ctrl.visitorForget === true) {', 'if (false && ctrl.visitorForget === true) {');
  assert.notEqual(mutant2Code, orbSource, 'forget mutation was inserted');
  await requireBehaviorFailure(async () => {
    const mh2 = buildHarness(mutant2Code);
    mh2.win.__zpConnect = async () => ({
      sendMessage: async () => {},
      loadHistory: async () => ({ exists: () => false }),
      resetSession: () => {}
    });
    mh2.localStorage.setItem('zp-visitor-id', 'test-visitor');
    mh2.win.dispatchEvent(new mh2.CustomEvent('zephyy-ctrl', { detail: { visitorForget: true } }));
    mh2.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(mh2.localStorage.getItem('zp-visitor-id'), null, 'identity cleared');
  }, 'identity cleared');
}

async function testProposalCards() {
  const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');
  const h = buildHarness(orbSource);

  assert.ok(h.win.__zpTest, 'zephyy-orb.js exports __zpTest');
  const { renderProposalCard, renderSuggestions } = h.win.__zpTest;

  // 1. Direct unit verification of metadata contract and pure functions
  // A. Non-object, null, array, string proposal -> returns null
  assert.equal(renderProposalCard(null), null);
  assert.equal(renderProposalCard('invalid'), null);
  assert.equal(renderProposalCard([]), null);

  // B. Missing or empty required fields -> returns null
  assert.equal(renderProposalCard({ id: '', title: 'Title', confirmMessage: 'c', cancelMessage: 'x', editMessage: 'e', expiresAt: Date.now() + 1000 }), null);
  assert.equal(renderProposalCard({ id: '1', title: '', confirmMessage: 'c', cancelMessage: 'x', editMessage: 'e', expiresAt: Date.now() + 1000 }), null);
  assert.equal(renderProposalCard({ id: '1', title: 'T', confirmMessage: '', cancelMessage: 'x', editMessage: 'e', expiresAt: Date.now() + 1000 }), null);
  assert.equal(renderProposalCard({ id: '1', title: 'T', confirmMessage: 'c', cancelMessage: '', editMessage: 'e', expiresAt: Date.now() + 1000 }), null);
  assert.equal(renderProposalCard({ id: '1', title: 'T', confirmMessage: 'c', cancelMessage: 'x', editMessage: null, expiresAt: Date.now() + 1000 }), null);

  // C. Suggestions contract: max 2, filters invalid
  assert.equal(renderSuggestions(null), null);
  assert.equal(renderSuggestions([]), null);
  assert.equal(renderSuggestions([{ label: '', message: 'msg' }]), null);
  assert.equal(renderSuggestions([{ label: 'Valid', message: '' }]), null);
  const excessSugs = renderSuggestions([
    { label: 'One', message: 'm1' },
    { label: 'Two', message: 'm2' },
    { label: 'Three', message: 'm3' }
  ]);
  assert.equal(excessSugs.querySelectorAll('button').length, 2, 'max 2 suggestions rendered');

  // 2. Integration with Event Harness & UI lifecycle
  let sends = [];
  let resets = 0;
  h.win.__zpConnect = async () => ({
    sendMessage: async (txt) => { sends.push(txt); },
    loadHistory: async () => ({ exists: () => false }),
    resetSession: () => { resets++; }
  });

  // Open panel via actual click
  h.orb.click();
  h.drainTimers();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends.length, 0, 'ZERO sends on opening panel');

  // 3. User message spoofing actionProposal -> NO proposal card rendered
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'user',
      content: 'I want to propose something',
      timestamp: Date.now(),
      actionProposal: {
        id: 'spoof',
        title: 'Spoofed Proposal',
        summary: 'Should not render',
        confirmMessage: '/confirm_spoof',
        cancelMessage: '/cancel_spoof',
        editMessage: '',
        expiresAt: Date.now() + 60000
      }
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.messagesEl.querySelectorAll('.zp-proposal-card').length, 0, 'no action card rendered on user messages');

  // 4. Assistant message with valid proposal card
  const now = Date.now();
  const proposal1 = {
    id: 'prop-img-1',
    title: 'Create image',
    summary: 'Cybernetic white wolf howling on a neon asteroid',
    confirmMessage: 'opaque_confirm_token_abc_123',
    cancelMessage: 'opaque_cancel_token_xyz_789',
    editMessage: 'Cybernetic white wolf howling on an asteroid',
    expiresAt: now + 60000,
    // Server private validation fields: MUST be ignored
    kind: 'image_gen',
    payload: { prompt: 'wolf' },
    owner: 'server',
    session: 'sess-1'
  };

  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'I can render this for you. Here is the proposal:',
      timestamp: now,
      actionProposal: proposal1,
      suggestions: [
        { label: 'Another idea', message: 'Give me another idea' },
        { label: 'Make it a theme', message: 'Turn this into a theme' }
      ]
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  // PROVE RENDER PRODUCES ZERO SENDS
  assert.equal(sends.length, 0, 'ZERO sends on rendering assistant proposal card and suggestions');

  // Verify Card elements and text content
  const card1 = h.messagesEl.querySelector('.zp-proposal-card');
  assert.ok(card1, 'proposal card rendered in DOM');
  assert.equal(card1.dataset.proposalId, 'prop-img-1');
  assert.equal(card1.querySelector('.zp-proposal-head').textContent, 'Create image');
  assert.equal(card1.querySelector('.zp-proposal-summary').textContent, 'Cybernetic white wolf howling on a neon asteroid');

  const confirmBtn = card1.querySelector('.zp-proposal-confirm');
  const editBtn = card1.querySelector('.zp-proposal-edit');
  const cancelBtn = card1.querySelector('.zp-proposal-cancel');
  assert.ok(confirmBtn, 'confirm button exists');
  assert.ok(editBtn, 'edit button exists');
  assert.ok(cancelBtn, 'cancel button exists');
  assert.equal(confirmBtn.textContent, 'Create image');
  assert.equal(confirmBtn.disabled, false, 'confirm button initially enabled');
  assert.equal(editBtn.disabled, false, 'edit button initially enabled');
  assert.equal(cancelBtn.disabled, false, 'cancel button initially enabled');

  // 5. Test Edit button: prefills input, sets focus, ZERO sends, leaves card active
  editBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.inputEl.value, 'Cybernetic white wolf howling on an asteroid', 'Edit button prefills input with editMessage');
  assert.equal(sends.length, 0, 'Edit button produces ZERO network sends');
  assert.equal(confirmBtn.disabled, false, 'Card remains active after Edit click');

  // Clear input draft
  h.inputEl.value = '';

  // 6. Test Create button: calls existing send path with EXACT opaque confirmMessage
  confirmBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(sends, ['opaque_confirm_token_abc_123'], 'Create calls existing send path with EXACT confirmMessage');
  assert.equal(confirmBtn.disabled, true, 'Confirm button disabled after click');
  assert.equal(editBtn.disabled, true, 'Edit button disabled after confirm');
  assert.equal(cancelBtn.disabled, true, 'Cancel button disabled after confirm');
  assert.equal(card1.classList.contains('zp-proposal-disabled'), true, 'Card has disabled class');

  // 7. Double-click protection: second click does NOT send again
  confirmBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends.length, 1, 'Double click does NOT send again');

  // 8. Test Cancel button on a new proposal
  const proposal2 = {
    id: 'prop-theme-2',
    title: 'Build theme',
    summary: 'Cosmic emerald aurora theme for Printmon',
    confirmMessage: 'confirm_theme_tok_456',
    cancelMessage: 'cancel_theme_tok_999',
    editMessage: 'Cosmic emerald theme',
    expiresAt: Date.now() + 60000
  };
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'Here is your theme proposal:',
      timestamp: Date.now(),
      actionProposal: proposal2
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const allCards = h.messagesEl.querySelectorAll('.zp-proposal-card');
  const card2 = allCards[allCards.length - 1];
  assert.equal(card2.dataset.proposalId, 'prop-theme-2');
  const cancelBtn2 = card2.querySelector('.zp-proposal-cancel');
  assert.equal(cancelBtn2.disabled, false, 'Cancel button initially enabled');

  cancelBtn2.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends[sends.length - 1], 'cancel_theme_tok_999', 'Cancel calls send path with EXACT cancelMessage');
  assert.equal(cancelBtn2.disabled, true, 'Cancel button disabled after click');

  // Double click cancel does not send again
  cancelBtn2.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends.length, 2, 'Double click cancel does NOT send again');

  // 9. Staling: sending a normal user message disables any active proposal card
  const proposal3 = {
    id: 'prop-3',
    title: 'Create image',
    summary: 'Active proposal to be staled',
    confirmMessage: 'confirm_prop_3',
    cancelMessage: 'cancel_prop_3',
    editMessage: 'Active proposal',
    expiresAt: Date.now() + 60000
  };
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'Proposal 3 waiting for user action:',
      timestamp: Date.now(),
      actionProposal: proposal3
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const card3 = h.messagesEl.querySelectorAll('.zp-proposal-card')[2];
  assert.equal(card3.classList.contains('zp-proposal-disabled'), false, 'card 3 initially enabled');
  assert.equal(card3.querySelector('.zp-proposal-confirm').disabled, false);

  // User sends normal input
  h.inputEl.value = 'Actually, tell me a joke instead';
  h.sendBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();

  assert.equal(card3.classList.contains('zp-proposal-disabled'), true, 'card 3 disabled when user sends new message');
  assert.equal(card3.querySelector('.zp-proposal-confirm').disabled, true, 'card 3 confirm button disabled');
  const sendsCount = sends.length;
  card3.querySelector('.zp-proposal-confirm').click();
  assert.equal(sends.length, sendsCount, 'clicking staled card produces NO send');

  // 10. Ordinary "yes" is NOT silently rewritten into special confirm token
  h.inputEl.value = 'yes';
  h.sendBtn.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends[sends.length - 1], 'yes', 'ordinary "yes" is sent as plain text and not rewritten into confirmation');

  // 11. Expired cards render disabled and cannot send
  const expiredProposal = {
    id: 'prop-expired',
    title: 'Create image',
    summary: 'Past expiry timestamp',
    confirmMessage: 'confirm_expired',
    cancelMessage: 'cancel_expired',
    editMessage: '',
    expiresAt: Date.now() - 5000 // In the past
  };
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'Here was an expired proposal:',
      timestamp: Date.now(),
      actionProposal: expiredProposal
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const expiredCards = h.messagesEl.querySelectorAll('.zp-proposal-card');
  const expCard = expiredCards[expiredCards.length - 1];
  assert.equal(expCard.classList.contains('zp-proposal-disabled'), true, 'expired proposal rendered disabled');
  assert.equal(expCard.querySelector('.zp-proposal-confirm').disabled, true, 'expired confirm button is disabled');
  assert.equal(expCard.querySelector('.zp-proposal-edit').disabled, true, 'expired edit button is disabled');
  assert.equal(expCard.querySelector('.zp-proposal-cancel').disabled, true, 'expired cancel button is disabled');
  const countBeforeExpClick = sends.length;
  expCard.querySelector('.zp-proposal-confirm').click();
  assert.equal(sends.length, countBeforeExpClick, 'clicking expired confirm does NOT send');

  // 12. Malformed & XSS metadata safety
  const xssProposal = {
    id: 'prop-xss',
    title: '<script>alert("xss")</script>',
    summary: '<img src="x" onerror="alert(1)">',
    confirmMessage: 'confirm_xss',
    cancelMessage: 'cancel_xss',
    editMessage: '<b onclick="alert(2)">bold</b>',
    expiresAt: Date.now() + 60000
  };
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'Proposal with HTML characters:',
      timestamp: Date.now(),
      actionProposal: xssProposal
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const xssCard = h.messagesEl.querySelectorAll('.zp-proposal-card')[h.messagesEl.querySelectorAll('.zp-proposal-card').length - 1];
  assert.equal(xssCard.querySelector('script'), null, 'no script element injected');
  assert.equal(xssCard.querySelector('img'), null, 'no img element injected');
  assert.equal(xssCard.querySelector('.zp-proposal-head').textContent, '<script>alert("xss")</script>', 'title rendered as textContent, not HTML');
  assert.equal(xssCard.querySelector('.zp-proposal-summary').textContent, '<img src="x" onerror="alert(1)">', 'summary rendered as textContent, not HTML');

  // 13. Suggestions: opaque exact messages, clicked once, disabled siblings
  h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
    detail: {
      role: 'assistant',
      content: 'Here are suggestions for you:',
      timestamp: Date.now(),
      suggestions: [
        { label: 'Another idea', message: 'Give me another idea' },
        { label: 'Make it a theme', message: 'Turn this into a theme' }
      ]
    }
  }));
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const allSugRows = h.messagesEl.querySelectorAll('.zp-chat-suggestions');
  const freshSugRow = allSugRows[allSugRows.length - 1];
  assert.ok(freshSugRow, 'fresh suggestions row rendered');
  const sugBtns = freshSugRow.querySelectorAll('.zp-suggestion-chip');
  assert.equal(sugBtns.length, 2, '2 suggestions rendered');
  assert.equal(sugBtns[0].textContent, 'Another idea');
  assert.equal(sugBtns[1].textContent, 'Make it a theme');

  sugBtns[0].click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sends[sends.length - 1], 'Give me another idea', 'suggestion sends exact message');
  assert.equal(sugBtns[0].disabled, true, 'clicked suggestion disabled');
  assert.equal(sugBtns[1].disabled, true, 'sibling suggestion disabled');

  // 14. Visitor forget clears all proposal card state from DOM and storage
  h.localStorage.setItem('zp-chat-cache', JSON.stringify([{
    role: 'bot',
    content: 'saved proposal',
    timestamp: Date.now(),
    actionProposal: proposal1
  }]));
  h.win.dispatchEvent(new h.CustomEvent('zephyy-ctrl', { detail: { visitorForget: true } }));
  h.drainTimers();
  for (let i = 0; i < 20; i++) await Promise.resolve();

  assert.equal(h.messagesEl.querySelectorAll('.zp-proposal-card').length, 0, 'forget clears all proposal cards');
  assert.equal(h.messagesEl.querySelectorAll('.zp-chat-suggestions').length, 0, 'forget clears all suggestion rows');
  assert.equal(h.localStorage.getItem('zp-chat-cache'), null, 'forget clears cache with proposals');
}

async function testFiveArchitecturalRepros() {
  const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');

  // REPRO 1: History load [assistant proposal, user Nevermind] must stale old controls;
  // clicking old proposal card must NOT send. Consumed card must not reactivate on close/reopen.
  {
    const h = buildHarness(orbSource);
    let sends = [];
    const historyData = {
      m1: {
        role: 'assistant',
        content: 'I propose this image:',
        timestamp: 1000,
        actionProposal: {
          id: 'p1',
          title: 'Create image',
          summary: 'A cool dog',
          confirmMessage: 'cmd_p1',
          cancelMessage: 'cancel_p1',
          editMessage: '',
          expiresAt: Date.now() + 60000
        }
      },
      m2: {
        role: 'user',
        content: 'Never mind',
        timestamp: 2000
      }
    };
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sends.push(txt); },
      loadHistory: async () => ({ exists: () => true, val: () => historyData }),
      resetSession: () => {}
    });

    h.orb.click();
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const card = h.messagesEl.querySelector('.zp-proposal-card');
    assert.ok(card, 'proposal card rendered in history');
    assert.equal(card.classList.contains('zp-proposal-disabled'), true, 'REPRO 1: proposal followed by user message MUST be staled in history');
    const confirmBtn = card.querySelector('.zp-proposal-confirm');
    assert.equal(confirmBtn.disabled, true, 'REPRO 1: confirm button must be disabled');
    confirmBtn.click();
    assert.equal(sends.length, 0, 'REPRO 1: clicking staled history card must NOT send');
  }

  // REPRO 2: Open with history promise pending -> Forget -> resolve old history:
  // old proposal must NOT be published, cache must not be rewritten with old history.
  {
    const h = buildHarness(orbSource);
    let sends = [];
    let resolveHistory;
    const pendingHistoryPromise = new Promise((resolve) => { resolveHistory = resolve; });
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sends.push(txt); },
      loadHistory: async () => pendingHistoryPromise,
      resetSession: () => {}
    });

    // Open panel -> triggers loadMessages with pending history
    h.orb.click();
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Visitor forget fires while history promise is still pending
    h.win.dispatchEvent(new h.CustomEvent('zephyy-ctrl', { detail: { visitorForget: true } }));
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Now resolve old history from the previous session
    resolveHistory({
      exists: () => true,
      val: () => ({
        old1: {
          role: 'assistant',
          content: 'Old proposal:',
          timestamp: 500,
          actionProposal: {
            id: 'old_prop',
            title: 'Create old',
            summary: 'Old summary',
            confirmMessage: 'old_confirm_cmd',
            cancelMessage: 'old_cancel',
            editMessage: '',
            expiresAt: Date.now() + 60000
          }
        }
      })
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(h.messagesEl.querySelectorAll('.zp-proposal-card').length, 0, 'REPRO 2: old history resolved after forget MUST NOT render proposal cards');
    assert.equal(h.localStorage.getItem('zp-chat-cache'), null, 'REPRO 2: old history resolved after forget MUST NOT restore old cache');
  }

  // REPRO 3: Assistant messages with identical text content but different keys
  // must NOT be dropped by content-only dedup.
  {
    const h = buildHarness(orbSource);
    let sends = [];
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sends.push(txt); },
      loadHistory: async () => ({ exists: () => false }),
      resetSession: () => {}
    });
    h.orb.click();
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: {
        key: 'k1',
        role: 'assistant',
        content: 'Here is your proposal:',
        timestamp: 1000,
        actionProposal: {
          id: 'prop_A',
          title: 'Create A',
          summary: 'Theme A',
          confirmMessage: 'cmd_A',
          cancelMessage: 'cancel_A',
          editMessage: '',
          expiresAt: Date.now() + 60000
        }
      }
    }));
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Message 2 has identical body text but new key 'k2' and proposal 'prop_B'
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: {
        key: 'k2',
        role: 'assistant',
        content: 'Here is your proposal:',
        timestamp: 2000,
        actionProposal: {
          id: 'prop_B',
          title: 'Create B',
          summary: 'Theme B',
          confirmMessage: 'cmd_B',
          cancelMessage: 'cancel_B',
          editMessage: '',
          expiresAt: Date.now() + 60000
        }
      }
    }));
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const cards = h.messagesEl.querySelectorAll('.zp-proposal-card');
    assert.equal(cards.length, 2, 'REPRO 3: identical body with distinct keys MUST render both messages and proposals');
    assert.equal(cards[0].classList.contains('zp-proposal-disabled'), true, 'REPRO 3: older proposal staled');
    assert.equal(cards[1].classList.contains('zp-proposal-disabled'), false, 'REPRO 3: newest proposal active');
    cards[1].querySelector('.zp-proposal-confirm').click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.deepEqual(sends, ['cmd_B'], 'REPRO 3: click on second card sends cmd_B');
  }

  // REPRO 4: Advance clock past deadline without running timer; click must recheck Date.now()
  // and NOT send.
  {
    const h = buildHarness(orbSource);
    let sends = [];
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sends.push(txt); },
      loadHistory: async () => ({ exists: () => false }),
      resetSession: () => {}
    });
    h.orb.click();
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    let fakeNow = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => fakeNow;
    try {
      h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
        detail: {
          key: 'k_exp',
          role: 'assistant',
          content: 'Expiring proposal:',
          timestamp: fakeNow,
          actionProposal: {
            id: 'prop_clock',
            title: 'Create',
            summary: 'Expiring soon',
            confirmMessage: 'cmd_exp',
            cancelMessage: 'cancel_exp',
            editMessage: 'edit_exp',
            expiresAt: fakeNow + 5000 // expires in 5s
          }
        }
      }));
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const card = h.messagesEl.querySelector('.zp-proposal-card');
      assert.ok(card);
      // Advance clock past expiresAt WITHOUT running the timers
      fakeNow += 10000;

      card.querySelector('.zp-proposal-confirm').click();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      assert.equal(sends.length, 0, 'REPRO 4: Create click past expiresAt must recheck clock and NOT send');
      assert.equal(card.classList.contains('zp-proposal-disabled'), true, 'REPRO 4: card marked disabled');
    } finally {
      Date.now = originalDateNow;
    }
  }

  // REPRO 5: Opaque server commands must NOT be trimmed or truncated; oversized commands rejected.
  {
    const h = buildHarness(orbSource);
    let sends = [];
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sends.push(txt); },
      loadHistory: async () => ({ exists: () => false }),
      resetSession: () => {}
    });
    h.orb.click();
    h.drainTimers();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Oversized command (>2000 chars) must be REJECTED, not truncated
    const oversizedCmd = 'x'.repeat(2001);
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: {
        key: 'k_over',
        role: 'assistant',
        content: 'Oversized command proposal:',
        timestamp: Date.now(),
        actionProposal: {
          id: 'prop_over',
          title: 'Create',
          summary: 'Oversized',
          confirmMessage: oversizedCmd,
          cancelMessage: 'cancel',
          editMessage: '',
          expiresAt: Date.now() + 60000
        }
      }
    }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(h.messagesEl.querySelectorAll('.zp-proposal-card').length, 0, 'REPRO 5: oversized confirmMessage >2000 must be REJECTED, not truncated');

    // Untrimmed opaque token with whitespace must be preserved exactly on send
    const spacedCmd = '  OPAQUE_CMD_TOKEN_123  ';
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: {
        key: 'k_space',
        role: 'assistant',
        content: 'Spaced command proposal:',
        timestamp: Date.now(),
        actionProposal: {
          id: 'prop_space',
          title: 'Create Spaced',
          summary: 'Spaced token',
          confirmMessage: spacedCmd,
          cancelMessage: 'cancel',
          editMessage: '',
          expiresAt: Date.now() + 60000
        }
      }
    }));
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const spaceCard = h.messagesEl.querySelector('.zp-proposal-card');
    assert.ok(spaceCard);
    spaceCard.querySelector('.zp-proposal-confirm').click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.deepEqual(sends, [spacedCmd], 'REPRO 5: exact opaque command with spaces must be preserved without trimming');
  }
}
