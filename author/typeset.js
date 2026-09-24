/* Набор фрагмента в текстуру.
 *
 * Три канала в одном непрозрачном холсте:
 *   R — сами буквы, G — их свет на ткани (широкий мягкий ореол),
 *   B — порядок проступания: свет идёт по строкам, как читают.
 * Холст непрозрачный намеренно: иначе браузер домножит цвет на альфу и
 * канал B доедет до шейдера искажённым (на этом уже обжигались).
 *
 * Гарнитуры — те же, что на странице (shared/base.css): заголовок
 * Instrument Serif, строки EB Garamond italic. Шрифты дожидаемся до
 * первого штриха, иначе холст нарисует Georgia.
 *
 * Размытие без ctx.filter: Safari его не знает, Chrome с ним сбрасывает
 * холст с ускорения. Уменьшаем и возвращаем — это и есть размытие.
 */
const DISPLAY = '"Instrument Serif", Georgia, serif';
const PROSE = '"EB Garamond", Georgia, serif';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function fitSize(ctx, lines, maxW, start, style, family) {
  let size = start;
  while (size > 16) {
    ctx.font = style + ' ' + size + 'px ' + family;
    let widest = 0;
    for (let i = 0; i < lines.length; i++) widest = Math.max(widest, ctx.measureText(lines[i]).width);
    if (widest <= maxW) break;
    size -= 1;
  }
  return size;
}

function blurInto(src, dst, factor) {
  const small = canvas(Math.max(2, src.width / factor | 0), Math.max(2, src.height / factor | 0));
  const sctx = small.getContext('2d');
  sctx.drawImage(src, 0, 0, small.width, small.height);
  const dctx = dst.getContext('2d');
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(small, 0, 0, dst.width, dst.height);
}

async function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const im = new Image();
    im.onload = function () { resolve(im); };
    im.onerror = reject;
    im.src = src;
  });
}

export async function ready() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px ' + DISPLAY),
      document.fonts.load('italic 400 40px ' + PROSE),
      document.fonts.load('400 40px ' + PROSE)
    ]);
  } catch (e) { /* набираем тем, что есть */ }
}

/* Один фрагмент → текстура. TW/TH задаёт вызывающий: на телефоне холст
 * меньше, память видеокарты там дороже. */
