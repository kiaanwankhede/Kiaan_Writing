/*
 * Learn2Write — a calm, reward-based writing app (Android tablet + stylus).
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
  // 24 levels in 4 stages. Tracing levels change ONE thing at a time; each new
  // stage starts a little easier again.
  //   n = characters per screen, size = share of the writing area's height
  //   (or mm = cap height in millimetres), tol = room to wander off the path in
  //   1/100ths of a character, guide = what helps him.
  var LEVELS = [
    // Stage 1 · tracing on a road
    { n: 1, size: 0.96, tol: 18,  guide: 'strong', stage: 1, note: '1 per screen · very big · lots of room · arrows' },
    { n: 1, size: 0.96, tol: 15,  guide: 'strong', stage: 1, note: '1 per screen · very big · plenty of room · arrows' },
    { n: 1, size: 0.86, tol: 15,  guide: 'strong', stage: 1, note: '1 per screen · big · plenty of room · arrows' },
    { n: 2, size: 0.86, tol: 15,  guide: 'strong', stage: 1, note: '2 per screen · big · plenty of room · arrows' },
    { n: 2, size: 0.86, tol: 12,  guide: 'strong', stage: 1, note: '2 per screen · big · good room · arrows' },
    { n: 2, size: 0.86, tol: 12,  guide: 'medium', stage: 1, note: '2 per screen · big · good room · dots only' },
    { n: 2, size: 0.74, tol: 12,  guide: 'medium', stage: 1, note: '2 per screen · medium · good room · dots only' },
    { n: 3, size: 0.74, tol: 12,  guide: 'medium', stage: 1, note: '3 per screen · medium · good room · dots only' },
    { n: 3, size: 0.74, tol: 10,  guide: 'medium', stage: 1, note: '3 per screen · medium · some room · dots only' },
    { n: 3, size: 0.74, tol: 10,  guide: 'light',  stage: 1, note: '3 per screen · medium · some room · faint path' },
    { n: 3, size: 0.62, tol: 10,  guide: 'light',  stage: 1, note: '3 per screen · smaller · some room · faint path' },
    { n: 3, size: 0.62, tol: 8,   guide: 'light',  stage: 1, note: '3 per screen · smaller · less room · faint path' },
    { n: 4, size: 0.62, tol: 8,   guide: 'light',  stage: 1, note: '4 per screen · smaller · less room · faint path' },
    { n: 4, size: 0.62, tol: 6.5, guide: 'light',  stage: 1, note: '4 per screen · smaller · tight · faint path' },
    // Stage 2 · dotted outline, like the printed practice sheet
    { n: 2, size: 0.74, tol: 10,  guide: 'dotted', stage: 2, startDot: true, note: 'Dotted outline · 2 per screen · medium · some room' },
    { n: 3, size: 0.74, tol: 10,  guide: 'dotted', stage: 2, startDot: true, note: 'Dotted outline · 3 per screen · medium · some room' },
    { n: 3, size: 0.62, tol: 8,   guide: 'dotted', stage: 2, startDot: true, note: 'Dotted outline · 3 per screen · smaller · less room' },
    // Stage 3 · free writing: copy the model
    { n: 1, size: 0.80, tol: 12,  guide: 'free', stage: 3, model: true, startDot: true, note: 'Copy the model · 1 per screen · big' },
    { n: 2, size: 0.80, tol: 12,  guide: 'free', stage: 3, model: true, startDot: true, note: 'Copy the model · 2 per screen · big' },
    { n: 3, mm: 22,     tol: 10,  guide: 'free', stage: 3, model: true, startDot: true, note: 'Copy the model · 3 per screen · school-paper size' },
    { n: 4, mm: 22,     tol: 10,  guide: 'free', stage: 3, model: true, startDot: true, note: 'Copy the model · 4 in a row · school-paper size' },
    // Stage 4 · hear it, write it: no model at all
    { n: 1, size: 0.80, tol: 12,  guide: 'memory', stage: 4, note: 'Hear it, write it · 1 per screen · big' },
    { n: 3, mm: 22,     tol: 10,  guide: 'memory', stage: 4, note: 'Hear it, write it · 3 per screen · school-paper size' },
    { n: 5, mm: 22,     tol: 10,  guide: 'memory', stage: 4, note: 'Hear it, write it · 5 in a row · school-paper size' }
  ];
  // Saved levels from older versions, mapped onto today's 24 levels:
  // v1 had 9 levels; v2 had 22 (its 21-22 are now 22-23).
  var OLD_LEVEL_MAP = { 1: 1, 2: 3, 3: 4, 4: 7, 5: 9, 6: 11, 7: 14, 8: 18, 9: 20 };
  var V2_LEVEL_MAP = { 21: 22, 22: 23 };
  var MMPX = 160 / 25.4; // Android CSS px per millimetre (1 dp = 1/160 inch)
  var LEVEL_UP = { turns: 5, avg: 0.75 };   // last 5 turns averaging 4 stars or more
  var LEVEL_DOWN = { turns: 3, avg: 0.35 }; // last 3 turns averaging under 2 stars

  var prefersReduced = false;
  try { prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var DEFAULTS = {
    settings: {
      name: '', set: 'numbers', order: 'sequence', turns: '5',
      levelMode: 'auto', fixedLevel: '1',
      demo: 'on', voice: 'spell', chime: 'on', calm: prefersReduced ? 'on' : 'off', palm: 'on', sheet: 'weak', restart: 'number'
    },
    level: 1, nextLevel: 1, levelHist: [],
    stats: {},      // key -> { tries, recent: [scores 0..1], best, last }
    sessions: [],   // { at, level, turns, avg }
    cursor: {},     // set -> next index when practising "in order"
    rewardDeck: [], rewardPos: 0,
    pen: { seen: false, varied: false }, // has a stylus been used, and does it report pressure?
    paper: {}       // key -> [{ r: 0..5 (0 = not rated), at }] for work done on paper
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
  if (data.levelsV !== 3) {
    var from = data.levelsV || 1;
    var mapLv = function (n) {
      n = parseInt(n, 10) || 1;
      if (from === 1) n = OLD_LEVEL_MAP[n] || 1;
      return V2_LEVEL_MAP[n] || n;
    };
    data.level = mapLv(data.level);
    data.nextLevel = mapLv(data.nextLevel || data.level);
    S.fixedLevel = String(mapLv(S.fixedLevel));
    data.levelsV = 3;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }
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

  // Free-writing check: $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012).
  // Compares the shape he wrote with every character in the practice set.
  var PN = 32, TPL = {};
  function pLen(strokes) { var L = 0; strokes.forEach(function (s) { for (var i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); }); return L; }
  function pResample(strokes, n) {
    var I = pLen(strokes) / (n - 1), out = [], D = 0;
    strokes.forEach(function (s0) {
      var s = s0.map(function (p) { return [p[0], p[1]]; });
      if (!out.length) out.push(s[0].slice());
      for (var i = 1; i < s.length; i++) {
        var d = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
        if (D + d >= I && d > 0) {
          var t = (I - D) / d, q = [s[i - 1][0] + t * (s[i][0] - s[i - 1][0]), s[i - 1][1] + t * (s[i][1] - s[i - 1][1])];
          out.push(q); s.splice(i, 0, q); D = 0;
        } else D += d;
      }
    });
    var last = strokes[strokes.length - 1];
    while (out.length < n) out.push(last[last.length - 1].slice());
    return out.slice(0, n);
  }
  function pCloud(strokes) {
    var pts = pResample(strokes, PN), b = bbox([pts]);
    var size = Math.max(b.maxx - b.minx, b.maxy - b.miny) || 1, cx = 0, cy = 0;
    pts = pts.map(function (p) { return [(p[0] - b.minx) / size, (p[1] - b.miny) / size]; });
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    return pts.map(function (p) { return [p[0] - cx, p[1] - cy]; });
  }
  function pCloudDist(a, b, start) {
    var n = a.length, used = [], sum = 0, i = start;
    do {
      var min = Infinity, idx = -1;
      for (var j = 0; j < n; j++) if (!used[j]) { var d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]); if (d < min) { min = d; idx = j; } }
      used[idx] = true;
      sum += (1 - ((i - start + n) % n) / n) * min;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function pMatch(a, b) {
    var step = Math.floor(Math.sqrt(a.length)), min = Infinity;
    for (var i = 0; i < a.length; i += step) min = Math.min(min, pCloudDist(a, b, i), pCloudDist(b, a, i));
    return min;
  }
  function tpl(key) { return TPL[key] || (TPL[key] = pCloud(SHAPES[key].strokes)); }
  function bbox(strokes) {
    var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
    strokes.forEach(function (s) { s.forEach(function (p) { b.minx = Math.min(b.minx, p[0]); b.maxx = Math.max(b.maxx, p[0]); b.miny = Math.min(b.miny, p[1]); b.maxy = Math.max(b.maxy, p[1]); }); });
    return b;
  }

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
  function recordAttempt(key, score, m) {
    var st = data.stats[key] || { tries: 0, recent: [], best: 0, last: 0 };
    if (m && m.presN >= 5 && data.pen.varied) {
      st.pres = (st.pres || []).concat(Math.round(m.presSum / m.presN * 100) / 100).slice(-10);
    }
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

  function newChar(key, L) {
    return {
      key: key,
      strokes: SHAPES[key].strokes.map(function (s) { return resample(s, 1); }),
      si: 0, prog: 0, done: false,
      free: L.guide === 'free' || L.guide === 'memory', ink: [], assist: false, evalTimer: null,
      m: { devSum: 0, devN: 0, lapses: 0, helps: 0, t0: 0, presSum: 0, presN: 0 }
    };
  }
  function startTurn() {
    var keys = session.queue[session.idx];
    var L = LEVELS[session.level - 1];
    session.doneTurn = false;
    T = {
      L: L, chars: keys.map(function (k) { return newChar(k, L); }), ci: 0,
      tracking: false, downId: null, downType: '', done: false, glowAt: 0,
      lastProgressAt: performance.now(), demo: null, finger: null, hover: null, nudgeAt: 0
    };
    T.chars[0].m.t0 = performance.now();
    $('trace-label').textContent = L.guide === 'memory' ? 'Listen and write' :
      keys.length === 1 ? (L.guide === 'free' ? 'Write ' : /[0-9]/.test(keys[0]) ? 'Number ' : 'Letter ') + keys[0] : (L.guide === 'free' ? 'Write ' + keys.join(' ') : '');
    $('btn-hear').hidden = L.guide !== 'memory';
    T.labelText = $('trace-label').textContent;
    renderStars($('stars-trace'));
    show('trace');
    beginChar(450);
  }
  function cur() { return T.chars[T.ci]; }
  function beginChar(delay) {
    var c = cur(), key = c.key, ci = T.ci;
    sayName(key);
    if (T.L.guide === 'memory') {
      // No model: he hears the number. Without voice, show a quantity cue (●●●) for numbers.
      if (S.voice === 'off' || !hasTTS) $('trace-label').textContent = /[0-9]/.test(key) ? 'Write \u25CF'.replace('\u25CF', new Array(+key + 1).join('\u25CF')) : 'Write ' + key;
      return;
    }
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
    var mS = T.L.model ? Math.min((h - 2 * pad) * 0.5, w * 0.2) : 0;
    var left = pad + (mS ? mS + gap : 0), availW = w - left - pad;
    var sMax = T.L.mm ? T.L.mm * MMPX / 0.8 : T.L.size * (h - 2 * pad);
    var s = Math.min(sMax, (availW - gap * (n - 1)) / n, h - 2 * pad);
    var total = n * s + (n - 1) * gap;
    var x0 = left + (availW - total) / 2, y0 = (h - s) / 2;
    geo.model = mS ? { x: pad, y: (h - mS) / 2, s: mS } : null;
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
    if (c.free && !c.assist) {
      var tot = c.strokes.reduce(function (a, s) { return a + s.len; }, 0);
      T.demo = { model: !!T.L.model, cell: !T.L.model, ci: T.ci, t0: performance.now(), dur: Math.max(900, tot * 12) };
      return;
    }
    T.demo = { ci: T.ci, si: c.si, from: c.prog, t0: performance.now(), dur: Math.max(700, (st.len - c.prog) * 14) };
  }

  // Stylus first: while the pen is in use, fingers and the resting palm are ignored.
  var lastPenAt = -1e9, penDown = false;
  function palmBlocked(e) {
    return S.palm === 'on' && e.pointerType === 'touch' && (penDown || performance.now() - lastPenAt < 5000);
  }

  // Palm guard for simple styluses (they look like a finger to the tablet).
  // 1) Size: a palm's contact is much bigger than a pen tip. The limit adapts to
  //    the touches that actually write, and never drops below a child's finger.
  // 2) Take-over: a touch that is not writing (e.g. a resting palm) gives way
  //    to the next touch, so the pen is never locked out.
  var contactSizes = [];
  function contactSize(e) {
    var s = Math.max(e.width || 0, e.height || 0);
    return s > 1.5 ? s : 0; // 0 = this tablet does not report touch size
  }
  function palmLimit() {
    if (contactSizes.length < 3) return 80;
    var a = contactSizes.slice().sort(function (x, y) { return x - y; });
    return clamp(a[Math.floor(a.length / 2)] * 3, 60, 110);
  }
  function looksLikePalm(e) {
    if (S.palm !== 'on' || e.pointerType !== 'touch') return false;
    var s = contactSize(e);
    return s > 0 && s > palmLimit();
  }
  function noteWritingSize(e) {
    var s = contactSize(e);
    if (!s || e.pointerType !== 'touch') return;
    contactSizes.push(s);
    if (contactSizes.length > 15) contactSizes.shift();
  }
  function canTakeOver(e) {
    if (S.palm !== 'on') return e.pointerType === 'pen' && T.downType !== 'pen';
    if (e.pointerType === 'pen' && T.downType !== 'pen') return true;
    if (!T.tracking) return true;
    var c = cur();
    if (c.free && !c.assist) { var s = c.ink[c.ink.length - 1]; if (s && pLen([s]) < 6) return true; }
    return false;
  }
  function dropHolder() {
    var c = cur();
    if (T.tracking && c.free && !c.assist) c.ink.pop(); // remove the resting hand's tiny mark
    T.tracking = false; T.downId = null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!T || T.done) return;
    if (e.pointerType === 'pen') { penDown = true; lastPenAt = performance.now(); }
    if (palmBlocked(e) || looksLikePalm(e)) return;
    if (T.downId !== null && T.downId !== e.pointerId) {
      if (!canTakeOver(e)) return;
      dropHolder();
    }
    e.preventDefault();
    audio();
    T.downId = e.pointerId; T.downType = e.pointerType;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = toUnits(e, T.ci);
    T.finger = p; T.hover = null;
    if (cur().free && !cur().assist) { freeDown(e, p); if (T.tracking) noteWritingSize(e); notePressure(e); return; }
    if (!tryPickUp(p)) T.nudgeAt = performance.now(); // gently point at where to start; no error sound
    else noteWritingSize(e);
    notePressure(e);
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
      if (cur().free && !cur().assist) { if (T.tracking) freeMove(evs[i], p); }
      else if (T.tracking) advance(p); else tryPickUp(p);
      notePressure(evs[i]);
    }
  });
  function release(e) {
    if (e.pointerType === 'pen') { penDown = false; lastPenAt = performance.now(); }
    if (!T || e.pointerId !== T.downId) return;
    var c = cur(), wasFree = T.tracking && c.free && !c.assist && !T.done;
    var midStroke = T.tracking && !wasFree && !T.done && c.prog > 3 && c.prog < c.strokes[c.si].len - 3;
    T.tracking = false; T.downId = null; T.finger = null;
    if (wasFree) freeUp();
    if (midStroke && S.restart !== 'off') {
      // A quick bounce of the pen is forgiven; a real lift starts again.
      clearTimeout(T.liftTimer);
      T.liftTimer = setTimeout(function () {
        if (T && cur() === c && !T.tracking && !c.done && c.prog > 3) { c.m.lapses++; restartChar(c); }
      }, 300);
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function (e) { if (T && e.pointerType === 'pen' && T.downId === null) T.hover = null; });

  // Pen pressure (0..1), reported by active styluses such as the Lenovo Tab Pen.
  // A passive rubber-tip stylus acts like a finger and reports no pressure.
  function notePressure(ev) {
    if (ev.pointerType !== 'pen' || !T || !T.tracking || T.done) return;
    if (!data.pen.seen) { data.pen.seen = true; save(); }
    var pr = ev.pressure;
    if (!(pr > 0)) return;
    if (!data.pen.varied && Math.abs(pr - 0.5) > 0.01 && pr < 1) { data.pen.varied = true; save(); }
    var m = cur().m;
    m.presSum += pr; m.presN++;
  }
  function pressureWord(v) { return v < 0.2 ? 'light' : v > 0.65 ? 'pressing hard' : 'comfortable'; }

  function tryPickUp(p) {
    var c = cur();
    var head = pointAt(c.strokes[c.si], c.prog);
    if (dist(p, head) > startTolUnits()) return false;
    clearTimeout(T.liftTimer);
    T.tracking = true;
    T.demo = null;
    if (T.labelText !== undefined && $('trace-label').textContent !== T.labelText && !c.assist) $('trace-label').textContent = T.labelText;
    if (!c.m.t0) c.m.t0 = performance.now();
    advance(p);
    return true;
  }

  // Lifting the pen or leaving the path mid-stroke starts the number again from the
  // green dot (or just that stroke, per the grown-ups setting). No buzzer: the ink
  // fades and the dot pulses. After 3 restarts on one number, "Show me" plays and
  // only the current stroke restarts, so he can always finish.
  function restartChar(c) {
    if (S.restart === 'off' || !T || c.done) return;
    c.restarts = (c.restarts || 0) + 1;
    var scope = S.restart === 'stroke' || c.restarts > 3 ? 'stroke' : 'number';
    var segs = [];
    if (scope === 'number') for (var i = 0; i < c.si; i++) segs.push([i, c.strokes[i].len]);
    if (c.prog > 0) segs.push([c.si, c.prog]);
    T.fade = { ci: T.chars.indexOf(c), segs: segs, t0: performance.now() };
    if (scope === 'number') c.si = 0;
    c.prog = 0;
    T.tracking = false;
    T.nudgeAt = performance.now();
    T.lastProgressAt = performance.now();
    if (!c.assist) $('trace-label').textContent = 'Start again from the green dot';
    if (!T.saidRestart && S.voice !== 'off') { T.saidRestart = true; stopSpeech(); speak('Again, from the green dot'); }
    if (c.restarts === 3) setTimeout(function () { if (T && cur() === c && !T.tracking) playDemo(true); }, 600);
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
    if (bd > tol * 2.2) { // went right off the path
      T.tracking = false; c.m.lapses++;
      if (S.restart !== 'off' && c.prog > 3) restartChar(c);
      return;
    }
    c.m.devSum += bd; c.m.devN++;
    if (bd <= tol) {
      var s = st.cum[best];
      if (s > c.prog) { c.prog = s; T.lastProgressAt = performance.now(); }
      if (c.prog >= st.len - 3) completeStroke(p);
    }
  }

  // ---------------------------------------------------------------- free writing
  function pressOf(e) { return e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5; }
  function inCell(p) { return p[0] > -25 && p[0] < 125 && p[1] > -25 && p[1] < 125; }
  function freeDown(e, p) {
    var c = cur();
    if (!inCell(p)) { T.nudgeAt = performance.now(); return; }
    clearTimeout(c.evalTimer); c.evalTimer = null;
    T.demo = null;
    if (!c.m.t0) c.m.t0 = performance.now();
    c.ink.push([[p[0], p[1], pressOf(e)]]);
    T.tracking = true; T.lastProgressAt = performance.now();
  }
  function freeMove(e, p) {
    var c = cur(), s = c.ink[c.ink.length - 1];
    if (!s) return;
    var last = s[s.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) return;
    s.push([p[0], p[1], pressOf(e)]);
    T.lastProgressAt = performance.now();
  }
  function freeUp() {
    var c = cur(), need = c.strokes.reduce(function (a, s) { return a + s.len; }, 0) * 0.45;
    if (pLen(c.ink) >= need) c.evalTimer = setTimeout(function () { evaluateFree(c); }, 1000);
  }
  // Checks the shape once he pauses. Recognised: success. Not recognised: the path
  // appears and he traces it, so every turn still ends in success (errorless).
  function evaluateFree(c) {
    if (!T || cur() !== c || c.done || T.tracking) return;
    var strokes = c.ink.map(function (s) { return s.map(function (p) { return [p[0], p[1]]; }); }).filter(function (s) { return s.length > 1; });
    if (!strokes.length) return;
    var cand = pCloud(strokes), dT = pMatch(cand, tpl(c.key)), best = Infinity;
    setKeys().forEach(function (k) { if (k !== c.key) best = Math.min(best, pMatch(cand, tpl(k))); });
    var b = bbox(strokes), hgt = b.maxy - b.miny, big = Math.max(hgt, b.maxx - b.minx);
    if (dT <= 1.6 && dT <= best * 1.2 && big >= 22) {
      var inLines = 0, total = 0;
      strokes.forEach(function (s) { s.forEach(function (p) { total++; if (p[1] >= 0 && p[1] <= 100) inLines++; }); });
      var shape = clamp(1 - (dT - 0.5) / 1.1, 0, 1), size = clamp(1 - Math.abs(hgt - 80) / 80, 0, 1);
      c.m.free = { shape: Math.round(shape * 100) / 100, size: Math.round(size * 100) / 100 };
      finishChar(c, clamp(0.6 * shape + 0.2 * size + 0.2 * (inLines / total) - 0.15 * c.m.helps, 0, 1));
    } else {
      c.assist = true; c.m.helps++;
      c.si = 0; c.prog = 0;
      T.lastProgressAt = performance.now();
      $('trace-label').textContent = "Let's trace it together";
      if (S.voice !== 'off') { stopSpeech(); speak("Let's trace it together"); }
      if (S.demo === 'on') setTimeout(function () { if (T && cur() === c && !T.tracking) playDemo(false); }, 900);
    }
  }

  function finishChar(c, score) {
    c.si = c.strokes.length - 1;
    c.done = true;
    c.score = score;
    recordAttempt(c.key, c.score, c.m);
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
    // Character finished. Traced after a free-writing attempt counts as help (at most ~3 stars).
    var sc = scoreAttempt(c.m, tolUnits());
    finishChar(c, c.assist ? Math.min(sc * 0.6, 0.55) : sc);
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

  // Pencil-look ink: graphite grey, darker and a little thicker with more pen pressure.
  function drawInk(ch, alpha, blue) {
    var varied = data.pen.varied;
    ch.ink.forEach(function (s) {
      for (var i = 1; i < s.length; i++) {
        var pr = s[i][2];
        ctx.globalAlpha = alpha * (blue ? 1 : varied ? 0.45 + 0.55 * pr : 0.85);
        ctx.strokeStyle = blue ? C.ink : '#3A3F47';
        ctx.lineWidth = blue ? 6 : 4.2 * (varied ? 0.75 + 0.5 * pr : 1);
        ctx.beginPath(); ctx.moveTo(s[i - 1][0], s[i - 1][1]); ctx.lineTo(s[i][0], s[i][1]); ctx.stroke();
      }
      if (s.length === 1) { ctx.globalAlpha = alpha; ctx.fillStyle = blue ? C.ink : '#3A3F47'; ctx.beginPath(); ctx.arc(s[0][0], s[0][1], 2.2, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // A free-writing cell: just the lines, a soft box and (at the first free level) a start dot.
  function drawFree(ch, isCur, now) {
    if (isCur) {
      ctx.fillStyle = '#F5F7FF'; roundRect(-8, -2, 116, 104, 10); ctx.fill();
      // keep the writing lines visible inside the box, like on paper
      ctx.lineWidth = 0.8; ctx.strokeStyle = C.base;
      [10, 90].forEach(function (y) { ctx.beginPath(); ctx.moveTo(-8, y); ctx.lineTo(108, y); ctx.stroke(); });
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#E4DCCB';
      ctx.beginPath(); ctx.moveTo(-8, 50); ctx.lineTo(108, 50); ctx.stroke(); ctx.setLineDash([]);
    }
    else if (!ch.done) { ctx.strokeStyle = C.track; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); roundRect(-8, -2, 116, 104, 10); ctx.stroke(); ctx.setLineDash([]); }
    if (isCur && T.L.startDot && !ch.ink.length) {
      var p0 = ch.strokes[0].pts[0], pulse = S.calm === 'on' ? 0 : Math.sin(now / 260);
      ctx.fillStyle = C.start; ctx.beginPath(); ctx.arc(p0[0], p0[1], 5 + pulse, 0, Math.PI * 2); ctx.fill();
    }
    if (ch.done && T.done && S.calm !== 'on') {
      var gl = Math.min(1, (now - T.glowAt) / 500);
      ctx.shadowColor = 'rgba(66, 99, 235, .45)'; ctx.shadowBlur = 12 * Math.sin(gl * Math.PI) * geo.dpr;
    }
    drawInk(ch, 1, ch.done);
    ctx.shadowBlur = 0;
    if (isCur && T.demo && T.demo.cell) {
      var tot = ch.strokes.reduce(function (a, s) { return a + s.len; }, 0);
      var f = Math.min(1, (now - T.demo.t0) / T.demo.dur), left = f * tot, gp = null;
      ctx.strokeStyle = C.ghost; ctx.lineWidth = 7; ctx.globalAlpha = 0.45;
      for (var i = 0; i < ch.strokes.length && left > 0; i++) {
        var st = ch.strokes[i], upto = Math.min(st.len, left);
        polyline(st, 0, upto); ctx.stroke(); gp = pointAt(st, upto); left -= st.len;
      }
      ctx.globalAlpha = 1;
      if (gp) { ctx.fillStyle = C.ghost; ctx.beginPath(); ctx.arc(gp[0], gp[1], 5, 0, Math.PI * 2); ctx.fill(); }
      if (f >= 1 && now - T.demo.t0 > T.demo.dur + 600) T.demo = null;
    }
    if (isCur && T.hover && !T.tracking) {
      ctx.strokeStyle = 'rgba(66, 99, 235, .45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(T.hover[0], T.hover[1], 3.5, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // The model to copy, in its own box on the left. "Show me" draws it stroke by stroke.
  function drawModel(now) {
    var m = geo.model, k = geo.dpr, ch = T.done ? T.chars[T.chars.length - 1] : cur();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#F4EFE6'; roundRect(m.x, m.y, m.s, m.s, 18); ctx.fill();
    ctx.setTransform(k * m.s / 112, 0, 0, k * m.s / 112, k * (m.x + m.s * 6 / 112), k * (m.y + m.s * 6 / 112));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1F2A44'; ctx.lineWidth = 8;
    ch.strokes.forEach(function (st) { polyline(st, 0, st.len); ctx.stroke(); });
    var p0 = ch.strokes[0].pts[0];
    ctx.fillStyle = C.start; ctx.beginPath(); ctx.arc(p0[0], p0[1], 6, 0, Math.PI * 2); ctx.fill();
    if (T.demo && T.demo.model) {
      var tot = ch.strokes.reduce(function (a, s) { return a + s.len; }, 0);
      var f = Math.min(1, (now - T.demo.t0) / T.demo.dur), left = f * tot, gp = null;
      ctx.strokeStyle = C.ghost; ctx.lineWidth = 9; ctx.globalAlpha = 0.5;
      for (var i = 0; i < ch.strokes.length && left > 0; i++) {
        var st = ch.strokes[i], upto = Math.min(st.len, left);
        polyline(st, 0, upto); ctx.stroke();
        gp = pointAt(st, upto); left -= st.len;
      }
      ctx.globalAlpha = 1;
      if (gp) { ctx.fillStyle = C.ghost; ctx.beginPath(); ctx.arc(gp[0], gp[1], 6, 0, Math.PI * 2); ctx.fill(); }
      if (f >= 1 && now - T.demo.t0 > T.demo.dur + 400) T.demo = null;
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
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
    var lx0 = geo.model ? geo.model.x + geo.model.s + (c0.x - geo.model.x - geo.model.s) * 0.4 : geo.w * 0.03;
    ctx.lineWidth = Math.max(1, 0.8 * u);
    ctx.strokeStyle = C.base;
    [10, 90].forEach(function (y) { ctx.beginPath(); ctx.moveTo(lx0, c0.y + y * u); ctx.lineTo(geo.w * 0.97, c0.y + y * u); ctx.stroke(); });
    ctx.setLineDash([3 * u, 3 * u]);
    ctx.strokeStyle = C.lines;
    ctx.beginPath(); ctx.moveTo(lx0, c0.y + 50 * u); ctx.lineTo(geo.w * 0.97, c0.y + 50 * u); ctx.stroke();
    ctx.setLineDash([]);
    if (geo.model) drawModel(now);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var ci = 0; ci < T.chars.length; ci++) {
      var ch = T.chars[ci], cell = geo.cells[ci];
      var isCur = ci === T.ci && !T.done;
      ctx.setTransform(k * cell.s / 100, 0, 0, k * cell.s / 100, k * cell.x, k * cell.y);
      if (ch.free && !ch.assist) { drawFree(ch, isCur, now); continue; }
      var g = ch.assist ? 'strong' : guide;
      if (ch.assist) drawInk(ch, 0.25, false); // what he wrote, faintly, under the path

      // Track (the road to follow). Upcoming characters wait quietly in the background.
      ctx.globalAlpha = g === 'light' ? 0.45 : 1;
      if (!isCur && !ch.done) ctx.globalAlpha *= 0.55;
      if (g === 'dotted') { // a thin dotted outline, like the printed practice sheet
        ctx.strokeStyle = '#8E95A1'; ctx.lineWidth = 2.6; ctx.setLineDash([0.1, 5.5]);
      } else { ctx.strokeStyle = C.track; ctx.lineWidth = 17; }
      ch.strokes.forEach(function (st) { polyline(st, 0, st.len); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // A restarted attempt fades away
      if (T.fade && T.fade.ci === ci) {
        var ff = (now - T.fade.t0) / 500;
        if (ff >= 1 || calm) T.fade = null;
        else {
          ctx.globalAlpha = 1 - ff; ctx.strokeStyle = C.ink; ctx.lineWidth = g === 'dotted' ? 6 : 11;
          T.fade.segs.forEach(function (sg) { polyline(ch.strokes[sg[0]], 0, sg[1]); ctx.stroke(); });
          ctx.globalAlpha = 1;
        }
      }

      // Ink (thinner over a dotted outline, like a pen)
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = g === 'dotted' ? 6 : 11;
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
      if (g === 'strong') {
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
      if (g === 'strong' || g === 'medium') {
        var end = curSt.pts[curSt.pts.length - 1];
        ctx.strokeStyle = C.arrow; ctx.lineWidth = 1.4;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(end[0], end[1], 6.5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      // Demo: a ghost dot shows the way
      if (T.demo && !T.demo.model && !T.demo.cell && T.demo.ci === ci) {
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
      var r = (g === 'light' ? 6 : g === 'dotted' ? 5.5 : 7.5) + pulse + nudge;
      ctx.fillStyle = ch.prog === 0 ? C.start : C.ink;
      ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      if (g === 'strong' && ch.prog === 0 && ch.strokes.length > 1) {
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
  $('btn-again').addEventListener('click', function () { if (session.paper) { show('home'); return; } startTurn(); });
  $('btn-next').addEventListener('click', function () {
    if (session.paper) { show('home'); return; }
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
        var pr = (data.paper[key] || []).filter(function (x) { return x.r > 0; }).slice(-5);
        var paperTxt = pr.length ? ' · paper ' + (pr.reduce(function (a, x) { return a + x.r; }, 0) / pr.length).toFixed(1) + '★' : '';
        li.querySelector('.meta').textContent = r.stars.toFixed(1) + ' · ' + r.tries + (r.tries === 1 ? ' try' : ' tries') + (r.trend > 0 ? ' · ↑' : r.trend < 0 ? ' · ↓' : '') + paperTxt;
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
      li.className += ' st' + x.stage;
      li.innerHTML = '<b>' + (i + 1) + '</b><span>' + ({ 2: 'dots', 3: 'copy', 4: 'hear' }[x.stage] || x.n + '×') + '</span>';
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
    renderPressure(keys);
    renderPaper(keys);
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

  function renderPressure(keys) {
    var box = $('pressure-body');
    if (!data.pen.seen) { box.innerHTML = '<p class="hint">No stylus used yet. Pressure appears here once he writes with the pen.</p>'; return; }
    if (!data.pen.varied) { box.innerHTML = '<p class="hint">This stylus does not report pressure, so it works like a finger. An active pen (one that pairs with the tablet, such as the Lenovo Tab Pen) is needed to measure pressure.</p>'; return; }
    var all = [], rows = [];
    keys.forEach(function (k) {
      var st = data.stats[k];
      if (st && st.pres && st.pres.length) {
        var r = st.pres.slice(-5), avg = r.reduce(function (a, b) { return a + b; }, 0) / r.length;
        all = all.concat(r);
        rows.push({ k: k, v: avg });
      }
    });
    if (!all.length) { box.innerHTML = '<p class="hint">Pressure will appear after his next tries with the pen.</p>'; return; }
    var mean = all.reduce(function (a, b) { return a + b; }, 0) / all.length;
    var html = '<div class="gauge"><div class="zones"><span>Light</span><span>Comfortable</span><span>Pressing hard</span></div>' +
      '<div class="gbar"><i style="left:' + Math.round(clamp(mean, 0, 1) * 100) + '%"></i></div></div>' +
      '<p class="pres-now">Overall: <b>' + pressureWord(mean) + '</b> (' + Math.round(mean * 100) + '%)</p><ul class="pres-grid">';
    rows.forEach(function (r) {
      html += '<li class="' + (r.v < 0.2 ? 'lo' : r.v > 0.65 ? 'hi' : 'ok') + '"><b>' + r.k + '</b><span><i style="width:' + Math.round(clamp(r.v, 0, 1) * 100) + '%"></i></span><small>' + Math.round(r.v * 100) + '%</small></li>';
    });
    box.innerHTML = html + '</ul><p class="hint">Average pen pressure over his last 5 tries per character. Every pen reads a little differently, so the trend matters more than the exact number. Steady, comfortable pressure helps when he moves to pencil and paper.</p>';
  }

  // ---------------------------------------------------------------- paper practice
  var paperSel = [], paperRating = 0;
  function weakest(n) {
    var keys = setKeys();
    var scored = keys.map(function (k) { var r = rating(k); return { k: k, s: r ? r.stars : 2.5 }; });
    scored.sort(function (a, b) { return a.s - b.s; });
    return scored.slice(0, n).map(function (x) { return x.k; }).sort(function (a, b) { return keys.indexOf(a) - keys.indexOf(b); });
  }
  function renderPaper(keys) {
    var pick = $('paper-pick');
    pick.innerHTML = '';
    paperSel = paperSel.filter(function (k) { return keys.indexOf(k) !== -1; });
    keys.forEach(function (key) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.textContent = key;
      b.setAttribute('aria-pressed', paperSel.indexOf(key) !== -1 ? 'true' : 'false');
      b.addEventListener('click', function () {
        var i = paperSel.indexOf(key);
        if (i === -1) paperSel.push(key); else paperSel.splice(i, 1);
        b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
      });
      li.appendChild(b); pick.appendChild(li);
    });
    var rate = $('paper-rate');
    rate.innerHTML = '';
    for (var n = 1; n <= 5; n++) (function (n) {
      var b = document.createElement('button');
      b.className = n <= paperRating ? 'on' : '';
      b.setAttribute('aria-label', n + (n === 1 ? ' star' : ' stars'));
      b.innerHTML = '<i></i>';
      b.addEventListener('click', function () { paperRating = paperRating === n ? 0 : n; renderPaper(setKeys()); });
      rate.appendChild(b);
    })(n);
  }
  $('btn-paper-reward').addEventListener('click', function () {
    var keys = paperSel.length ? paperSel.slice() : [];
    keys.forEach(function (k) {
      data.paper[k] = (data.paper[k] || []).concat({ r: paperRating, at: Date.now() }).slice(-20);
    });
    save();
    unlockSpeech();
    paperSel = []; paperRating = 0;
    session = { paper: true, level: currentLevel(), queue: [keys], idx: 0, doneTurn: false, turnScores: [] };
    showReward();
  });

  // Practice sheet: each row has the model, two dotted copies to trace and three empty boxes.
  function sheetCell(key, kind) {
    var lines = '<line x1="0" y1="10" x2="100" y2="10" stroke="#D8CFBF" stroke-width="1"/><line x1="0" y1="90" x2="100" y2="90" stroke="#D8CFBF" stroke-width="1"/><line x1="0" y1="50" x2="100" y2="50" stroke="#E9E3D7" stroke-width="1" stroke-dasharray="3 3"/>';
    var body = '';
    if (kind !== 'blank') {
      SHAPES[key].strokes.forEach(function (st) {
        var d = 'M' + st.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
        body += kind === 'model'
          ? '<path d="' + d + '" fill="none" stroke="#1F2A44" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
          : '<path d="' + d + '" fill="none" stroke="#9AA0AA" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 6"/>';
      });
      if (kind === 'dots') { var p0 = SHAPES[key].strokes[0][0]; body += '<circle cx="' + p0[0] + '" cy="' + p0[1] + '" r="3.6" fill="#2F9E6B"/>'; }
    }
    return '<svg viewBox="-6 0 112 100" xmlns="http://www.w3.org/2000/svg">' + lines + body + '</svg>';
  }
  function buildSheet() {
    var keys = S.sheet === 'all' ? setKeys().slice(0, 9) : weakest(6);
    var name = (S.name || '').trim();
    var html = '<div class="sheet-head"><h1>Learn2Write practice</h1><span>' + new Date().toLocaleDateString() + '</span></div>' +
      '<p class="sheet-name">Name: ' + (name ? name.replace(/[<>&]/g, '') : '______________________') + '</p>';
    keys.forEach(function (k) {
      html += '<div class="sheet-row">' + sheetCell(k, 'model') + sheetCell(k, 'dots') + sheetCell(k, 'dots') + sheetCell(k, 'blank') + sheetCell(k, 'blank') + sheetCell(k, 'blank') + '</div>';
    });
    html += '<p class="sheet-foot">Start at the green dot. Trace the dotted ones, then write it on your own. When a row is done, open Learn2Write → Grown-ups → Done on paper to give the picture.</p>';
    $('print-sheet').innerHTML = html;
  }
  $('btn-print').addEventListener('click', function () {
    buildSheet();
    setTimeout(function () {
      if (window.L2WNative && window.L2WNative.print) window.L2WNative.print(); // Android print: printer or "Save as PDF"
      else window.print();
    }, 100);
  });

  // Touch check: lets a grown-up see whether the pen and his palm are told apart.
  (function () {
    var pad = $('touch-test'), out = $('touch-test-out');
    if (!pad) return;
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (e.pointerType === 'pen') { out.textContent = 'Pen detected: pressure and the palm guard work automatically with this pen.'; return; }
      if (e.pointerType === 'mouse') { out.textContent = 'Mouse: try this on the tablet with the pen and his palm.'; return; }
      var s = contactSize(e), lim = palmLimit();
      if (!s) { out.textContent = 'This tablet does not report touch size, so palms cannot be told apart by size. Taking over from a resting palm still works; keep the glove for free writing.'; return; }
      out.textContent = 'Touch size ' + Math.round(s) + ' px: ' + (s > lim ? 'treated as a palm and ignored.' : 'treated as the pen or a finger and used.') + ' (Palm limit now ' + Math.round(lim) + ' px.)';
    });
  })();

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
    data.stats = {}; data.sessions = []; data.cursor = {}; data.level = 1; data.nextLevel = 1; data.levelHist = []; data.paper = {};
    save(); renderParent();
  });
  $('btn-parent-done').addEventListener('click', function () { show('home'); });

  // ---------------------------------------------------------------- wiring
  $('btn-start').addEventListener('click', startSession);
  $('btn-show').addEventListener('click', function () { audio(); playDemo(true); });
  $('btn-hear').addEventListener('click', function () { if (T && !T.done) sayName(cur().key); });
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
      return { screen: current, keys: T && T.chars.map(function (c) { return c.key; }), ci: T && T.ci, stroke: T && cur().si, done: T && T.done, idx: session && session.idx, level: currentLevel(), tracking: !!(T && T.tracking), downType: T && T.downType, free: !!(T && cur().free), assist: !!(T && cur().assist), prog: T ? Math.round(cur().prog) : null, restarts: T ? (cur().restarts || 0) : null };
    },
    strokeScreenPoints: function (otherKey) {
      if (!T) return [];
      var r = canvas.getBoundingClientRect(), c = geo.cells[T.ci];
      var strokes = otherKey ? SHAPES[otherKey].strokes.map(function (s) { return resample(s, 1); }) : cur().strokes;
      return strokes.map(function (st) {
        return st.pts.filter(function (_, i) { return i % 3 === 0 || i === st.pts.length - 1; }).map(function (p) {
          return [r.left + c.x + p[0] * c.s / 100, r.top + c.y + p[1] * c.s / 100];
        });
      });
    }
  };
})();
