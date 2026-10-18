// Page motion: smooth scroll, the scroll-driven story captions, scan-line headline reveals,
// media reveals and counters. Content is always readable at rest; motion only decorates it.
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = window.gsap && window.ScrollTrigger;
  var still = new URLSearchParams(location.search).has('still');
  if (still) document.documentElement.classList.add('still');

  // ---------- smooth scroll (light, so long pages still move quickly) ----------
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.16, wheelMultiplier: 1.15, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else { (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0); }
  }
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1 }) : scrollTo({ top: 0 }); return; }
      var el = document.querySelector(id); if (!el) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(el, { offset: -40, duration: 1.1 }) : el.scrollIntoView();
    });
  });

  // ---------- header ----------
  var top = document.getElementById('top'), lastY = 0;
  function onScroll() {
    var y = scrollY;
    top.classList.toggle('solid', y > 40);
    top.classList.toggle('away', y > lastY + 2 && y > innerHeight * 1.2 && !top.matches(':focus-within'));
    if (y < lastY - 2) top.classList.remove('away');
    lastY = y;
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- copy email ----------
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy'), st = document.getElementById('copystat');
      var done = function (m) { st.textContent = m; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done('Email copied.'); }, function () { done('Copy failed. The address is ' + text + '.'); });
      else done('Copy failed. The address is ' + text + '.');
    });
  });

  // ---------- film dialog ----------
  var film = document.getElementById('film');
  document.querySelectorAll('[data-film]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (film.showModal) film.showModal(); else film.setAttribute('open', '');
      if (lenis) lenis.stop();
      film.querySelector('video').play().catch(function () {});
    });
  });
  film.querySelector('[data-close]').addEventListener('click', function () { film.close ? film.close() : film.removeAttribute('open'); });
  film.addEventListener('close', function () { film.querySelector('video').pause(); if (lenis) lenis.start(); });
  film.addEventListener('click', function (e) { if (e.target === film) film.close(); });

  // ---------- looping project videos ----------
  document.querySelectorAll('video[data-loop]').forEach(function (v) {
    v.muted = true;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pp';
    v.parentNode.appendChild(btn);
    var userPaused = reduce;
    var label = function () { btn.textContent = v.paused ? 'Play' : 'Pause'; btn.setAttribute('aria-label', (v.paused ? 'Play' : 'Pause') + ' video'); };
    btn.addEventListener('click', function () { if (v.paused) { userPaused = false; v.play().catch(function () {}); } else { userPaused = true; v.pause(); } });
    v.addEventListener('play', label); v.addEventListener('pause', label); label();
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !userPaused) v.play().catch(function () {}); else if (!e.isIntersecting) v.pause(); });
    }, { threshold: 0.2 }).observe(v);
  });

  // ---------- story captions ----------
  // One caption at a time. The outgoing one finishes leaving before the next arrives, so they never overlap.
  var caps = [document.getElementById('hero')].concat([].slice.call(document.querySelectorAll('.cap')));
  var RANGES = [[0, 0.06], [0.06, 0.30], [0.30, 0.62], [0.62, 1.01]];   // hero, instruction, drive+reach, grasp+lift
  var current = 0, bar = document.querySelector('#progress span'), cue = document.getElementById('cue');
  caps.forEach(function (c, i) { if (i) { c.style.opacity = 0; c.style.visibility = 'hidden'; } });

  function show(i) {
    if (i === current) return;
    var out = caps[current], inn = caps[current = i];
    if (!hasGsap || reduce) {
      out.style.opacity = 0; out.style.visibility = 'hidden';
      inn.style.visibility = 'visible'; inn.style.opacity = 1; inn.style.pointerEvents = 'auto';
      out.style.pointerEvents = 'none';
      return;
    }
    gsap.killTweensOf([out, inn]);
    out.style.pointerEvents = 'none';
    gsap.to(out, { opacity: 0, y: -24, duration: 0.22, ease: 'power2.in', onComplete: function () { out.style.visibility = 'hidden'; } });
    gsap.set(inn, { visibility: 'visible', pointerEvents: 'auto' });
    gsap.fromTo(inn, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.45, delay: 0.2, ease: 'power3.out' });
  }

  function storyProgress() {
    var s = document.getElementById('story'), r = s.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
  }
  function onStory() {
    if (still) return;
    var p = storyProgress(), idx = 0;
    RANGES.forEach(function (r, k) { if (p >= r[0] && p < r[1]) idx = k; });
    show(idx);
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    if (cue) cue.style.opacity = String(1 - Math.min(1, p / 0.03));
  }
  addEventListener('scroll', onStory, { passive: true }); onStory();

  if (!hasGsap) return;
  gsap.registerPlugin(ScrollTrigger);

  // ---------- hero name: letters stretch into place ----------
  document.querySelectorAll('.hero-copy h1 .word').forEach(function (w) {
    w.innerHTML = w.textContent.split('').map(function (c) { return '<span class="ch">' + c + '</span>'; }).join('');
  });
  if (!reduce && !still) {
    gsap.from('.hero-copy h1 .ch', { fontStretch: '55%', opacity: 0, yPercent: 35, duration: 1.1, ease: 'expo.out', stagger: 0.035, delay: 0.1 });
    gsap.from(['.hero-copy .status', '.hero-copy .role', '.hero-copy .btns', '#cue'], { opacity: 0, y: 16, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.4 });
  }

  // ---------- scan-line headline reveals (fast, early, and never leave text hidden) ----------
  gsap.utils.toArray('.scan').forEach(function (el) {
    var b = document.createElement('span'); b.className = 'bar'; b.setAttribute('aria-hidden', 'true'); el.appendChild(b);
    if (reduce) return;
    var tl = gsap.timeline({ paused: true });
    tl.set(b, { opacity: 1 })
      .fromTo(el, { clipPath: 'inset(-10% 100% -10% 0)', fontStretch: '75%' }, { clipPath: 'inset(-10% 0% -10% 0)', fontStretch: '122%', duration: 0.75, ease: 'power3.inOut', immediateRender: false }, 0)
      .fromTo(b, { left: '0%' }, { left: '100%', duration: 0.75, ease: 'power3.inOut' }, 0)
      .to(b, { opacity: 0, duration: 0.2 }, 0.7);
    ScrollTrigger.create({ trigger: el, start: 'top 98%', once: true, onEnter: function () { tl.play(); } });
  });

  if (reduce) return;

  // ---------- project media: open up as they arrive ----------
  gsap.utils.toArray('.project .media').forEach(function (m) {
    gsap.fromTo(m, { clipPath: 'inset(8% 8% 8% 8% round 16px)' }, { clipPath: 'inset(0% 0% 0% 0% round 16px)', ease: 'none', scrollTrigger: { trigger: m, start: 'top bottom', end: 'top 55%', scrub: true } });
  });

  // ---------- the finding: bars fill and the number counts ----------
  gsap.utils.toArray('.mrow').forEach(function (row, i) {
    var fill = row.querySelector('.fill'), pct = row.querySelector('.pct'), end = +pct.getAttribute('data-count');
    var st = { trigger: row, start: 'top 95%', once: true };
    gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'expo.out', delay: i * 0.08, scrollTrigger: st });
    if (end) { var o = { v: 0 }; gsap.to(o, { v: end, duration: 1.1, ease: 'expo.out', delay: i * 0.08, scrollTrigger: st, onUpdate: function () { pct.textContent = Math.round(o.v) + '%'; } }); }
  });

  // ---------- details: animate open ----------
  document.querySelectorAll('details.more').forEach(function (d) {
    var body = d.querySelector('.more-body');
    d.querySelector('summary').addEventListener('click', function (e) {
      if (d.open) return;
      e.preventDefault(); d.open = true;
      gsap.fromTo(body, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.4, ease: 'power3.out', clearProps: 'height', onComplete: function () { ScrollTrigger.refresh(); } });
    });
  });

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
