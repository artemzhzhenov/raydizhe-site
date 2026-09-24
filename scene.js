/* Вариант D · The Room — сцена.
 *
 * Кадры романа висят в тёплой темноте на разной глубине; скролл ведёт
 * сквозь них камеру. Раскадровка — в beats.js, здесь только механика.
 *
 * Главный приём: текстурами служат те самые <img>, что лежат в разметке
 * для фолбэка. Картинка скачивается один раз, страница без WebGL читается
 * целиком сама по себе, а alt остаётся доступен экранному диктору.
 */

import * as THREE from '../assets/vendor/three.slim.js';
import { FRAMES, GLOW, BEATS, RING, REELS, SHEETS, PACE } from './beats.js';
import { createSheets } from './sheets.js';
import { link } from './author-link.js';

const canvas = document.getElementById('room');

/* Камерой управляет JS, поэтому общее правило «animation: none» из
 * base.css её не касается — запрос читаем сами. Объявлено в начале файла:
 * блок указателя читает его при загрузке модуля. */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* Каст — единственное место, где кадр сцены и вёрстка спорят за одно и то
 * же фото. Ниже 900px `.cast` в shared/base.css становится свайп-каруселью
 * (карточка «фото + имя», общая для всех четырёх вариантов); в A/B/C фото
 * лежит внутри карточки и едет вместе с ней. В D фото вынуто в сцену — на
 * узком экране оно осталось бы неподвижным в пространстве, а мимо него
 * ехали бы только текстовые карточки: имя не под тем лицом, портрет виден
 * дважды. На узком экране эти три меша не показываем вовсе — работает
 * карусель из base.css, как в остальных вариантах. Используется и в cull()
 * (гасить каст-мешы), и при создании кадра (пометить, какие именно). */
const CAST_IDS = new Set(['tessa', 'sam', 'ethan']);

/* ── Материал кадра ─────────────────────────────────────────────────────── */
/* Своя пара шейдеров, а не готовый материал, ради двух вещей: мягких краёв
 * и тумана, который гасит альфу, а не подмешивает цвет.
 *
 * Почему альфу: фон страницы и цвет тумана — один и тот же --night. Если
 * подмешивать цвет и при этом рисовать полупрозрачно, дальний кадр темнеет
 * дважды и проваливается в черноту раньше времени. */
const VERT = `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec2 uFeather;
  uniform float uFog;
  // Растворение на подлёте: x — глубина, на которой кадр ещё цел, y — на
  // которой он уже погас (y < x). Нули — растворения нет.
  uniform vec2 uNear;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    // Растушёвка по каждой оси отдельно и с разными порогами.
    //
    // UV нормированы на свою сторону, а стороны у кадра 9:16 отличаются в
    // 1.78 раза: один порог на обе оси даёт по горизонтали полосу во столько
    // же раз уже, и боковые края читаются жёстким швом, тогда как верх и низ
    // растворяются. Порог по X пересчитывается из пропорций кадра при
    // создании материала.
    vec2 d = abs(vUv - 0.5) * 2.0;
    float ax = 1.0 - smoothstep(uFeather.x, 1.0, d.x);
    float ay = 1.0 - smoothstep(uFeather.y, 1.0, d.y);
    float fog = 1.0 - exp(-uFog * uFog * vDepth * vDepth);
    float near = uNear.x > 0.0 ? smoothstep(uNear.y, uNear.x, vDepth) : 1.0;
    float a = ax * ay * uOpacity * near * (1.0 - fog);
    if (a < 0.004) discard;
    gl_FragColor = vec4(tex.rgb, a);
  }
`;

const GLOW_FRAG = `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, r));
    gl_FragColor = vec4(uColor, a * a * uStrength);
  }
`;

/* Плотность тумана принадлежит остановке, а не сцене целиком.
 *
 * Причина — два кадра раскадровки требуют противоположного. На «Читателях»
 * камера отъезжает на 54 единицы и должна увидеть разом все десять кадров;
 * на «Финале» кадры за спиной должны быть едва различимы. Одна плотность на
 * всю сцену обслуживает либо то, либо другое: при 0.045 с «Читателей» видны
 * только ближние пять, при 0.020 на «Финале» кадры читаются отчётливо.
 *
 * Один и тот же объект uniform передаётся всем материалам кадров, поэтому
 * значение меняется в одном месте и применяется сразу ко всем. */
const uFog = { value: BEATS[0].fog };

/* ── Рендерер и сцена ───────────────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
/* Цвет не перекодируем: текстуры отдаются как есть, вывод — тоже.
 * Так кадр в сцене совпадает по тону с тем же кадром в фолбэке и с
 * фоном --night вокруг. Физического света в сцене нет, конвертировать
 * нечего. */
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
camera.position.set(BEATS[0].cam[0], BEATS[0].cam[1], BEATS[0].cam[2]);

/* Точка взгляда остановки с учётом бокового сдвига aside.
 *
 * В beats.js look — центр кадра, aside — на сколько единиц кадр должен стоять
 * правее центра экрана; отрицательный aside ставит кадр левее центра. Сдвиг откладывается влево от look вдоль
 * горизонтальной «правой» оси камеры на этой остановке, поэтому не зависит
 * от того, куда камера повёрнута: на титуле она смотрит вглубь по −Z, на
 * финале — обратно по +Z, формула одна.
 *
 * Узкий экран (< 900px по ширине окна) — другая композиция вовсе: сдвига нет,
 * кадр стоит по центру за текстом (см. room.css), функция возвращает
 * несдвинутую точку взгляда.
 *
 * На ширине ≥ 900px сдвиг зажимается так, чтобы кадр ВЕСЬ остался на экране,
 * с полем EDGE от края. Считается в углах, а не в единицах: экранная
 * координата — это tan(угла)/tan(полуугла), и у сдвинутого вбок кадра
 * дальний край уходит нелинейно. Отсюда формула
 *
 *     сдвиг ≤ dist · tan( полуугол·(1−EDGE) − atan(полуширина кадра / dist) ),
 *
 * то есть «сколько осталось от половины экрана, когда из неё вычли сам кадр».
 * Прежний зажим считал долю (0.82) от половины угла и про ширину кадра не
 * знал: на титуле кадр вылезал за правый край на 4 % при 1440×900 и на 10 %
 * при 1197×833 — автор это и увидел. Теперь окно любой ширины даёт целый
 * кадр, а на узких окнах сдвиг просто становится меньше.
 *
 * aspect — свойство окна, не устройства: поворот телефона меняет его на лету.
 * Функция чистая и зовётся из resize() на каждый поворот, поэтому поворот в
 * альбом возвращает полный сдвиг, а не оставляет суженный навсегда. */
/* Поле от края экрана до кадра — доля половины горизонтального угла. */
const EDGE = 0.04;
const upVec = new THREE.Vector3(0, 1, 0);
const fwdVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();

/* Полуширина того, что держим в экране на этой остановке, в единицах сцены.
 *
 * Остановка со сдвигом смотрит в центр своего кадра, поэтому кадр ищется по
 * точке взгляда: совпадают x и z (y у титула отличается на 0.05 — камера
 * там чуть выше центра кадра). Пропорция 9:16 — это пропорция исходников
 * (720×1280); единственный кадр с другой, sam 850×1280, ни на одной
 * остановке со сдвигом не стоит. Берётся из данных, а не из меша: lookOf()
 * зовётся при загрузке модуля, когда фотографии ещё не скачались.
 *
 * Финал смотрит не на кадр, а на колесо роликов — там вернётся 0, и сдвиг
 * останется каким задан: на расстоянии 10 единиц половины экрана хватает с
 * запасом на любом окне. */
const FRAME_RATIO = 9 / 16;

function halfWidthAt(beat) {
  // На «Авторе» в кадре не один объект, а веер листков: зажим должен
  // считать его целиком, иначе крайний листок уедет за край окна.
  // Разлёт мест по горизонтали плюс полширины листка — около одной высоты.
  if (beat.id === SHEETS.beat) return sheetsSpan * (sheets.aspect / 2 + 0.30);
  for (let i = 0; i < FRAMES.length; i++) {
    const f = FRAMES[i];
    if (Math.abs(f.pos[0] - beat.look[0]) < 0.05 && Math.abs(f.pos[2] - beat.look[2]) < 0.05) {
      return f.height * FRAME_RATIO / 2;
    }
  }
  return 0;
}

