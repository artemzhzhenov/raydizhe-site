/* Слой шёлка на остановке «Автор».
 *
 * Сцена d-room остаётся как есть; этот слой лежит над ней отдельным
 * прозрачным холстом и работает только около «Автора»:
 *
 *   1. читатель доходит до «Diana Ray» — в воздухе летят лепестки роз;
 *   2. прокрутка дальше — строфы проступают светом прямо в воздухе,
 *      над общим фоном сайта, без подложки; экран прокрутки — строфа;
 *   3. после последней строфа гаснет, лепестки уходят, и страница едет
 *      дальше, к «Следующей книге».
 *
 * (presence.silk — исторически «шёлк»; теперь это присутствие стихов.
 * Сгущение вуали сайта осталось выключателем: CONFIG.reveal.thicken.)
 *
 * Вне этого участка слой не рисует ничего и цикл кадров стоит.
 *
 * Стихи лежат в разметке (#poem): по проходу на строфу. Диктор и читатель
 * без WebGL получают их как обычный текст. */
import * as THREE from '../../assets/vendor/three.slim.js';
import { CONFIG, tierOf } from './config.js';
import { FRAGMENTS } from './content.js';
import { ready, typeset } from './typeset.js';
import { createAirRender } from './render/air.js';
import { createRoseDust } from './render/roseDust.js';
import { createRhythm } from './motion.js';
import { createAttention } from './interaction.js';
import { link } from '../author-link.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const root = document.documentElement;
const author = document.getElementById('author');
const poem = document.getElementById('poem');

function smooth(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }

/* Середина элемента от начала документа. Не offsetTop: у проходов
 * offsetParent — сама секция #poem (она позиционирована), и offsetTop
 * считался бы от неё. */
function centreOf(el) {
  const r = el.getBoundingClientRect();
  return r.top + scrollY + r.height / 2;
}

