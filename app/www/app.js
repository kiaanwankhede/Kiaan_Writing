/*
 * Picture Pen — prototype.
 * Routine: First write -> Then one picture with its spelling.
 * Errorless tracing: the ink only moves forward along the correct path,
 * so wandering off simply pauses it. There is no "wrong" sound or screen.
 */
(function () {
  'use strict';

  var D = window.PP_DATA;
  var SHAPES = D.SHAPES, REWARDS = D.REWARDS, SETS = D.SETS;
  var IMG = 'img/';
  var STORE_KEY = 'picturepen.v1';
  var ALL_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(SETS.strokes.keys);
  var SYMBOL = { 'line-down': '│', 'line-across': '—', 'circle': '◯', 'cross': '+' };

  var prefersReduced = false;
  try { prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var DEFAULTS = {
    settings: {
      name: '', set: 'straight', custom: ['L', 'T', 'I'], order: 'sequence', turns: '5',
      tolerance: 'wide', guide: 'strong', demo: 'on', voice: 'spell', chime: 'on',
      calm: prefersReduced ? 'on' : 'off'
    },
    progress: {}, // key -> { count, last }
    book: [],     // keys whose picture has been earned
    cursor: {},   // set -> next index when practising "in order"
    sessions: 0
  };

  // ---------------------------------------------------------------- storage
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var d = clone(DEFAULTS);
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) if (k !== 'settings') d[k] = saved[k];
        for (var s in saved.settings || {}) d.settings[s] = saved.settings[s];
      }
    } catch (e) {}
    return d;
  }
  var data = load();
  var S = data.settings;
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {} }

  // Own photos live in IndexedDB (bigger than localStorage allows).
  var photos = {}; // key -> { word, url }
  var idb = {
    open: function () {
      return new Promise(function (res, rej) {
        if (!('indexedDB' in window)) return rej(new Error('no indexedDB'));
        var r = indexedDB.open('picturepen', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    },
    tx: function (mode, fn) {
      return idb.open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('photos', mode);
          var out = fn(t.objectStore('photos'));
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { rej(t.error); };
        });
      });
    },
    all: function () {
      return idb.open().then(function (db) {
        return new Promise(function (res, rej) {
          var out = {};
          var req = db.transaction('photos', 'readonly').objectStore('photos').openCursor();
          req.onsuccess = function () {
            var c = req.result;
            if (c) { out[c.key] = c.value; c.continue(); } else res(out);
          };
          req.onerror = function () { rej(req.error); };
        });
      });
    },
    put: function (key, val) { return idb.tx('readwrite', function (st) { st.put(val, key); }); },
    del: function (key) { return idb.tx('readwrite', function (st) { st.delete(key); }); }
  };
  function loadPhotos() {
    return idb.all().then(function (all) {
      for (var k in photos) URL.revokeObjectURL(photos[k].url);
      photos = {};
      for (var key in all) photos[key] = { word: all[key].word, url: URL.createObjectURL(all[key].blob) };
    }).catch(function () {});
  }

  function rewardFor(key) {
    var base = REWARDS[key];
    var p = photos[key];
    if (p) return { word: p.word || base.word, src: p.url, photo: true };
    return { word: base.word, src: IMG + base.img + '.svg', photo: false };
  }
  function labelFor(key) { return SHAPES[key].label || key; }

  // ---------------------------------------------------------------- native bridge
  // Inside the Android/iOS app, Capacitor exposes native plugins. In a plain
  // browser (used for quick checks) these are simply missing and we fall back.
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  function plugin(name) {
    if (!isNative) return null;
    try { return (Cap.Plugins && Cap.Plugins[name]) || (Cap.registerPlugin ? Cap.registerPlugin(name) : null); } catch (e) { return null; }
  }
  var NativeTTS = plugin('TextToSpeech');
  var NativeApp = plugin('App');

  // ---------------------------------------------------------------- sound
  var actx = null;
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) {} }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, gain) {
    var ctx = audio();
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    var t = ctx.currentTime + start;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function chime(kind) {
    if (S.chime !== 'on') return;
    if (kind === 'stroke') tone(659.25, 0, 0.35, 0.05);
    else { tone(523.25, 0, 0.5, 0.045); tone(659.25, 0.12, 0.5, 0.045); tone(783.99, 0.24, 0.8, 0.045); }
  }

  // ---------------------------------------------------------------- speech
  // Android's WebView has no Web Speech API, so the app uses the native
  // text-to-speech engine (the voice the tablet is set up with).
  var webTTS = 'speechSynthesis' in window;
  var hasTTS = !!NativeTTS || webTTS;
  var voice = null;
  var ttsLang = (navigator.language || 'en-US');
  if (!/^en/i.test(ttsLang)) ttsLang = 'en-US';
  function pickVoice() {
    if (!webTTS) return null;
    var vs = speechSynthesis.getVoices() || [];
    var lang = ttsLang.toLowerCase();
    var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
    voice = en.filter(function (v) { return v.lang.toLowerCase() === lang; })[0] ||
            en.filter(function (v) { return v.default; })[0] || en[0] || null;
  }
  if (!NativeTTS && webTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function unlockSpeech() {
    audio();
    if (NativeTTS || !webTTS) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function speak(text) {
    return new Promise(function (res) {
      if (!hasTTS) return res();
      var done = false;
      function fin() { if (!done) { done = true; res(); } }
      setTimeout(fin, 1200 + text.length * 160); // never hang if a voice misbehaves
      if (NativeTTS) {
        NativeTTS.speak({ text: text, lang: ttsLang, rate: 0.85, pitch: 1.05, volume: 1, category: 'playback' }).then(fin, fin);
        return;
      }
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.82; u.pitch = 1.05;
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
      } catch (e) { fin(); }
    });
  }
  function stopSpeech() {
    speakRun++;
    if (NativeTTS) { try { NativeTTS.stop().catch(function () {}); } catch (e) {} }
    else if (webTTS) { try { speechSynthesis.cancel(); } catch (e) {} }
  }

  // Build the letter tiles of a word: A P P L E
  function buildTiles(el, word) {
    el.innerHTML = '';
    var firstDone = false;
    word.toUpperCase().split('').forEach(function (ch) {
      var t = document.createElement('span');
      if (/[A-Z]/.test(ch)) {
        t.className = 'tile' + (firstDone ? '' : ' first');
        t.textContent = ch;
        firstDone = true;
      } else {
        t.className = 'tile gap';
        t.textContent = ch === '-' ? '-' : '';
      }
      el.appendChild(t);
    });
  }

  // "A is for Apple. A, P, P, L, E. Apple!" with each tile lighting up in turn.
  var speakRun = 0;
  function playWord(el, key, word) {
    stopSpeech();
    var run = speakRun;
    var tiles = Array.prototype.slice.call(el.querySelectorAll('.tile:not(.gap)'));
    var useVoice = hasTTS && S.voice !== 'off';
    function alive() { return run === speakRun; }
    function clear() { tiles.forEach(function (t) { t.classList.remove('lit'); }); }
    function all() { tiles.forEach(function (t) { t.classList.add('lit'); }); }
    clear();
    var p = useVoice ? speak(key.length === 1 ? key + ' is for ' + word : word + '!') : wait(250);
    return p.then(function () {
      if (!alive()) return;
      var spell = S.voice === 'spell' || (!useVoice && S.calm !== 'on');
      if (!spell) return;
      return tiles.reduce(function (chain, t) {
        return chain.then(function () {
          if (!alive()) return;
          clear(); t.classList.add('lit');
          return (useVoice && S.voice === 'spell') ? speak(t.textContent) : wait(450);
        });
      }, Promise.resolve());
    }).then(function () {
      if (!alive()) return;
      all();
      return useVoice ? speak(word) : wait(500);
    }).then(function () {
      return wait(900);
    }).then(function () {
      if (alive()) clear();
    });
  }

  // ---------------------------------------------------------------- geometry
  function resample(points, step) {
    var pts = [points[0].slice()], cum = [0], total = 0;
    for (var i = 1; i < points.length; i++) {
      var x0 = points[i - 1][0], y0 = points[i - 1][1], x1 = points[i][0], y1 = points[i][1];
      var d = Math.hypot(x1 - x0, y1 - y0);
      if (d === 0) continue;
      var n = Math.max(1, Math.ceil(d / step));
      for (var k = 1; k <= n; k++) {
        var t = k / n;
        pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
        total += d / n;
        cum.push(total);
      }
    }
    return { pts: pts, cum: cum, len: total };
  }
  function idxAt(st, s) {
    if (s <= 0) return 0;
    if (s >= st.len) return st.pts.length - 1;
    var lo = 0, hi = st.cum.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (st.cum[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function pointAt(st, s) {
    var i = idxAt(st, s);
    if (i >= st.pts.length - 1) return st.pts[st.pts.length - 1];
    var a = st.pts[i], b = st.pts[i + 1];
    var seg = st.cum[i + 1] - st.cum[i] || 1;
    var t = (s - st.cum[i]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function tangentAt(st, s) {
    var a = pointAt(st, Math.max(0, s - 1.5)), b = pointAt(st, Math.min(st.len, s + 1.5));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  var TOL = { wide: 15, medium: 10.5, narrow: 7 };

  // ---------------------------------------------------------------- screens
  var $ = function (id) { return document.getElementById(id); };
  var current = 'home';
  function show(name) {
    current = name;
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i].dataset.screen !== name;
    if (name !== 'reward' && name !== 'book') stopSpeech();
    if (name === 'home') renderHome();
    if (name === 'trace') { sizeCanvas(); startLoop(); }
    if (name === 'book') renderBook();
    if (name === 'parent') renderParent();
  }
  function applyCalm() { document.documentElement.classList.toggle('calm', S.calm === 'on'); }

  // Press-and-hold buttons keep little fingers from leaving by accident.
  function holdButton(el, ms, onDone) {
    var t0 = 0, raf = 0, active = false;
    function set(p) { el.style.setProperty('--p', p); }
    function tick() {
      var p = Math.min(1, (performance.now() - t0) / ms);
      set(p);
      if (p >= 1) { active = false; set(0); onDone(); return; }
      raf = requestAnimationFrame(tick);
    }
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      active = true; t0 = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      raf = requestAnimationFrame(tick);
    });
    function cancel() { if (!active) return; active = false; cancelAnimationFrame(raf); set(0); }
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) { if (e.detail === 0) onDone(); }); // keyboard users
  }

  // ---------------------------------------------------------------- home
  function renderHome() {
    var name = (S.name || '').trim();
    $('greeting').textContent = name ? 'Hi ' + name + '!' : 'Hi there!';
    $('book-count').textContent = data.book.length;
  }

  // ---------------------------------------------------------------- session
  var session = null;
  function setKeys() {
    if (S.set === 'custom') return S.custom && S.custom.length ? S.custom.slice() : ['L'];
    return (SETS[S.set] || SETS.straight).keys.slice();
  }
  function buildQueue() {
    var keys = setKeys(), n = parseInt(S.turns, 10) || 5, q = [];
    if (S.order === 'shuffle') {
      var bag = [];
      while (q.length < n) {
        if (!bag.length) bag = keys.slice().sort(function () { return Math.random() - 0.5; });
        var k = bag.shift();
        if (q.length && q[q.length - 1] === k && keys.length > 1) { bag.push(k); continue; }
        q.push(k);
      }
    } else {
      var c = (data.cursor[S.set] || 0) % keys.length;
      for (var i = 0; i < n; i++) q.push(keys[(c + i) % keys.length]);
      data.cursor[S.set] = (c + n) % keys.length;
      save();
    }
    return q;
  }
  function startSession() {
    unlockSpeech();
    session = { queue: buildQueue(), idx: 0, earned: [], doneTurn: false };
    startTurn();
  }
  function renderStars(el) {
    el.innerHTML = '';
    for (var i = 0; i < session.queue.length; i++) {
      var li = document.createElement('li');
      var on = i < session.idx || (i === session.idx && session.doneTurn);
      li.className = on ? 'on' : (i === session.idx ? 'now' : '');
      li.innerHTML = '<img src="' + IMG + 'star.svg" alt="">';
      el.appendChild(li);
    }
  }

  // ---------------------------------------------------------------- tracing
  var T = null;
  var canvas = $('trace-canvas'), ctx = canvas.getContext('2d');
  var geo = { size: 400, margin: 24, scale: 3.5, dpr: 1 };

  function startTurn() {
    var key = session.queue[session.idx];
    session.doneTurn = false;
    T = {
      key: key,
      strokes: SHAPES[key].strokes.map(function (s) { return resample(s, 1); }),
      si: 0, prog: 0, tracking: false, downId: null, done: false, glowAt: 0,
      lastProgressAt: performance.now(), demo: null, finger: null, nudgeAt: 0
    };
    $('trace-label').textContent = key.length === 1 ? 'Letter ' + key : labelFor(key);
    renderStars($('stars-trace'));
    show('trace');
    if (S.demo === 'on') setTimeout(function () { if (T && T.key === key && !T.tracking && T.prog === 0 && T.si === 0) playDemo(); }, 450);
  }

  function sizeCanvas() {
    var wrap = $('canvas-wrap').getBoundingClientRect();
    var size = Math.max(220, Math.floor(Math.min(wrap.width, wrap.height, 760)));
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    geo.size = size; geo.dpr = dpr;
    geo.margin = size * 0.07;
    geo.scale = (size - 2 * geo.margin) / 100;
  }
  window.addEventListener('resize', function () { if (current === 'trace') sizeCanvas(); });

  function toUnits(e) {
    var r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - geo.margin) / geo.scale, (e.clientY - r.top - geo.margin) / geo.scale];
  }

  function playDemo() {
    if (!T || T.done) return;
    var st = T.strokes[T.si];
    T.demo = { si: T.si, from: T.prog, t0: performance.now(), dur: Math.max(700, (st.len - T.prog) * 14) };
  }

  function startTol() { return Math.max(TOL[S.tolerance] * 1.35, 12); }

  // One finger at a time. While the finger stays down it can pick the line
  // back up whenever it returns to the head dot, so there is nothing to "redo".
  canvas.addEventListener('pointerdown', function (e) {
    if (!T || T.done) return;
    if (T.downId !== null && T.downId !== e.pointerId) return;
    e.preventDefault();
    audio();
    T.downId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = toUnits(e);
    T.finger = p;
    if (!tryPickUp(p)) T.nudgeAt = performance.now(); // gently point at where to start; no error sound
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!T || T.done || e.pointerId !== T.downId) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!evs.length) evs = [e];
    for (var i = 0; i < evs.length && !T.done; i++) {
      var p = toUnits(evs[i]);
      T.finger = p;
      if (T.tracking) advance(p); else tryPickUp(p);
    }
  });
  function release(e) {
    if (!T || e.pointerId !== T.downId) return;
    T.tracking = false; T.downId = null; T.finger = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function tryPickUp(p) {
    var head = pointAt(T.strokes[T.si], T.prog);
    if (dist(p, head) > startTol()) return false;
    T.tracking = true;
    T.demo = null;
    advance(p);
    return true;
  }

  function advance(p) {
    var st = T.strokes[T.si];
    var tol = TOL[S.tolerance] || TOL.wide;
    var i0 = idxAt(st, T.prog - 4), i1 = Math.min(st.pts.length - 1, idxAt(st, T.prog + 22) + 1);
    var best = -1, bd = Infinity;
    for (var i = i0; i <= i1; i++) {
      var d = dist(p, st.pts[i]);
      if (d < bd) { bd = d; best = i; }
    }
    T.finger = p;
    if (bd <= tol) {
      var s = st.cum[best];
      if (s > T.prog) { T.prog = s; T.lastProgressAt = performance.now(); }
      if (T.prog >= st.len - 3) completeStroke(p);
    } else if (bd > tol * 2.2) {
      T.tracking = false; // wandered off: the ink just waits where it is
    }
  }

  function completeStroke(p) {
    var st = T.strokes[T.si];
    T.prog = st.len;
    T.si++;
    if (T.si >= T.strokes.length) {
      T.si = T.strokes.length - 1;
      T.done = true; T.tracking = false; T.glowAt = performance.now();
      chime('letter');
      letterDone();
      return;
    }
    chime('stroke');
    T.prog = 0;
    T.lastProgressAt = performance.now();
    var next = T.strokes[T.si];
    var keepGoing = T.tracking && dist(p, next.pts[0]) <= startTol();
    if (!keepGoing) {
      T.tracking = false;
      if (S.demo === 'on') setTimeout(function () { if (T && !T.tracking && !T.done && T.prog === 0) playDemo(); }, 350);
    }
  }

  function letterDone() {
    var key = T.key;
    var pr = data.progress[key] || { count: 0, last: 0 };
    pr.count++; pr.last = Date.now();
    data.progress[key] = pr;
    if (data.book.indexOf(key) === -1) data.book.push(key);
    save();
    setTimeout(function () { showReward(key); }, 750);
  }

  // Drawing ---------------------------------------------------------------
  var C = { paper: '#FFFFFF', lines: '#EFE9DE', base: '#E2D9C9', track: '#ECE5D8', ink: '#4263EB', start: '#2F9E6B', arrow: '#B7AC98', ghost: '#F08C00' };

  function polyline(st, from, to) {
    var i0 = idxAt(st, from), i1 = idxAt(st, to);
    var a = pointAt(st, from);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    for (var i = i0 + 1; i <= i1; i++) ctx.lineTo(st.pts[i][0], st.pts[i][1]);
    var b = pointAt(st, to);
    ctx.lineTo(b[0], b[1]);
  }

  function draw(now) {
    var g = geo, k = g.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, g.size, g.size);
    if (!T) return;
    ctx.setTransform(k * g.scale, 0, 0, k * g.scale, k * g.margin, k * g.margin);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Writing lines, like the paper he will move on to.
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = C.base;
    [10, 90].forEach(function (y) { ctx.beginPath(); ctx.moveTo(-3, y); ctx.lineTo(103, y); ctx.stroke(); });
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = C.lines;
    ctx.beginPath(); ctx.moveTo(-3, 50); ctx.lineTo(103, 50); ctx.stroke();
    ctx.setLineDash([]);

    var guide = S.guide;
    var calm = S.calm === 'on';

    // Track (the grey road to follow)
    ctx.globalAlpha = guide === 'light' ? 0.45 : 1;
    ctx.strokeStyle = C.track;
    ctx.lineWidth = 17;
    T.strokes.forEach(function (st) { polyline(st, 0, st.len); ctx.stroke(); });
    ctx.globalAlpha = 1;

    // Ink: finished strokes and the part of the current stroke already traced
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 11;
    if (T.done && !calm) {
      var gl = Math.min(1, (now - T.glowAt) / 500);
      ctx.shadowColor = 'rgba(66, 99, 235, .45)';
      ctx.shadowBlur = 12 * Math.sin(gl * Math.PI) * g.dpr;
    }
    for (var i = 0; i < T.strokes.length; i++) {
      var st = T.strokes[i];
      if (i < T.si || T.done) { polyline(st, 0, st.len); ctx.stroke(); }
      else if (i === T.si && T.prog > 0) { polyline(st, 0, T.prog); ctx.stroke(); }
    }
    ctx.shadowBlur = 0;
    if (T.done) return;

    var cur = T.strokes[T.si];

    // Direction arrows along what is left of the current stroke
    if (guide === 'strong') {
      ctx.strokeStyle = C.arrow;
      ctx.lineWidth = 1.8;
      for (var s = T.prog + 10; s < cur.len - 6; s += 15) {
        var pt = pointAt(cur, s), a = tangentAt(cur, s);
        ctx.save();
        ctx.translate(pt[0], pt[1]); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-2.2, -3); ctx.lineTo(1.6, 0); ctx.lineTo(-2.2, 3); ctx.stroke();
        ctx.restore();
      }
    }

    // Finish ring
    if (guide !== 'light') {
      var end = cur.pts[cur.pts.length - 1];
      ctx.strokeStyle = C.arrow; ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(end[0], end[1], 6.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Demo: a ghost dot shows the way
    if (T.demo) {
      var f = Math.min(1, (now - T.demo.t0) / T.demo.dur);
      var ds = T.strokes[T.demo.si];
      var upto = T.demo.from + (ds.len - T.demo.from) * f;
      ctx.globalAlpha = 0.28; ctx.strokeStyle = C.ghost; ctx.lineWidth = 8;
      polyline(ds, T.demo.from, upto); ctx.stroke();
      ctx.globalAlpha = 1;
      var gp = pointAt(ds, upto);
      ctx.fillStyle = C.ghost;
      ctx.beginPath(); ctx.arc(gp[0], gp[1], 5.5, 0, Math.PI * 2); ctx.fill();
      if (f >= 1 && now - T.demo.t0 > T.demo.dur + 300) T.demo = null;
    }

    // Head: where to put the finger (green at a fresh start, blue to resume)
    var head = pointAt(cur, T.prog);
    var pulse = calm ? 0 : Math.sin(now / 260) * 1.1;
    var nudge = now - T.nudgeAt < 700 ? 3 * Math.sin(((now - T.nudgeAt) / 700) * Math.PI) : 0;
    var r = (guide === 'light' ? 6 : 7.5) + pulse + nudge;
    ctx.fillStyle = T.prog === 0 ? C.start : C.ink;
    ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    if (guide === 'strong' && T.prog === 0 && T.strokes.length > 1) {
      ctx.font = '900 8px Nunito, ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(T.si + 1), head[0], head[1] + 0.4);
    } else {
      ctx.beginPath(); ctx.arc(head[0], head[1], 2.4, 0, Math.PI * 2); ctx.fill();
    }

    // Soft halo under the finger
    if (T.tracking && T.finger) {
      ctx.fillStyle = 'rgba(66, 99, 235, .12)';
      ctx.beginPath(); ctx.arc(T.finger[0], T.finger[1], 9, 0, Math.PI * 2); ctx.fill();
    }

    // Stuck for a while? Show the way again (only when "Show me first" is on).
    if (S.demo === 'on' && !T.tracking && !T.demo && now - T.lastProgressAt > 7000) {
      T.lastProgressAt = now;
      playDemo();
    }
  }

  var looping = false;
  function startLoop() {
    if (looping) return;
    looping = true;
    (function frame(now) {
      if (current !== 'trace') { looping = false; return; }
      draw(now);
      requestAnimationFrame(frame);
    })(performance.now());
  }

  // ---------------------------------------------------------------- reward
  function setPicture(imgEl, btnEl, rw, pop) {
    imgEl.src = rw.src;
    imgEl.alt = rw.word;
    imgEl.classList.toggle('photo', !!rw.photo);
    if (pop && S.calm !== 'on') { btnEl.classList.remove('pop'); void btnEl.offsetWidth; btnEl.classList.add('pop'); }
  }
  function showReward(key) {
    var rw = rewardFor(key);
    session.doneTurn = true;
    session.earned.push(key);
    renderStars($('stars-reward'));
    setPicture($('reward-img'), $('reward-pic'), rw, true);
    buildTiles($('reward-tiles'), rw.word);
    show('reward');
    setTimeout(function () { if (current === 'reward') playWord($('reward-tiles'), key, rw.word); }, 350);
  }
  $('reward-pic').addEventListener('click', function () {
    var key = session.queue[session.idx];
    playWord($('reward-tiles'), key, rewardFor(key).word);
  });
  $('btn-again').addEventListener('click', function () { startTurn(); });
  $('btn-next').addEventListener('click', function () {
    session.idx++;
    if (session.idx >= session.queue.length) { finishSession(); return; }
    startTurn();
  });

  // ---------------------------------------------------------------- done
  function finishSession() {
    data.sessions++;
    save();
    var row = $('done-row');
    row.innerHTML = '';
    var seen = {};
    session.earned.forEach(function (key) {
      if (seen[key]) return;
      seen[key] = 1;
      var rw = rewardFor(key);
      var li = document.createElement('li');
      li.innerHTML = '<img alt=""><span></span>';
      li.querySelector('img').src = rw.src;
      if (rw.photo) li.querySelector('img').className = 'photo';
      li.querySelector('span').textContent = rw.word;
      row.appendChild(li);
    });
    chime('letter');
    show('done');
  }
  $('btn-done-home').addEventListener('click', function () { show('home'); });
  $('btn-done-book').addEventListener('click', function () { show('book'); });

  // ---------------------------------------------------------------- picture book
  function renderBook() {
    var grid = $('book-grid');
    grid.innerHTML = '';
    var earned = 0;
    ALL_KEYS.forEach(function (key) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      var has = data.book.indexOf(key) !== -1;
      if (has) {
        earned++;
        var rw = rewardFor(key);
        b.className = 'earned';
        b.innerHTML = '<img alt=""><span class="word"></span>';
        b.querySelector('img').src = rw.src;
        if (rw.photo) b.querySelector('img').className = 'photo';
        b.querySelector('.word').textContent = rw.word;
        b.setAttribute('aria-label', rw.word);
        b.addEventListener('click', function () { openViewer(key); });
      } else {
        b.innerHTML = '<span class="ghost"></span>';
        b.querySelector('.ghost').textContent = SYMBOL[key] || key;
        b.setAttribute('aria-label', 'Not yet: ' + labelFor(key));
        b.disabled = true;
      }
      li.appendChild(b);
      grid.appendChild(li);
    });
    $('book-meta').textContent = earned + ' of ' + ALL_KEYS.length;
  }
  var viewerKey = null;
  function openViewer(key) {
    viewerKey = key;
    var rw = rewardFor(key);
    setPicture($('viewer-img'), $('viewer-pic'), rw, true);
    buildTiles($('viewer-tiles'), rw.word);
    $('viewer').hidden = false;
    playWord($('viewer-tiles'), key, rw.word);
  }
  $('viewer-pic').addEventListener('click', function () { playWord($('viewer-tiles'), viewerKey, rewardFor(viewerKey).word); });
  $('viewer-close').addEventListener('click', function () { stopSpeech(); $('viewer').hidden = true; });
  $('btn-book-back').addEventListener('click', function () { $('viewer').hidden = true; show('home'); });

  // ---------------------------------------------------------------- parent zone
  function optionHTML(key) {
    return key.length === 1 ? key + ' — ' + REWARDS[key].word : labelFor(key) + ' — ' + REWARDS[key].word;
  }
  function renderParent() {
    // set select
    var sel = $('set-select');
    sel.innerHTML = '';
    Object.keys(SETS).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = SETS[k].label + (k === 'custom' ? '' : ' (' + SETS[k].keys.join(' ').replace(/line-down|line-across|circle|cross/g, function (m) { return SYMBOL[m]; }) + ')');
      sel.appendChild(o);
    });
    sel.value = S.set;
    $('custom-field').hidden = S.set !== 'custom';

    // custom picker
    var pick = $('pick-grid');
    pick.innerHTML = '';
    ALL_KEYS.forEach(function (key) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.textContent = SYMBOL[key] || key;
      b.setAttribute('aria-pressed', S.custom.indexOf(key) !== -1 ? 'true' : 'false');
      b.addEventListener('click', function () {
        var i = S.custom.indexOf(key);
        if (i === -1) S.custom.push(key); else S.custom.splice(i, 1);
        b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
        save();
      });
      li.appendChild(b); pick.appendChild(li);
    });

    // segmented controls
    var segs = document.querySelectorAll('.seg');
    for (var i = 0; i < segs.length; i++) {
      var setting = segs[i].dataset.setting;
      var btns = segs[i].querySelectorAll('button');
      for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-pressed', btns[j].dataset.value === String(S[setting]) ? 'true' : 'false');
    }

    $('name-input').value = S.name || '';

    // photo letter select
    var pl = $('photo-letter');
    var keep = pl.value;
    pl.innerHTML = '';
    ALL_KEYS.forEach(function (key) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = optionHTML(key) + (photos[key] ? '  (your photo)' : '');
      pl.appendChild(o);
    });
    pl.value = keep || 'A';
    $('photo-word').value = photos[pl.value] ? photos[pl.value].word : REWARDS[pl.value].word;

    // stats + progress grid
    var traces = 0;
    for (var k in data.progress) traces += data.progress[k].count;
    $('stat-pictures').textContent = data.book.length;
    $('stat-traces').textContent = traces;
    $('stat-sessions').textContent = data.sessions;
    var grid = $('progress-grid');
    grid.innerHTML = '';
    ALL_KEYS.forEach(function (key) {
      var c = (data.progress[key] || {}).count || 0;
      var li = document.createElement('li');
      li.dataset.level = c === 0 ? 0 : c < 3 ? 1 : c < 6 ? 2 : 3;
      li.innerHTML = '<span></span><small></small>';
      li.querySelector('span').textContent = SYMBOL[key] || key;
      li.querySelector('small').textContent = c ? c + '×' : '–';
      grid.appendChild(li);
    });
  }

  $('set-select').addEventListener('change', function (e) {
    S.set = e.target.value; save();
    $('custom-field').hidden = S.set !== 'custom';
  });
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      S[seg.dataset.setting] = b.dataset.value;
      save(); applyCalm(); renderParent();
    });
  });
  $('name-input').addEventListener('input', function (e) { S.name = e.target.value.slice(0, 24); save(); });
  $('photo-letter').addEventListener('change', function (e) {
    var key = e.target.value;
    $('photo-word').value = photos[key] ? photos[key].word : REWARDS[key].word;
    $('photo-status').textContent = '';
  });

  function resizeImage(file, max) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('encode failed')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('not an image')); };
      img.src = url;
    });
  }
  $('photo-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    var key = $('photo-letter').value;
    var word = ($('photo-word').value || '').trim() || REWARDS[key].word;
    if (!file) return;
    $('photo-status').textContent = 'Saving…';
    resizeImage(file, 720).then(function (blob) {
      return idb.put(key, { word: word, blob: blob });
    }).then(loadPhotos).then(function () {
      $('photo-status').textContent = 'Saved. ' + (key.length === 1 ? 'Letter ' + key : labelFor(key)) + ' now shows your photo with the word "' + word + '".';
      renderParent();
    }).catch(function () {
      $('photo-status').textContent = 'Sorry, that photo could not be saved on this device.';
    });
    e.target.value = '';
  });
  $('photo-word').addEventListener('change', function () {
    var key = $('photo-letter').value;
    if (!photos[key]) return;
    var word = ($('photo-word').value || '').trim() || REWARDS[key].word;
    idb.all().then(function (all) {
      if (all[key]) return idb.put(key, { word: word, blob: all[key].blob });
    }).then(loadPhotos).then(function () { $('photo-status').textContent = 'Word updated to "' + word + '".'; });
  });
  $('photo-clear').addEventListener('click', function () {
    var key = $('photo-letter').value;
    idb.del(key).then(loadPhotos).then(function () {
      $('photo-status').textContent = 'Back to the built-in picture: ' + REWARDS[key].word + '.';
      renderParent();
    }).catch(function () {});
  });
  $('btn-reset').addEventListener('click', function () {
    if (!window.confirm('Reset the picture book and practice counts?')) return;
    data.progress = {}; data.book = []; data.cursor = {}; data.sessions = 0;
    save(); renderParent();
  });
  $('btn-parent-done').addEventListener('click', function () { show('home'); });

  // ---------------------------------------------------------------- wiring
  $('btn-start').addEventListener('click', startSession);
  $('btn-book').addEventListener('click', function () { show('book'); });
  $('btn-show').addEventListener('click', function () { audio(); playDemo(); });
  holdButton($('btn-parent'), 2000, function () { show('parent'); });
  holdButton($('btn-exit'), 1200, function () { show('home'); });

  applyCalm();
  loadPhotos().then(function () { if (current === 'home') renderHome(); });
  show('home');

  // Android back button: never drops the child out of the app.
  // Grown-up screens go back home; child screens ignore it.
  if (NativeApp && NativeApp.addListener) {
    try {
      NativeApp.addListener('backButton', function () {
        if (!$('viewer').hidden) { stopSpeech(); $('viewer').hidden = true; return; }
        if (current === 'parent' || current === 'book' || current === 'done') show('home');
      });
    } catch (e) {}
  }

  // Small hook used by automated checks (and handy for demos): where the
  // current stroke points are on screen, in CSS pixels.
  window.PicturePen = {
    state: function () { return { screen: current, key: T && T.key, stroke: T && T.si, done: T && T.done, idx: session && session.idx }; },
    strokeScreenPoints: function () {
      if (!T) return [];
      var r = canvas.getBoundingClientRect();
      return T.strokes.map(function (st) {
        return st.pts.filter(function (_, i) { return i % 3 === 0 || i === st.pts.length - 1; }).map(function (p) {
          return [r.left + geo.margin + p[0] * geo.scale, r.top + geo.margin + p[1] * geo.scale];
        });
      });
    }
  };
})();