function lookOf(beat, out) {
  out.set(beat.look[0], beat.look[1], beat.look[2]);
  const aside = beat.aside || 0;
  if (!aside) return out;
  // Горизонтальная проекция направления взгляда: сдвиг вбок не должен
  // задирать или ронять точку взгляда, если камера смотрит под наклоном.
  fwdVec.set(beat.look[0] - beat.cam[0], 0, beat.look[2] - beat.cam[2]);
  const dist = fwdVec.length();
  if (dist < 1e-6) return out;
  fwdVec.divideScalar(dist);
  // Узкий экран — другая композиция: кадр по центру ЗА текстом (спека,
  // «Текст поверх полноэкранных кадров»); тот же порог 900px, что включает
  // тени под текст в room.css. Сдвиг вбок тут только уводил бы кадр вправо:
  // по ширине он и так шире экрана. Порог по ширине окна, а не по aspect:
  // окно 1200×900 по CSS широкое (без теней), а по aspect — уже опорного.
  //
  // lift — единственное исключение: не вбок, а ВВЕРХ. Точка взгляда
  // опускается на столько единиц, значит объект остановки поднимается на
  // экране. Нужно «Автору»: книга там не кадр за текстом, а предмет, и она
  // должна встать в пустоту НАД текстом, а не на него.
  if (window.innerWidth < 900) {
    if (beat.lift) out.y -= beat.lift;
    return out;
  }
  // THREE.MathUtils нет в слим-сборке (assets/vendor/three.slim.js) —
  // перевод градусов в радианы руками.
  const halfV = (camera.fov / 2) * (Math.PI / 180);
  const halfH = Math.atan(Math.tan(halfV) * (window.innerWidth / window.innerHeight));
  const edge = halfH * (1 - EDGE) - Math.atan(halfWidthAt(beat) / dist);
  const room = edge > 0 ? Math.tan(edge) * dist : 0;
  // Знак aside — сторона: плюс справа от центра, минус слева. Зажим один и
  // тот же, считается по модулю. Значение заведомо больше зажима (например
  // −2.2 у «Первых строк») — это способ сказать «прижать к краю»: сколько
  // бы ни было места на этом окне, кадр встанет вплотную к краю с полем
  // EDGE и целиком.
  const shift = Math.sign(aside) * Math.min(Math.abs(aside), room);
  rightVec.crossVectors(fwdVec, upVec);
  return out.addScaledVector(rightVec, -shift);
}
camera.lookAt(lookOf(BEATS[0], new THREE.Vector3()));

const group = new THREE.Group();
scene.add(group);

/* ── Вуаль ──────────────────────────────────────────────────────────────── */
/* Задача заказчика: по всей странице — вуаль. Не дымка. Автор прислал
 * образец (баннер «Chapter 24»), и первая версия — мягкий туман из шума —
 * рецензию не прошла: «дымка очень слабая».
 *
 * Разбор образца: там длинные ленты прозрачной ткани. У каждой широкое
 * мягкое тело и ОДНА тонкая светлая линия — гребень складки, на который
 * лёг свет. Ленты идут пучками, пересекаются под малыми углами, в
 * пересечениях светлее; по плотным местам рассыпаны искры.
 *
 * Отсюда устройство: не шум, а геометрия. Каждая лента — своя ось и своя
 * волна, три синуса разной длины дают крупный изгиб и рябь. Шум оставлен
 * только на крупную маску плотности, чтобы между пучками были честные
 * просветы: без них вуаль превращается в молоко и глушит фотографии.
 *
 * Три плана в глубину (путь, который выбрал автор): глубокий — широкие
 * полотнища почти без гребня, средний — складки, ближний — тонкие нити и
 * искры. При прокрутке планы разъезжаются с разной скоростью, поэтому
 * между ними читается расстояние.
 *
 * Движение медленное намеренно: полный размах волны — 25–40 секунд.
 * Вуаль дышит, а не бежит.
 *
 * Слой рисуется последним и без проверки глубины: ложится поверх кадров,
 * книги и колёс, но под текстом — текст живёт в DOM над холстом.
 *
 * При prefers-reduced-motion вуаль стоит: это движение на весь экран,
 * ровно то, что читатель этой настройкой и просил убрать. */
const VEIL_FRAG = `
  uniform float uTime;
  uniform float uAspect;
  uniform float uStrength;
  uniform float uDrift;
  uniform float uSeed;
  uniform float uWidth;
  uniform float uSpan;
  uniform float uAmp;
  uniform float uBase;
  uniform float uSpread;
  uniform float uSparkle;
  uniform float uBody;
  uniform float uCrest;
  uniform vec3 uHalo;
  uniform vec3 uCore;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(3.1, 1.7); a *= 0.5; }
    return v;
  }

  /* Искры: редкие ячейки сетки, в каждой точка со своей фазой мерцания и
   * слабым крестом-бликом — как на образце. */
  float sparkle(vec2 p, float t) {
    vec2 g = p * 22.0;
    vec2 id = floor(g), f = fract(g) - 0.5;
    if (hash(id + 1.7) < 0.80) return 0.0;
    vec2 r = vec2(hash(id), hash(id + 7.3)) - 0.5;
    float ph = hash(id + 3.1) * 6.2831;
    float tw = pow(0.5 + 0.5 * sin(t * 2.2 + ph), 3.0);
    vec2 d = f - r * 0.7;
    float core = exp(-dot(d, d) * 800.0);
    float flare = exp(-abs(d.x) * 300.0 - abs(d.y) * 44.0)
                + exp(-abs(d.y) * 300.0 - abs(d.x) * 44.0);
    return tw * (core + flare * 0.30);
  }

  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5) * 2.0;
    p.x += uDrift;
    float t = uTime;

    float body = 0.0;
    float crest = 0.0;

    for (int i = 0; i < COUNT; i++) {
      float fi = float(i);
      float r1 = hash(vec2(fi, uSeed));
      float r2 = hash(vec2(fi + 11.0, uSeed));
      float r3 = hash(vec2(fi + 23.0, uSeed));
      float r4 = hash(vec2(fi + 37.0, uSeed));

      // Ленты идут пучками по три: соседние складки одной полосы ткани
      // почти параллельны, а пучки расходятся веером.
      float cl = floor(fi / 3.0);
      float h1 = hash(vec2(cl + 0.5, uSeed));
      float h2 = hash(vec2(cl + 9.5, uSeed));
      float ang = uBase + uSpread * (h1 - 0.5) + 0.07 * (r1 - 0.5);
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 nrm = vec2(-dir.y, dir.x);
      float u = dot(p, dir) + t * 0.05;   // ткань едет вдоль самой себя
      float v = dot(p, nrm);

      float vc = (h2 - 0.5) * uSpan + (r2 - 0.5) * uWidth * 4.0
        + 0.30 * uAmp * sin(0.85 * u + r3 * 6.2831 + t * 0.62)
        + 0.13 * uAmp * sin(1.90 * u + r4 * 6.2831 - t * 0.47)
        + 0.05 * uAmp * sin(3.70 * u + r1 * 6.2831 + t * 0.71);
      float d = v - vc;

      // Ширина гуляет вдоль ленты — ткань то раскрывается, то встаёт ребром.
      float w = uWidth * (0.45 + 0.95 * r3) * (0.78 + 0.22 * sin(1.25 * u + r2 * 6.2831 + t * 0.53));
      float bd = exp(-pow(d / w, 2.0) * 2.2);

      // Гребень смещён к одному краю: свет ложится на сгиб, а не по центру.
      float side = r1 > 0.5 ? 1.0 : -1.0;
      float off = w * (0.30 + 0.34 * r4) * side;
      float cr = exp(-pow((d - off) / (w * 0.15), 2.0) * 2.0);

      float env = smoothstep(-2.4, -0.9, u) * (1.0 - smoothstep(0.9, 2.4, u));
      float fade = 0.50 + 0.50 * sin(0.72 * u + r4 * 6.2831 + t * 0.33);
      float k = env * fade * (0.55 + 0.7 * r2);

      body  += bd * k;
      crest += cr * k;
    }

    float mask = pow(clamp(fbm(p * 0.5 + vec2(t * 0.02, t * 0.013)) * 1.55 + 0.10, 0.0, 1.2), 1.7);
    float a = (body * uBody + crest * uCrest) * mask * uStrength;
    float sp = sparkle(p, t * 1.4) * smoothstep(0.03, 0.22, a) * uSparkle;

    vec3 col = mix(uHalo, uCore, clamp(crest * mask * uCrest * 1.3, 0.0, 1.0));
    col += sp * 0.5;
    gl_FragColor = vec4(col, clamp(a + sp * 0.8, 0.0, 1.0));
  }
`;

function veilLayer(o) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: VEIL_FRAG,
    defines: { COUNT: o.count },
    uniforms: {
      uTime: { value: 0 }, uAspect: { value: 1 }, uDrift: { value: 0 },
      uStrength: { value: o.strength * VEIL_GAIN }, uSeed: { value: o.seed },
      uWidth: { value: o.width }, uSpan: { value: o.span }, uAmp: { value: o.amp },
      uBase: { value: o.base }, uSpread: { value: o.spread }, uSparkle: { value: o.sparkle },
      uBody: { value: o.body }, uCrest: { value: o.crest },
      uHalo: { value: new THREE.Color(o.halo) }, uCore: { value: new THREE.Color(o.core) }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = o.order;
  mesh.userData.speed = o.speed;
  mesh.userData.parallax = o.parallax;
  mesh.userData.strength = o.strength * VEIL_GAIN;
  mesh.userData.body = o.body;
  scene.add(mesh);
  return mesh;
}

