/* Форма «сообщить о выходе» — поведение на странице.
 *
 * С JS форма не перезагружает страницу: отправка fetch'ем, ответ приёмника
 * превращается в «You're on the list» + обои прямо в финале. Без JS работает
 * сама (action/method в разметке). Логика без DOM — в notify-core.js.
 *
 * Сцена (scene.js) держит маршрут камеры по центрам секций: когда форма
 * сменяется обоями, высота финала меняется — шлём `souls:layout`, сцена
 * пересчитывает центры. */
import { looksLikeEmail, errorText, giftKind, giftFile, giftList, STORAGE_KEY } from './notify-core.js';

const D = window.SOULS || {};
const cfg = D.notify || {};
const box = document.getElementById('notify');
const form = document.getElementById('notify-form');
if (box && form) start();

function track(name, data) {
  try { if (window.umami && window.umami.track) window.umami.track(name, data); } catch (e) { /* статистика — не повод ломать форму */ }
}

function remember() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* приватный режим — просто не запомним */ }
}
function remembered() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
}

function layoutChanged() {
  window.dispatchEvent(new CustomEvent('souls:layout'));
}

function start() {
  const email = form.elements.email;
  const error = box.querySelector('.notify-error');
  const done = box.querySelector('.notify-done');
  const ink = box.querySelector('.notify-ink');

  if (cfg.endpoint) form.action = cfg.endpoint;
  if (window.__NOTIFY_ENDPOINT) form.action = window.__NOTIFY_ENDPOINT; // только для локальных проверок
  if (cfg.version) form.elements.v.value = cfg.version;

  // Ссылка с титула: если подписались, придя по ней, — spot=title.
  document.querySelectorAll('[data-notify-spot]').forEach(function (a) {
    a.addEventListener('click', function () { form.elements.spot.value = a.dataset.notifySpot; });
  });
  function showError(text) {
    error.textContent = text;
    email.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  function finish(animate) {
    box.dataset.state = 'done';
    done.hidden = false;
    if (animate) {
      // Фокус — только после свежей подписки; при повторном заходе он утащил бы страницу к финалу.
      ink.tabIndex = -1;
      ink.focus({ preventScroll: true });
      ink.classList.add('is-writing');
    }
    try { buildGift(box.querySelector('.gift')); } catch (e) { console.warn('notify: обои не собрались —', e && e.message); }
    layoutChanged();
  }

  // Высота блока меняется не только при смене формы на обои, но и когда
  // догружаются картинки и шрифт — следим за размером и говорим сцене, не чаще раза в кадр.
  if ('ResizeObserver' in window) {
    let queued = false;
    new ResizeObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; layoutChanged(); });
    }).observe(box);
  }

  // Рукописный шрифт — заранее, при первом касании поля, чтобы чернила не писались запасным.
  email.addEventListener('focus', function () {
    if (document.fonts && document.fonts.load) document.fonts.load('1em "Homemade Apple"').catch(function () {});
  }, { once: true });

  if (remembered()) {
    finish(false);
    return;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (box.dataset.state === 'sending') return;
    showError('');
    const value = email.value;
    if (!looksLikeEmail(value)) { showError(errorText('format')); email.focus(); return; }
    box.dataset.state = 'sending';
    // Правило приёмника: отправка раньше 2 с после загрузки — бот, строка не
    // сохраняется. Тот, кто пришёл сразу на #notify, мог успеть быстрее, поэтому
    // держим отправку до 2,1 с от загрузки страницы.
    const wait = Math.max(0, 2100 - performance.now());
    setTimeout(send, wait);

    function send() {
    const body = new URLSearchParams();
    body.set('email', value.trim());
    body.set('v', form.elements.v.value);
    body.set('spot', form.elements.spot.value);
    body.set('hp', form.elements.hp.value);
    body.set('t', String(Math.round(performance.now())));
    if (form.elements.future.checked) body.set('future', '1');

    const stop = new AbortController();
    const timer = setTimeout(function () { stop.abort(); }, 15000);
    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: stop.signal,
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'busy' }; });
    }).then(function (data) {
      clearTimeout(timer);
      if (data && data.ok) {
        remember();
        track('notify', { spot: form.elements.spot.value });
        finish(true);
        return;
      }
      box.dataset.state = 'idle';
      showError(errorText(data && data.error));
    }).catch(function () {
      clearTimeout(timer);
      box.dataset.state = 'idle';
      showError(errorText('busy'));
    });
    }
  });
}

/* ── Обои ─────────────────────────────────────────────────────────────── */
function buildGift(gift) {
  if (!gift || gift.dataset.built) return;
  gift.dataset.built = '1';
  const grid = gift.querySelector('.gift-grid');
  const hint = gift.querySelector('.gift-hint');
  const tpl = document.getElementById('gift-card');
  const view = document.getElementById('gift-view');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const buttons = gift.querySelectorAll('.gift-switch [data-kind]');

  function render(kind) {
    grid.dataset.kind = kind;
    grid.textContent = '';
    const list = giftList(cfg.gift, kind);
    list.forEach(function (w, i) {
      const node = tpl.content.cloneNode(true);
      const img = node.querySelector('img');
      const open = node.querySelector('.gift-open');
      const dl = node.querySelector('.gift-download');
      img.src = giftFile(kind, w.slug, true);
      img.alt = w.title + ' — wallpaper for ' + kind;
      open.href = giftFile(kind, w.slug);
      dl.href = giftFile(kind, w.slug);
      node.querySelector('.gift-title').textContent = w.title;
      if (!coarse) { open.target = '_blank'; open.rel = 'noopener'; } // компьютер: сцена остаётся открытой
      open.addEventListener('click', function (ev) {
        track('wallpaper', { kind: kind, n: i + 1 });
        if (!coarse || !view || typeof view.showModal !== 'function') return; // компьютер: обычная ссылка на файл
        ev.preventDefault();
        view.querySelector('img').src = open.href;
        view.querySelector('img').alt = img.alt;
        view.showModal();
      });
      dl.addEventListener('click', function () { track('wallpaper', { kind: kind, n: i + 1 }); });
      grid.appendChild(node);
    });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.kind === kind ? 'true' : 'false'); });
    hint.textContent = kind === 'phone'
      ? (coarse ? 'Tap a wallpaper, then press and hold to save it.' : 'Phone wallpapers, 1290 × 2796.')
      : 'Desktop wallpapers, 3840 × 2160.';
    layoutChanged();
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { render(b.dataset.kind); });
  });
  if (view) {
    view.querySelector('.gift-close').addEventListener('click', function () { view.close(); });
    view.addEventListener('click', function (ev) { if (ev.target === view) view.close(); });
    view.addEventListener('close', function () {
      const big = view.querySelector('img');
      big.src = '';
      big.alt = '';
    });
  }
  render(giftKind(window.innerWidth, coarse));
}
