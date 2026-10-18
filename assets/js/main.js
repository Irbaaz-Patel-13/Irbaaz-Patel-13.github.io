// Page motion: smooth scroll, the scroll-driven story captions, scan-line headline reveals,
// clip reveals on project media, counters, and the small bits of UI.
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = window.gsap && window.ScrollTrigger;
  var still = new URLSearchParams(location.search).has('still');
  if (still) document.documentElement.classList.add('still');

  // ---------- smooth scroll ----------
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) { e.preventDefault(); lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
      var el = document.querySelector(id); if (!el) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(el, { offset: -60 }) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ---------- header ----------
  var top = document.getElementById('top'), lastY = 0;
  function onScroll() {
    var y = scrollY;
    top.classList.toggle('solid', y > innerHeight * 0.6);
    top.classList.toggle('away', y > lastY && y > innerHeight * 0.9 && !top.matches(':focus-within'));
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
      if (film.showModal) { film.showModal(); } else { film.setAttribute('open', ''); }
      var v = film.querySelector('video'); v.play().catch(function () {});
    });
  });
  film.querySelector('[data-close]').addEventListener('click', function () { film.close ? film.close() : film.removeAttribute('open'); });
  film.addEventListener('close', function () { film.querySelector('video').pause(); });
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
    }, { threshold: 0.3 }).observe(v);
  });

  if (!hasGsap) return;
  gsap.registerPlugin(ScrollTrigger);

  // ---------- hero name: letters stretch into place ----------
  document.querySelectorAll('.hero-copy h1 .word').forEach(function (w) {
    w.innerHTML = w.textContent.split('').map(function (c) { return '<span class="ch">' + c + '</span>'; }).join('');
  });
  if (!reduce && !still) {
    gsap.from('.hero-copy h1 .ch', { fontStretch: '50%', opacity: 0, yPercent: 40, duration: 1.3, ease: 'expo.out', stagger: 0.045, delay: 0.15 });
    gsap.from(['.hero-copy .status', '.hero-copy .role', '.hero-copy .btns', '#cue'], { opacity: 0, y: 18, duration: 1, ease: 'power3.out', stagger: 0.1, delay: 0.55 });
  }

  // ---------- story captions, scrubbed by scroll ----------
  var caps = gsap.utils.toArray('.cap');
  var ranges = [[0.08, 0.20], [0.20, 0.34], [0.34, 0.52], [0.52, 0.70], [0.70, 0.86], [0.86, 1.01]];
  var railSteps = [[0.20, 0.34], [0.34, 0.52], [0.52, 0.70], [0.70, 0.78], [0.78, 0.92]];
  var railItems = document.querySelectorAll('#rail li');
  var rail = document.getElementById('rail'), hero = document.getElementById('hero'), cue = document.getElementById('cue');
  var lastCap = -1;

  function setCap(i) {
    if (i === lastCap) return;
    caps.forEach(function (c, k) {
      if (k === i) {
        gsap.killTweensOf(c);
        gsap.set(c, { visibility: 'visible' });
        gsap.fromTo(c, { opacity: 0, y: reduce ? 0 : 36, filter: reduce ? 'none' : 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: reduce ? 0.2 : 0.7, ease: 'power3.out' });
        if (!reduce) gsap.from(c.querySelectorAll('h2, p, .btns'), { y: 22, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.07 });
      } else if (k === lastCap) {
        gsap.killTweensOf(c);
        gsap.to(c, { opacity: 0, y: reduce ? 0 : -28, filter: reduce ? 'none' : 'blur(6px)', duration: reduce ? 0.15 : 0.45, ease: 'power2.in', onComplete: function () { c.style.visibility = 'hidden'; } });
      } else { c.style.opacity = 0; c.style.visibility = 'hidden'; }
    });
    lastCap = i;
  }

  ScrollTrigger.create({
    trigger: '#story', start: 'top top', end: 'bottom bottom',
    onUpdate: function (self) {
      var p = self.progress;
      if (still) return;
      // hero copy dissolves as the run begins
      var h = gsap.utils.clamp(0, 1, p / 0.06);
      hero.style.opacity = 1 - h;
      hero.style.pointerEvents = h > 0.9 ? 'none' : 'auto';
      if (!reduce) hero.style.filter = 'blur(' + (h * 10).toFixed(1) + 'px)';
      cue.style.opacity = 1 - gsap.utils.clamp(0, 1, p / 0.03);
      rail.style.opacity = gsap.utils.clamp(0, 1, (p - 0.07) / 0.04);
      var idx = -1; ranges.forEach(function (r, k) { if (p >= r[0] && p < r[1]) idx = k; });
      setCap(idx);
      railItems.forEach(function (li, k) {
        var r = railSteps[k], f = gsap.utils.clamp(0, 1, (p - r[0]) / (r[1] - r[0]));
        li.style.setProperty('--fill', (f * 100).toFixed(1) + '%');
        li.classList.toggle('on', p >= r[0]);
      });
    }
  });

  // ---------- scan-line headline reveals ----------
  gsap.utils.toArray('.scan').forEach(function (el) {
    var bar = document.createElement('span'); bar.className = 'bar'; bar.setAttribute('aria-hidden', 'true'); el.appendChild(bar);
    if (reduce) return;
    var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' } });
    tl.set(bar, { opacity: 1, left: '0%' })
      .fromTo(el, { clipPath: 'inset(-10% 100% -10% 0)', fontStretch: '70%' }, { clipPath: 'inset(-10% 0% -10% 0)', fontStretch: el.classList.contains('big') ? '125%' : '112%', duration: 1.1, ease: 'power3.inOut' }, 0)
      .fromTo(bar, { left: '0%' }, { left: '100%', duration: 1.1, ease: 'power3.inOut' }, 0)
      .to(bar, { opacity: 0, duration: 0.3 }, 1.0);
  });

  if (reduce) return;

  // ---------- project media: clip reveal + slow parallax ----------
  gsap.utils.toArray('.project').forEach(function (pj) {
    var m = pj.querySelector('.media'), inner = m.querySelector('video, img');
    gsap.fromTo(m, { clipPath: 'inset(12% 12% 12% 12% round 18px)' }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', ease: 'none', scrollTrigger: { trigger: pj, start: 'top 95%', end: 'top 35%', scrub: true } });
    gsap.fromTo(inner, { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: pj, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from(pj.querySelectorAll('.copy > *:not(h3)'), { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: pj, start: 'top 70%' } });
  });

  // ---------- the finding: bars fill and numbers count ----------
  gsap.utils.toArray('.mrow').forEach(function (row, i) {
    var fill = row.querySelector('.fill'), pct = row.querySelector('.pct'), end = +pct.getAttribute('data-count'), o = { v: 0 };
    var st = { trigger: row, start: 'top 88%' };
    gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'expo.out', delay: i * 0.06, scrollTrigger: st });
    gsap.to(o, { v: end, duration: 1.4, ease: 'expo.out', delay: i * 0.06, scrollTrigger: st, onUpdate: function () { pct.textContent = Math.round(o.v) + '%'; } });
  });
  gsap.from('.finding .say > *', { y: 26, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.finding', start: 'top 75%' } });
  gsap.set('.also-row, details.more, .facts > div, .chan > div', { y: 24, opacity: 0 });
  ScrollTrigger.batch('.also-row, details.more, .facts > div, .chan > div', {
    start: 'top 92%', once: true,
    onEnter: function (els) { gsap.to(els, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.06 }); }
  });
  gsap.from('.about .prose p', { y: 26, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.about', start: 'top 70%' } });

  // ---------- details: animate open ----------
  document.querySelectorAll('details.more').forEach(function (d) {
    var body = d.querySelector('.more-body');
    d.querySelector('summary').addEventListener('click', function (e) {
      if (d.open) return;           // closing: let the browser do it
      e.preventDefault(); d.open = true;
      gsap.fromTo(body, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.55, ease: 'power3.out', clearProps: 'height', onComplete: function () { ScrollTrigger.refresh(); } });
    });
  });

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