// На узком экране лент меньше: три полноэкранных прохода поверх всей сцены —
// это то место, где слабый телефон просядет первым. Рисунок от этого не
// меняется, меняется густота.
const VEIL_THIN = window.innerWidth < 900;
// В узкий экран попадает меньше лент — чтобы вуаль читалась так же, узкий
// кадр берёт их чуть плотнее.
const VEIL_GAIN = VEIL_THIN ? 1.25 : 1;
const veil = [
  veilLayer({
    count: VEIL_THIN ? 4 : 6, seed: 21.3, strength: 0.20, width: 0.60, span: 2.4,
    amp: 0.62, base: 0.20, spread: 0.40, sparkle: 0, body: 1.00, crest: 0.25,
    halo: 0xcfc4b2, core: 0xeee2cf, order: 1000, speed: 0.15, parallax: -0.06
  }),
  veilLayer({
    count: VEIL_THIN ? 6 : 9, seed: 3.7, strength: 0.27, width: 0.26, span: 2.2,
    amp: 0.55, base: 0.15, spread: 0.62, sparkle: 0, body: 0.50, crest: 1.25,
    halo: 0xd8cdbc, core: 0xf6ecdd, order: 1001, speed: 0.20, parallax: -0.10
  }),
  veilLayer({
    count: VEIL_THIN ? 6 : 9, seed: 12.4, strength: 0.30, width: 0.10, span: 2.4,
    amp: 0.48, base: -0.34, spread: 0.95, sparkle: 1, body: 0.26, crest: 1.60,
    halo: 0xe7dccb, core: 0xfff7ea, order: 1002, speed: 0.27, parallax: 0.16
  })
];

function veilAspect(a) {
  for (let i = 0; i < veil.length; i++) veil[i].material.uniforms.uAspect.value = a;
}
// Планы разъезжаются с разной скоростью: за всю страницу дальний уходит
// влево меньше чем на полэкрана, ближний вправо — чуть больше.
/* У «Автора» вуаль сгущается: из неё проступает шёлк со стихами (слой
 * author/stage.js пишет link.thick). Плотнее становятся и сами ленты, и их
 * тело — не только ярче, а гуще. */
function veilTime(t, scroll) {
  const thick = link.thick;
  for (let i = 0; i < veil.length; i++) {
    const u = veil[i].material.uniforms;
    const d = veil[i].userData;
    u.uTime.value = t * d.speed;
    u.uDrift.value = scroll * d.parallax;
    u.uStrength.value = d.strength * (1 + thick * 2.4);
    u.uBody.value = d.body * (1 + thick * 1.6);
  }
}

/* ── Колёса ─────────────────────────────────────────────────────────────── */
/* Колёс два: кадры романа на «Читателях» и ролики в финале (задача 7).
 * Механизм один.
 *
 * Колесо — группа, которую каждый кадр разворачивают точно к камере, и дети
 * на окружности в её локальной плоскости XY. Отсюда всё нужное берётся
 * само: копии на одном расстоянии от камеры, значит одного размера, и
 * ничего не приближается и не удаляется; крена у камеры нет, значит копии
 * стоят вертикально; вращение читается как ход часовой стрелки.
 *
 * Взятость копии — одно число k от 0 до 1. Оно разом стягивает радиус к
 * нулю (копия идёт в центр колеса), выдвигает её к камере на WHEEL_FORWARD
 * и растит до FOCUS_FILL высоты экрана. Одно число вместо трёх анимаций:
 * промежуточные состояния не могут разойтись между собой. */
const WHEEL_FORWARD = 1.5;
const FOCUS_FILL = 0.8;
const FOCUS_RATE = 10;
const HALF_V = (camera.fov / 2) * (Math.PI / 180);
/* Насколько далеко от своей остановки колесо ещё рисуется. Меньше —
 * колесо гаснет ближе к стоянке, больше — дольше висит на проезде. */
const WHEEL_REACH = 0.75;

const wheels = [];

function makeWheel(spec) {
  const g = new THREE.Group();
  g.position.set(spec.center[0], spec.center[1], spec.center[2]);
  scene.add(g);
  const tilt = (spec.tilt || 0) * (Math.PI / 180);
  const w = {
    spec: spec, group: g, angle: 0, spin: true,
    // Размеры и раскладка зависят от ширины окна — считает fitWheel().
    radius: spec.radius, height: spec.height, period: spec.period, roll: false, every: 1,
    // Наклон круга разложен один раз: в placeWheel он нужен каждый кадр на
    // каждую копию, а меняться ему неоткуда — это число раскадровки.
    // tilt считается от горизонтали (см. beats.js), поэтому по вертикали
    // экрана ход идёт как синус, а в глубину — как косинус: у лежащего
    // плашмя круга (tilt 0) весь ход уходит в глубину.
    leanY: Math.sin(tilt), leanZ: Math.cos(tilt),
    // Индекс своей остановки: по нему cull() гасит колесо везде, кроме неё.
    beatIndex: BEATS.findIndex(function (b) { return b.id === spec.beat; })
  };
  wheels.push(w);
  return w;
}

/* Узкий экран может дать колесу другие числа и другую раскладку — поле
 * narrow у колеса (см. RING в beats.js). Чистая функция, зовётся из
 * resize() на каждый поворот телефона. */
function fitWheel(w) {
  const n = narrow ? w.spec.narrow : null;
  w.radius = n && n.radius !== undefined ? n.radius : w.spec.radius;
  w.height = n && n.height !== undefined ? n.height : w.spec.height;
  w.period = n && n.period !== undefined ? n.period : w.spec.period;
  w.every = n && n.every !== undefined ? n.every : 1;
  w.roll = !!(n && n.roll);
}

const ringWheel = makeWheel(RING);
const reelWheel = makeWheel(REELS);

/* Взятая копия. Заполняет указатель (см. ниже по файлу); здесь объявлена
 * потому, что её читают placeWheel и updateWheels. */
let focusMesh = null;
let lastFocus = null;

/* Узкий экран сжимает колесо через fit, а не через масштаб группы:
 * масштаб утянул бы за собой и взятую копию, и «80 % экрана» перестали бы
 * быть восемьюдесятью. */
function addToWheel(w, mesh, slot, index, aspect) {
  mesh.userData.slot = slot;
  mesh.userData.k = 0;
  // Номер копии по порядку кадров: по нему cull() прореживает колесо на
  // узком экране (поле every).
  mesh.userData.index = index;
  mesh.userData.aspect = aspect;
  w.group.add(mesh);
  placeWheel(w);
}

/* Доля видимой ширины под единственный ролик на узком экране — см. placeWheel. */
const PINNED_WIDTH = 0.74;

function placeWheel(w) {
  // Развернуть колесо точно к камере: дальше локальные координаты детей —
  // это экранные, +X вправо, +Y вверх, +Z на зрителя. Наклон круга живёт
  // внутри этих координат (см. ниже), а не в повороте группы: иначе копии
  // перестали бы стоять вертикально.
  w.group.quaternion.copy(camera.quaternion);
  const dist = camera.position.distanceTo(w.group.position);
  // Высота, при которой копия займёт FOCUS_FILL экрана, считается на той
  // глубине, куда копия выходит, а не в плоскости колеса.
  const grown = FOCUS_FILL * 2 * Math.max(0.5, dist - WHEEL_FORWARD) * Math.tan(HALF_V);
  for (let i = 0; i < w.group.children.length; i++) {
    const c = w.group.children[i];
    const k = c.userData.k;
    // Минус перед углом — вращение по часовой стрелке.
    const a = (c.userData.slot - w.angle) * Math.PI * 2;
    const r = w.radius * (1 - k);
    if (w.roll) {
      // Колесо, катящееся на читателя (узкий экран): круг стоит в
      // вертикальной плоскости вдоль взгляда, вбок копии не расходятся
      // вовсе. Косинус в глубину, а не в ширину, — копия проходит сверху
      // вниз через ближнюю точку и уходит вглубь.
      c.position.set(0, Math.sin(a) * r, Math.cos(a) * r + k * WHEEL_FORWARD);
      const base = w.height;
      const h = base + (grown - base) * k;
      c.scale.set(h * c.userData.aspect, h, 1);
      continue;
    }
    // Круг карусели лежит плашмя и приподнят к зрителю на spec.tilt: по
    // ширине экрана ход полный, по высоте сжат наклоном, остальное уходит
    // в глубину — отсюда пологий эллипс и то, что копии проходят одна
    // перед другой. Минус перед глубиной: круг висит выше камеры и клонится
    // к читателю НИЖНИМ краем, поэтому низ эллипса ближе и крупнее.
    // Радиус гаснет с k, поэтому взятая копия приходит ровно в центр, а
    // оставшийся сдвиг по z — тот самый выход к камере, из которого
    // посчитан grown.
    c.position.set(
      Math.cos(a) * r,
      Math.sin(a) * r * w.leanY,
      -Math.sin(a) * r * w.leanZ + k * WHEEL_FORWARD
    );
    const base = w.height;
    let h = base + (grown - base) * k;
    // Единственный ролик на узком экране (pinned): по высоте он занял бы
    // почти всю ширину телефона, и мягкие края кадра уходили бы за рамку
    // экрана — ролик читался жёстким прямоугольником без затемнения по
    // бокам, в отличие от кадров на остальном сайте. Ширину держим в
    // PINNED_WIDTH видимой ширины, чтобы растушёвка оставалась в кадре.
    if (c.userData.pinned) {
      const visW = (grown / FOCUS_FILL) * camera.aspect;
      h = Math.min(h, visW * PINNED_WIDTH / c.userData.aspect);
    }
    c.scale.set(h * c.userData.aspect, h, 1);
  }
}

