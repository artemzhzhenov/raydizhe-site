/* Вариант D · The Room — листки со стихами на остановке «Автор».
 *
 * Задача автора: не книга на столе, а листки в воздухе; проходит ветерок —
 * они меняются местами, передний уходит назад, следующий выходит к читателю;
 * содержимое при этом можно прочитать. Всё — в её стиле: кремовая бумага,
 * антиква, тонкая виньетка, пометки от руки на полях.
 *
 * Устройство:
 *   — четыре листка и четыре места (SLOTS). Место 0 — переднее, оно
 *     развёрнуто к читателю и держит текст читаемым; остальные три стоят
 *     глубже, мельче и темнее;
 *   — раз в HOLD секунд проходит порыв: каждый листок переезжает на
 *     соседнее место, передний по дуге уходит в самый конец очереди. Полный
 *     круг — около минуты, прочитать успевает и неторопливый читатель;
 *   — держат листок (мышь рядом или тап) — порыв не начинается, очередь
 *     стоит, передний листок чуть подаётся к читателю;
 *   — колыхание бумаги считается в вершинном шейдере. У переднего листка
 *     оно почти нулевое: текст не должен плыть под чтением. Дальние гуляют
 *     заметно, и сильнее всего — на самом порыве.
 *
 * Света в сцене нет (в срезе three нет ни ламп, ни физических материалов),
 * поэтому бумага светится сама: тень от волны берётся из наклона
 * поверхности в том же шейдере, а мягкий свет сверху-слева запечён в холст.
 */
import { POEM } from './poem.js';

const PAGE_W = 768, PAGE_H = 1080;
const ASPECT = PAGE_W / PAGE_H;
const PI = Math.PI;

/* Стопка-картотека. Листок 0 лежит ближе всех и виден целиком; каждый
 * следующий стоит выше на PEEK своих высот, поэтому наружу торчит его
 * верхняя кромка — а на кромке напечатано начало строфы. Читатель видит
 * не четыре одинаковых корешка, а четыре первых строки и сам выбирает,
 * какую тянуть.
 *
 * PEEK и раскладка страницы связаны: первая строка строфы должна попадать
 * в верхние PEEK текстуры, иначе на кромке будет пустая бумага. Меняешь
 * одно — проверь другое (см. typeset ниже).
 *
 * Лёгкий разворот и сдвиг вбок — чтобы стопка читалась веером бумаги, а не
 * машинной пачкой. */
const PEEK = 0.30;
const DEPTH = 0.038;
const N = 4;

function stackPose(i, peek, out) {
  out.x = (i - 1.5) * 0.034;
  out.y = (i - 1.5) * peek;
  out.z = -i * DEPTH;
  out.rx = 0;
  out.ry = (i - 1.5) * 0.016;
  out.rz = (i - 1.5) * 0.021;
  out.s = 1;
  return out;
}

/* Полная высота стопки в высотах листка — по ней считается размер под
 * окно: в кадр должен попасть весь веер, а не один листок. */
function spanOf(peek) { return 1 + (N - 1) * peek; }

const BREEZE_EVERY = 15.0;  // как часто ветер сам приоткрывает следующий
const BREEZE_LONG = 3.4;    // и сколько это длится

const SERIF = '"EB Garamond", Georgia, serif';
const HAND = '"Homemade Apple", cursive';
const INK = 'rgba(62, 50, 40, 0.93)';
const PENCIL = 'rgba(96, 80, 64, 0.42)';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Бумага: крафтовая, ручного отлива. Тон тёплый овсяный, в массе видно
 * волокно и мелкие вкрапления целлюлозы, край рваный — как у листа,
 * оторванного от большого полотна, а не обрезанного ножом.
 *
 * Рваный край делается прозрачностью самой текстуры: контур листа —
 * ломаная со случайными отступами, всё снаружи не рисуется вовсе. Поэтому
 * материал листка прозрачный, а глубина не пишется — иначе края соседних
 * листков резали бы друг друга.
 *
 * Размывать нечем: ctx.filter Safari не поддерживает, а рисовать двадцать
 * тысяч мазков с фильтром по отдельности Chrome не переживает (на этом уже
 * обожглись на переплёте книги). Всё мягкое здесь собрано из радиальных
 * градиентов и наложенных штрихов — они мягкие сами по себе. */
/* Гладкий одномерный шум: k случайных узлов, между ними — плавный переход.
 * Нужен краю: чистый random даёт пилу, а край рваной бумаги идёт длинными
 * неровными языками, и только внутри них — мелкая рвань. */
function wobble(r, k) {
  const v = [];
  for (let i = 0; i < k; i++) v.push(r());
  return function (t) {
    const x = t * (k - 1);
    const i = Math.min(k - 2, Math.floor(x));
    const f = x - i;
    const e = f * f * (3 - 2 * f);
    return v[i] + (v[i + 1] - v[i]) * e;
  };
}

