/*
 * Picture Pen — letter geometry and reward pictures.
 *
 * Every shape lives in a 100 x 100 box (y grows downward).
 * Capital letters sit between the top line (y = 10) and the baseline (y = 90).
 * A shape is a list of strokes, in the order a child should draw them.
 * A stroke is a polyline: a list of [x, y] points, drawn from first to last.
 */
(function (global) {
  'use strict';

  // Elliptical arc, angles in degrees, screen coordinates (0 = right, 90 = down).
  // a0 -> a1 can run either way: increasing = clockwise on screen.
  function arc(cx, cy, rx, ry, a0, a1) {
    var pts = [];
    var n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4));
    for (var i = 0; i <= n; i++) {
      var a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }

  // Join several point lists into one stroke, dropping repeated join points.
  function path() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var part = arguments[i];
      for (var j = 0; j < part.length; j++) {
        var p = part[j];
        var last = out[out.length - 1];
        if (last && Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) continue;
        out.push(p);
      }
    }
    return out;
  }

  var circle = function (cx, cy, r) { return arc(cx, cy, r, r, -90, -450); }; // starts at top, goes anticlockwise

  var SHAPES = {
    // Pre-writing strokes (the developmental warm-ups)
    'line-down':   { label: 'Line down',   strokes: [[[50, 10], [50, 90]]] },
    'line-across': { label: 'Line across', strokes: [[[15, 50], [85, 50]]] },
    'circle':      { label: 'Circle',      strokes: [arc(50, 50, 38, 38, -90, -450)] },
    'cross':       { label: 'Cross',       strokes: [[[50, 12], [50, 88]], [[12, 50], [88, 50]]] },

    // Capital letters
    A: { strokes: [[[50, 10], [20, 90]], [[50, 10], [80, 90]], [[31, 60], [69, 60]]] },
    B: { strokes: [
      [[25, 10], [25, 90]],
      path([[25, 10], [50, 10]], arc(50, 30, 20, 20, -90, 90), [[50, 50], [25, 50]]),
      path([[25, 50], [53, 50]], arc(53, 70, 20, 20, -90, 90), [[53, 90], [25, 90]])
    ] },
    C: { strokes: [arc(50, 50, 40, 40, -40, -320)] },
    D: { strokes: [
      [[25, 10], [25, 90]],
      path([[25, 10], [42, 10]], arc(42, 50, 40, 40, -90, 90), [[42, 90], [25, 90]])
    ] },
    E: { strokes: [[[25, 10], [25, 90]], [[25, 10], [75, 10]], [[25, 50], [68, 50]], [[25, 90], [75, 90]]] },
    F: { strokes: [[[25, 10], [25, 90]], [[25, 10], [75, 10]], [[25, 50], [68, 50]]] },
    G: { strokes: [path(arc(50, 50, 40, 40, -45, -360), [[90, 50], [62, 50]])] },
    H: { strokes: [[[25, 10], [25, 90]], [[75, 10], [75, 90]], [[25, 50], [75, 50]]] },
    I: { strokes: [[[50, 10], [50, 90]], [[30, 10], [70, 10]], [[30, 90], [70, 90]]] },
    J: { strokes: [path([[65, 10], [65, 65]], arc(45, 65, 20, 20, 0, 180))] },
    K: { strokes: [[[25, 10], [25, 90]], [[72, 10], [27, 52]], [[27, 52], [75, 90]]] },
    L: { strokes: [[[25, 10], [25, 90], [75, 90]]] },
    M: { strokes: [[[20, 10], [20, 90]], [[20, 10], [50, 60], [80, 10], [80, 90]]] },
    N: { strokes: [[[25, 10], [25, 90]], [[25, 10], [75, 90], [75, 10]]] },
    O: { strokes: [circle(50, 50, 40)] },
    P: { strokes: [
      [[25, 10], [25, 90]],
      path([[25, 10], [50, 10]], arc(50, 30, 20, 20, -90, 90), [[50, 50], [25, 50]])
    ] },
    Q: { strokes: [circle(50, 50, 40), [[60, 68], [84, 92]]] },
    R: { strokes: [
      [[25, 10], [25, 90]],
      path([[25, 10], [50, 10]], arc(50, 30, 20, 20, -90, 90), [[50, 50], [25, 50]]),
      [[45, 50], [75, 90]]
    ] },
    S: { strokes: [path(arc(50, 30, 24, 20, -15, -270), arc(50, 70, 26, 20, -90, 160))] },
    T: { strokes: [[[50, 10], [50, 90]], [[20, 10], [80, 10]]] },
    U: { strokes: [path([[25, 10], [25, 62]], arc(50, 62, 25, 25, 180, 0), [[75, 62], [75, 10]])] },
    V: { strokes: [[[20, 10], [50, 90], [80, 10]]] },
    W: { strokes: [[[10, 10], [30, 90], [50, 25], [70, 90], [90, 10]]] },
    X: { strokes: [[[22, 10], [78, 90]], [[78, 10], [22, 90]]] },
    Y: { strokes: [[[22, 10], [50, 50]], [[78, 10], [50, 50], [50, 90]]] },
    Z: { strokes: [[[22, 10], [78, 10], [22, 90], [78, 90]]] }
  };

  // One picture per shape. `img` is a file in ../assets/img/.
  var REWARDS = {
    'line-down':   { word: 'Rain',  img: 'rain' },
    'line-across': { word: 'Snake', img: 'snake' },
    'circle':      { word: 'Ball',  img: 'ball' },
    'cross':       { word: 'Plane', img: 'plane' },
    A: { word: 'Apple',     img: 'apple' },
    B: { word: 'Bus',       img: 'bus' },
    C: { word: 'Cat',       img: 'cat' },
    D: { word: 'Dog',       img: 'dog' },
    E: { word: 'Egg',       img: 'egg' },
    F: { word: 'Fish',      img: 'fish' },
    G: { word: 'Grapes',    img: 'grapes' },
    H: { word: 'House',     img: 'house' },
    I: { word: 'Ice cream', img: 'icecream' },
    J: { word: 'Juice',     img: 'juice' },
    K: { word: 'Kite',      img: 'kite' },
    L: { word: 'Lion',      img: 'lion' },
    M: { word: 'Monkey',    img: 'monkey' },
    N: { word: 'Nest',      img: 'nest' },
    O: { word: 'Owl',       img: 'owl' },
    P: { word: 'Pig',       img: 'pig' },
    Q: { word: 'Queen',     img: 'queen' },
    R: { word: 'Rocket',    img: 'rocket' },
    S: { word: 'Sun',       img: 'sun' },
    T: { word: 'Train',     img: 'train' },
    U: { word: 'Umbrella',  img: 'umbrella' },
    V: { word: 'Van',       img: 'van' },
    W: { word: 'Whale',     img: 'whale' },
    X: { word: 'X-ray',     img: 'xray' },
    Y: { word: 'Yo-yo',     img: 'yoyo' },
    Z: { word: 'Zebra',     img: 'zebra' }
  };

  var SETS = {
    strokes:  { label: 'Warm-up strokes',          keys: ['line-down', 'line-across', 'circle', 'cross'] },
    straight: { label: 'Straight-line letters',    keys: ['L', 'T', 'I', 'H', 'E', 'F'] },
    slanted:  { label: 'Slanty letters',           keys: ['V', 'X', 'A', 'Z', 'N', 'M', 'K', 'Y', 'W'] },
    curvy:    { label: 'Curvy letters',            keys: ['C', 'O', 'Q', 'G', 'S', 'U', 'J', 'D', 'P', 'B', 'R'] },
    all:      { label: 'All letters A–Z',          keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
    custom:   { label: 'My own choice',            keys: [] }
  };

  global.PP_DATA = { SHAPES: SHAPES, REWARDS: REWARDS, SETS: SETS };
})(window);