/* Колесо, чью копию держат, не вращается — иначе взятый кадр уезжал бы из-под
 * курсора. Копия с меткой pinned стоит в центре в полный размер всегда: так
 * на узком экране показывается единственный ролик (задача 7). */
function updateWheels(dt) {
  const ease = 1 - Math.exp(-dt * FOCUS_RATE);
  for (let n = 0; n < wheels.length; n++) {
    const w = wheels[n];
    const held = focusMesh !== null && focusMesh.parent === w.group;
    if (w.spin && !held) w.angle = (w.angle + dt / w.period) % 1;
    for (let i = 0; i < w.group.children.length; i++) {
      const c = w.group.children[i];
      if (c.userData.pinned) { c.userData.k = 1; continue; }
      const target = c === focusMesh ? 1 : 0;
      c.userData.k += (target - c.userData.k) * ease;
      if (Math.abs(target - c.userData.k) < 0.002) c.userData.k = target;
    }
    placeWheel(w);
  }
}

/* ── Листки со стихами на «Авторе» ──────────────────────────────────────── */
/* Автор писала к роману стихи и выкладывала их. Здесь они стоят на месте
 * книги — по её же просьбе: книга «не зашла».
 *
 * Не книга на столе, а листки в воздухе: проходит ветерок, листки меняются
 * местами, передний по дуге уходит в конец очереди, следующий выходит к
 * читателю. Механика — sheets.js, текст — poem.js, место и размеры —
 * SHEETS в beats.js.
 *
 * Здесь только связка со сценой: поставить, развернуть, подогнать размер
 * под окно и отдать время. Фотографий у листков нет и вынимать нечего —
 * содержание здесь сам текст, и главное требование к нему одно: его должно
 * быть видно настолько, чтобы прочитать. */
const sheets = createSheets(THREE, {
  height: SHEETS.height,
  anisotropy: renderer.capabilities.getMaxAnisotropy()
});
const sheetsBeat = BEATS.findIndex(function (b) { return b.id === SHEETS.beat; });
sheets.group.position.set(SHEETS.center[0], SHEETS.center[1], SHEETS.center[2]);
sheets.group.visible = false;
scene.add(sheets.group);

/* Листки висят параллельно экрану «Автора» и чуть навзничь.
 *
 * Параллельно экрану, а не «лицом к камере»: они стоят сбоку от оси взгляда
 * (aside), и развёрнутые к самой камере легли бы на экран наискось. */
const sheetsLook = new THREE.Vector3();
const sheetsAim = new THREE.Vector3();

function orientSheets() {
  const b = BEATS[sheetsBeat];
  lookOf(b, sheetsLook);
  sheetsLook.sub(new THREE.Vector3(b.cam[0], b.cam[1], b.cam[2]));
  sheets.group.rotation.set(0, 0, 0);
  sheets.group.lookAt(sheets.group.position.clone().sub(sheetsLook));
  sheets.group.rotateX(-SHEETS.tilt * Math.PI / 180);
}

/* Подгонка под окно: передний листок занимает заданную долю высоты, но не
 * шире заданной доли ширины. На широком экране он стоит справа от текста и
 * не должен на него наезжать; на узком текста рядом нет, и листок берёт
 * почти всю ширину — иначе стихи не прочитать.
 *
 * Считается от камеры остановки, а не от живой: размер листков не должен
 * гулять на проезде мимо. */
let sheetsSpan = SHEETS.height;

function fitSheets() {
  const b = BEATS[sheetsBeat];
  sheets.setPeek(narrow ? SHEETS.narrow.peek : SHEETS.peek);
  const dx = SHEETS.center[0] - b.cam[0];
  const dy = SHEETS.center[1] - b.cam[1];
  const dz = SHEETS.center[2] - b.cam[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Доли считаются от ВСЕЙ стопки: в кадр должен попасть веер целиком,
  // иначе верхние кромки уедут за край окна.
  const tan = Math.tan(HALF_V);
  const visH = 2 * dist * tan;
  const visW = visH * camera.aspect;
  const byHeight = visH * cfg2fill(SHEETS) / sheets.span;
  const byWidth = visW * cfg2fillW(SHEETS) / sheets.aspect;
  const h = Math.min(byHeight, byWidth);
  sheets.setScale(h / SHEETS.height);
  sheetsSpan = h;
  const hold = narrow ? SHEETS.narrow.hold : SHEETS.hold;
  sheets.setHold(hold.forward, hold.grow);

  /* Куда уводить взятый листок. Камера смотрит не на сами листки, а в
   * точку, сдвинутую вбок на aside, — значит листки стоят сбоку от
   * середины кадра. Разница между точкой взгляда и центром листков,
   * переведённая в оси группы, и есть тот сдвиг, который ставит взятый
   * листок ровно в середину. */
  lookOf(b, sheetsAim);
  sheets.group.updateMatrixWorld();
  // worldToLocal — метод самого Object3D: отдельного Matrix4 в срезе three
  // нет. Начало координат группы и есть центр листков, поэтому локальные
  // координаты точки взгляда — это сразу нужный сдвиг.
  sheets.group.worldToLocal(sheetsAim);
  /* На узком экране взятый листок выходит ровно в середину: текста рядом
   * нет. На широком — только половину пути: там слева стоит рассказ автора
   * о себе, и доехавший до середины листок лёг бы прямо на него. */
  const pull = narrow ? 1 : 0.5;
  sheets.setAim(sheetsAim.x * pull / h, sheetsAim.y * pull / h);
}

/* Узкий экран берёт свои доли из SHEETS.narrow, широкий — верхние. */
function cfg2fill(S) { return narrow ? S.narrow.fill : S.fill; }
function cfg2fillW(S) { return narrow ? S.narrow.fillW : S.fillW; }

/* Держат листок — очередь стоит, читатель дочитывает. Остальное делает
 * sheets.js.
 *
 * На узком экране взятый листок занимает почти весь экран — иначе стихи не
 * прочитать, — и ложится ровно на рассказ автора о себе. Холст лежит ПОД
 * разметкой, поэтому текст проступал бы сквозь бумагу. Пока листок держат,
 * текст секции гаснет: читают сейчас стихи. На широком экране листок стоит
 * сбоку от текста и ничего гасить не нужно. */
const authorSection = document.getElementById('author');
let reading = false;

/* Сквозняк: где указатель в плоскости стопки. Плоскость перпендикулярна
 * оси камеры и проходит через центр листков — то же построение, что у
 * pointerNear(), и по той же причине: THREE.Plane в срезе нет.
 *
 * Луч уже выставлен в updateFocus() этого же кадра. */
const sheetsPt = new THREE.Vector3();

function feedDraft() {
  if (!pointerLive || !sheets.group.visible) { sheets.setPointer(0, 0, false); return; }
  camera.getWorldDirection(camFwd);
  toCentre.copy(sheets.group.position).sub(camera.position);
  const denom = raycaster.ray.direction.dot(camFwd);
  if (Math.abs(denom) < 1e-6) { sheets.setPointer(0, 0, false); return; }
  const t = toCentre.dot(camFwd) / denom;
  if (t <= 0) { sheets.setPointer(0, 0, false); return; }
  sheetsPt.copy(raycaster.ray.direction).multiplyScalar(t).add(raycaster.ray.origin);
  sheets.group.worldToLocal(sheetsPt);
  sheets.setPointer(sheetsPt.x / sheetsSpan, sheetsPt.y / sheetsSpan, true);
}

function updateSheets(dt) {
  if (SHEETS.off || !sheets.ready) return;
  const held = focusMesh !== null && focusMesh.parent === sheets.group;
  feedDraft();
  sheets.update(dt, held ? focusMesh : null);
  const want = held && narrow;
  if (want !== reading && authorSection) {
    reading = want;
    authorSection.classList.toggle('reading', want);
  }
}

/* ── Указатель ──────────────────────────────────────────────────────────── */
/* Наведение мышью и тап делают одно и то же: берут копию из колеса. Взятая
 * копия останавливает своё колесо, выходит в центр и вырастает до 80 %
 * высоты экрана — всё это считает placeWheel по числу k.
 *
 * Три границы, без которых это мешало бы читать:
 *   1. Отзывается только то колесо, чья остановка сейчас текущая, — иначе
 *      кадры залипали бы на проезде мимо.
 *   2. Указатель над ссылкой или кнопкой ничего не берёт: там курсор занят
 *      страницей, а не сценой.
 *   3. Прокрутка отпускает взятое: читатель поехал дальше — колесо само
 *      вернулось к вращению.
 *
 * Луч пускается не на каждое движение мыши, а один раз за кадр цикла:
 * pointermove только запоминает координаты. */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerLive = false;
let stickyMesh = null;

/* Что на текущей остановке отзывается на указатель: колесо копий, колесо
 * роликов или книга. Возвращается группа и радиус удержания вокруг её
 * центра — дальше всё одинаково, откуда бы объект ни был. */
function activeTarget() {
  const beat = BEATS[Math.max(0, Math.min(LAST, Math.round(position)))];
  if (beat.id === SHEETS.beat && !SHEETS.off) {
    /* Вся стопка плюс запас. hold здесь НЕ нужен: у каждого листка свой
     * прямоугольник для луча, и переизбрание — это и есть то, что просил
     * автор: увёл мышь на соседнюю кромку — вышел соседний листок. Пока
     * указатель рядом, но ни по кому не попал, взятое держится само
     * (последняя ветка updateFocus). */
    return { group: sheets.group, reach: sheetsSpan * sheets.span * 0.62 };
  }
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    if (w.spec.beat === beat.id) {
      // Полвысоты копии сверх радиуса: круг чуть шире самого колеса.
      return { group: w.group, reach: w.radius + w.height * 0.6 };
    }
  }
  return null;
}

