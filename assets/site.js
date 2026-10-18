// Looping demo videos: play only while on screen, honour reduced motion, give every loop a pause control.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loops = document.querySelectorAll('video[data-loop]');
  loops.forEach(function (v) {
    v.muted = true; v.loop = true; v.playsInline = true;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'play-toggle';
    (v.closest('.frame') || v.parentNode).appendChild(btn);
    var userPaused = reduce;
    function label() { btn.textContent = v.paused ? 'Play' : 'Pause'; btn.setAttribute('aria-label', (v.paused ? 'Play' : 'Pause') + ' video'); }
    btn.addEventListener('click', function () {
      if (v.paused) { userPaused = false; v.play().catch(function () {}); } else { userPaused = true; v.pause(); }
    });
    v.addEventListener('play', label); v.addEventListener('pause', label); label();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !userPaused) v.play().catch(function () {});
          else if (!e.isIntersecting) v.pause();
        });
      }, { threshold: 0.25 }).observe(v);
    } else if (!reduce) { v.play().catch(function () {}); }
  });

  // Copy email
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var status = document.getElementById(b.getAttribute('aria-controls'));
      function done(msg) { if (status) status.textContent = msg; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done('Email copied.'); }, function () { done('Copy failed. The address is ' + text); });
      } else { done('Copy failed. The address is ' + text); }
    });
  });

  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
})();