export async function typeset(fragment, TW, TH) {
  const ink = canvas(TW, TH);
  const ctx = ink.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const cx = TW / 2;
  const col = Math.round(TW * 0.78);
  const ls = fitSize(ctx, fragment.lines, col, Math.round(TW / 26), 'italic', PROSE);
  const step = Math.round(ls * 1.95);
  const hs = fragment.heading ? fitSize(ctx, fragment.heading, col * 0.70, Math.round(ls * 1.55), '', DISPLAY) : 0;
  const ds = fragment.dedication ? Math.round(ls * 0.92) : 0;

  let sig = null;
  if (fragment.signature) {
    try { sig = await loadImage(fragment.signature); } catch (e) { sig = null; }
  }
  const sigH = sig ? Math.round(ls * 2.4) : 0;
  const sigW = sig ? Math.round(sigH * sig.width / sig.height) : 0;

  // Высота блока целиком, чтобы поставить его по центру холста.
  let blockH = step * (fragment.lines.length - 1) + ls * 1.16;
  if (hs) blockH += hs * 1.12 + Math.round(hs * 0.95);
  if (ds) blockH += Math.round(ls * 1.7) + ds;
  if (sig) blockH += Math.round(ls * 0.6) + sigH;

  let y = Math.round((TH - blockH) / 2);
  const bands = [];
  const band = function (text, size, style, family, baseline, extra) {
    ctx.font = style + ' ' + size + 'px ' + family;
    const w = ctx.measureText(text).width;
    ctx.fillText(text, cx, baseline);
    // Границы слов — для неровного проступания.
    const words = [];
    const parts = text.split(' ');
    let x = cx - w / 2;
    for (let k = 0; k < parts.length; k++) {
      const pw = ctx.measureText(parts[k]).width;
      words.push({ x0: x, x1: x + pw });
      x += pw + ctx.measureText(' ').width;
    }
    bands.push({
      x0: cx - w / 2, x1: cx + w / 2,
      y0: baseline - size * 0.90, y1: baseline + size * 0.32,
      base: baseline, weight: w + size * (extra || 4), words: words
    });
  };

  if (hs) {
    y += Math.round(hs * 0.82);
    band(fragment.heading[0], hs, '', DISPLAY, y, 3);
    y += Math.round(hs * 1.12);
    band(fragment.heading[1], hs, '', DISPLAY, y, 7);
    y += Math.round(hs * 0.95);
  }
  y += Math.round(ls * 0.86);
  for (let i = 0; i < fragment.lines.length; i++) {
    band(fragment.lines[i], ls, 'italic', PROSE, y + i * step, 5);
  }
  y += step * (fragment.lines.length - 1);

  if (ds) {
    y += Math.round(ls * 1.7) + ds;
    band(fragment.dedication, ds, 'italic', PROSE, y, 8);
  }
  if (sig) {
    /* Подпись автора: у картинки один цвет и альфа — переносим альфу в
     * чернила. Чуть правее середины, как ставят подпись рукой. */
    y += Math.round(ls * 0.6);
    const sx = Math.round(cx - sigW / 2 + col * 0.10);
    const tmp = canvas(sigW, sigH);
    const tctx = tmp.getContext('2d');
    tctx.drawImage(sig, 0, 0, sigW, sigH);
    const td = tctx.getImageData(0, 0, sigW, sigH);
    const a = td.data;
    for (let p = 0; p < a.length; p += 4) { const v = a[p + 3]; a[p] = v; a[p + 1] = v; a[p + 2] = v; a[p + 3] = 255; }
    tctx.putImageData(td, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tmp, sx, y);
    ctx.restore();
    bands.push({ x0: sx, x1: sx + sigW, y0: y, y1: y + sigH, base: y + sigH * 0.7, weight: sigW + ls * 6 });
    y += sigH;
  }

  /* Свет букв на ткани: широкий и узкий ореолы вместе. */
  const wide = canvas(TW, TH);
  blurInto(ink, wide, 20);
  const mid = canvas(TW, TH);
  blurInto(ink, mid, 7);

  /* Порядок проступания: по строке слева направо, строки по очереди.
   * До единицы не доводим: пиксел с порядком ровно 1.0 не проступит
   * никогда (хвост последней строки оставался недописанным). */
  const order = canvas(TW, TH);
  const octx = order.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, TW, TH);
  let total = 0;
  for (let i = 0; i < bands.length; i++) total += bands[i].weight;
  let acc = 0;
  const TOP = 0.94;
  const PAD = Math.round(TW / 40);
  /* Проступание неровное: слова одной строки встают чуть вразнобой — не
   * загрузка, а свет, который находит слова. Каждому слову свой отрезок
   * порядка со случайным сдвигом; между словами чернил нет. */
  let seed = 7;
  const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    b.from = acc / total * TOP;
    acc += b.weight;
    b.to = acc / total * TOP;
    const span = b.to - b.from;
    octx.fillStyle = 'rgb(' + Math.round(b.to * 255) + ',' + Math.round(b.to * 255) + ',' + Math.round(b.to * 255) + ')';
    octx.fillRect(b.x0 - PAD, b.y0 - PAD, b.x1 - b.x0 + PAD * 2, b.y1 - b.y0 + PAD * 2);
    const words = b.words || [{ x0: b.x0, x1: b.x1 }];
    const lineW = Math.max(1, b.x1 - b.x0);
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      const j = (rnd() - 0.5) * span * 0.16;
      const f0 = Math.max(b.from, Math.min(b.to, b.from + span * ((w.x0 - b.x0) / lineW) + j));
      const f1 = Math.max(f0, Math.min(b.to, b.from + span * ((w.x1 - b.x0) / lineW) + j));
      const g = octx.createLinearGradient(w.x0, 0, w.x1, 0);
      const v0 = Math.round(f0 * 255), v1 = Math.round(f1 * 255);
      g.addColorStop(0, 'rgb(' + v0 + ',' + v0 + ',' + v0 + ')');
      g.addColorStop(1, 'rgb(' + v1 + ',' + v1 + ',' + v1 + ')');
      octx.fillStyle = g;
      const gap = k ? (w.x0 - words[k - 1].x1) / 2 : PAD;
      const gapR = k < words.length - 1 ? (words[k + 1].x0 - w.x1) / 2 : PAD;
      octx.fillRect(w.x0 - gap, b.y0 - PAD, w.x1 - w.x0 + gap + gapR, b.y1 - b.y0 + PAD * 2);
    }
  }

  const out = canvas(TW, TH);
  const out2 = out.getContext('2d');
  const iD = ctx.getImageData(0, 0, TW, TH).data;
  const wD = wide.getContext('2d').getImageData(0, 0, TW, TH).data;
  const mD = mid.getContext('2d').getImageData(0, 0, TW, TH).data;
  const oD = octx.getImageData(0, 0, TW, TH).data;
  const img = out2.createImageData(TW, TH);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    d[p] = iD[p];
    d[p + 1] = Math.min(255, (wD[p] * 0.62 + mD[p] * 0.55) | 0);
    d[p + 2] = oD[p];
    d[p + 3] = 255;
  }
  out2.putImageData(img, 0, 0);

  let x0 = TW, x1 = 0, y0 = TH, y1 = 0;
  for (let i = 0; i < bands.length; i++) {
    x0 = Math.min(x0, bands[i].x0); x1 = Math.max(x1, bands[i].x1);
    y0 = Math.min(y0, bands[i].y0); y1 = Math.max(y1, bands[i].y1);
  }
  return { canvas: out, bands: bands, blockW: x1 - x0, blockH: y1 - y0, cx: (x0 + x1) / 2 / TW, cy: (y0 + y1) / 2 / TH };
}