function pick() {
  const t = activeTarget();
  if (!t) return null;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(t.group.children, false);
  for (let i = 0; i < hits.length; i++) {
    // cull() гасит дальние копии, а Raycaster видимость сам не смотрит.
    // pinned — единственный ролик на узком экране, он и так в полный рост.
    if (hits[i].object.visible && !hits[i].object.userData.pinned) return hits[i].object;
  }
  return null;
}

/* Указатель рядом с центром колеса или книги?
 *
 * Нужно, чтобы взятое не мигало: оно уходит в центр и вырастает, а
 * указатель остаётся там, где стояла маленькая копия, — попадание по ней
 * теряется, и без удержания она отпускала бы и забирала себя каждый кадр.
 *
 * Плоскость проверки перпендикулярна оси камеры и проходит через центр
 * группы, поэтому пересечение считается без THREE.Plane (его в срезе нет):
 * идём вдоль луча до этой плоскости и меряем расстояние от центра. */
const hitVec = new THREE.Vector3();
const camFwd = new THREE.Vector3();
const toCentre = new THREE.Vector3();

function pointerNear(target) {
  camera.getWorldDirection(camFwd);
  toCentre.copy(target.group.position).sub(camera.position);
  const denom = raycaster.ray.direction.dot(camFwd);
  if (Math.abs(denom) < 1e-6) return false;
  const t = toCentre.dot(camFwd) / denom;
  if (t <= 0) return false;
  hitVec.copy(raycaster.ray.direction).multiplyScalar(t).add(raycaster.ray.origin);
  return hitVec.distanceTo(target.group.position) <= target.reach;
}

function updateFocus() {
  const t = activeTarget();
  if (!t) { stickyMesh = null; focusMesh = null; return; }
  if (stickyMesh) {
    // Та же проверка, что и в ветке удержания: тапнутое принадлежит
    // объекту текущей остановки, а не соседней.
    if (stickyMesh.parent === t.group) { focusMesh = stickyMesh; return; }
    stickyMesh = null;
  }
  if (!pointerLive) { focusMesh = null; return; }
  // Луч ставим здесь, а не полагаемся на pick(): проверка удержания ниже
  // идёт ДО неё, а pointerNear() читает raycaster.ray. На старом луче
  // удержание отвечает по прошлому положению указателя и не отпускает
  // никогда — поймано на живой странице: куб (он стоял здесь до книги)
  // переставал вращаться совсем.
  raycaster.setFromCamera(pointer, camera);
  // Книга: держим, пока указатель рядом, и не переизбираем.
  if (t.hold && focusMesh && focusMesh.parent === t.group && pointerNear(t)) return;
  const hit = pick();
  // Указали на копию или грань — берём, даже если сейчас держим другую.
  if (hit) { focusMesh = hit; return; }
  // Не попали ни по кому, но указатель ещё рядом — держим взятое.
  if (focusMesh && focusMesh.parent === t.group && pointerNear(t)) return;
  focusMesh = null;
}

function overPage(e) {
  return !!(e.target && e.target.closest && e.target.closest('a, button'));
}

function toNDC(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

/* Слушатели ставим всегда, в том числе при prefers-reduced-motion: взять
 * копию — действие самого читателя, а не самоход сцены. Раньше их там не
 * было, и на айфоне с «Уменьшением движения» тап по фотографии не делал
 * ничего (поймано автором на живом телефоне). */
window.addEventListener('pointermove', function (e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  if (overPage(e)) { pointerLive = false; return; }
  toNDC(e);
  pointerLive = true;
}, { passive: true });

// Именно document, а не window: pointerleave не всплывает, и уход
// курсора за край окна до window не доходит. blur — вторая страховка,
// на переключение вкладки или окна мимо мыши.
document.addEventListener('pointerleave', function () { pointerLive = false; }, { passive: true });
window.addEventListener('blur', function () { pointerLive = false; }, { passive: true });

// Тап: на сенсорном экране наведения нет. Тап по копии берёт её, тап мимо
// или по ней же — отпускает.
window.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'mouse') return;
  if (overPage(e)) return;
  toNDC(e);
  const hit = pick();
  stickyMesh = (hit && hit !== stickyMesh) ? hit : null;
}, { passive: true });

window.addEventListener('scroll', function () { stickyMesh = null; }, { passive: true });

/* Только для проверок из Playwright. Читает его только проверка; сцена
 * лишь выставляет `probe.reel`, чтобы проверке было что читать. */
export const probe = {
  group: group, ring: ringWheel.group, reel: null, camera: camera, wheels: wheels,
  sheets: sheets, veil: veil,
  focusId: function () { return focusMesh ? (focusMesh.userData.id || null) : null; }
};

/* ── Кадры ──────────────────────────────────────────────────────────────── */
const geometry = new THREE.PlaneGeometry(1, 1);

/* Доля полустороны, на которой кадр растворяется в темноте. Задаётся по
 * вертикали; по горизонтали пересчитывается из пропорций кадра, чтобы полоса
 * растушёвки была одинаковой ширины со всех четырёх сторон. */
const FEATHER = 0.62;

/* Материал кадра: общий для фотографий и для видео на финале.
 * Пропорции нужны для порога растушёвки по горизонтали (см. FRAG).
 * side задаётся только при doubleSided: THREE.FrontSide в срезе не
 * экспортирован, а `side: undefined` Material.setValues встречает
 * предупреждением; отсутствие ключа даёт FrontSide по умолчанию. */
function makeMaterial(texture, aspect, opts) {
  const o = opts || {};
  const feather = o.feather === undefined ? FEATHER : o.feather;
  const near = o.near;
  const featherX = 1.0 - (1.0 - feather) / aspect;
  const params = {
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: 1.0 },
      uFeather: { value: new THREE.Vector2(featherX, feather) },
      uNear: { value: new THREE.Vector2(near ? near[0] : 0, near ? near[1] : 0) },
      uFog: uFog
    },
    transparent: true,
    depthWrite: false
  };
  if (o.doubleSided) params.side = THREE.DoubleSide;
  return new THREE.ShaderMaterial(params);
}

function makeFrame(spec, img) {
  const texture = new THREE.Texture(img);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;

  // Пропорции исходника нужны дважды: для ширины плоскости (кадры в
  // shared/img/ не все одного формата — sam-portrait шире прочих, растягивать
  // их нельзя) и для порога растушёвки по горизонтали.
  const aspect = img.naturalWidth / img.naturalHeight;
  const material = makeMaterial(texture, aspect, { doubleSided: true, near: spec.fadeNear });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(spec.height * aspect, spec.height, 1);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  mesh.rotation.y = spec.rotY;
  // Помечаем каст отдельно от отсечения по дистанции в cull() — см.
  // комментарий у CAST_IDS выше.
  mesh.userData.cast = CAST_IDS.has(spec.id);
  mesh.userData.id = spec.id;
  return mesh;
}

/* Копия кадра для колеса: та же геометрия и тот же материал, что у
 * оригинала в коридоре, — текстура одна на двоих, лишних загрузок нет.
 * Слот по индексу кадра в FRAMES, а не по порядку загрузки: копии не
 * должны меняться местами от того, какая картинка доехала первой. */
