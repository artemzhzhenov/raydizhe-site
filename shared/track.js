/* События вовлечённости на странице: что читатель долистал, куда нажал.
 * Шлёт в Umami через window.umami.track — счётчик есть только на боевом
 * домене (page.js), значит локально и на превью событий нет. Каждое
 * событие — один раз за визит (Sender в track-core.js). Имена и смысл —
 * ops/README.md, «Вовлечённость». */
import { linkEvent, REACH, Sender } from './track-core.js';

const sender = new Sender(function () { return window.umami; });
window.__TRACK = sender; // для tools/track-check.mjs

// Счётчик догружается после нас — досылаем очередь, пока он не появится.
const retry = setInterval(function () {
  if (window.umami) { sender.flush(); clearInterval(retry); }
}, 500);
setTimeout(function () { clearInterval(retry); sender.flush(); }, 16000);

// Долистали: верх секции вошёл в верхние три четверти экрана (от высоты секции не зависит).
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      sender.track(REACH[e.target.id]);
      io.unobserve(e.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -25% 0px' });
  Object.keys(REACH).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
}

// Клики — делегированием: ссылки эпизодов создаются позже, page.js'ом.
document.addEventListener('click', function (ev) {
  const t = ev.target instanceof Element ? ev.target : null;
  if (!t) return;
  const link = t.closest('[data-link]');
  if (link) { const name = linkEvent(link.dataset.link); if (name) sender.track(name); return; }
  if (t.closest('.ep-link')) { sender.track('episode-watch'); return; }
  // Ролик включил читатель: карусель на телефоне или кнопка «Sound» в сцене.
  if (t.closest('#follow .reels .shot-video') || t.closest('#follow .reel-play') || t.closest('#follow button.sound')) sender.track('reel-play');
}, true);
