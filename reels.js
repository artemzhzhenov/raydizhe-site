/* Карусель роликов на финале — только узкий экран.
 *
 * Ролики на телефоне всегда в вёрстке, со сценой и без неё (см. buildReel()
 * в scene.js): одинаково на любом телефоне. Листаются вбок, по одному,
 * соседи выглядывают из-за краёв. Эта часть добавляет только то, чего CSS
 * не умеет: точки под лентой и «играет один ролик за раз». Широкий экран
 * сюда не заходит — там три колонки или колесо в сцене, как было.
 */

const narrowQuery = window.matchMedia('(max-width: 899.98px)');

export function startReels() {
  const track = document.querySelector('#follow .reels');
  if (!track) return;
  const slides = Array.prototype.slice.call(track.querySelectorAll('.shot-video'));
  const videos = slides.map(function (s) { return s.querySelector('video'); });
  if (slides.length < 2) return;

  // Свои кнопки вместо полосы плеера: края ролика растворяются, как у
  // портретов каста, и системная полоса внизу растворилась бы вместе с
  // ними. Нажатие по ролику — play со звуком (жест читателя), ещё раз —
  // пауза. Только узкий экран: на широком плеером правит сцена или
  // обычные controls.
  const plays = slides.map(function (slide, i) {
    const v = videos[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reel-play';
    b.setAttribute('aria-label', 'Play reel ' + (i + 1));
    slide.appendChild(b);
    slide.addEventListener('click', function () {
      if (!narrowQuery.matches || !v) return;
      if (v.paused) {
        v.muted = false;
        const p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    });
    if (v) {
      v.addEventListener('play', function () { slide.classList.add('is-playing'); });
      v.addEventListener('pause', function () { slide.classList.remove('is-playing'); });
    }
    return b;
  });
  function applyMode() {
    const on = narrowQuery.matches;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      // Ролик, взятый сценой (.frame-on), не трогаем: там controls
      // выключила она сама.
      if (!v || slides[i].classList.contains('frame-on')) continue;
      v.controls = !on;
      v.tabIndex = on ? -1 : 0;
      plays[i].hidden = !on;
    }
  }
  applyMode();
  if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', applyMode);

  const dots = document.createElement('p');
  dots.className = 'reel-dots';
  dots.setAttribute('aria-label', 'Reels');
  const buttons = slides.map(function (slide, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Reel ' + (i + 1) + ' of ' + slides.length);
    b.addEventListener('click', function () {
      track.scrollTo({ left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2, behavior: 'smooth' });
    });
    dots.appendChild(b);
    return b;
  });
  track.after(dots);

  function mark(active) {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-current', i === active ? 'true' : 'false');
    }
  }
  mark(0);

  // Ближний к центру ленты слайд — текущий. Ролик, уехавший вбок, встаёт:
  // два звука разом никому не нужны.
  let current = 0;
  let queued = false;
  function onScroll() {
    queued = false;
    if (!narrowQuery.matches) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < slides.length; i++) {
      const d = Math.abs(slides[i].offsetLeft + slides[i].offsetWidth / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best === current) return;
    current = best;
    mark(best);
    for (let i = 0; i < videos.length; i++) {
      if (i !== best && videos[i] && !videos[i].paused) videos[i].pause();
    }
  }
  track.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });

  // Запустили один — остальные встают.
  videos.forEach(function (v) {
    if (!v) return;
    v.addEventListener('play', function () {
      if (!narrowQuery.matches) return;
      for (let i = 0; i < videos.length; i++) {
        if (videos[i] && videos[i] !== v && !videos[i].paused) videos[i].pause();
      }
    });
  });

  // Финал ушёл с экрана — ролик встаёт, телефон не греется впустую.
  const watcher = new IntersectionObserver(function (entries) {
    if (entries[entries.length - 1].isIntersecting || !narrowQuery.matches) return;
    for (let i = 0; i < videos.length; i++) if (videos[i] && !videos[i].paused) videos[i].pause();
  });
  watcher.observe(track);
}