function addToRing(spec, img) {
  const original = group.children.find(function (m) { return m.userData.id === spec.id; });
  if (!original) return;
  const aspect = img.naturalWidth / img.naturalHeight;
  const copy = new THREE.Mesh(geometry, original.material);
  copy.userData.id = spec.id;
  const index = FRAMES.indexOf(spec);
  addToWheel(ringWheel, copy, index / FRAMES.length, index, aspect);
}

/* Каждый кадр встаёт в сцену сам по себе, как только его пиксели готовы.
 *
 * Два решения, которые здесь важнее, чем кажутся:
 *
 * 1. Никакого Promise.all. Камера не ждёт последнюю текстуру — на медленной
 *    сети читатель смотрел бы в пустоту, пока докачается десятый кадр.
 *
 * 2. Фолбэк-кадр прячется поштучно, классом на самом кадре, а не общим
 *    классом на документе. Спрятать все разом — значит убрать со страницы
 *    и те кадры, чьи текстуры не доехали: содержание пропало бы совсем. */
function buildFrames() {
  for (const spec of FRAMES) {
    const img = document.querySelector('img[data-frame="' + spec.id + '"]');
    if (!img) continue;
    // decode() ждёт настоящей готовности пикселей: complete бывает true
    // ещё до того, как картинка пригодна как текстура.
    const wait = img.complete && img.naturalWidth
      ? Promise.resolve()
      : img.decode().catch(function () { return null; });
    wait.then(function () {
      if (!img.naturalWidth) return;
      group.add(makeFrame(spec, img));
      addToRing(spec, img);
      const box = img.closest('.shot, .cast-frame');
      if (box) {
        box.classList.add('frame-on');
        // Кадр ушёл из потока — высоты секций изменились, маршрут надо
        // пересчитать. Десять вызовов за загрузку страницы, по одному на
        // кадр, девять чтений offsetTop каждый: цена незаметная.
        measure();
      }
      if (reduced.matches) {
        // Без requestAnimationFrame-цикла settle() сама себя не перезапустит:
        // сбрасываем remembered-остановку, чтобы её пересчитали по свежей
        // вёрстке, — иначе при восстановленной прокрутке камера так и
        // останется там, где встала до того, как кадры покинули поток.
        staticBeat = -1;
        settle();
      } else {
        render();
      }
    });
  }
}

/* Свет у остановки «Автор» — единственный объект, который не фотография. */
function buildGlow() {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0xD9A05B) },
      uStrength: { value: 0.5 }
    },
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Обе стороны, как у кадров: плоскость развёрнута на GLOW.rotY, и при
  // проезде камера проходит мимо неё с той стороны, где односторонний
  // материал просто исчез бы.
  material.side = THREE.DoubleSide;
  mesh.scale.set(GLOW.size[0], GLOW.size[1], 1);
  mesh.position.set(GLOW.pos[0], GLOW.pos[1], GLOW.pos[2]);
  mesh.rotation.y = GLOW.rotY;
  scene.add(mesh);
}

/* ── Ролики в финале ────────────────────────────────────────────────────── */
/* Три <video> из секции follow — и фолбэк, и источники текстур, как <img> у
 * кадров. Правила:
 *   1. Ни байта видео, пока читатель не доехал до «Следующей книги»: за одну
 *      остановку до финала, не раньше — на первый экран ролики не давят.
 *   2. Играют, только пока финал на экране: телефон не греется там, где
 *      видео не видно.
 *   3. Звук включает только кнопка (задача 8), и звучит только взятая копия.
 *
 * На узком экране в сцену идёт только первый ролик и помечается pinned:
 * placeWheel держит такую копию в центре и в полный размер, updateWheels её
 * не трогает, указатель не берёт. */
const reelClips = [];
let followVisible = false;

function syncReelPlayback() {
  const held = focusMesh !== null && focusMesh.parent === reelWheel.group;
  for (let i = 0; i < reelClips.length; i++) {
    const clip = reelClips[i];
    // Пока меша нет, играть нечего: до loadeddata видео — обычная фигура в
    // вёрстке, и play() тут запустил бы её со звуком.
    if (!clip.mesh) continue;
    // Взяли одну копию — остальные встают: три дорожки разом не нужны
    // никому, да и декодировать их незачем.
    const wanted = followVisible && !document.hidden && (!held || focusMesh === clip.mesh);
    if (wanted) {
      const p = clip.video.play();
      // Отказ в автозапуске — не ошибка сцены: фолбэк-плеер остаётся.
      if (p && p.catch) p.catch(function () {});
    } else {
      clip.video.pause();
    }
  }
}

function onReelReady(clip) {
  const video = clip.video;
  // Плеер и фокус отбираем только теперь, когда сцена действительно берёт
  // видео: если файл не доехал, фигура в вёрстке остаётся полноценной.
  video.controls = false;
  video.tabIndex = -1;
  const texture = new THREE.Texture(video);
  // Мипмапы для видео не строим: генерировать их тридцать раз в секунду
  // дорого и незачем.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const aspect = video.videoWidth / video.videoHeight;
  const mesh = new THREE.Mesh(geometry, makeMaterial(texture, aspect, {}));
  mesh.userData.id = video.dataset.frame;
  if (narrow) mesh.userData.pinned = true;
  clip.mesh = mesh;
  addToWheel(reelWheel, mesh, clip.slot, clip.index, aspect);
  if (!probe.reel) probe.reel = mesh;

  const box = video.closest('.shot-video');
  if (box) {
    box.classList.add('frame-on');
    measure();
  }
  syncReelPlayback();
  render();
}

function buildReel() {
  const videos = Array.prototype.slice.call(document.querySelectorAll('video[data-frame^="reel-"]'));
  // Без движения видео в сцену не берём: остаются фигурами с плеерами.
  // На узком экране — тоже: там ролики живут каруселью из вёрстки (reels.js)
  // поверх сцены. Один закреплённый 3D-ролик под кнопками читался как
  // «видео одно», а телефонам с тесной памятью сцена без видео легче.
  if (!videos.length || reduced.matches) return;
  if (narrow) {
    // Лёгкая копия первого ролика — и для карусели. preload="none":
    // смена src ничего не качает, пока читатель не нажмёт play.
    for (let i = 0; i < videos.length; i++) {
      if (videos[i].dataset.srcSm) videos[i].src = videos[i].dataset.srcSm;
    }
    return;
  }
  const list = videos;
  // Ролики, которые сцена не берёт, со страницы убираем: иначе рядом с
  // 3D-роликом стояли бы их фолбэк-плееры. Возвращаем их при потере
  // контекста — там страница снова становится фолбэком целиком.
  for (let i = list.length; i < videos.length; i++) {
    const box = videos[i].closest('.shot-video');
    if (box) box.hidden = true;
  }
  // Колесо из одного ролика вращать нечего и незачем.
  reelWheel.spin = list.length > 1;

  // Звук включает только читатель. Клик — жест пользователя, браузер
  // разрешает снять muted; сами мы этого не делаем никогда.
  const soundBtn = document.querySelector('button.sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.textContent = soundOn ? 'Mute' : 'Sound';
      applySound();
    });
  }

  for (let i = 0; i < list.length; i++) {
    const clip = { video: list[i], mesh: null, slot: i / list.length, index: i };
    reelClips.push(clip);
    list[i].addEventListener('loadeddata', function () { onReelReady(clip); }, { once: true });
  }

  // Загрузка: как только «Следующая книга» или сам финал вошли в экран.
  // Финал тоже наблюдаем — читатель по ссылке #follow «Следующую книгу» не
  // проходит вовсе. muted — здесь, до load(): ни один play() не должен
  // застать видео со звуком.
  const loader = new IntersectionObserver(function (entries) {
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    loader.disconnect();
    for (let i = 0; i < reelClips.length; i++) {
      const v = reelClips[i].video;
      v.muted = true;
      // load() под preload="none" в Safari может не дойти до loadeddata —
      // раз уж решили грузить, грузим по-настоящему.
      v.preload = 'auto';
      v.src = (narrow && v.dataset.srcSm) ? v.dataset.srcSm : v.dataset.src;
      v.load();
    }
  });
  loader.observe(document.getElementById('next'));
  loader.observe(document.getElementById('follow'));

  const watcher = new IntersectionObserver(function (entries) {
    followVisible = entries[entries.length - 1].isIntersecting;
    syncReelPlayback();
  });
  watcher.observe(document.getElementById('follow'));
}

/* Кадр каждого играющего ролика в текстуру и провал в темноту на шве петли.
 * Зовётся из цикла; ролики на паузе пропускаются. */
