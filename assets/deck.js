/* Learn2Write deck: scale-to-fit, keyboard / click / swipe navigation, #slide links. */
(function () {
  'use strict';
  var deck = document.querySelector('.deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var bar = document.querySelector('.progress');
  var counter = document.getElementById('counter');
  var i = 0;

  slides.forEach(function (s, n) {
    var foot = document.createElement('div');
    foot.className = 'slide-foot';
    foot.innerHTML = '<span>Learn2Write · research, design &amp; app plan</span><span class="page">' + (n + 1) + ' / ' + slides.length + '</span>';
    s.appendChild(foot);
  });

  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    deck.style.transform = 'scale(' + s + ')';
  }

  function go(n, animate) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    slides[i].classList.remove('active', 'fade-in');
    i = n;
    slides[i].classList.add('active');
    if (animate) slides[i].classList.add('fade-in');
    bar.style.width = ((i + 1) / slides.length * 100) + '%';
    counter.textContent = (i + 1) + ' / ' + slides.length;
    if (location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1));
  }
  function fromHash() {
    var n = parseInt((location.hash || '').slice(1), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); go(i + 1, true); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); go(i - 1, true); }
    else if (k === 'Home') go(0, true);
    else if (k === 'End') go(slides.length - 1, true);
    else if (k === 'f' || k === 'F') toggleFull();
  });

  document.getElementById('prev').addEventListener('click', function () { go(i - 1, true); });
  document.getElementById('next').addEventListener('click', function () { go(i + 1, true); });
  document.getElementById('full').addEventListener('click', toggleFull);

  // Click the right or left part of a slide to move (links still work).
  document.querySelector('.viewport').addEventListener('click', function (e) {
    if (e.target.closest('a, button')) return;
    if (window.getSelection && String(window.getSelection())) return;
    go(e.clientX > window.innerWidth * 0.35 ? i + 1 : i - 1, true);
  });

  var x0 = null, y0 = null;
  document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? i + 1 : i - 1, true);
    x0 = null;
  }, { passive: true });

  function toggleFull() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) {}
  }

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', function () { go(fromHash(), false); });
  fit();
  go(fromHash(), false);
})();