function deckle(ctx, seed) {
  const r = mulberry32(seed);
  // Две волны на каждую сторону: длинные языки и мелкая рвань поверх.
  const big = [wobble(r, 7), wobble(r, 7), wobble(r, 9), wobble(r, 9)];
  const fine = [wobble(r, 22), wobble(r, 22), wobble(r, 28), wobble(r, 28)];

  const side = function (idx, from, to, n, fixed, horizontal, inward, first) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const v = from + (to - from) * t;
      const d = ((big[idx](t) - 0.5) * 11 + (fine[idx](t) - 0.5) * 3.4 + 5.5) * inward;
      const x = horizontal ? v : fixed + d;
      const y = horizontal ? fixed + d : v;
      if (first && i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  ctx.beginPath();
  side(0, 0, PAGE_W, 34, 0, true, 1, true);
  side(1, 0, PAGE_H, 46, PAGE_W, false, -1, false);
  side(2, PAGE_W, 0, 34, PAGE_H, true, -1, false);
  side(3, PAGE_H, 0, 46, 0, false, 1, false);
  ctx.closePath();
}

function paper(seed) {
  const c = canvas(PAGE_W, PAGE_H);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);

  // Контур листа: всё дальнейшее рисуется только внутри него.
  ctx.save();
  deckle(ctx, seed + 101);
  ctx.clip();

  ctx.fillStyle = '#e7d8bb';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Неровность отлива: широкие пятна плотнее и реже.
  for (let i = 0; i < 16; i++) {
    const x = r() * PAGE_W, y = r() * PAGE_H, rad = 110 + r() * 300;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() > 0.45;
    g.addColorStop(0, warm ? 'rgba(168,132,78,' + (0.03 + r() * 0.045) + ')'
                           : 'rgba(255,248,232,' + (0.03 + r() * 0.05) + ')');
    g.addColorStop(1, 'rgba(168,132,78,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }

  // Волокно: длинные тонкие нити по всей массе листа.
  for (let i = 0; i < 1500; i++) {
    const a = (r() - 0.5) * 1.2 + (r() > 0.5 ? 0 : PI / 2);
    const l = 12 + r() * 46;
    const x = r() * PAGE_W, y = r() * PAGE_H;
    ctx.strokeStyle = r() > 0.5 ? 'rgba(128,102,64,0.035)' : 'rgba(255,250,236,0.075)';
    ctx.lineWidth = 0.7 + r() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6,
                         y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 6,
                         x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // Вкрапления: крупинки непроваренной массы, примета крафта.
  for (let i = 0; i < 520; i++) {
    const x = r() * PAGE_W, y = r() * PAGE_H, rad = 0.6 + r() * 1.9;
    ctx.fillStyle = r() > 0.35 ? 'rgba(110,84,50,0.10)' : 'rgba(60,44,26,0.13)';
    ctx.beginPath();
    ctx.ellipse(x, y, rad * (1 + r()), rad, r() * PI, 0, PI * 2);
    ctx.fill();
  }

  // Свет сверху-слева — как на снимках автора.
  const lit = ctx.createLinearGradient(0, 0, PAGE_W * 0.9, PAGE_H);
  lit.addColorStop(0, 'rgba(255,248,232,0.26)');
  lit.addColorStop(0.45, 'rgba(255,248,232,0.04)');
  lit.addColorStop(1, 'rgba(112,80,44,0.15)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Кромка: у рваного края волокно приподнято и ловит свет, а сразу за ним
  // бумага темнее. Две обводки по тому же контуру.
  ctx.lineJoin = 'round';
  deckle(ctx, seed + 101);
  ctx.strokeStyle = 'rgba(255,250,238,0.30)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  deckle(ctx, seed + 101);
  ctx.strokeStyle = 'rgba(104,74,40,0.22)';
  ctx.lineWidth = 5.5;
  ctx.stroke();

  const edge = ctx.createRadialGradient(PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.36, PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.80);
  edge.addColorStop(0, 'rgba(112,80,44,0)');
  edge.addColorStop(1, 'rgba(112,80,44,0.20)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.restore();
  return c;
}

/* Сухоцветы: на снимках автора через страницу лежит тень веточки гипсофилы.
 * Рисуется мягким без всякого размытия — стебель в четыре прохода разной
 * толщины, соцветия радиальными градиентами. */
function sprig(ctx, x, y, angle, len, r) {
  const ink = function (a) { return 'rgba(112,90,62,' + a + ')'; };

  const stem = function (x0, y0, a, l, w, alpha) {
    const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
    const mx = x0 + Math.cos(a) * l * 0.5 - Math.sin(a) * l * 0.12;
    const my = y0 + Math.sin(a) * l * 0.5 + Math.cos(a) * l * 0.12;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = ink(alpha * (0.35 + k * 0.22));
      ctx.lineWidth = w * (3.4 - k);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
    }
    return [x1, y1];
  };

  const bloom = function (bx, by, rad, alpha) {
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
    g.addColorStop(0, ink(alpha));
    g.addColorStop(0.55, ink(alpha * 0.55));
    g.addColorStop(1, ink(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, PI * 2);
    ctx.fill();
  };

  const end = stem(x, y, angle, len, 1.25, 0.10);
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = 0.25 + (i / n) * 0.78;
    const bx = x + Math.cos(angle) * len * t;
    const by = y + Math.sin(angle) * len * t;
    const side = i % 2 ? 1 : -1;
    const a = angle + side * (0.5 + r() * 0.5);
    const l = len * (0.18 + r() * 0.26);
    const tip = stem(bx, by, a, l, 0.9, 0.085);
    const cl = 5 + Math.floor(r() * 5);
    for (let j = 0; j < cl; j++) {
      bloom(tip[0] + (r() - 0.5) * 26, tip[1] + (r() - 0.5) * 26, 4.5 + r() * 7, 0.075 + r() * 0.05);
    }
  }
  const cl = 6 + Math.floor(r() * 5);
  for (let j = 0; j < cl; j++) bloom(end[0] + (r() - 0.5) * 28, end[1] + (r() - 0.5) * 28, 5 + r() * 8, 0.08 + r() * 0.05);
}

/* Тени сухоцветов по углам. У каждого листка свой набор — иначе четыре
 * одинаковых веточки читаются штампом. */
function botanicals(ctx, seed) {
  const r = mulberry32(seed + 57);
  ctx.save();
  const sets = [
    [[PAGE_W + 40, -30, 2.45, 420], [-40, PAGE_H + 30, -0.75, 330]],
    [[-50, -20, 0.72, 400], [PAGE_W + 30, PAGE_H + 40, 3.85, 300]],
    [[PAGE_W + 30, PAGE_H * 0.15, 2.85, 380], [PAGE_W * 0.1, PAGE_H + 40, -1.25, 300]],
    [[-40, PAGE_H * 0.2, 0.45, 360], [PAGE_W + 40, PAGE_H + 20, 3.6, 340]]
  ];
  const set = sets[seed % sets.length];
  for (let i = 0; i < set.length; i++) sprig(ctx, set[i][0], set[i][1], set[i][2], set[i][3], r);
  ctx.restore();
}

/* ── Сухоцветы, лежащие НА бумаге ───────────────────────────────────────── */
/* Одних теней автору мало: на её снимках веточки гипсофилы и сухие
 * лепестки лежат сверху листа. Здесь они и нарисованы — сначала своя
 * короткая тень (смещена вправо-вниз, свет сверху-слева, как у всей
 * страницы), потом стебель, потом соцветия.
 *
 * Цветок гипсофилы мелкий: пять почти круглых лепестков вокруг тёплой
 * точки, три-четыре пикселя в поперечнике на этом холсте. Их много, и
 * держатся они кистями — поодиночке читались бы сором. */
function blossom(ctx, x, y, size, r) {
  // Часть кисти — нераскрывшиеся бутоны: сухая гипсофила наполовину из них,
  // и без них соцветие читается россыпью ромашек.
  const bud = r() < 0.34;
  // Тон гуляет от почти белого до чайного — цветы сухие, выгоревшие.
  const warm = 0.55 + r() * 0.45;
  const lite = function (a) {
    return 'rgba(' + Math.round(255 - 6 * (1 - warm)) + ',' +
           Math.round(252 - 18 * (1 - warm)) + ',' +
           Math.round(243 - 34 * (1 - warm)) + ',' + a + ')';
  };
  // Лёгкая посадка: цветок не парит, под ним чуть темнее.
  softShadow(ctx, x + 1.2, y + 1.6, size * 1.25, 0.07);

  if (bud) {
    const g = ctx.createRadialGradient(x - size * 0.2, y - size * 0.25, 0, x, y, size * 0.72);
    g.addColorStop(0, lite(0.95));
    g.addColorStop(1, 'rgba(200,180,146,0.80)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.52, size * 0.40, r() * PI, 0, PI * 2);
    ctx.fill();
    return;
  }

  const n = 4 + Math.floor(r() * 2);
  const a0 = r() * PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * (PI * 2 / n) + (r() - 0.5) * 0.3;
    const rad = size * (0.44 + r() * 0.16);
    const px = x + Math.cos(a) * size * 0.46;
    const py = y + Math.sin(a) * size * 0.46;
    const g = ctx.createRadialGradient(px - rad * 0.3, py - rad * 0.3, 0, px, py, rad);
    g.addColorStop(0, lite(0.96));
    g.addColorStop(0.7, lite(0.90));
    g.addColorStop(1, 'rgba(198,178,146,0.62)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rad, rad * 0.86, a, 0, PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(186,152,96,0.68)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.17, 0, PI * 2);
  ctx.fill();
}

function softShadow(ctx, x, y, rad, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, 'rgba(104,84,58,' + alpha + ')');
  g.addColorStop(0.6, 'rgba(104,84,58,' + (alpha * 0.5) + ')');
  g.addColorStop(1, 'rgba(104,84,58,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, PI * 2);
  ctx.fill();
}

/* Веточка гипсофилы: стебель, от него отходят тонкие ножки, на концах —
 * кисти цветков. Рисуется дважды: тенью со сдвигом и самой веточкой. */
function gypsum(ctx, x, y, angle, len, r, shadow) {
  const dx = shadow ? 7 : 0, dy = shadow ? 9 : 0;
  const tips = [];

  const twig = function (x0, y0, a, l, w) {
    const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
    const mx = x0 + Math.cos(a) * l * 0.5 - Math.sin(a) * l * 0.14;
    const my = y0 + Math.sin(a) * l * 0.5 + Math.cos(a) * l * 0.14;
    if (shadow) {
      ctx.strokeStyle = 'rgba(104,84,58,0.10)';
      ctx.lineWidth = w + 2.2;
    } else {
      ctx.strokeStyle = 'rgba(146,126,92,0.80)';
      ctx.lineWidth = w;
    }
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + dx, y0 + dy);
    ctx.quadraticCurveTo(mx + dx, my + dy, x1 + dx, y1 + dy);
    ctx.stroke();
    return [x1, y1];
  };

  const end = twig(x, y, angle, len, 1.5);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const t = 0.22 + (i / n) * 0.8;
    const bx = x + Math.cos(angle) * len * t;
    const by = y + Math.sin(angle) * len * t;
    const side = i % 2 ? 1 : -1;
    const a = angle + side * (0.45 + r() * 0.45);
    const l = len * (0.16 + r() * 0.22);
    const tip = twig(bx, by, a, l, 1.0);
    // Внутри кисти ещё две коротких ножки — так соцветие не шарик.
    for (let k = 0; k < 2; k++) {
      const tk = twig(tip[0], tip[1], a + (k ? 0.5 : -0.5), l * 0.38, 0.7);
      tips.push(tk);
    }
    tips.push(tip);
  }
  tips.push(end);

  for (let i = 0; i < tips.length; i++) {
    const cl = 2 + Math.floor(r() * 3);
    for (let j = 0; j < cl; j++) {
      const px = tips[i][0] + (r() - 0.5) * 11;
      const py = tips[i][1] + (r() - 0.5) * 11;
      const sz = 4.6 + r() * 3.2;
      if (shadow) softShadow(ctx, px + dx, py + dy, sz * 1.5, 0.11);
      else blossom(ctx, px, py, sz, r);
    }
  }
}

/* Сухой лепесток гортензии: у автора такие лежат по углам страницы. */
function petal(ctx, x, y, angle, size, r, shadow) {
  ctx.save();
  ctx.translate(x + (shadow ? 6 : 0), y + (shadow ? 8 : 0));
  ctx.rotate(angle);
  const path = function () {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.55, -size * 0.62, size * 1.05, -size * 0.34, size, 0);
    ctx.bezierCurveTo(size * 1.05, size * 0.34, size * 0.55, size * 0.62, 0, 0);
  };
  if (shadow) {
    ctx.fillStyle = 'rgba(104,84,58,0.17)';
    ctx.save();
    ctx.scale(1.08, 1.12);
    path();
    ctx.fill();
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, -size * 0.5, size, size * 0.5);
    g.addColorStop(0, 'rgba(250,240,228,0.98)');
    g.addColorStop(0.5, 'rgba(236,212,196,0.97)');
    g.addColorStop(1, 'rgba(198,164,136,0.95)');
    ctx.fillStyle = g;
    path();
    ctx.fill();
    ctx.strokeStyle = 'rgba(176,142,110,0.55)';
    ctx.lineWidth = 0.9;
    path();
    ctx.stroke();
    // Прожилки — три тонких луча от черешка.
    ctx.strokeStyle = 'rgba(178,150,118,0.55)';
    ctx.lineWidth = 0.7;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(size * 0.06, 0);
      ctx.quadraticCurveTo(size * 0.5, i * size * 0.2, size * 0.92, i * size * 0.12);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* Что лежит на каждом листке. Наборы разные: четыре одинаковых букета
 * читались бы штампом, а не сухоцветами. Всё — по краям и в углах: текст
 * закрывать нельзя, его ради этого и увеличивали. */
function flowers(ctx, index) {
  const r = mulberry32(index * 31 + 11);
  const sets = [
    { sprigs: [[PAGE_W - 96, 84, 2.75, 210]], petals: [[104, PAGE_H - 150, 0.7, 34]] },
    { sprigs: [[118, 96, 0.42, 190]], petals: [[PAGE_W - 150, PAGE_H - 120, 2.5, 30], [96, PAGE_H - 96, 1.1, 24]] },
    { sprigs: [[PAGE_W - 88, PAGE_H - 108, 3.55, 200]], petals: [[128, 120, -0.5, 30]] },
    { sprigs: [[96, PAGE_H - 96, -0.62, 205]], petals: [[PAGE_W - 140, 112, 2.2, 32]] }
  ];
  const set = sets[index % sets.length];
  // Сначала все тени, потом всё, что их отбрасывает: иначе тень одного
  // ляжет поверх лепестка другого.
  for (let pass = 0; pass < 2; pass++) {
    const shadow = pass === 0;
    const rr = mulberry32(index * 31 + 11);
    for (let i = 0; i < set.sprigs.length; i++) {
      const g = set.sprigs[i];
      gypsum(ctx, g[0], g[1], g[2], g[3], rr, shadow);
    }
    for (let i = 0; i < set.petals.length; i++) {
      const pt = set.petals[i];
      petal(ctx, pt[0], pt[1], pt[2], pt[3], rr, shadow);
    }
  }
  if (r() < 2) return;
}

/* Лист: капля с прожилкой. Из неё собраны и уголки рамки, и серединка
 * разделителя — один мотив на всю страницу держит её цельной. */
function leaf(ctx, x, y, angle, size, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(78,62,48,' + alpha + ')';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.40, -size * 0.44, size, 0);
  ctx.quadraticCurveTo(size * 0.40, size * 0.44, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,62,48,' + (alpha * 0.8) + ')';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0);
  ctx.lineTo(size * 0.86, 0);
  ctx.stroke();
  ctx.restore();
}

/* Разделитель автора: волосяная линия с разрывом, в разрыве — розетка из
 * листьев с точкой в середине, у нижнего к линии добавлены усики. */
function ornament(ctx, cx, y, half, closing) {
  ctx.save();
  ctx.strokeStyle = 'rgba(78,62,48,0.48)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx - 24, y);
  ctx.moveTo(cx + 24, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();

  // Розетка: пять листьев вверх и три вниз — у автора верх пышнее.
  for (let i = 0; i < 5; i++) {
    const a = -PI / 2 + (i - 2) * 0.42;
    leaf(ctx, cx, y, a, 11 - Math.abs(i - 2) * 1.8, 0.5);
  }
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i - 1) * 0.5;
    leaf(ctx, cx, y, a, 7 - Math.abs(i - 1) * 1.6, 0.4);
  }
  leaf(ctx, cx, y, 0, 8, 0.42);
  leaf(ctx, cx, y, PI, 8, 0.42);
  ctx.fillStyle = 'rgba(78,62,48,0.72)';
  ctx.beginPath();
  ctx.arc(cx, y, 1.7, 0, PI * 2);
  ctx.fill();

  if (closing) {
    ctx.strokeStyle = 'rgba(78,62,48,0.34)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 30, y); ctx.quadraticCurveTo(cx - 24, y - 4, cx - 17, y - 2);
    ctx.moveTo(cx + 30, y); ctx.quadraticCurveTo(cx + 24, y - 4, cx + 17, y - 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* Рамка по краю листа: волосяная линия с разрывами на углах, в разрывы
 * садятся веточки из тех же листьев. Тонкая намеренно — страница автора
 * держится воздухом, и обводка не должна спорить со стихами. */
function border(ctx) {
  const m = 44;
  const gap = 30;
  ctx.save();
  ctx.strokeStyle = 'rgba(78,62,48,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(m + gap, m);              ctx.lineTo(PAGE_W - m - gap, m);
  ctx.moveTo(PAGE_W - m, m + gap);     ctx.lineTo(PAGE_W - m, PAGE_H - m - gap);
  ctx.moveTo(PAGE_W - m - gap, PAGE_H - m); ctx.lineTo(m + gap, PAGE_H - m);
  ctx.moveTo(m, PAGE_H - m - gap);     ctx.lineTo(m, m + gap);
  ctx.stroke();

  // Уголки: три листа веером по диагонали наружу и точка.
  const corners = [
    [m, m, PI * 1.25], [PAGE_W - m, m, PI * 1.75],
    [PAGE_W - m, PAGE_H - m, PI * 0.25], [m, PAGE_H - m, PI * 0.75]
  ];
  for (let i = 0; i < corners.length; i++) {
    const cx = corners[i][0], cy = corners[i][1], a = corners[i][2];
    for (let k = -1; k <= 1; k++) leaf(ctx, cx, cy, a + k * 0.62, 13 - Math.abs(k) * 3, 0.26);
    ctx.fillStyle = 'rgba(78,62,48,0.34)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Кегль подбирается под самую длинную строку: у автора строки разной
 * длины, и загонять их в одну ширину нельзя — текст её. */
function fitSize(ctx, lines, maxW, start, style) {
  let size = start;
  while (size > 18) {
    ctx.font = style + ' ' + size + 'px ' + SERIF;
    let widest = 0;
    for (let i = 0; i < lines.length; i++) widest = Math.max(widest, ctx.measureText(lines[i]).width);
    if (widest <= maxW) break;
    size -= 1;
  }
  return size;
}

function handBlock(ctx, lines, x, y, size, align) {
  ctx.save();
  ctx.font = size + 'px ' + HAND;
  ctx.fillStyle = PENCIL;
  ctx.textAlign = align;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * size * 1.5);
  ctx.restore();
}

/* Раскладка листка. Все числа — в пикселях холста. */
function typeset(sheet, index, sign) {
  const seed = index * 7 + 3;
  const c = paper(seed);
  const ctx = c.getContext('2d');
  // Всё, что ложится поверх бумаги, обрезается по тому же рваному краю.
  ctx.save();
  deckle(ctx, seed + 101);
  ctx.clip();
  botanicals(ctx, index);
  border(ctx);
  const cx = PAGE_W / 2;
  const col = PAGE_W - 112;   // поля по 56

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  /* Титульный листок лежит первым и виден целиком — ему верх не нужен, и
   * заголовок стоит там, где стоял бы в книге. У остальных строфа поднята:
   * её первая строка обязана попасть в верхние PEEK листа, иначе из стопки
   * будет торчать пустая бумага. */
  let y;
  if (sheet.heading) {
    ctx.fillStyle = INK;
    const hs = fitSize(ctx, POEM.heading, col, 66, '');
    ctx.font = hs + 'px ' + SERIF;
    ctx.fillText(POEM.heading[0], cx, 292);
    ctx.fillText(POEM.heading[1], cx, 292 + hs * 1.14);
    ornament(ctx, cx, 452, 150, false);
    y = 566;
  } else {
    ornament(ctx, cx, 196, 150, false);
    y = 296;
  }

  if (sheet.noteTop) handBlock(ctx, sheet.noteTop, PAGE_W - 78, 84, 25, 'right');

  const size = fitSize(ctx, sheet.lines, col, 46, 'italic');
  ctx.font = 'italic ' + size + 'px ' + SERIF;
  ctx.fillStyle = INK;
  const step = 96;
  for (let i = 0; i < sheet.lines.length; i++) ctx.fillText(sheet.lines[i], cx, y + i * step);

  ornament(ctx, cx, y + (sheet.lines.length - 1) * step + 96, 110, true);

  if (sheet.noteFoot) handBlock(ctx, sheet.noteFoot, 88, PAGE_H - 250, 25, 'left');

  if (sheet.dedication) {
    ctx.font = '34px ' + SERIF;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(sheet.dedication, cx, PAGE_H - 200);
  }
  /* Подпись — не шрифт, а сама подпись автора: снята с её страницы и
   * положена сюда как есть, вместе с сердечком. Имитировать её почерк
   * гарнитурой значит подделывать подпись, а не ставить её. */
  if (sheet.sign && sign) {
    const sw = 250;
    const sh = sw * sign.naturalHeight / sign.naturalWidth;
    ctx.drawImage(sign, cx - sw / 2, PAGE_H - 78 - sh, sw, sh);
  }
  // Цветы — последними: они лежат НА листе, а не напечатаны под текстом.
  flowers(ctx, index);
  ctx.restore();
  return c;
}

/* ── Шейдеры ────────────────────────────────────────────────────────────── */
/* Колыхание: две волны поперёк листа, сильнее к свободному краю. vShade —
 * наклон поверхности: он и работает светом, ламп в сцене нет. */
const VERT = `
  uniform float uTime;
  uniform float uAmp;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    float x = uv.x - 0.5;
    float y = uv.y - 0.5;
    float edge = 0.22 + 0.78 * abs(x) * 2.0;
    float p1 = y * 5.2 + uTime * 1.15 + uPhase;
    float p2 = x * 4.4 - uTime * 0.87 + uPhase * 1.7;
    vec3 pos = position;
    pos.z += (sin(p1) * 0.55 + sin(p2) * 0.45) * uAmp * edge;
    float slope = cos(p2) * 4.4 * 0.45 * uAmp * edge;
    vShade = clamp(1.0 + slope * 0.85, 0.66, 1.38);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = `
  uniform sampler2D uMap;
  uniform float uDim;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb * vShade * (1.0 - uDim), t.a * uOpacity);
  }
`;

function ease(u) { return u * u * (3.0 - 2.0 * u); }

export function createSheets(THREE, opts) {
  const height = opts.height;
  const width = height * ASPECT;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const geometry = new THREE.PlaneGeometry(width, height, 16, 22);
  const hitGeometry = new THREE.PlaneGeometry(width, height);
  const sheets = [];
  let ready = false;
  let waiting = [];

  for (let i = 0; i < POEM.sheets.length; i++) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: null },
        uTime: { value: 0 },
        uAmp: { value: 0 },
        uPhase: { value: i * 1.9 },
        uDim: { value: 0 },
        uOpacity: { value: 1 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.id = 'poem-' + POEM.sheets[i].id;
    inner.add(mesh);

    /* У каждого листка свой невидимый прямоугольник для луча: читатель
     * целится в конкретную кромку, а не в стопку вообще. Луч возвращает
     * попадания по возрастанию расстояния, и ближний листок сам закрывает
     * собой те, что лежат за ним, — поэтому отдельная маска на кромку не
     * нужна.
     *
     * Прямоугольники живут в group, а не в inner: pick() в scene.js
     * смотрит только на прямых детей. Значит их положение надо переносить
     * из листка руками, с учётом масштаба inner — это делает apply(). */
    const hit = new THREE.Mesh(hitGeometry, new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false, depthWrite: false
    }));
    hit.userData.id = 'poem-' + POEM.sheets[i].id;
    hit.userData.index = i;
    group.add(hit);

    sheets.push({ mesh: mesh, hit: hit, open: 0 });
  }

  /* Холсты рисуются, когда загружены почерк и подпись автора. */
  const hand = new FontFace('Homemade Apple', 'url(../assets/fonts/homemade-apple-400.woff2)');
  const sign = new Image();
  const signLoaded = new Promise(function (done) {
    sign.onload = function () { done(sign); };
    sign.onerror = function () { done(null); };
    sign.src = '../shared/img/signature.png';
  });
  Promise.all([
    hand.load().then(function (f) { document.fonts.add(f); }).catch(function () {}),
    document.fonts.load('italic 46px "EB Garamond"').catch(function () {}),
    document.fonts.load('46px "EB Garamond"').catch(function () {}),
    signLoaded
  ]).then(function (done) {
    const signImg = done[3];
    for (let i = 0; i < sheets.length; i++) {
      const tex = new THREE.Texture(typeset(POEM.sheets[i], i, signImg));
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = opts.anisotropy || 1;
      tex.needsUpdate = true;
      sheets[i].mesh.material.uniforms.uMap.value = tex;
    }
    ready = true;
    for (let i = 0; i < waiting.length; i++) waiting[i]();
    waiting = [];
  });

  // Куда уводить вынутый листок, чтобы он встал в середину кадра, и
  // насколько подавать вперёд. Ставит scene.js — только она знает камеру.
  let aimX = 0, aimY = 0;
  let holdFwd = 0.40, holdGrow = 0.07;
  let peek = PEEK;

  // Сквозняк: где сейчас указатель в осях стопки и насколько быстро он
  // идёт. Бумага отзывается на движение руки над ней, а не на таймер.
  let dx = 0, dy = 0, draft = 0, hasPointer = false;
  let lastX = 0, lastY = 0;

  let life = 0;
  let clock = 0;
  let breezeAt = -1;     // какой листок сейчас приоткрывает ветер
  let breezeT = 0;
  let lastBreeze = 0;    // ветер идёт по кругу, начиная с первой кромки
  let openIndex = -1;    // какой листок сейчас держит читатель

  const pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
  const rest = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };

  function apply(dt) {
    const k = inner.scale.x;
    for (let i = 0; i < sheets.length; i++) {
      const sh = sheets[i];
      stackPose(i, peek, rest);

      /* Сквозняк. Чем ближе указатель к листку, тем сильнее его отводит —
       * как от ладони, проведённой над бумагой. Считается от места листка
       * в стопке, а не от его текущего положения: иначе отклонённый листок
       * убегал бы от указателя сам от себя. */
      if (draft > 0.001) {
        const ax = dx - rest.x, ay = dy - rest.y;
        const near = Math.exp(-(ax * ax + ay * ay) / 0.30);
        const w = near * draft;
        rest.z += w * 0.14;
        rest.rz += -ax * w * 0.26;
        rest.rx += ay * w * 0.22;
        rest.y += w * 0.02;
      }

      // Ветер сам приоткрывает листок: та же дорога, что у вынутого, но
      // пройденная на треть и обратно.
      const puff = (breezeAt === i && breezeT > 0) ? Math.sin(breezeT * PI) * 0.34 : 0;
      const out = Math.max(sh.open, puff);

      pose.x = rest.x + (aimX - rest.x) * out;
      pose.y = rest.y + (aimY - rest.y) * out;
      pose.z = rest.z + (holdFwd - rest.z) * out;
      pose.rx = rest.rx * (1 - out);
      pose.ry = rest.ry * (1 - out);
      pose.rz = rest.rz * (1 - out);
      pose.s = 1 + holdGrow * out;

      const m = sh.mesh;
      m.position.set(pose.x * height, pose.y * height, pose.z * height);
      m.rotation.set(pose.rx, pose.ry, pose.rz);
      m.scale.setScalar(pose.s);

      /* Кто выше в стопке, тот рисуется раньше: ближний листок должен
       * лечь поверх дальних. Вынутый — поверх всех. */
      m.renderOrder = Math.round(40 + (N - i) * 10 + out * 160);

      // Дальние в покое чуть глуше — так видно глубину стопки. Вынутый
      // гасит соседей, чтобы не мешали читать.
      const depth = i * 0.055;
      let dim = depth * (1 - out);
      let op = 1;
      if (openIndex >= 0 && i !== openIndex) {
        const q = sheets[openIndex].open;
        dim = depth + q * 0.12;
        op = 1 - q * 0.78;
      }
      m.material.uniforms.uDim.value = dim;
      m.material.uniforms.uOpacity.value = op;

      // Прямоугольник для луча повторяет листок, но живёт в group.
      const h = sh.hit;
      h.position.copy(m.position).multiplyScalar(k);
      h.rotation.copy(m.rotation);
      h.scale.setScalar(pose.s * k);
    }
  }

  function indexOf(mesh) {
    for (let i = 0; i < sheets.length; i++) if (sheets[i].hit === mesh) return i;
    return -1;
  }

  apply(0);

  return {
    group: group,
    halfWidth: width / 2,
    height: height,
    aspect: ASPECT,
    get span() { return spanOf(peek); },
    get ready() { return ready; },
    whenReady: function (cb) { if (ready) cb(); else waiting.push(cb); },
    setScale: function (k) { inner.scale.setScalar(k); },
    setAim: function (x, y) { aimX = x; aimY = y; },
    setHold: function (forward, grow) { holdFwd = forward; holdGrow = grow; },
    setPeek: function (v) { peek = v; },
    /* Указатель в осях стопки, в высотах листка. scene.js зовёт это каждый
     * кадр; live=false — указателя на странице нет. */
    setPointer: function (x, y, live) {
      if (live && hasPointer) {
        const vx = x - lastX, vy = y - lastY;
        const speed = Math.sqrt(vx * vx + vy * vy);
        // Резкое движение поднимает сквозняк, покой его гасит.
        draft = Math.min(1, Math.max(draft, speed * 9));
      }
      dx = x; dy = y; lastX = x; lastY = y; hasPointer = live;
      if (!live) draft = Math.min(draft, 0.35);
    },
    /* Читатель снова доехал до «Автора» — стопка с начала. */
    reset: function () {
      life = 0; clock = 0; breezeAt = -1; breezeT = 0; openIndex = -1; draft = 0;
      for (let i = 0; i < sheets.length; i++) sheets[i].open = 0;
      apply(0);
    },
    indexOf: indexOf,
    update: function (dt, focusMesh) {
      life += dt;
      openIndex = focusMesh ? indexOf(focusMesh) : -1;

      for (let i = 0; i < sheets.length; i++) {
        const want = (i === openIndex) ? 1 : 0;
        const sh = sheets[i];
        sh.open += (want - sh.open) * (1 - Math.exp(-dt * 5.2));
        if (Math.abs(want - sh.open) < 0.002) sh.open = want;
      }

      // Сквозняк затухает сам: рука прошла — бумага улеглась.
      draft *= Math.exp(-dt * 1.5);
      if (draft < 0.002) draft = 0;

      /* Ветер. Пока читатель держит листок, ветра нет — он читает. Пока
       * никто ничего не трогает, раз в BREEZE_EVERY секунд ветер сам
       * приоткрывает следующий листок и кладёт обратно: иначе стопка стоит
       * мёртвой, и на телефоне никто не догадается её тронуть. */
      if (breezeAt >= 0) {
        breezeT += dt / BREEZE_LONG;
        if (breezeT >= 1) { breezeT = 0; breezeAt = -1; clock = 0; }
      } else if (openIndex < 0) {
        clock += dt;
        if (clock >= BREEZE_EVERY) {
          lastBreeze = (lastBreeze + 1) % N;
          breezeAt = lastBreeze;
          breezeT = 0.0001;
        }
      } else {
        clock = 0;
      }

      apply(dt);

      // Колыхание: у вынутого почти нулевое — под чтением текст не должен
      // плыть; у остальных тем сильнее, чем сильнее сквозняк.
      for (let i = 0; i < sheets.length; i++) {
        const sh = sheets[i];
        const u = sh.mesh.material.uniforms;
        u.uTime.value = life;
        const calm = 0.011 + draft * 0.022;
        u.uAmp.value = calm * (1 - sh.open * 0.85);
      }
    }
  };
}
