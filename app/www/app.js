/*
 * Picture Pen — a calm, reward-based writing app (Android tablet + stylus).
 *
 * Routine: First write -> Then ONE picture with its spelling.
 * Errorless tracing: the ink only moves forward along the correct path,
 * so wandering off simply pauses it. There is no "wrong" sound or screen.
 *
 * Grows with him: begins with one big character and lots of room to wander.
 * As he masters a level, the room shrinks, characters get smaller and more
 * characters appear on each screen (see LEVELS).
 */
(function () {
  'use strict';

  var D = window.PP_DATA;
  var SHAPES = D.SHAPES, SETS = D.SETS, NAMES = D.NAMES;
  var REWARDS = window.PP_REWARDS || [];
  var STORE_KEY = 'picturepen.v2';
  var UI = 'img/ui/', PIC = 'img/r/';

  // n = characters per screen, size = share of the writing area's height,
  // tol = how far (in 1/100ths of a character) the pen may wander from the path.
  var LEVELS = [
    { n: 1, size: 0.96, tol: 18,  guide: 'strong', note: '1 per screen · very big · lots of room' },
    { n: 1, size: 0.84, tol: 14,  guide: 'strong', note: '1 per screen · big · plenty of room' },
    { n: 2, size: 0.80, tol: 12,  guide: 'strong', note: '2 per screen · big · good room' },
    { n: 2, size: 0.70, tol: 10,  guide: 'medium', note: '2 per screen · medium · some room' },
    { n: 3, size: 0.62, tol: 8.5, guide: 'medium', note: '3 per screen · medium · less room' },
    { n: 3, size: 0.54, tol: 7,   guide: 'light',  note: '3 per screen · smaller · little room' },
    { n: 4, size: 0.48, tol: 6,   guide: 'light',  note: '4 per screen · small · tight' }
  ];
  var LEVEL_UP = { turns: 5, avg: 0.75 };   // last 5 turns averaging 4 stars or more
  var LEVEL_DOWN = { turns: 3, avg: 0.35 }; // last 3 turns averaging under 2 stars

  var prefersReduced = false;
  try { prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var DEFAULTS = {
    settings: {
      name: '', set: 'numbers', order: 'sequence', turns: '5',
      levelMode: 'auto', fixedLevel: '1',
      demo: 'on', voice: 'spell', chime: 'on', calm: prefersReduced ? 'on' : 'off', palm: 'on'
    },
    level: 1, nextLevel: 1, levelHist: [],
    stats: {},      // key -> { tries, recent: [scores 0..1], best, last }
    sessions: [],   // { at, level, turns, avg }
    cursor: {},     // set -> next index when practising "in order"
    rewardDeck: [], rewardPos: 0
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

  // ---------------------------------------------------------------- native bridge
  // Inside the Android app, Capacitor exposes native plugins. In a plain
  // browser (used for quick checks) they are missing and we fall back.
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
    else if (kind === 'char') { tone(587.33, 0, 0.4, 0.045); tone(783.99, 0.1, 0.5, 0.045); }
    else { tone(523.25, 0, 0.5, 0.045); tone(659.25, 0.12, 0.5, 0.045); tone(783.99, 0.24, 0.8, 0.045); }
  }

  // ---------------------------------------------------------------- speech
  // Android's WebView has no Web Speech API, so the app uses the tablet's
  // own text-to-speech engine through a native plugin.
  var webTTS = 'speechSynthesis' in window;
  var hasTTS = !!NativeTTS || webTTS;
  var voice = null;
  var ttsLang = navigator.language || 'en-US';
  if (!/^en/i.test(ttsLang)) ttsLang = 'en-US';
  function pickVoice() {
    if (!webTTS) return;
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
  var speakRun = 0;
  function stopSpeech() {
    speakRun++;
    if (NativeTTS) { try { NativeTTS.stop().catch(function () {}); } catch (e) {} }
    else if (webTTS) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  function sayName(key) {
    if (S.voice === 'off' || !hasTTS) return;
    stopSpeech();
    speak(NAMES[key] || key);
  }

  // Word tiles: A P P L E
  function buildTiles(el, word) {
    el.innerHTML = '';
    word.toUpperCase().split('').forEach(function (ch) {
      var t = document.createElement('span');
      if (/[A-Z]/.test(ch)) { t.className = 'tile'; t.textContent = ch; }
      else { t.className = 'tile gap'; t.textContent = ch === '-' ? '-' : ''; }
      el.appendChild(t);
    });
    var letters = word.replace(/[^A-Za-z]/g, '').length;
    el.dataset.len = letters > 9 ? 'long' : letters > 6 ? 'mid' : 'short';
  }

  // "Apple! A, P, P, L, E. Apple!" with each tile lighting up in turn.
  function playWord(el, word) {
    stopSpeech();
    var run = speakRun;
    var tiles = Array.prototype.slice.call(el.querySelectorAll('.tile:not(.gap)'));
    var useVoice = hasTTS && S.voice !== 'off';
    function alive() { return run === speakRun; }
    function clear() { tiles.forEach(function (t) { t.classList.remove('lit'); }); }
    function all() { tiles.forEach(function (t) { t.classList.add('lit'); }); }
    clear();
    return (useVoice ? speak(word + '!') : wait(250)).then(function () {
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
    }).then(function () { return wait(900); }).then(function () { if (alive()) clear(); });
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
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------------- scoring
  // One attempt at one character -> 0..1. Based on how close the pen stayed to
  // the path (compared with the room allowed at this level), how often it
  // wandered right off, and how often "Show me" help was needed.
  function scoreAttempt(m, tol) {
    var rel = m.devN ? (m.devSum / m.devN) / tol : 0.5;
    var acc = 1 - clamp((rel - 0.1) / 0.7, 0, 1);
    return clamp(acc - 0.12 * m.lapses - 0.15 * m.helps, 0, 1);
  }
  function starsFor(score) { return score >= 0.85 ? 5 : score >= 0.7 ? 4 : score >= 0.5 ? 3 : score >= 0.3 ? 2 : 1; }
  function rating(key) {
    var st = data.stats[key];
    if (!st || !st.recent.length) return null;
    var r = st.recent.slice(-5);
    var avg = r.reduce(function (a, b) { return a + starsFor(b); }, 0) / r.length;
    var trend = 0;
    if (st.recent.length >= 6) {
      var last = st.recent.slice(-3), prev = st.recent.slice(-6, -3);
      var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
      var diff = mean(last) - mean(prev);
      trend = diff > 0.06 ? 1 : diff < -0.06 ? -1 : 0;
    }
    return { stars: avg, tries: st.tries, trend: trend };
  }
  function recordAttempt(key, score) {
    var st = data.stats[key] || { tries: 0, recent: [], best: 0, last: 0 };
    st.tries++;
    st.recent.push(Math.round(score * 100) / 100);
    if (st.recent.length > 10) st.recent = st.recent.slice(-10);
    st.best = Math.max(st.best, score);
    st.last = Date.now();
    data.stats[key] = st;
  }

  // ---------------------------------------------------------------- levels
  function currentLevel() {
    var n = S.levelMode === 'fixed' ? parseInt(S.fixedLevel, 10) : data.level;
    return clamp(n || 1, 1, LEVELS.length);
  }
  // Level changes wait for the next session, so the screen never changes
  // unexpectedly in the middle of practice.
  function recordTurnForLevel(turnScore) {
    data.levelHist.push(turnScore);
    if (data.levelHist.length > 10) data.levelHist = data.levelHist.slice(-10);
    if (S.levelMode === 'fixed') return;
    var h = data.levelHist;
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    if (h.length >= LEVEL_UP.turns && avg(h.slice(-LEVEL_UP.turns)) >= LEVEL_UP.avg && data.level < LEVELS.length) {
      data.nextLevel = data.level + 1;
    } else if (h.length >= LEVEL_DOWN.turns && avg(h.slice(-LEVEL_DOWN.turns)) < LEVEL_DOWN.avg && data.level > 1) {
      data.nextLevel = data.level - 1;
    } else {
      data.nextLevel = data.level;
    }
  }
  function applyPendingLevel() {
    if (S.levelMode === 'fixed') return;
    if (data.nextLevel && data.nextLevel !== data.level) {
      data.level = data.nextLevel;
      data.levelHist = [];
      save();
    }
  }

  // ---------------------------------------------------------------- rewards
  // One picture per success, from a shuffled deck: no repeats until all have been seen.
  function shuffled(n, avoidFirst) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    if (avoidFirst !== undefined && a[0] === avoidFirst && n > 1) { a.push(a.shift()); }
    return a;
  }
  function nextReward() {
    if (!REWARDS.length) return { w: 'Star', src: UI + 'star.svg' };
    if (!data.rewardDeck || data.rewardDeck.length !== REWARDS.length || data.rewardPos >= data.rewardDeck.length) {
      var last = data.rewardDeck && data.rewardDeck.length ? data.rewardDeck[data.rewardDeck.length - 1] : undefined;
      data.rewardDeck = shuffled(REWARDS.length, last);
      data.rewardPos = 0;
    }
    var r = REWARDS[data.rewardDeck[data.rewardPos++]];
    save();
    return { w: r.w, src: PIC + r.i + '.svg' };
  }

  // ---------------------------------------------------------------- screens
  var $ = function (id) { return document.getElementById(id); };
  var current = 'home';
  function show(name) {
    current = name;
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i].dataset.screen !== name;
    if (name !== 'reward' && name !== 'trace') stopSpeech();
    if (name === 'home') renderHome();
    if (name === 'trace') { layout(); startLoop(); }
    if (name === 'parent') renderParent();
  }
  function applyCalm() { document.documentElement.classList.toggle('calm', S.calm === 'on'); }

  // Press-and-hold buttons keep little hands from leaving by accident.
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
  }

  // ---------------------------------------------------------------- session
  var session = null;
  function setKeys() { return (SETS[S.set] || SETS.numbers).keys.slice(); }
  function pickChars(total) {
    var keys = setKeys(), q = [], i;
    if (S.order === 'shuffle') {
      var bag = [];
      while (q.length < total) {
        if (!bag.length) bag = keys.slice().sort(function () { return Math.random() - 0.5; });
        var k = bag.shift();
        if (q.length && q[q.length - 1] === k && keys.length > 1) { bag.push(k); continue; }
        q.push(k);
      }
    } else if (S.order === 'weak') {
      // More turns on the characters with the fewest stars; untried ones count as weak.
      var weights = keys.map(function (k) { var r = rating(k); return r ? Math.pow(6 - r.stars, 2) : 16; });
      while (q.length < total) {
        var sum = weights.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * sum;
        for (i = 0; i < keys.length; i++) { x -= weights[i]; if (x <= 0) break; }
        var pick = keys[Math.min(i, keys.length - 1)];
        if (q.length && q[q.length - 1] === pick && keys.length > 1) continue;
        q.push(pick);
      }
    } else {
      var c = (data.cursor[S.set] || 0) % keys.length;
      for (i = 0; i < total; i++) q.push(keys[(c + i) % keys.length]);
      data.cursor[S.set] = (c + total) % keys.length;
    }
    return q;
  }
  function startSession() {
    unlockSpeech();
    applyPendingLevel();
    var lv = currentLevel(), L = LEVELS[lv - 1];
    var turns = parseInt(S.turns, 10) || 5;
    var chars = pickChars(turns * L.n);
    var queue = [];
    for (var t = 0; t < turns; t++) queue.push(chars.slice(t * L.n, t * L.n + L.n));
    session = { level: lv, queue: queue, idx: 0, doneTurn: false, turnScores: [] };
    save();
    startTurn();
  }
  function renderStars(el) {
    el.innerHTML = '';
    for (var i = 0; i < session.queue.length; i++) {
      var li = document.createElement('li');
      var on = i < session.idx || (i === session.idx && session.doneTurn);
      li.className = on ? 'on' : (i === session.idx ? 'now' : '');
      li.innerHTML = '<img src="' + UI + 'star.svg" alt="">';
      el.appendChild(li);
    }
  }

  // ---------------------------------------------------------------- tracing
  var T = null;
  var canvas = $('trace-canvas'), ctx = canvas.getContext('2d');
  var geo = { w: 600, h: 400, dpr: 1, cells: [] };

  function newChar(key) {
    return {
      key: key,
      strokes: SHAPES[key].strokes.map(function (s) { return resample(s, 1); }),
      si: 0, prog: 0, done: false,
      m: { devSum: 0, devN: 0, lapses: 0, helps: 0, t0: 0 }
    };
  }
  function startTurn() {
    var keys = session.queue[session.idx];
    var L = LEVELS[session.level - 1];
    session.doneTurn = false;
    T = {
      L: L, chars: keys.map(newChar), ci: 0,
      tracking: false, downId: null, downType: '', done: false, glowAt: 0,
      lastProgressAt: performance.now(), demo: null, finger: null, hover: null, nudgeAt: 0
    };
    T.chars[0].m.t0 = performance.now();
    $('trace-label').textContent = keys.length === 1 ? (/[0-9]/.test(keys[0]) ? 'Number ' : 'Letter ') + keys[0] : '';
    renderStars($('stars-trace'));
    show('trace');
    beginChar(450);
  }
  function cur() { return T.chars[T.ci]; }
  function beginChar(delay) {
    var c = cur(), key = c.key, ci = T.ci;
    sayName(key);
    if (S.demo === 'on') setTimeout(function () {
      if (T && T.ci === ci && cur().key === key && !T.tracking && c.prog === 0 && c.si === 0) playDemo(false);
    }, delay || 450);
  }

  function layout() {
    var wrap = $('canvas-wrap').getBoundingClientRect();
    var w = Math.max(260, Math.floor(wrap.width)), h = Math.max(220, Math.floor(wrap.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    geo.w = w; geo.h = h; geo.dpr = dpr;
    if (!T) return;
    var n = T.chars.length, pad = Math.min(w, h) * 0.05, gap = h * 0.06;
    var s = Math.min(T.L.size * (h - 2 * pad), (w - 2 * pad - gap * (n - 1)) / n);
    var total = n * s + (n - 1) * gap;
    var x0 = (w - total) / 2, y0 = (h - s) / 2;
    geo.cells = [];
    for (var i = 0; i < n; i++) geo.cells.push({ x: x0 + i * (s + gap), y: y0, s: s });
  }
  window.addEventListener('resize', function () { if (current === 'trace') layout(); });

  function toUnits(e, ci) {
    var r = canvas.getBoundingClientRect(), c = geo.cells[ci];
    return [(e.clientX - r.left - c.x) * 100 / c.s, (e.clientY - r.top - c.y) * 100 / c.s];
  }
  function tolUnits() { return T.L.tol; }
  function startTolUnits() {
    var c = geo.cells[T.ci];
    return Math.max(T.L.tol * 1.35, 12, 26 * 100 / c.s); // never smaller than ~26 px
  }

  function playDemo(isHelp) {
    if (!T || T.done) return;
    var c = cur(), st = c.strokes[c.si];
    if (isHelp) c.m.helps++;
    T.demo = { ci: T.ci, si: c.si, from: c.prog, t0: performance.now(), dur: Math.max(700, (st.len - c.prog) * 14) };
  }

  // Stylus first: while the pen is in use, fingers and the resting palm are ignored.
  var lastPenAt = -1e9, penDown = false;
  function palmBlocked(e) {
    return S.palm === 'on' && e.pointerType === 'touch' && (penDown || performance.now() - lastPenAt < 5000);
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!T || T.done) return;
    if (e.pointerType === 'pen') { penDown = true; lastPenAt = performance.now(); }
    if (palmBlocked(e)) return;
    if (T.downId !== null && T.downId !== e.pointerId) {
      if (e.pointerType === 'pen' && T.downType !== 'pen') { T.tracking = false; } // the pen takes over from a palm
      else return;
    }
    e.preventDefault();
    audio();
    T.downId = e.pointerId; T.downType = e.pointerType;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = toUnits(e, T.ci);
    T.finger = p; T.hover = null;
    if (!tryPickUp(p)) T.nudgeAt = performance.now(); // gently point at where to start; no error sound
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!T || T.done) return;
    if (e.pointerType === 'pen') lastPenAt = performance.now();
    if (e.pointerId !== T.downId) {
      if (e.pointerType === 'pen' && T.downId === null) T.hover = toUnits(e, T.ci); // pen hovering above the screen
      return;
    }
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!evs.length) evs = [e];
    for (var i = 0; i < evs.length && !T.done && T.downId !== null; i++) {
      var p = toUnits(evs[i], T.ci);
      T.finger = p;
      if (T.tracking) advance(p); else tryPickUp(p);
    }
  });
  function release(e) {
    if (e.pointerType === 'pen') { penDown = false; lastPenAt = performance.now(); }
    if (!T || e.pointerId !== T.downId) return;
    T.tracking = false; T.downId = null; T.finger = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function (e) { if (T && e.pointerType === 'pen' && T.downId === null) T.hover = null; });

  function tryPickUp(p) {
    var c = cur();
    var head = pointAt(c.strokes[c.si], c.prog);
    if (dist(p, head) > startTolUnits()) return false;
    T.tracking = true;
    T.demo = null;
    if (!c.m.t0) c.m.t0 = performance.now();
    advance(p);
    return true;
  }

  function advance(p) {
    var c = cur(), st = c.strokes[c.si];
    var tol = tolUnits();
    var i0 = idxAt(st, c.prog - 4), i1 = Math.min(st.pts.length - 1, idxAt(st, c.prog + 22) + 1);
    var best = -1, bd = Infinity;
    for (var i = i0; i <= i1; i++) {
      var d = dist(p, st.pts[i]);
      if (d < bd) { bd = d; best = i; }
    }
    T.finger = p;
    if (bd > tol * 2.2) { T.tracking = false; c.m.lapses++; return; } // wandered off: the ink just waits
    c.m.devSum += bd; c.m.devN++;
    if (bd <= tol) {
      var s = st.cum[best];
      if (s > c.prog) { c.prog = s; T.lastProgressAt = performance.now(); }
      if (c.prog >= st.len - 3) completeStroke(p);
    }
  }

  function completeStroke(p) {
    var c = cur(), st = c.strokes[c.si];
    c.prog = st.len;
    c.si++;
    if (c.si < c.strokes.length) {
      chime('stroke');
      c.prog = 0;
      T.lastProgressAt = performance.now();
      var keepGoing = T.tracking && dist(p, c.strokes[c.si].pts[0]) <= startTolUnits();
      if (!keepGoing) {
        T.tracking = false;
        if (S.demo === 'on') setTimeout(function () { if (T && !T.tracking && !T.done && cur() === c && c.prog === 0) playDemo(false); }, 350);
      }
      return;
    }
    // Character finished
    c.si = c.strokes.length - 1;
    c.done = true;
    c.score = scoreAttempt(c.m, tolUnits());
    recordAttempt(c.key, c.score);
    T.tracking = false;
    if (T.ci < T.chars.length - 1) {
      chime('char');
      T.ci++;
      T.demo = null;
      T.lastProgressAt = performance.now();
      cur().m.t0 = performance.now();
      save();
      beginChar(500);
      return;
    }
    T.done = true; T.glowAt = performance.now();
    chime('turn');
    turnDone();
  }

  function turnDone() {
    var sum = 0;
    T.chars.forEach(function (c) { sum += c.score; });
    var turnScore = sum / T.chars.length;
    session.turnScores.push(turnScore);
    recordTurnForLevel(turnScore);
    save();
    setTimeout(showReward, 750);
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
    var k = geo.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, geo.w, geo.h);
    if (!T || !geo.cells.length) return;
    var calm = S.calm === 'on', guide = T.L.guide;

    // Writing lines across the whole page, like the paper he will move on to.
    var c0 = geo.cells[0], u = c0.s / 100;
    ctx.lineWidth = Math.max(1, 0.8 * u);
    ctx.strokeStyle = C.base;
    [10, 90].forEach(function (y) { ctx.beginPath(); ctx.moveTo(geo.w * 0.03, c0.y + y * u); ctx.lineTo(geo.w * 0.97, c0.y + y * u); ctx.stroke(); });
    ctx.setLineDash([3 * u, 3 * u]);
    ctx.strokeStyle = C.lines;
    ctx.beginPath(); ctx.moveTo(geo.w * 0.03, c0.y + 50 * u); ctx.lineTo(geo.w * 0.97, c0.y + 50 * u); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var ci = 0; ci < T.chars.length; ci++) {
      var ch = T.chars[ci], cell = geo.cells[ci];
      var isCur = ci === T.ci && !T.done;
      ctx.setTransform(k * cell.s / 100, 0, 0, k * cell.s / 100, k * cell.x, k * cell.y);

      // Track (the road to follow). Upcoming characters wait quietly in the background.
      ctx.globalAlpha = guide === 'light' ? 0.45 : 1;
      if (!isCur && !ch.done) ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = C.track;
      ctx.lineWidth = 17;
      ch.strokes.forEach(function (st) { polyline(st, 0, st.len); ctx.stroke(); });
      ctx.globalAlpha = 1;

      // Ink
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 11;
      if (T.done && !calm) {
        var gl = Math.min(1, (now - T.glowAt) / 500);
        ctx.shadowColor = 'rgba(66, 99, 235, .45)';
        ctx.shadowBlur = 12 * Math.sin(gl * Math.PI) * k;
      }
      for (var i = 0; i < ch.strokes.length; i++) {
        var st = ch.strokes[i];
        if (ch.done || i < ch.si) { polyline(st, 0, st.len); ctx.stroke(); }
        else if (i === ch.si && ch.prog > 0) { polyline(st, 0, ch.prog); ctx.stroke(); }
      }
      ctx.shadowBlur = 0;
      if (!isCur) continue;

      var curSt = ch.strokes[ch.si];

      // Direction arrows along what is left of the current stroke
      if (guide === 'strong') {
        ctx.strokeStyle = C.arrow;
        ctx.lineWidth = 1.8;
        for (var s = ch.prog + 10; s < curSt.len - 6; s += 15) {
          var pt = pointAt(curSt, s), a = tangentAt(curSt, s);
          ctx.save();
          ctx.translate(pt[0], pt[1]); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(-2.2, -3); ctx.lineTo(1.6, 0); ctx.lineTo(-2.2, 3); ctx.stroke();
          ctx.restore();
        }
      }
      // Finish ring
      if (guide !== 'light') {
        var end = curSt.pts[curSt.pts.length - 1];
        ctx.strokeStyle = C.arrow; ctx.lineWidth = 1.4;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(end[0], end[1], 6.5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      // Demo: a ghost dot shows the way
      if (T.demo && T.demo.ci === ci) {
        var f = Math.min(1, (now - T.demo.t0) / T.demo.dur);
        var ds = ch.strokes[T.demo.si];
        var upto = T.demo.from + (ds.len - T.demo.from) * f;
        ctx.globalAlpha = 0.28; ctx.strokeStyle = C.ghost; ctx.lineWidth = 8;
        polyline(ds, T.demo.from, upto); ctx.stroke();
        ctx.globalAlpha = 1;
        var gp = pointAt(ds, upto);
        ctx.fillStyle = C.ghost;
        ctx.beginPath(); ctx.arc(gp[0], gp[1], 5.5, 0, Math.PI * 2); ctx.fill();
        if (f >= 1 && now - T.demo.t0 > T.demo.dur + 300) T.demo = null;
      }
      // Head: where to put the pen (green at a fresh start, blue to carry on)
      var head = pointAt(curSt, ch.prog);
      var pulse = calm ? 0 : Math.sin(now / 260) * 1.1;
      var nudge = now - T.nudgeAt < 700 ? 3 * Math.sin(((now - T.nudgeAt) / 700) * Math.PI) : 0;
      var r = (guide === 'light' ? 6 : 7.5) + pulse + nudge;
      ctx.fillStyle = ch.prog === 0 ? C.start : C.ink;
      ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      if (guide === 'strong' && ch.prog === 0 && ch.strokes.length > 1) {
        ctx.font = '900 8px Nunito, ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(ch.si + 1), head[0], head[1] + 0.4);
      } else {
        ctx.beginPath(); ctx.arc(head[0], head[1], 2.4, 0, Math.PI * 2); ctx.fill();
      }
      // Pen hover ring and a soft halo under the pen
      if (T.hover && !T.tracking) {
        ctx.strokeStyle = 'rgba(66, 99, 235, .45)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(T.hover[0], T.hover[1], 3.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (T.tracking && T.finger) {
        ctx.fillStyle = 'rgba(66, 99, 235, .12)';
        ctx.beginPath(); ctx.arc(T.finger[0], T.finger[1], 9, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Stuck for a while? Show the way again (only when "Show me" is on).
    if (S.demo === 'on' && !T.done && !T.tracking && !T.demo && now - T.lastProgressAt > 7000) {
      T.lastProgressAt = now;
      playDemo(true);
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
  var shownReward = null;
  function showReward() {
    var rw = nextReward();
    shownReward = rw;
    session.doneTurn = true;
    renderStars($('stars-reward'));
    var img = $('reward-img'), btn = $('reward-pic');
    img.src = rw.src;
    img.alt = rw.w;
    if (S.calm !== 'on') { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    buildTiles($('reward-tiles'), rw.w);
    show('reward');
    setTimeout(function () { if (current === 'reward') playWord($('reward-tiles'), rw.w); }, 350);
  }
  $('reward-pic').addEventListener('click', function () { if (shownReward) playWord($('reward-tiles'), shownReward.w); });
  $('btn-again').addEventListener('click', function () { startTurn(); });
  $('btn-next').addEventListener('click', function () {
    session.idx++;
    if (session.idx >= session.queue.length) { finishSession(); return; }
    startTurn();
  });

  // ---------------------------------------------------------------- done
  function finishSession() {
    var sc = session.turnScores;
    var avg = sc.length ? sc.reduce(function (a, b) { return a + b; }, 0) / sc.length : 0;
    data.sessions.push({ at: Date.now(), level: session.level, turns: sc.length, avg: Math.round(avg * 100) / 100 });
    if (data.sessions.length > 60) data.sessions = data.sessions.slice(-60);
    save();
    var row = $('done-stars');
    row.innerHTML = '';
    for (var i = 0; i < session.queue.length; i++) row.innerHTML += '<li class="on"><img src="' + UI + 'star.svg" alt=""></li>';
    chime('turn');
    show('done');
  }
  $('btn-done-home').addEventListener('click', function () { show('home'); });

  // ---------------------------------------------------------------- grown-ups
  function starRow(n) {
    var full = Math.round(n * 2) / 2, html = '';
    for (var i = 1; i <= 5; i++) html += '<i class="' + (full >= i ? 'f' : full >= i - 0.5 ? 'h' : '') + '"></i>';
    return html;
  }
  function fmtDate(t) {
    var d = new Date(t);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function renderParent() {
    var keys = setKeys();
    // Performance per character
    var grid = $('perf-grid');
    grid.innerHTML = '';
    var rated = [];
    keys.forEach(function (key) {
      var r = rating(key);
      var li = document.createElement('li');
      li.className = 'perf' + (r ? ' b' + Math.max(1, Math.min(5, Math.round(r.stars))) : ' none');
      li.innerHTML = '<span class="ch"></span><span class="st"></span><span class="meta"></span>';
      li.querySelector('.ch').textContent = key;
      if (r) {
        rated.push({ key: key, stars: r.stars });
        li.querySelector('.st').innerHTML = starRow(r.stars);
        li.querySelector('.meta').textContent = r.stars.toFixed(1) + ' · ' + r.tries + (r.tries === 1 ? ' try' : ' tries') + (r.trend > 0 ? ' · ↑' : r.trend < 0 ? ' · ↓' : '');
      } else {
        li.querySelector('.st').innerHTML = starRow(0);
        li.querySelector('.meta').textContent = 'not tried yet';
      }
      grid.appendChild(li);
    });
    rated.sort(function (a, b) { return b.stars - a.stars; });
    var good = rated.filter(function (r) { return r.stars >= 4; }).slice(0, 5).map(function (r) { return r.key; });
    var weak = rated.slice().reverse().filter(function (r) { return r.stars < 3.5; }).slice(0, 5).map(function (r) { return r.key; });
    $('perf-good').textContent = good.length ? good.join('  ') : '–';
    $('perf-weak').textContent = weak.length ? weak.join('  ') : '–';

    // Level
    var lv = currentLevel(), L = LEVELS[lv - 1];
    $('level-now').textContent = 'Level ' + lv + ' of ' + LEVELS.length;
    $('level-note').textContent = L.note;
    var ladder = $('level-ladder');
    ladder.innerHTML = '';
    LEVELS.forEach(function (x, i) {
      var li = document.createElement('li');
      li.className = (i + 1 === lv ? 'now' : i + 1 < lv ? 'past' : '');
      li.innerHTML = '<b>' + (i + 1) + '</b><span>' + x.n + '×</span>';
      li.title = x.note;
      ladder.appendChild(li);
    });
    var h = data.levelHist.slice(-LEVEL_UP.turns);
    var good5 = h.filter(function (s) { return s >= LEVEL_UP.avg; }).length;
    var msg;
    if (S.levelMode === 'fixed') msg = 'Level is fixed by you. Switch to Automatic to let it grow with him.';
    else if (data.nextLevel > data.level) msg = 'Ready to move up: the next session starts at Level ' + data.nextLevel + '.';
    else if (data.nextLevel < data.level) msg = 'Next session steps back to Level ' + data.nextLevel + ' to keep it fun.';
    else if (lv === LEVELS.length) msg = 'Top level reached.';
    else msg = 'Moves up after 5 turns averaging 4★ or more. Recent turns: ' + (h.length ? h.map(function (s) { return starsFor(s) + '★'; }).join(' ') : 'none yet') + ' (' + good5 + ' strong).';
    $('level-msg').textContent = msg;
    $('fixed-level-field').hidden = S.levelMode !== 'fixed';
    var fl = $('fixed-level');
    if (!fl.options.length) LEVELS.forEach(function (x, i) { var o = document.createElement('option'); o.value = String(i + 1); o.textContent = 'Level ' + (i + 1) + ' — ' + x.note; fl.appendChild(o); });
    fl.value = S.fixedLevel;

    // Sessions
    var tb = $('session-rows');
    tb.innerHTML = '';
    var recent = data.sessions.slice(-8).reverse();
    if (!recent.length) tb.innerHTML = '<tr><td colspan="4" class="muted">No sessions yet.</td></tr>';
    recent.forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td><td class="st"></td>';
      tr.children[0].textContent = fmtDate(s.at);
      tr.children[1].textContent = 'Level ' + s.level;
      tr.children[2].textContent = s.turns + ' turns';
      tr.children[3].innerHTML = starRow(starsFor(s.avg));
      tb.appendChild(tr);
    });
    var seen = data.rewardPos || 0;
    $('pictures-seen').textContent = seen + ' of ' + REWARDS.length + ' pictures shown in this round';

    // Settings controls
    var sel = $('set-select');
    if (!sel.options.length) Object.keys(SETS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = SETS[k].label; sel.appendChild(o); });
    sel.value = S.set;
    var segs = document.querySelectorAll('.seg');
    for (var i = 0; i < segs.length; i++) {
      var setting = segs[i].dataset.setting;
      var btns = segs[i].querySelectorAll('button');
      for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-pressed', btns[j].dataset.value === String(S[setting]) ? 'true' : 'false');
    }
    $('name-input').value = S.name || '';
  }

  $('set-select').addEventListener('change', function (e) { S.set = e.target.value; save(); renderParent(); });
  $('fixed-level').addEventListener('change', function (e) { S.fixedLevel = e.target.value; save(); renderParent(); });
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var key = seg.dataset.setting;
      S[key] = b.dataset.value;
      if (key === 'levelMode' && S.levelMode === 'fixed') S.fixedLevel = String(data.level);
      if (key === 'levelMode' && S.levelMode === 'auto') { data.nextLevel = data.level; }
      save(); applyCalm(); renderParent();
    });
  });
  $('name-input').addEventListener('input', function (e) { S.name = e.target.value.slice(0, 24); save(); });
  $('btn-reset').addEventListener('click', function () {
    if (!window.confirm('Reset stars, level and session history? Settings stay.')) return;
    data.stats = {}; data.sessions = []; data.cursor = {}; data.level = 1; data.nextLevel = 1; data.levelHist = [];
    save(); renderParent();
  });
  $('btn-parent-done').addEventListener('click', function () { show('home'); });

  // ---------------------------------------------------------------- wiring
  $('btn-start').addEventListener('click', startSession);
  $('btn-show').addEventListener('click', function () { audio(); playDemo(true); });
  holdButton($('btn-parent'), 2000, function () { show('parent'); });
  holdButton($('btn-exit'), 1200, function () { show('home'); });

  // Android back button: never drops him out of the app.
  if (NativeApp && NativeApp.addListener) {
    try {
      NativeApp.addListener('backButton', function () {
        if (current === 'parent' || current === 'done') show('home');
      });
    } catch (e) {}
  }

  applyCalm();
  show('home');

  // Small hook used by automated checks: current state and on-screen stroke points.
  window.PicturePen = {
    state: function () {
      return { screen: current, keys: T && T.chars.map(function (c) { return c.key; }), ci: T && T.ci, stroke: T && cur().si, done: T && T.done, idx: session && session.idx, level: currentLevel(), tracking: !!(T && T.tracking), downType: T && T.downType };
    },
    strokeScreenPoints: function () {
      if (!T) return [];
      var r = canvas.getBoundingClientRect(), c = geo.cells[T.ci];
      return cur().strokes.map(function (st) {
        return st.pts.filter(function (_, i) { return i % 3 === 0 || i === st.pts.length - 1; }).map(function (p) {
          return [r.left + c.x + p[0] * c.s / 100, r.top + c.y + p[1] * c.s / 100];
        });
      });
    }
  };
})();