function updateReel() {
  for (let i = 0; i < reelClips.length; i++) {
    const clip = reelClips[i];
    const v = clip.video;
    if (!clip.mesh || v.paused || v.readyState < 2) {
      // Встал на паузу внутри провала петли — не оставляем его тёмным.
      if (clip.mesh) clip.mesh.material.uniforms.uOpacity.value = 1;
      continue;
    }
    clip.mesh.material.uniforms.uMap.value.needsUpdate = true;
    const t = v.currentTime;
    const d = v.duration;
    // d бывает NaN, пока не пришли метаданные, — тогда провала нет.
    const seam = d > 0 ? Math.max(0, Math.min(1, t / REELS.dip, (d - t) / REELS.dip)) : 1;
    clip.mesh.material.uniforms.uOpacity.value = seam;
    // Со звуком шов слышен так же, как виден: громкость идёт за яркостью.
    if (!v.muted) v.volume = seam;
  }
}

/* Звук — один флаг на всю сцену. Звучать может только взятая копия: три
 * дорожки разом — каша, а у колеса из трёх роликов «включить звук» иначе
 * ничего не значило бы. Флаг включён, но ничего не взято — тишина. */
let soundOn = false;

function applySound() {
  for (let i = 0; i < reelClips.length; i++) {
    const clip = reelClips[i];
    // На узком экране единственный ролик помечен pinned: взять его
    // указателем нельзя, и без этой оговорки кнопка звука на телефоне
    // молчала бы. Заодно размьютирование там происходит прямо в
    // обработчике клика, внутри жеста читателя.
    const live = clip.mesh !== null && (clip.mesh === focusMesh || clip.mesh.userData.pinned);
    clip.video.muted = !(soundOn && live);
    if (!clip.video.muted) clip.video.volume = 1;
  }
}

/* ── Потеря контекста ───────────────────────────────────────────────────── */
/* Браузер отбирает контекст WebGL, когда не хватает памяти или вкладка долго
 * висит в фоне, — на телефоне это не экзотика.
 *
 * Для обычной сцены потеря контекста означает замерший кадр. Здесь — хуже:
 * фолбэк-кадры спрятаны классом frame-on, и читатель остался бы с текстом
 * и без единой фотографии. Поэтому возвращаем страницу ровно в то
 * состояние, в котором она работает без WebGL: кадры обратно в вёрстку,
 * сцена выключена.
 *
 * Восстановление контекста не отслеживаем намеренно: собрать сцену заново
 * означало бы заново завести текстуры, материалы и маршрут, а страница в
 * фолбэке уже полноценна — читатель ничего не теряет, кроме движения. */
let alive = true;

canvas.addEventListener('webglcontextlost', function (e) {
  // Без preventDefault браузер не считает потерю обработанной.
  e.preventDefault();
  alive = false;
  document.documentElement.classList.remove('scene-on');
  const hidden = document.querySelectorAll('.frame-on');
  for (let i = 0; i < hidden.length; i++) hidden[i].classList.remove('frame-on');
  // Ролики возвращаются в вёрстку плеерами: controls и фокус обратно.
  // Меши мертвы вместе с контекстом; без них syncReelPlayback() выходит
  // сразу — наблюдатель #follow больше не сможет запустить play() у
  // размьюченного видео без жеста читателя.
  for (let i = 0; i < reelClips.length; i++) {
    const v = reelClips[i].video;
    v.controls = true;
    v.tabIndex = 0;
    v.pause();
    v.muted = false;
    reelClips[i].mesh = null;
  }
  const parked = document.querySelectorAll('.shot-video[hidden]');
  for (let i = 0; i < parked.length; i++) parked[i].hidden = false;
  focusMesh = null;
  stickyMesh = null;
  probe.reel = null;
});

/* ── Пыль ───────────────────────────────────────────────────────────────── */
/* Не эффект ради эффекта: без неё пустые остановки (пролог, автор) читаются
 * как пустой чёрный экран, а не как воздух комнаты. Частиц мало и они
 * тусклые — они дают глубину, а не блеск. */
const DUST_VERT = `
  attribute float seed;
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.12 + seed) * 0.35;
    p.x += cos(uTime * 0.09 + seed * 1.7) * 0.30;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    // Вблизи частицы гасим: пылинка перед самым объективом читается как
    // грязь на экране, а не как воздух.
    float near = smoothstep(0.8, 4.0, depth);
    float far = 1.0 - smoothstep(8.0, 34.0, depth);
    vAlpha = near * far * (0.25 + 0.75 * abs(sin(seed + uTime * 0.2)));
    // Обмер на «первых строках» и «авторе» показал: без нижнего порога
    // размер на среднем удалении (10–30 единиц, как раз рабочая глубина
    // этих остановок) падает ниже пикселя и точка технически рисуется —
    // альфа-канал ненулевой, — но физически неразличима на экране. Порог
    // держит пылинку на грани заметности и не трогает ближний план: там
    // формула и так даёт точку крупнее порога.
    gl_PointSize = max(uSize * uDpr / max(depth, 0.6), 3.0 * uDpr);
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * 0.5);
  }
`;

let dust = null;

function buildDust(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = 2 - Math.random() * 56;
    seeds[i] = Math.random() * 6.283;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 26 },
      uDpr: { value: 1 },
      uColor: { value: new THREE.Color(0xD9A05B) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  dust = new THREE.Points(geom, material);
  scene.add(dust);
}

/* ── Размер ─────────────────────────────────────────────────────────────── */
let dpr = 1;
/* Потолок, который опускает адаптация под слабое устройство. Обратно не
 * поднимаем: качать разрешение туда-сюда заметнее, чем просто держать
 * ниже. */
let adaptiveCap = Infinity;

/* Тот же порог, что и в shared/base.css у карусели каста
 * (`@media (max-width: 899.98px)`): 900px — граница между «уже карусель
 * из вёрстки» и «ещё сетка из трёх колонок». Обновляется в resize(), а не
 * читается заново при каждом cull() — cull() дергается каждый кадр цикла,
 * matchMedia/innerWidth там ни к чему. Пересчёт при повороте телефона —
 * через тот же resize(), см. слушатель `resize` внизу файла. */
let narrow = window.innerWidth < 900;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cap = Math.min(w < 700 ? 1.75 : 2, adaptiveCap);
  dpr = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(dpr);
  if (dust) dust.material.uniforms.uDpr.value = dpr;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  veilAspect(w / h);
  narrow = w < 900;
  for (let i = 0; i < wheels.length; i++) fitWheel(wheels[i]);
  fitSheets();
  // Поворот телефона меняет aspect так же, как первая загрузка страницы, —
  // пересчитываем сдвиги aside всех остановок на каждый resize(). curveLook
  // объявлена ниже по файлу, но resize() при загрузке модуля не вызывается
  // ни разу — первый вызов из start(), когда кривая уже есть.
  for (let i = 0; i < BEATS.length; i++) lookOf(BEATS[i], curveLook.points[i]);
  orientSheets();
}

function render() {
  renderer.render(scene, camera);
}

/* ── Маршрут камеры ─────────────────────────────────────────────────────── */
/* Две кривые Catmull-Rom через девять остановок: одна для положения камеры,
 * вторая для точки, на которую она смотрит. Кривые, а не отрезки: по
 * ломаной камера на каждой остановке дёргалась бы изломом. */
const curveCam = new THREE.CatmullRomCurve3(
  BEATS.map(function (b) { return new THREE.Vector3(b.cam[0], b.cam[1], b.cam[2]); })
);
/* Точки взгляда — через lookOf(), не сырые BEATS[i].look: сдвиг aside и его
 * сжатие на узком экране должны попасть в саму кривую, иначе camera.lookAt()
 * при старте поставит камеру верно, а маршрут apply(t) при первом же скролле
 * потянет её к несдвинутой точке. Те же объекты Vector3 перезаписываются в
 * resize() при смене aspect — CatmullRomCurve3 читает points при каждом
 * getPoint(), кэша нет. */
const curveLook = new THREE.CatmullRomCurve3(
  BEATS.map(function (b) { return lookOf(b, new THREE.Vector3()); })
);
const LAST = BEATS.length - 1;

/* Центры секций, а не их верх: секции бывают разной высоты (у «Эпизодов»
 * список растёт), и равномерное деление прогресса по странице развалилось
 * бы при первом же новом ролике. */
let centers = [];

