/* Внимание читателя. Наведение, касание, фокус с клавиатуры, прокрутка —
 * всё сводится к одному плавному числу 0…1: насколько читатель здесь.
 * Пока он здесь, шёлк успокаивается, контраст встаёт, строфа не уходит.
 *
 * Листание: короткое касание или щелчок — дальше; стрелки, пробел, Enter —
 * дальше, стрелки влево/вверх — назад. Долгое касание — только внимание.
 *
 * Фокус считаем только клавиатурный: щелчок мышью тоже ставит фокус на
 * элемент, и без этой оговорки один щелчок держал бы строфу вечно. */
export function createAttention(el, A, on, tier) {
  let hover = false, pressing = false, focused = false;
  /* Рука: где курсор, в долях кадра от центра (−0.5…0.5), с инерцией. */
  const hand = { x: 0, y: 0, tx: 0, ty: 0, on: 0 };
  const pointerTau = A.pointerTau[tier] || 1.0;
  const seen = function (e) {
    hand.tx = e.clientX / innerWidth - 0.5;
    hand.ty = 0.5 - e.clientY / innerHeight;
  };
  let lastMove = -1e9, lastScroll = -1e9, lastDown = -1e9;
  let down = null;
  let value = 0;
  const now = function () { return performance.now() / 1000; };

  el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') { hover = true; lastMove = now(); } });
  el.addEventListener('pointerleave', function () { hover = false; });
  el.addEventListener('pointermove', function (e) { seen(e); if (e.pointerType !== 'touch') { hover = true; lastMove = now(); } });
  el.addEventListener('pointerdown', function (e) {
    pressing = true; lastDown = now(); seen(e);
    down = { t: lastDown, x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', function (e) {
    if (e.target.closest && e.target.closest('a, button')) { pressing = false; down = null; return; }
    if (pressing && down) {
      const dt = (now() - down.t) * 1000;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (dt < A.tapMs && dx * dx + dy * dy < A.tapPx * A.tapPx) on.next();
    }
    pressing = false; down = null;
  });
  el.addEventListener('pointercancel', function () { pressing = false; down = null; });
  el.addEventListener('focus', function () { focused = now() - lastDown > 0.35; });
  el.addEventListener('blur', function () { focused = false; });
  el.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // Enter и пробел на ссылке — её собственные: листать строфы не надо.
    if (e.target.closest && e.target.closest('a, button')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); focused = true; on.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focused = true; on.prev(); }
  });
  const scrolled = function () { lastScroll = now(); };
  addEventListener('wheel', scrolled, { passive: true });
  addEventListener('scroll', scrolled, { passive: true });

  function update(dt) {
    const n = now();
    const hov = hover && (n - lastMove < A.hoverIdle);
    const target = (hov || pressing || focused || (n - lastScroll < A.scrollHold)) ? 1 : 0;
    const tau = target > value ? A.riseTau : A.fallTau;
    value += (target - value) * (1 - Math.exp(-dt / tau));
    const k = 1 - Math.exp(-dt / pointerTau);
    hand.x += (hand.tx - hand.x) * k;
    hand.y += (hand.ty - hand.y) * k;
    const handOn = (hov || pressing) ? 1 : 0;
    hand.on += (handOn - hand.on) * k;
    return value;
  }

  return { update: update, hand: hand, get value() { return value; } };
}
