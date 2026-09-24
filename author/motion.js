/* Ритм: почти пустая сцена → еле проступание → строфа читается → внимание
 * → медленное отпускание → следующий фрагмент.
 *
 * Модуль не знает ни ткани, ни экрана. На вход — шаг времени и внимание
 * читателя (0…1), на выход — номер фрагмента, ход проступания и яркость.
 * Внимание останавливает чтение: пока читатель здесь, строфа не уходит.
 *
 * При сниженном движении строфа не пишется, а проступает вся сразу и так
 * же уходит. */
function easeInOut(u) { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); }
function easeOut(u) { u = Math.min(1, Math.max(0, u)); return 1 - (1 - u) * (1 - u); }

export function createRhythm(fragments, R, reduced) {
  const count = fragments.length;
  let index = 0, phase = 'dark', t = 0;
  let darkFor = R.dark;
  let releaseFor = R.release;
  let pending = -1;          // куда идти после отпускания, если читатель листнул
  let holdTimer = 0;
  const out = { index: 0, progress: 0, inkFade: 0, phase: 'dark', changed: false };

  function holdFor(i) { return R.hold + R.holdPerLine * fragments[i].lines.length; }
  function begin(ph) { phase = ph; t = 0; if (ph === 'hold') holdTimer = 0; }

  function update(dt, attention) {
    t += dt;
    out.changed = false;
    if (phase === 'dark') {
      out.progress = 0; out.inkFade = 0;
      if (t >= darkFor) begin('emerge');
    } else if (phase === 'emerge') {
      if (reduced) {
        out.progress = 1.4;
        out.inkFade = easeInOut(t / R.reducedFade);
        if (t >= R.reducedFade) begin('hold');
      } else {
        out.progress = 1.4 * easeInOut(t / R.emerge);
        out.inkFade = 1;
        if (t >= R.emerge) begin('hold');
      }
    } else if (phase === 'hold') {
      out.progress = 1.4; out.inkFade = 1;
      holdTimer += dt * (1 - attention);
      // На сайте строфу листает прокрутка: сама она не уходит.
      if (R.auto !== false && holdTimer >= holdFor(index)) { releaseFor = reduced ? R.reducedFade : R.release; begin('release'); }
    } else if (phase === 'release') {
      out.progress = 1.4;
      out.inkFade = 1 - easeInOut(t / releaseFor);
      if (t >= releaseFor) {
        const last = index === count - 1;
        const next = pending >= 0 ? pending : (index + 1) % count;
        pending = -1;
        darkFor = (last && next === 0) ? R.darkAfterLast : R.dark;
        index = next;
        out.changed = true;
        begin('dark');
      }
    }
    out.index = index;
    out.phase = phase;
    return out;
  }

  function go(target) {
    if (phase === 'dark') {
      index = target; out.changed = true; begin('emerge');
    } else if (phase === 'release') {
      pending = target;
    } else {
      pending = target;
      releaseFor = R.skipRelease;
      begin('release');
    }
  }
  function next() { go((phase === 'dark' ? index : index + 1) % count); }
  function prev() { go(((phase === 'dark' ? index - 1 : index - 1) + count) % count); }

  /* Сначала: читатель ушёл и вернулся — строфа снова проступает, а не
   * встречает его уже дописанной. */
  function reset(target) { index = target; pending = -1; darkFor = R.dark; out.changed = true; begin('dark'); }

  return { update: update, next: next, prev: prev, go: go, reset: reset, get index() { return index; }, get phase() { return phase; } };
}