export async function startAuthorSilk() {
  if (!author || !poem) return null;
  const passages = Array.prototype.slice.call(poem.querySelectorAll('.passage'));
  if (!passages.length) return null;

  const tier = tierOf();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.id = 'author-silk';
  canvas.setAttribute('aria-hidden', 'true');
  const room = document.getElementById('room');
  room.parentNode.insertBefore(canvas, room.nextSibling);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.dpr[tier]));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const env = { mode: 'silkLight', tier: tier, reduced: reduced };
  const view = createAirRender(THREE, renderer, CONFIG, env);
  const dust = createRoseDust(THREE, view, CONFIG, env);

  await ready();
  const phone = tier === 'phone';
  const TW = phone ? 1400 : 1600, TH = phone ? 840 : 960;
  const texts = [];
  for (let i = 0; i < FRAGMENTS.length; i++) texts.push(await typeset(FRAGMENTS[i], TW, TH));
  const textures = texts.map(function (t) {
    const tex = new THREE.Texture(t.canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    return tex;
  });

  /* Листание: касание, стрелки, Enter — к следующему проходу прокруткой.
   * Строфу выбирает прокрутка, так что и кнопки двигают страницу, а не
   * сцену: где читатель — там и строфа. */
  function scrollToPassage(i) {
    const el = passages[Math.max(0, Math.min(passages.length - 1, i))];
    const top = centreOf(el) - innerHeight / 2;
    scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
  }
  const rhythm = createRhythm(FRAGMENTS, CONFIG.rhythm, reduced);
  const attention = createAttention(poem, CONFIG.attention, {
    next: function () { scrollToPassage(passageAt() + 1); },
    prev: function () { scrollToPassage(passageAt() - 1); }
  }, tier);

  const countEl = document.createElement('p');
  countEl.className = 'poem-count';
  countEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(countEl);

  let current = -1;
  function layout() {
    renderer.setSize(innerWidth, innerHeight, false);
    if (current >= 0) view.resize(innerWidth, innerHeight, texts[current], current);
    dust.resize(innerWidth, innerHeight);
  }
  function show(i) {
    if (i === current) return;
    current = i;
    view.setTexture(textures[i]);
    layout();
    countEl.textContent = ROMAN[i] + ' · ' + ROMAN[FRAGMENTS.length - 1];
    for (let k = 0; k < passages.length; k++) {
      if (k === i) passages[k].setAttribute('aria-current', 'true');
      else passages[k].removeAttribute('aria-current');
    }
  }
  show(0);
  addEventListener('resize', function () { layout(); wake(); });

  /* Где мы на участке. Всё — от середины экрана и геометрии разметки,
   * поэтому работает одинаково на любой высоте экрана и при любой длине
   * текста. */
  function passageAt() {
    const mid = scrollY + innerHeight / 2;
    let best = 0, bestD = 1e9;
    for (let k = 0; k < passages.length; k++) {
      const c = centreOf(passages[k]);
      const d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }
  const R = CONFIG.reveal;
  const presence = { petals: 0, thick: 0, silk: 0 };
  function measurePresence() {
    const vh = innerHeight;
    const mid = scrollY + vh / 2;
    const a = centreOf(author);
    const first = centreOf(passages[0]);
    const last = centreOf(passages[passages.length - 1]);
    const leave = smooth((mid - last) / (vh * R.leave));
    const gather = Math.min(1, Math.max(0, (mid - a) / Math.max(1, first - a)));
    presence.petals = smooth((mid - (a - vh * R.petalsIn)) / (vh * R.petalsIn)) * (1 - leave);
    // Вуаль сайта сгущается, только если это включено (R.thicken > 0).
    presence.thick = R.thicken * smooth(gather / R.silkFrom * 0.8) * (1 - leave);
    presence.silk = smooth((gather - R.silkFrom) / (1 - R.silkFrom)) * (1 - leave);
    return presence.petals > 0.001 || presence.silk > 0.001;
  }

  let raf = 0, last = 0, clock = 0, active = false, hidden = document.hidden;
  const speed = CONFIG.silk.speed * (reduced ? CONFIG.reduced.speed : 1);
  const fs = { time: 0, calm: 0, progress: 0, inkFade: 0, temp: 1, scroll: 0, hand: attention.hand, phase: 'dark', veil: 0, petals: 0 };

  function frame(now) {
    raf = 0;
    const on = measurePresence();
    link.thick = presence.thick;
    if (!on) {
      if (active) { active = false; root.classList.remove('silk-reading', 'poem-reply-on'); countEl.style.opacity = '0'; renderer.clear(); canvas.style.visibility = 'hidden'; }
      // Ушли совсем — в следующий раз строфа проступит заново.
      if (rhythm.phase !== 'dark' || current !== passageAt()) { rhythm.reset(passageAt()); show(passageAt()); }
      return;
    }
    if (!active) { active = true; canvas.style.visibility = 'visible'; last = 0; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    clock += dt * speed;

    // Строфа — та, на чьём экране читатель. Пишется, только когда шёлк
    // собрался; пока он сгущается, ритм стоит в темноте.
    const want = passageAt();
    if (presence.silk > 0.6) {
      if (want !== rhythm.index) rhythm.go(want);
    } else if (presence.silk < 0.05 && (rhythm.phase !== 'dark' || rhythm.index !== want)) {
      rhythm.reset(want);
    }
    const att = attention.update(dt);
    const r = presence.silk > 0.6 ? rhythm.update(dt, att) : { index: rhythm.index, progress: 0, inkFade: 0, phase: 'dark' };
    if (r.index !== current) show(r.index);
    root.classList.toggle('silk-reading', presence.silk > 0.5);
    // «Write to Diana» — когда последняя строфа дописана и стоит.
    root.classList.toggle('poem-reply-on', presence.silk > 0.9 && current === FRAGMENTS.length - 1 && r.phase === 'hold');
    countEl.style.opacity = String(Math.max(0, presence.silk - 0.5) * 2);

    fs.time = clock;
    fs.calm = att;
    fs.progress = r.progress;
    fs.inkFade = r.inkFade;
    fs.temp = (CONFIG.passages[current] || { warm: 1 }).warm;
    fs.phase = r.phase;
    fs.veil = presence.silk;
    fs.petals = presence.petals;
    view.set(fs);
    dust.update(dt, fs);
    view.render();
    if (!hidden) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !hidden) raf = requestAnimationFrame(frame); }
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', function () { hidden = document.hidden; wake(); });

  layout();
  root.classList.add('silk-on');
  wake();

  const api = { view: view, rhythm: rhythm, attention: attention, presence: presence, texts: texts, get index() { return current; } };
  window.__authorSilk = api;
  return api;
}
