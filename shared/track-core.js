/* События вовлечённости — логика без DOM (проверяется node --test).
 * Навешивание на страницу — shared/track.js. Что значит каждое событие —
 * ops/README.md, раздел «Вовлечённость». */

export const REACH = { episodes: 'reach-episodes', follow: 'reach-end' };

const LINKS = { facebook: 'go-facebook', instagram: 'go-instagram', wattpad: 'go-wattpad', email: 'write-diana' };

export function linkEvent(kind) {
  return Object.prototype.hasOwnProperty.call(LINKS, kind) ? LINKS[kind] : null;
}

/* Отправитель: одно событие — один раз за загрузку страницы. Счётчик Umami
 * подключается позже скриптов (page.js добавляет его только на боевом
 * домене), поэтому ранние события ждут его до `wait` мс, потом забываются:
 * на превью и локально счётчика нет вовсе — и событий нет. */
export class Sender {
  constructor(getUmami, opts) {
    const o = opts || {};
    this.getUmami = getUmami;
    this.wait = o.wait == null ? 15000 : o.wait;
    this.clock = o.clock || Date.now;
    this.sent = new Set();
    this.pending = [];
    this.since = null;
  }

  track(name) {
    if (this.sent.has(name)) return false;
    this.sent.add(name);
    this.pending.push(name);
    if (this.since == null) this.since = this.clock();
    this.flush();
    return true;
  }

  flush() {
    let u = null;
    try { u = this.getUmami(); } catch (e) { u = null; }
    if (!u || typeof u.track !== 'function') {
      if (this.since != null && this.clock() - this.since > this.wait) { this.pending = []; this.since = null; }
      return 0;
    }
    let n = 0;
    while (this.pending.length) {
      const name = this.pending.shift();
      try { u.track(name); n++; } catch (e) { /* статистика не должна ломать страницу */ }
    }
    this.since = null;
    return n;
  }
}
