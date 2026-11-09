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
  await testPolishRegressions();

  console.log('PASS: no SDK until chat, status stream put/patch/null, one connection, auth wiring, atomic input, input limits, batched replies, dedupe, ordering, reset race, auth failure and retry, storage blocked, meme rendering, page-aware starters, adversarial defense, proposal cards & suggestions contract, full orb lifecycle & mutant verification, Video.js shared player & safe caption provenance');
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
  let manualVendorLoad = false;
  let headEl;

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
      get isConnected() {
        let cur = el;
        while (cur.parentNode) cur = cur.parentNode;
        return cur === doc.body || cur === messagesEl || (cur._id && (cur._id === 'zp-chat-messages' || cur._id === 'body'));
      },
      set innerHTML(val) {
        el._innerHTML = val;
        children.length = 0;
        if (typeof val === 'string') {
          if (val.includes('zp-thinking-text')) {
            const span = makeEl('thinking_text_' + Math.random(), 'span');
            span.className = 'zp-thinking-text';
            el.appendChild(span);
          }
          if (val.includes('zp-chat-img-card')) {
            const fig = makeEl('fig_' + Math.random(), 'figure');
            const classMatch = val.match(/<figure[^>]*class="([^"]+)"/);
            fig.className = classMatch ? classMatch[1] : 'zp-chat-img-card';
            const urlMatch = val.match(/data-stash-url="([^"]+)"/);
            if (urlMatch) {
              fig.setAttribute('data-stash-url', urlMatch[1]);
              fig.dataset.stashUrl = urlMatch[1];
            }
              if (val.includes('<video')) {
                const vidMatch = val.match(/<video[^>]*class="([^"]*)"[^>]*src="([^"]*)"[^>]*>/);
                const vid = makeEl('vid_' + Math.random(), 'video');
                if (vidMatch) {
                  vid.className = vidMatch[1];
                  vid.setAttribute('src', vidMatch[2]);
                  vid.src = vidMatch[2];
                }
                fig.appendChild(vid);
              }
              if (val.includes('<img')) {
                const imgMatch = val.match(/<img[^>]*class="([^"]*)"[^>]*src="([^"]*)"[^>]*>/);
                const img = makeEl('img_' + Math.random(), 'img');
                if (imgMatch) {
                  img.className = imgMatch[1];
                  img.setAttribute('src', imgMatch[2]);
                  img.src = imgMatch[2];
                }
                fig.appendChild(img);
              }
              const meta = makeEl('meta_' + Math.random(), 'figcaption');
              meta.className = 'zp-chat-img-meta zp-chat-stash-meta';
              const stashSpan = makeEl('span_' + Math.random(), 'span');
              stashSpan.textContent = 'Doshus.NET Meme Stash';
              meta.appendChild(stashSpan);
              fig.appendChild(meta);
              el.appendChild(fig);
          }
        }
      },
      get innerHTML() { return el._innerHTML || ''; },
      setAttribute: (k, v) => {
        el.attributes[k] = String(v);
        if (k.startsWith('data-')) el.dataset[k.slice(5)] = String(v);
      },
      getAttribute: (k) => (el.attributes[k] !== undefined ? el.attributes[k] : (el[k] !== undefined ? String(el[k]) : (el.dataset && el.dataset[k.replace(/^data-/, '')] !== undefined ? el.dataset[k.replace(/^data-/, '')] : null))),
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
        if (el === headEl && ch.onload && !manualVendorLoad && win.videojs) {
          Promise.resolve().then(() => { if (ch.onload && !ch._loaded) { ch._loaded = true; ch.onload(); } });
        }
        return ch;
      },
      prepend: (ch) => {
        if (ch.parentNode) ch.parentNode.removeChild(ch);
        children.unshift(ch);
        ch.parentNode = el;
        return ch;
      },
      before: (sibling) => {
        if (el.parentNode) el.parentNode.insertBefore(sibling, el);
      },
      insertBefore: (ch, ref) => {
        if (ch.parentNode) ch.parentNode.removeChild(ch);
        const idx = children.indexOf(ref);
        if (idx >= 0) children.splice(idx, 0, ch);
        else children.push(ch);
        ch.parentNode = el;
        if ((el === headEl || el.parentNode === headEl) && ch.onload && !manualVendorLoad && win.videojs) {
          Promise.resolve().then(() => { if (ch.onload && !ch._loaded) { ch._loaded = true; ch.onload(); } });
        }
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
      const tagM = sel.match(/^([a-zA-Z0-9_-]+)(\..*|\[.*)?$/);
      if (tagM && tagM[1] && tagM[2]) {
        if (node.tagName.toLowerCase() !== tagM[1].toLowerCase()) return false;
        sel = tagM[2];
      }
      if (sel.startsWith('#')) return node.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const parts = sel.split(/\[|\:/);
        const cls = parts[0].slice(1);
        if (!node.classList.contains(cls)) return false;
        if (sel.includes('[data-content]')) return node.dataset && node.dataset.content !== undefined;
        if (sel.includes('[data-stash-url]')) return (node.dataset && node.dataset.stashUrl !== undefined) || node.getAttribute('data-stash-url') !== null;
        return true;
      }
      const attrM = sel.match(/^\[([a-zA-Z0-9_-]+)(?:([*$^~|]?=)([^\]]+))?\]$/);
      if (attrM) {
        const val = node.getAttribute(attrM[1]) || node[attrM[1]] || null;
        if (attrM[2] !== undefined) {
          const op = attrM[2];
          const expected = attrM[3].replace(/^["']|["']$/g, '');
          if (!val) return false;
          if (op === '=') return String(val) === expected;
          if (op === '$=') return String(val).endsWith(expected);
          if (op === '*=') return String(val).includes(expected);
        }
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
  const modelBadge = makeEl('zp-model-badge', 'span');
  modelBadge.textContent = 'Checking...';

  const windowListeners = new Map();
  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  let videoInitCount = 0;
  let videoDisposeCount = 0;
  const activeMockPlayers = [];
  function MockVideoPlayer(videoEl, options) {
    this.videoEl = videoEl;
    this.options = options;
    this._disposed = false;
    this._paused = false;
    this.listeners = {};
    videoInitCount++;
    activeMockPlayers.push(this);
  }
  MockVideoPlayer.prototype.dispose = function() {
    this._disposed = true;
    videoDisposeCount++;
    if (this.listeners.dispose) this.listeners.dispose.forEach(fn => fn());
  };
  MockVideoPlayer.prototype.isDisposed = function() { return this._disposed; };
  MockVideoPlayer.prototype.pause = function() { this._paused = true; };
  MockVideoPlayer.prototype.paused = function() { return this._paused; };
  MockVideoPlayer.prototype.one = function(evt, fn) {
    (this.listeners[evt] = this.listeners[evt] || []).push(fn);
  };
  const mockVideoJs = (videoEl, opts) => new MockVideoPlayer(videoEl, opts);

  const catalogFile = path.join(__dirname, '../public/assets/memes/meme-catalog.json');
  let catalogData = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  let fetchFails = false;
  const fetchMock = async (url) => {
    if (fetchFails) throw new Error('Fetch failed');
    if (url.includes('meme-catalog.json')) {
      return { ok: true, json: async () => JSON.parse(JSON.stringify(catalogData)) };
    }
    return { ok: true, json: async () => ({}) };
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
    __zpConnect: null,
    fetch: fetchMock,
    videojs: mockVideoJs
  };

  headEl = makeEl('head');
  const doc = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      if (headEl.querySelector(sel)) return headEl.querySelector(sel);
      return null;
    },
    querySelectorAll: (sel) => headEl.querySelectorAll(sel),
    createElement: (tag) => makeEl('auto_' + Math.random(), tag),
    addEventListener: () => {},
    body: makeEl('body'),
    head: headEl
  };

  const ctx = {
    window: win, document: doc, console, navigator: { maxTouchPoints: 0 },
    URL, Date, fetch: fetchMock,
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

  const loaderSource = fs.readFileSync(path.join(__dirname, '../public/js/video-loader.js'), 'utf8');
  vm.runInNewContext(loaderSource, ctx);
  vm.runInContext(sourceCode, ctx);

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
    CustomEvent: ctx.CustomEvent,
    modelBadge,
    activeMockPlayers,
    getVideoStats: () => ({ videoInitCount, videoDisposeCount }),
    context: ctx,
    setCatalogData: (d) => { catalogData = d; },
    setFetchFails: (f) => { fetchFails = f; },
    setManualVendorLoad: (v) => { manualVendorLoad = v; }
  };
}

async function testMemeAndStarters() {
  const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');
  const h = buildHarness(orbSource);

  assert.ok(h.win.__zpTest, 'zephyy-orb.js exports __zpTest');
  const { renderContent, parseMediaUrl, getOrderedStarters } = h.win.__zpTest;

  // 1. Stash image markdown -> rendered as canonical RELATIVE path, neutral stash attribution, NO "Generated by Zephyy", NO "Copy prompt", NO unverified visible description
  const stashImgHtml = renderContent('Here is a meme: ![A cool cat](https://doshus.net/assets/memes/20230607_060826.webp)');
  assert.match(stashImgHtml, /<img src="\/assets\/memes\/20230607_060826\.webp"/, 'stash image rendered as canonical relative path');
  assert.match(stashImgHtml, /alt="Doshus\.NET meme stash image"/);
  assert.doesNotMatch(stashImgHtml, /<span class="zp-chat-stash-desc">/, 'stash image unverified description NOT rendered in synchronous content');
  assert.match(stashImgHtml, /<span>Doshus\.NET Meme Stash<\/span>/);
  assert.doesNotMatch(stashImgHtml, /Generated by Zephyy/);
  assert.doesNotMatch(stashImgHtml, /Copy prompt/);
  assert.doesNotMatch(stashImgHtml, /data-zpli/);

  // 2. Stash video markdown -> <video controls playsinline preload="metadata"> rendered as canonical relative path, NO autoplay, NO auto-unmute
  const stashVidHtml = renderContent('Watch this: ![Funny dog](https://doshus.net/assets/memes/1687785524275.mp4)');
  assert.match(stashVidHtml, /<video controls playsinline preload="metadata" class="video-js zp-chat-video zp-chat-stash-video" src="\/assets\/memes\/1687785524275\.mp4" aria-label="Doshus\.NET meme stash video">/, 'stash video rendered as canonical relative path with controls');
  assert.doesNotMatch(stashVidHtml, /autoplay/i);
  assert.doesNotMatch(stashVidHtml, /muted/i);
  assert.doesNotMatch(stashVidHtml, /<span class="zp-chat-stash-desc">/, 'stash video unverified description NOT rendered in synchronous content');
  assert.doesNotMatch(stashVidHtml, /Funny dog/);
  assert.match(stashVidHtml, /<span>Doshus\.NET Meme Stash<\/span>/);
  assert.doesNotMatch(stashVidHtml, /Generated by Zephyy/);
  assert.doesNotMatch(stashVidHtml, /Copy prompt/);

  // 3. Percent-encoded filenames with parentheses and brackets
  const encodedHtml = renderContent('![Instagram](https://doshus.net/assets/memes/Screenshot_20260226_053636_Instagram%281%29.webp)');
  assert.match(encodedHtml, /Screenshot_20260226_053636_Instagram%281%29\.webp/);
  assert.doesNotMatch(encodedHtml, /<span class="zp-chat-stash-desc">/);
  assert.match(encodedHtml, /<span>Doshus\.NET Meme Stash<\/span>/);

  const bracketHtml = renderContent('![Bracket](https://doshus.net/assets/memes/clip%5B1%5D.mp4)');
  assert.match(bracketHtml, /<video controls playsinline preload="metadata"/);
  assert.match(bracketHtml, /clip%5B1%5D\.mp4/);
  assert.match(bracketHtml, /aria-label="Doshus\.NET meme stash video"/);
  assert.doesNotMatch(bracketHtml, /<span class="zp-chat-stash-desc">/);
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

  // XSS injection in alt text: untrusted alt is NOT injected or rendered
  const xssAltHtml = renderContent('![<script>alert("xss")</script>](https://doshus.net/assets/memes/20230607_060826.webp)');
  assert.doesNotMatch(xssAltHtml, /<script>/);
  assert.doesNotMatch(xssAltHtml, /<span class="zp-chat-stash-desc">/);

  // Malicious alt text: untrusted alt is NOT rendered as visible caption; no script execution
  const malAltHtml = renderContent('!["quote" & <script>alert(1)</script>](https://doshus.net/assets/memes/1687785524275.mp4)');
  assert.doesNotMatch(malAltHtml, /<script>/);
  assert.doesNotMatch(malAltHtml, /<span class="zp-chat-stash-desc">/);
  assert.match(malAltHtml, /aria-label="Doshus\.NET meme stash video"/);

  // 6. Curated starters: 'Gimme a meme' + 'Make a Printmon theme'
  h.win.location.pathname = '/';
  const homeStarters = getOrderedStarters().map(s => s.label);
  assert.equal(homeStarters.length, 2);
  assert.equal(homeStarters[0], 'Gimme a meme');
  assert.equal(homeStarters[1], 'Make a Printmon theme');
  assert.equal(getOrderedStarters()[0].prompt, 'Gimme a meme');
  assert.equal(getOrderedStarters()[1].prompt, 'Help me make a Printmon theme');

  h.win.location.pathname = '/financehub';
  assert.equal(getOrderedStarters().length, 2);
  assert.equal(getOrderedStarters()[0].label, 'Gimme a meme');

  h.win.location.pathname = '/nexus';
  assert.equal(getOrderedStarters()[0].label, 'Gimme a meme');

  h.win.location.pathname = '/thelounge';
  assert.equal(getOrderedStarters()[0].label, 'Gimme a meme');

  h.win.location.pathname = '/amazon/printmon/gallery';
  assert.equal(getOrderedStarters().length, 2);
  assert.equal(getOrderedStarters()[0].label, 'Make a Printmon theme');
  assert.equal(getOrderedStarters()[0].prompt, 'Help me make a Printmon theme');
  assert.equal(getOrderedStarters()[1].label, 'Gimme a meme');
  assert.equal(getOrderedStarters()[1].prompt, 'Gimme a meme');

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
  assert.deepEqual(sends, ['Gimme a meme'], 'first send executes immediately with starter text "Gimme a meme" without forcing a name prompt');

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

async function testPolishRegressions() {
  const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');

  // 1. Curated starters: 'Gimme a meme' + 'Make a Printmon theme'
  {
    const h = buildHarness(orbSource);
    const { getOrderedStarters } = h.win.__zpTest;
    for (const route of ['/', '/financehub', '/nexus', '/thelounge', '/zephyy']) {
      h.win.location.pathname = route;
      const starters = getOrderedStarters();
      assert.equal(starters.length, 2, `Route ${route} must have 2 starters`);
      assert.equal(starters[0].label, 'Gimme a meme');
      assert.equal(starters[0].prompt, 'Gimme a meme');
      assert.equal(starters[1].label, 'Make a Printmon theme');
      assert.equal(starters[1].prompt, 'Help me make a Printmon theme');
    }
    h.win.location.pathname = '/amazon/printmon';
    const pmStarters = getOrderedStarters();
    assert.equal(pmStarters.length, 2);
    assert.equal(pmStarters[0].label, 'Make a Printmon theme');
    assert.equal(pmStarters[0].prompt, 'Help me make a Printmon theme');
    assert.equal(pmStarters[1].label, 'Gimme a meme');
    assert.equal(pmStarters[1].prompt, 'Gimme a meme');
  }

  // 2. Truthful friendly badge ('Meme stash') for stash/deterministic routing; operator telemetry preserved
  {
    const h = buildHarness(orbSource);
    assert.equal(h.modelBadge.textContent, 'Checking...');

    // Internal stash model: friendly truthful badge 'Meme stash'; telemetry dataset records raw model
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: { key: 'm1', role: 'assistant', content: 'Here is a meme', timestamp: Date.now(), model: 'stash' }
    }));
    assert.equal(h.modelBadge.textContent, 'Meme stash', 'internal "stash" routing label displayed as friendly "Meme stash"');
    assert.equal(h.modelBadge.dataset.telemetryModel, 'stash', 'operator telemetry preserved in dataset');

    // Internal deterministic routing label: displayed as friendly 'Meme stash'
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: { key: 'm2', role: 'assistant', content: 'Another deterministic', timestamp: Date.now(), model: 'deterministic-stash' }
    }));
    assert.equal(h.modelBadge.textContent, 'Meme stash', 'internal "deterministic-stash" routing label displayed as "Meme stash"');
    assert.equal(h.modelBadge.dataset.telemetryModel, 'deterministic-stash');

    // Real AI model: displays cleanly
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: { key: 'm3', role: 'assistant', content: 'AI reply', timestamp: Date.now(), model: 'gemini-2.0-flash' }
    }));
    assert.equal(h.modelBadge.textContent, 'gemini-2.0-flash', 'real AI model displays in header');
    assert.equal(h.modelBadge.dataset.telemetryModel, 'gemini-2.0-flash');
  }

  // 3. Normalized suggestion chips (natural language requests) & fabricated visitor message avoidance
  {
    const h = buildHarness(orbSource);
    const { renderSuggestions, isFabricatedProtocolMessage, isLegacyProtocolSuggestion, normalizeSuggestion } = h.win.__zpTest;

    // Normalization transforms legacy/shorthand chips to explicit natural-language requests
    const normAnother = normalizeSuggestion({ label: 'Another', message: '[MEME:random]' });
    assert.ok(normAnother);
    assert.equal(normAnother.label, 'Another meme');
    assert.equal(normAnother.message, 'Show me another meme');

    const normVideo = normalizeSuggestion({ label: 'Video', message: '[MEME:video]' });
    assert.ok(normVideo);
    assert.equal(normVideo.label, 'Show a video');
    assert.equal(normVideo.message, 'Show me a video meme');

    const normAnotherMeme = normalizeSuggestion({ label: 'Another meme', message: '[MEME:next]' });
    assert.ok(normAnotherMeme);
    assert.equal(normAnotherMeme.label, 'Another meme');
    assert.equal(normAnotherMeme.message, 'Show me another meme');

    const normPrintmon = normalizeSuggestion({ label: 'Make a Printmon theme', message: 'Help me make a Printmon theme' });
    assert.ok(normPrintmon);
    assert.equal(normPrintmon.label, 'Make a Printmon theme');
    assert.equal(normPrintmon.message, 'Help me make a Printmon theme');

    // Unusable raw protocol syntax is dropped
    assert.equal(normalizeSuggestion({ label: '[CMD_INTERNAL]', message: '[CMD_INTERNAL]' }), null);

    // Unrelated conversation suggestions are preserved without rewrite (no broad video/meme matching)
    const normUnrelated = normalizeSuggestion({ label: 'Video editing tips', message: 'Can you give me tips on video editing for memes?' });
    assert.ok(normUnrelated);
    assert.equal(normUnrelated.label, 'Video editing tips', 'unrelated suggestion label preserved');
    assert.equal(normUnrelated.message, 'Can you give me tips on video editing for memes?', 'unrelated suggestion message preserved');

    // Render suggestions from legacy/protocol chips produces explicit chips
    const normalizedRow = renderSuggestions([
      { label: 'Another', message: '[MEME:random]' },
      { label: 'Video', message: '[MEME:video]' }
    ], 'k_sug_normalized');
    assert.ok(normalizedRow, 'normalized suggestions produce rendered chips');
    const chips = normalizedRow.querySelectorAll('.zp-suggestion-chip');
    assert.equal(chips.length, 2);
    assert.equal(chips[0].textContent, 'Another meme');
    assert.equal(chips[1].textContent, 'Show a video');

    // Clicking chip sends natural language request, never [MEME] protocol
    let sentAction = null;
    h.win.__zpConnect = async () => ({
      sendMessage: async (txt) => { sentAction = txt; }
    });
    chips[0].click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(sentAction, 'Show me another meme', 'clicked suggestion chip sends natural language, not [MEME]');

    // Legitimate non-meme suggestion renders
    const cleanRow = renderSuggestions([
      { label: 'Tell me more', message: 'Tell me more about this' }
    ], 'k_sug_clean');
    assert.ok(cleanRow, 'clean suggestion rendered');
    assert.equal(cleanRow.querySelectorAll('.zp-suggestion-chip').length, 1);

    // Fabricated visitor protocol messages: detected
    assert.equal(isFabricatedProtocolMessage('[MEME:random]'), true);
    assert.equal(isFabricatedProtocolMessage('[MEME:video]'), true);
    assert.equal(isFabricatedProtocolMessage('[THEME:generate]'), true);
    assert.equal(isFabricatedProtocolMessage('Can you show me a meme?'), false);

    // Open panel so incoming messages are appended to transcript
    h.orb.click();

    // User message with [MEME:random] is translated to readable text, NOT erased from transcript
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: { key: 'm_fab', role: 'user', content: '[MEME:random]', timestamp: Date.now() }
    }));
    const userFabMsgs = h.messagesEl.querySelectorAll('.zp-chat-msg-user');
    assert.ok(userFabMsgs.length > 0, 'user message must not be dropped from transcript');
    const lastUserMsg = userFabMsgs[userFabMsgs.length - 1];
    assert.equal(lastUserMsg.dataset.content, 'Show me another meme', 'synthetic legacy entry translated to readable text');
    assert.match(lastUserMsg.innerHTML, /Show me another meme/, 'user message displays translated natural language');

    // Display known legacy actions readably without dropping real visitor messages.
    for (const [key, content, expected] of [
      ['m_legacy_cat', '[MEME:cats]', 'Show me a meme about cats'],
      ['m_legacy_theme', '[THEME:generate]', 'Help me make a Printmon theme'],
      ['m_literal_tag', '[ASCII:literal]', '[ASCII:literal]'],
      ['m_inline_tag', 'Explain [THEME:generate] to me', 'Explain [THEME:generate] to me']
    ]) {
      h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
        detail: { key, role: 'user', content, timestamp: Date.now() }
      }));
      const message = h.messagesEl.children.find(c => c.dataset && c.dataset.msgKey === key);
      assert.ok(message, 'visitor message must not be silently erased: ' + key);
      assert.equal(message.dataset.content, expected, 'legacy request displays readably: ' + key);
    }

    // Real user conversation is preserved exactly as typed
    h.win.dispatchEvent(new h.CustomEvent('zephyy-msg', {
      detail: { key: 'm_real', role: 'user', content: 'What about video editing for memes?', timestamp: Date.now() }
    }));
    const realUserMsg = h.messagesEl.children.find(c => c.dataset && c.dataset.msgKey === 'm_real');
    assert.ok(realUserMsg, 'real user message is preserved');
    assert.equal(realUserMsg.dataset.content, 'What about video editing for memes?');
    assert.match(realUserMsg.innerHTML, /What about video editing for memes\?/);
  }

  // 4. Stash captions safe provenance architecture: unreviewed vs human
  {
    const h = buildHarness(orbSource);
    const { renderContent, resolveStashCaptions } = h.win.__zpTest;

    // Test 4a: Old persisted message with descriptive alt: visible caption NOT shown synchronously
    const oldMsgHtml = renderContent('Here: ![Cats clustered beside parked cars](/assets/memes/-_internete_bunun_ic_in_para_veriyorum_aDBN9F.webm)');
    assert.doesNotMatch(oldMsgHtml, /<span class="zp-chat-stash-desc">/, 'old descriptive alt NOT shown as visible caption');
    assert.match(oldMsgHtml, /data-stash-url="\/assets\/memes\/-_internete_bunun_ic_in_para_veriyorum_aDBN9F\.webm"/);

    // Test 4b: Catalog lookup with default unreviewed: NO visible caption
    const containerUnreviewed = h.doc.createElement('div');
    containerUnreviewed.innerHTML = oldMsgHtml;
    h.doc.body.appendChild(containerUnreviewed);

    resolveStashCaptions(containerUnreviewed);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(containerUnreviewed.querySelector('.zp-chat-stash-desc'), null, 'unreviewed catalog item has NO visible caption (fail closed)');

    // Test 4c: Catalog lookup with human-approved caption (captionReview: 'human')
    const humanApprovedUrl = '/assets/memes/human_test.webm';
    h.win.__zpTest.setStashCatalogMap({
      [humanApprovedUrl]: {
        id: 'human_test.webm',
        path: humanApprovedUrl,
        type: 'video',
        description: 'Verified human approved caption for cat video',
        reviewed: true,
        captionReview: 'human'
      }
    });

    const containerHuman = h.doc.createElement('div');
    containerHuman.innerHTML = renderContent('![Unused alt](' + humanApprovedUrl + ')');
    h.doc.body.appendChild(containerHuman);

    resolveStashCaptions(containerHuman);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const humanDescSpan = containerHuman.querySelector('.zp-chat-stash-desc');
    assert.ok(humanDescSpan, 'human approved caption rendered');
    assert.equal(humanDescSpan.textContent, 'Verified human approved caption for cat video');
    const vidEl = containerHuman.querySelector('video');
    assert.equal(vidEl.getAttribute('aria-label'), 'Verified human approved caption for cat video');

    // Test 4d: Catalog fetch failure / error -> fails closed, NO caption
    h.setFetchFails(true);
    h.win.__zpTest.setStashCatalogMap(null); // force reload
    const containerFail = h.doc.createElement('div');
    containerFail.innerHTML = renderContent('![Another meme](/assets/memes/cat2.webm)');
    h.doc.body.appendChild(containerFail);

    resolveStashCaptions(containerFail);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(containerFail.querySelector('.zp-chat-stash-desc'), null, 'network/fetch failure fails closed with no caption');
    h.setFetchFails(false);

    // Test 4e: Real parentheses in filename (encoded in URL -> decoded for catalog lookup)
    const parenUrl = '/assets/memes/artblessedsofunny-20250619-0001%281%29.jpg';
    h.win.__zpTest.setStashCatalogMap({
      'artblessedsofunny-20250619-0001(1).jpg': {
        id: 'artblessedsofunny-20250619-0001(1).jpg',
        path: '/assets/memes/artblessedsofunny-20250619-0001(1).jpg',
        type: 'image',
        description: 'Verified human approved caption with parens',
        reviewed: true,
        captionReview: 'human'
      }
    });
    const containerParen = h.doc.createElement('div');
    containerParen.innerHTML = renderContent('![Paren meme](' + parenUrl + ')');
    h.doc.body.appendChild(containerParen);
    resolveStashCaptions(containerParen);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const parenDesc = containerParen.querySelector('.zp-chat-stash-desc');
    assert.ok(parenDesc, 'human caption with parentheses in filename rendered');
    assert.equal(parenDesc.textContent, 'Verified human approved caption with parens');

    // Test 4f: Real Unicode in filename
    const unicodeUrl = '/assets/memes/test_unicode_%C3%A7%C4%9F%C3%B6%281%29.jpg';
    h.win.__zpTest.setStashCatalogMap({
      'test_unicode_çğö(1).jpg': {
        id: 'test_unicode_çğö(1).jpg',
        path: '/assets/memes/test_unicode_çğö(1).jpg',
        type: 'image',
        description: 'Verified human approved caption with unicode',
        reviewed: true,
        captionReview: 'human'
      }
    });
    const containerUnicode = h.doc.createElement('div');
    containerUnicode.innerHTML = renderContent('![Unicode meme](' + unicodeUrl + ')');
    h.doc.body.appendChild(containerUnicode);
    resolveStashCaptions(containerUnicode);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const unicodeDesc = containerUnicode.querySelector('.zp-chat-stash-desc');
    assert.ok(unicodeDesc, 'human caption with unicode in filename rendered');
    assert.equal(unicodeDesc.textContent, 'Verified human approved caption with unicode');

    // Test 4g: Real spaces in filename
    const spacesUrl = '/assets/memes/test%20meme%20with%20spaces%20%282%29.jpg';
    h.win.__zpTest.setStashCatalogMap({
      'test meme with spaces (2).jpg': {
        id: 'test meme with spaces (2).jpg',
        path: '/assets/memes/test meme with spaces (2).jpg',
        type: 'image',
        description: 'Verified human approved caption with spaces',
        reviewed: true,
        captionReview: 'human'
      }
    });
    const containerSpaces = h.doc.createElement('div');
    containerSpaces.innerHTML = renderContent('![Spaces meme](' + spacesUrl + ')');
    h.doc.body.appendChild(containerSpaces);
    resolveStashCaptions(containerSpaces);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const spacesDesc = containerSpaces.querySelector('.zp-chat-stash-desc');
    assert.ok(spacesDesc, 'human caption with spaces in filename rendered');
    assert.equal(spacesDesc.textContent, 'Verified human approved caption with spaces');

    // Test 4h: Malformed percent-encoding and traversal attempts fail closed
    const { normalizeStashPath } = h.win.__zpTest;
    assert.equal(normalizeStashPath('/assets/memes/%E0%A4%A'), null, 'malformed percent encoding fails closed');
    assert.equal(normalizeStashPath('/assets/memes/%999'), null, 'invalid percent encoding fails closed');
    assert.equal(normalizeStashPath('/assets/memes/..%2Fsecret.jpg'), null, 'traversal attempt fails closed');
    assert.equal(normalizeStashPath('https://evil.com/assets/memes/cat.jpg'), null, 'foreign host fails closed');
  }

  // 5. Video.js player lifecycle: init, duplicate-init, close/forget/history cleanup, native fallback
  {
    const h = buildHarness(orbSource);
    const { initChatVideoPlayers, disposeChatVideoPlayers, getActiveChatPlayers } = h.win.__zpTest;

    // Render a video message
    const videoMsg = h.doc.createElement('div');
    videoMsg.className = 'zp-chat-msg zp-chat-msg-bot';
    videoMsg.innerHTML = '<figure class="zp-chat-img-card zp-chat-video-card zp-chat-stash-card" data-stash-url="/assets/memes/clip.webm">' +
      '<video controls playsinline preload="metadata" class="video-js zp-chat-video zp-chat-stash-video" src="/assets/memes/clip.webm"></video>' +
      '<figcaption class="zp-chat-img-meta zp-chat-stash-meta"><span>Doshus.NET Meme Stash</span></figcaption></figure>';
    h.messagesEl.appendChild(videoMsg);

    initChatVideoPlayers(videoMsg);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const videoEl = videoMsg.querySelector('video');
    assert.ok(videoEl._zpPlayer, 'Video.js player initialized on chat stash video');
    assert.equal(videoEl._zpPlayer.isDisposed(), false, 'Player is active and not disposed');
    assert.equal(h.getVideoStats().videoInitCount, 1, 'Exactly one player initialized');

    // Duplicate-init check: calling initChatVideoPlayers again does NOT create a second player
    initChatVideoPlayers(videoMsg);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(h.getVideoStats().videoInitCount, 1, 'Duplicate init safely ignored');

    // Panel close pauses playing video
    h.orb.click(); // opens panel (isOpen -> true)
    videoEl._zpPlayer._paused = false;
    assert.equal(videoEl._zpPlayer.paused(), false);
    h.orb.click(); // closes panel (isOpen -> false)
    assert.equal(videoEl._zpPlayer.paused(), true, 'Closing panel pauses active video player');

    // Forget / reset disposes players
    assert.equal(getActiveChatPlayers().size > 0, true, 'Active players tracked');
    disposeChatVideoPlayers();
    assert.equal(videoEl._zpPlayer, null, 'disposeChatVideoPlayers clears player reference');
    assert.equal(getActiveChatPlayers().size, 0, 'Active players set cleared after dispose');

    // Native fallback on Video.js load failure
    const failedVideoMsg = h.doc.createElement('div');
    failedVideoMsg.className = 'zp-chat-msg zp-chat-msg-bot';
    failedVideoMsg.innerHTML = '<figure class="zp-chat-img-card zp-chat-video-card zp-chat-stash-card">' +
      '<video controls playsinline preload="metadata" class="video-js zp-chat-video zp-chat-stash-video" src="/assets/memes/fallback.webm"></video>' +
      '</figure>';
    h.messagesEl.appendChild(failedVideoMsg);

    // Mock loader failure
    h.win.attachVideoJsPlayer = async (vEl) => {
      vEl.controls = true;
      vEl.classList.remove('video-js');
      throw new Error('Video.js failed to load');
    };
    initChatVideoPlayers(failedVideoMsg);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const fallbackVideoEl = failedVideoMsg.querySelector('video');
    assert.equal(fallbackVideoEl.controls, true, 'Fallback video has native controls enabled');
    assert.equal(fallbackVideoEl.classList.contains('video-js'), false, 'video-js class removed on fallback');

    // Async race safety: if element disconnected before player attaches, player is not created or is disposed
    const detachedVideoMsg = h.doc.createElement('div');
    detachedVideoMsg.innerHTML = '<figure class="zp-chat-img-card zp-chat-video-card">' +
      '<video controls class="video-js zp-chat-stash-video" src="/assets/memes/race.webm"></video></figure>';
    h.win.attachVideoJsPlayer = async (vEl) => {
      if (!vEl.isConnected) return null;
      return new h.win.videojs(vEl, {});
    };
    initChatVideoPlayers(detachedVideoMsg);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(detachedVideoMsg.querySelector('video')._zpPlayer, undefined, 'Disconnected element does NOT initialize player');
  }

  // 6. Single canonical Video.js loader architecture (no parallel stack)
  {
    const mainSource = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
    const orbSource = fs.readFileSync(path.join(__dirname, '../public/js/zephyy-orb.js'), 'utf8');
    const loaderSource = fs.readFileSync(path.join(__dirname, '../public/js/video-loader.js'), 'utf8');

    // Vendor paths are ONLY defined in public/js/video-loader.js
    assert.doesNotMatch(mainSource, /\/assets\/vendor\/videojs\/video\.min\.js/, 'main.js does not define vendor script path');
    assert.doesNotMatch(orbSource, /\/assets\/vendor\/videojs\/video\.min\.js/, 'zephyy-orb.js does not define vendor script path');
    assert.doesNotMatch(mainSource, /function ensureVideoLoader/, 'main.js does not define loader');
    assert.doesNotMatch(orbSource, /function ensureVideoLoader/, 'zephyy-orb.js does not define loader');
    assert.doesNotMatch(mainSource, /loadVideoJs\._isStub/, 'main.js has no loader stubs');
    assert.doesNotMatch(orbSource, /loadVideoJs\._isStub/, 'zephyy-orb.js has no loader stubs');
    assert.match(loaderSource, /\/assets\/vendor\/videojs\/video\.min\.js/, 'video-loader.js defines canonical vendor script path');
    assert.match(loaderSource, /\/assets\/vendor\/videojs\/video-js\.min\.css/, 'video-loader.js defines canonical vendor sheet path');
  }

  // 7. Concurrent home board + chat video load (shared readiness for BOTH JS and CSS, in-flight gate, dedupe)
  {
    const loaderSource = fs.readFileSync(path.join(__dirname, '../public/js/video-loader.js'), 'utf8');
    const h = buildHarness(orbSource);
    h.setManualVendorLoad(true);

    // Place existing meme-video.css in head to test cascade order preservation
    const memeCss = h.doc.createElement('link');
    memeCss.setAttribute('rel', 'stylesheet');
    memeCss.setAttribute('href', '/css/meme-video.css');
    h.doc.head.appendChild(memeCss);

    // Run video-loader.js inside the harness environment (without vendor videojs pre-loaded)
    delete h.win.videojs;
    const vm = require('node:vm');
    vm.runInContext(loaderSource, h.context);

    assert.equal(typeof h.win.loadVideoJs, 'function', 'loadVideoJs exported by video-loader.js');
    assert.equal(typeof h.win.attachVideoJsPlayer, 'function', 'attachVideoJsPlayer exported by video-loader.js');

    // Simulate concurrent loadVideoJs calls (e.g. home board meme card + chat panel at same time)
    const p1 = h.win.loadVideoJs();
    const p2 = h.win.loadVideoJs();

    // Verify only ONE stylesheet link was added
    const sheets = h.doc.head.children.filter(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css'));
    assert.equal(sheets.length, 1, 'Only one vendor stylesheet link created on concurrent loads');

    // Verify stylesheet was inserted BEFORE meme-video.css in head
    const sheetIdx = h.doc.head.children.indexOf(sheets[0]);
    const memeCssIdx = h.doc.head.children.indexOf(memeCss);
    assert.ok(sheetIdx < memeCssIdx, 'video-js stylesheet must be inserted before meme-video.css');

    // Verify only ONE vendor script was added
    const scripts = h.doc.head.children.filter(c => c.tagName === 'SCRIPT' && c.src && c.src.includes('video.min.js'));
    assert.equal(scripts.length, 1, 'Only one vendor script tag created on concurrent loads');

    // Script publishes global before CSS loads
    const mockVjs = function(el, opts) {
      return { el, opts, isDisposed: () => false, dispose: () => {} };
    };
    h.win.videojs = mockVjs;
    scripts[0].onload();

    // In-flight CSS gate: verify p1 and p2 have NOT resolved because CSS is still in flight
    let p1Resolved = false;
    p1.then(() => { p1Resolved = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(p1Resolved, false, 'loader must NOT resolve when CSS is still in-flight even if window.videojs exists');

    // Second attach arrives while CSS is in flight: must also await CSS
    const videoEl2 = h.doc.createElement('video');
    videoEl2.src = '/assets/memes/second.webm';
    h.doc.body.appendChild(videoEl2);
    const attachPromise2 = h.win.attachVideoJsPlayer(videoEl2);
    let attach2Resolved = false;
    attachPromise2.then(() => { attach2Resolved = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(attach2Resolved, false, 'second attach must await in-flight CSS settlement');

    // Dedupe check: still only one script and one sheet in head
    assert.equal(h.doc.head.children.filter(c => c.tagName === 'SCRIPT' && c.src && c.src.includes('video.min.js')).length, 1);
    assert.equal(h.doc.head.children.filter(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css')).length, 1);

    // CSS finishes loading: both resolve
    sheets[0].onload();
    const [vjs1, vjs2, player2] = await Promise.all([p1, p2, attachPromise2]);
    assert.equal(vjs1, mockVjs);
    assert.equal(vjs2, mockVjs);
    assert.equal(vjs1, vjs2, 'Concurrent callers resolve with identical videojs instance');
    assert.ok(player2, 'Second attach resolves player after CSS settlement');
  }

  // 8. Failed load retry (CSS failure then retry, script failure then retry)
  {
    const loaderSource = fs.readFileSync(path.join(__dirname, '../public/js/video-loader.js'), 'utf8');
    const h = buildHarness(orbSource);
    h.setManualVendorLoad(true);
    delete h.win.videojs;
    const vm = require('node:vm');
    vm.runInContext(loaderSource, h.context);

    const mockVjs = function(el, opts) {
      return { el, opts, isDisposed: () => false, dispose: () => {} };
    };

    // 8a. CSS failure rejects promise and cleans up DOM; subsequent call retries cleanly
    const cssFailPromise = h.win.loadVideoJs();
    const failSheet = h.doc.head.children.find(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css'));
    assert.ok(failSheet, 'stylesheet created');
    failSheet.onerror();
    await assert.rejects(cssFailPromise, /Video\.js stylesheet failed to load/);
    assert.equal(h.doc.head.children.filter(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css')).length, 0, 'failed sheet removed from DOM');

    const cssRetryPromise = h.win.loadVideoJs();
    const newRetrySheet = h.doc.head.children.find(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css'));
    const newRetryScript = h.doc.head.children.find(c => c.tagName === 'SCRIPT' && c.src && c.src.includes('video.min.js'));
    assert.ok(newRetrySheet && newRetryScript, 'new script and sheet created on retry after CSS failure');
    h.win.videojs = mockVjs;
    newRetryScript.onload();
    newRetrySheet.onload();
    const resolvedAfterCss = await cssRetryPromise;
    assert.equal(resolvedAfterCss, mockVjs, 'Retry succeeds after CSS failure');

    // 8b. Script failure rejects promise and cleans up DOM; subsequent call retries cleanly
    delete h.win.videojs;
    vm.runInContext(loaderSource, h.context);
    const scriptFailPromise = h.win.loadVideoJs();
    const failScript = h.doc.head.children.filter(c => c.tagName === 'SCRIPT' && c.src && c.src.includes('video.min.js')).pop();
    assert.ok(failScript, 'script created');
    failScript.onerror();
    await assert.rejects(scriptFailPromise, /Video\.js failed to load/);

    const scriptRetryPromise = h.win.loadVideoJs();
    const retryScript2 = h.doc.head.children.filter(c => c.tagName === 'SCRIPT' && c.src && c.src.includes('video.min.js')).pop();
    const retrySheet2 = h.doc.head.children.filter(c => c.tagName === 'LINK' && c.href && c.href.includes('video-js.min.css')).pop();
    assert.ok(retryScript2 && retrySheet2, 'new script and sheet created on retry after script failure');
    h.win.videojs = mockVjs;
    retrySheet2.onload();
    retryScript2.onload();
    const resolvedAfterScript = await scriptRetryPromise;
    assert.equal(resolvedAfterScript, mockVjs, 'Retry succeeds after script failure');
  }

  // 9. All 11 page entry points wired in load order (including 404 and 4 Zephyy subpages)
  {
    const wiredPages = [
      { path: '../public/amazon/printmon/gallery.html', pattern: /<script src="\.\.\/\.\.\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/index.html', pattern: /<script src="js\/video-loader\.js"><\/script>/ },
      { path: '../public/financehub.html', pattern: /<script src="js\/video-loader\.js"><\/script>/ },
      { path: '../public/nexus.html', pattern: /<script src="js\/video-loader\.js"><\/script>/ },
      { path: '../public/thelounge.html', pattern: /<script src="js\/video-loader\.js"><\/script>/ },
      { path: '../public/zephyy.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/404.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/zephyy/status/index.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/zephyy/crew/index.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/zephyy/qa/index.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ },
      { path: '../public/zephyy/changelog/index.html', pattern: /<script src="\/js\/video-loader\.js"><\/script>/ }
    ];

    assert.equal(wiredPages.length, 11, 'exactly 11 site pages wired with video-loader.js');
    for (const pg of wiredPages) {
      const html = fs.readFileSync(path.join(__dirname, pg.path), 'utf8');
      assert.match(html, pg.pattern, `${pg.path} wires video-loader.js`);
    }
  }
}