function measure() {
  centers = BEATS.map(function (b) {
    const el = document.getElementById(b.id);
    return el ? el.offsetTop + el.offsetHeight / 2 : 0;
  });
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* Положение на маршруте: целое число — ровно остановка, дробь — перегон. */
function targetT() {
  const scrollMid = window.scrollY + window.innerHeight / 2;
  if (!centers.length || scrollMid <= centers[0]) return 0;
  if (scrollMid >= centers[LAST]) return LAST;
  let i = 0;
  while (i < LAST && scrollMid > centers[i + 1]) i++;
  const span = centers[i + 1] - centers[i];
  const u = span > 0 ? (scrollMid - centers[i]) / span : 0;
  // Камера стоит, пока секция читается, и весь проезд делает на стыке
  // секций (PACE в beats.js) — кадр, доехав до максимума, замирает.
  //
  // Поле pace у остановки задаёт свой темп перегону, который из неё
  // выходит (зачем — в beats.js у «Титула»).
  const pace = BEATS[i].pace || PACE;
  return i + smoothstep(pace.start, pace.end, u);
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

function apply(t) {
  const u = t / LAST;
  curveCam.getPoint(u, camPos);
  curveLook.getPoint(u, camLook);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Туман густеет и редеет вместе с проездом. По прямой, а не по кривой:
  // Catmull-Rom проскакивает за крайние значения, а отрицательная плотность
  // в шейдере даёт не туман, а свечение.
  const i = Math.min(LAST - 1, Math.floor(t));
  const k = t - i;
  uFog.value = BEATS[i].fog + (BEATS[i + 1].fog - BEATS[i].fog) * k;
}

/* ── Цикл ───────────────────────────────────────────────────────────────── */
let position = 0;
let lastTime = 0;
let running = false;

/* Скользящее среднее по 60 кадрам. Один тяжёлый кадр — это сборка мусора
 * или загрузка текстуры, а не слабое железо; реагировать надо на серию. */
let samples = 0;
let elapsed = 0;

/* Кадр, который туман погасил полностью, не должен доходить до шейдера:
 * discard по альфе всё равно прогоняет фрагмент по всей площади плоскости.
 * Кадров всего десять, выигрыш небольшой, но на телефоне он в заполнении
 * экрана, а не в числе объектов.
 *
 * Порог считается от текущей плотности тумана, а не фиксированной дистанцией.
 * Фиксированная отсекала бы кадры, которые на разреженном тумане «Читателей»
 * обязаны быть видны: альфа = exp(−k²d²), и порог 0.02 даёт d = 1.98/k —
 * 44 единицы при плотности 0.045 и 99 при 0.020. Одно число обслуживало бы
 * только одну остановку. */
const camVec = new THREE.Vector3();
const worldVec = new THREE.Vector3();

function cull() {
  camVec.copy(camera.position);
  const limit = 1.98 / uFog.value;
  for (let i = 0; i < group.children.length; i++) {
    const mesh = group.children[i];
    // На узком экране каст живёт в вёрстке (карусель из base.css, фото
    // внутри карточки) — эти три меша в сцене гасим целиком, иначе портрет
    // виден и в карточке, и в пространстве одновременно. См. CAST_IDS.
    if (narrow && mesh.userData.cast) { mesh.visible = false; continue; }
    mesh.visible = mesh.position.distanceTo(camVec) < limit;
  }
  // Колесо живёт только около своей остановки. Без этого колесо кадров —
  // оно стоит в 23 единицах и всего в 3.5° от оси взгляда финала — висело бы
  // позади роликов, а колесо роликов так же лезло бы в «Читателей» при
  // возврате вверх. Одного тумана мало: на финале он разрежен до 0.030
  // ради самих роликов, и порог отсечения уходит за 60 единиц.
  for (let n = 0; n < wheels.length; n++) {
    const w = wheels[n];
    const near = Math.abs(position - w.beatIndex) < WHEEL_REACH;
    w.group.updateMatrixWorld();
    for (let i = 0; i < w.group.children.length; i++) {
      const c = w.group.children[i];
      if (!near) { c.visible = false; continue; }
      // Прореживание: на узком экране колесо показывает каждую every-ю
      // копию (см. RING.narrow в beats.js).
      if (w.every > 1 && c.userData.index % w.every) { c.visible = false; continue; }
      c.getWorldPosition(worldVec);
      c.visible = worldVec.distanceTo(camVec) < limit;
    }
  }
  // Листки — по тому же правилу, что колёса: они у самой стены «Автора», и
  // на проезде к «Следующей книге» камера проходит мимо них боком.
  // Появились снова — очередь с начала: читатель доехал до «Автора» и
  // должен увидеть первый листок с заголовком, а не третье четверостишие.
  const showSheets = !SHEETS.off && sheets.ready
    && Math.abs(position - sheetsBeat) < WHEEL_REACH
    && sheets.group.position.distanceTo(camVec) < limit;
  if (showSheets && !sheets.group.visible) sheets.reset();
  sheets.group.visible = showSheets;
}

function budget(dt) {
  elapsed += dt * 1000;
  samples++;
  if (samples < 60) return;
  const avg = elapsed / samples;
  samples = 0;
  elapsed = 0;
  if (avg > 22 && dpr > 1) {
    adaptiveCap = Math.max(1, dpr - 0.25);
    resize();
  }
}

function frame(now) {
  if (!running || !alive) return;
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  budget(dt);

  // Экспоненциальное сглаживание: колесо мыши даёт скачки по сто пикселей,
  // камера не должна их повторять.
  const target = targetT();
  position += (target - position) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - position) < 0.0002) position = target;

  apply(position);
  if (dust) dust.material.uniforms.uTime.value = now / 1000;
  veilTime(now / 1000, position);
  updateFocus();
  if (focusMesh !== lastFocus) {
    lastFocus = focusMesh;
    // Взяли ролик — остальные встают; отпустили — играют снова. Звук
    // переезжает вместе со взятой копией.
    syncReelPlayback();
    applySound();
  }
  updateWheels(dt);
  updateSheets(dt);
  updateReel();
  cull();
  render();
  requestAnimationFrame(frame);
}

/* ── Запуск ─────────────────────────────────────────────────────────────── */
/* Без движения: камера переставляется на ближайшую остановку и сцена
 * рисуется один раз. Никакого непрерывного цикла. */
let staticBeat = -1;
let staticQueued = false;

function settle() {
  staticQueued = false;
  const beat = Math.round(targetT());
  if (beat === staticBeat) return;
  staticBeat = beat;
  // Без движения позиция на маршруте не пересчитывается циклом — ставим её
  // руками, иначе cull() сочтёт, что до остановки колеса далеко.
  position = beat;
  apply(beat);
  updateWheels(0);
  updateSheets(0);
  cull();
  render();
}

function onStaticScroll() {
  if (staticQueued) return;
  staticQueued = true;
  requestAnimationFrame(settle);
}

/* Тихий цикл: prefers-reduced-motion.
 *
 * Выключено самое «укачивающее» — проезд камеры: она по-прежнему просто
 * переставляется на ближайшую остановку при прокрутке (settle), без
 * сглаживания и без промежуточных кадров. Пыль тоже стоит: её время не
 * трогаем.
 *
 * А колесо, книга и видео живут. Причина не в трактовке стандарта, а в том,
 * что без них страница на телефоне с этой настройкой разваливается: кадры
 * замирают колонкой друг под другом, и читатель видит ленту фотографий
 * вместо карусели (автор поймал это на своём айфоне). Движение здесь
 * мелкое, на одном месте и не связано с прокруткой.
 *
 * Вуаль тоже живёт — по той же причине и с той же оговоркой. Сначала она
 * здесь стояла: движение на весь экран выглядело ровно тем, что этой
 * настройкой просят убрать. Но на айфоне автора настройка включена, и
 * вместо вуали он видел неподвижную картинку — то есть ради читателя,
 * которого мы бережём, мы ломали страницу всем остальным.
 *
 * Разделено по существу: колыхание ткани — медленное (полный размах
 * 25-40 секунд), малоконтрастное и само по себе, оно остаётся. А вот
 * сдвиг планов привязан к прокрутке — именно такое движение и укачивает,
 * и здесь его нет: veilTime получает сдвиг 0, и слои стоят друг над
 * другом. */
function quietFrame(now) {
  if (!running || !alive) return;
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  updateFocus();
  if (focusMesh !== lastFocus) {
    lastFocus = focusMesh;
    syncReelPlayback();
    applySound();
  }
  updateWheels(dt);
  updateSheets(dt);
  updateReel();
  // Второй аргумент — сдвиг планов от прокрутки; здесь его нет намеренно.
  veilTime(now / 1000, 0);
  cull();
  render();
  requestAnimationFrame(quietFrame);
}

function start() {
  measure();
  resize();
  if (reduced.matches) {
    settle();
    window.addEventListener('scroll', onStaticScroll, { passive: true });
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(quietFrame);
    return;
  }
  position = targetT();
  apply(position);
  render();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

document.documentElement.classList.add('scene-on');
buildGlow();
if (!reduced.matches) buildDust(window.innerWidth < 700 ? 250 : 600);
buildFrames();
buildReel();
start();

/* Страховка на поздние сдвиги вёрстки: шрифты, подгрузка, смена ориентации.
 * Основной пересчёт центров идёт в buildFrames, по факту скрытия каждого
 * кадра, — сюда событие load почти всегда приходит слишком рано. */
window.addEventListener('load', measure);

/* Скрытая вкладка не должна греть телефон. Проверки «сцена в кадре» нет:
 * canvas растянут на весь экран и виден всегда, пока видна страница. */
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    running = false;
    syncReelPlayback();
    return;
  }
  if (!reduced.matches && !running) {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }
  syncReelPlayback();
});

window.addEventListener('resize', function () {
  resize();
  measure();
  if (!running) { staticBeat = -1; settle(); }
});
