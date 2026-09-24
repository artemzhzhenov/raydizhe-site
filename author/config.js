/* Настройки стихов на остановке «Автор». Все числа здесь.
 *
 * Слой живёт поверх сцены d-room только около «Автора»: сначала в воздухе
 * появляются лепестки роз, потом строфы проступают светом прямо в воздухе,
 * над общим фоном сайта, — по строфе на экран прокрутки. После последней
 * строфа гаснет, и страница едет дальше.
 *
 * Шёлк (render/silk.js и блок silk ниже) в этой сборке не используется:
 * автор решил убрать подложку. Модуль оставлен — вернуть можно одной
 * строкой в stage.js.
 *
 * Ярусы: desktop — полная версия; tablet — тише ход ткани и меньше
 * чувствительность; phone — без наведения, ход ткани ещё тише. */
export const CONFIG = {
  dpr: { desktop: 2, tablet: 1.75, phone: 1.75 },
  segments: { x: 128, y: 96 },

  silk: {
    amp: 0.020,
    calmAmp: 0.36,
    speed: 1.0,
    tilt: { y: -0.085, x: 0.022 },
    /* Штора на сквозняке: низ полотна ходит вбок и от стены, верх стоит. */
    sway: { x: 0.030, z: 0.045 },
    touch: { desktop: 0.45, tablet: 0.25, phone: 0.0 },
    lightFollow: { desktop: 0.12, tablet: 0.06, phone: 0.0 },
    ampByTier: { desktop: 1.0, tablet: 0.72, phone: 0.62 },
    /* Пока шёлк только сгущается из вуали, он колышется сильнее и потом
     * успокаивается: во столько раз больше ход складок в самом начале. */
    gatherAmp: 2.4
  },

  layout: {
    wide:   { textW: 0.46, textMaxH: 0.50, panelW: 0.66, panelH: 1.55 },
    narrow: { textW: 0.88, textMaxH: 0.46, panelW: 1.35, panelH: 1.55 },
    places: [
      { x: -0.055, y: 0.045 },
      { x: 0.060, y: -0.020 },
      { x: -0.040, y: 0.010 },
      { x: 0.000, y: 0.030 }
    ],
    narrowPlaces: [
      { x: 0.0, y: 0.06 }, { x: 0.0, y: -0.02 }, { x: 0.0, y: 0.03 }, { x: 0.0, y: 0.04 }
    ],
    scrollShift: 0.0
  },

  /* Свет теплеет от строфы к строфе: рассвет → утро. */
  passages: [
    { warm: 0.94 }, { warm: 1.00 }, { warm: 1.06 }, { warm: 1.12 }
  ],

  /* На сайте строфу листает прокрутка, а не таймер: дописанная строфа
   * стоит, пока читатель на её экране. */
  rhythm: {
    emerge: 7.0, hold: 7.0, holdPerLine: 1.7, release: 4.6,
    dark: 0.6, darkAfterLast: 1.2, skipRelease: 1.3, reducedFade: 2.4,
    auto: false
  },

  attention: {
    riseTau: 0.55, fallTau: 1.9, hoverIdle: 10.0, scrollHold: 1.6,
    tapMs: 380, tapPx: 9,
    pointerTau: { desktop: 0.9, tablet: 1.2, phone: 1.2 }
  },

  /* Появление слоя по прокрутке, в долях высоты экрана.
   *   petalsIn — за сколько до середины «Автора» начинают лететь лепестки;
   *   silkFrom — с какой доли пути «Автор → первая строфа» шёлк проступает
   *             (до неё только сгущается вуаль сайта);
   *   leave    — за сколько экрана после последней строфы шёлк уходит. */
  /* thicken — сгущать ли вуаль сайта перед стихами (0 — нет, как решил
   * автор: фон единый по всему сайту; 1 — как было с шёлком). */
  reveal: { petalsIn: 0.55, silkFrom: 0.35, leave: 0.60, thicken: 0 },

  /* Стихи в воздухе: цвет букв, их тёплый отсвет и тень вокруг букв
   * (shade — сила тени; держит контраст на светлых местах сцены). */
  air: { ink: 0xf4e6cc, glow: 0xd9a05b, shadow: 0x0d0906, shade: 0.55 },

  petals: {
    atlas: { src: new URL('petals.png', import.meta.url).href, cols: 4, rows: 2, count: 7, dim: 0.78 },
    /* Красные лепестки роз пылью: только красный (клетка 0) — так решил
     * автор. size — доля высоты кадра для самого крупного; life — секунды
     * жизни; drift/fall — снос и падение, доли кадра в секунду; gust — сила
     * порыва; chase — доля лепестков, что тянутся к строке. */
    dust: { kinds: [0], count: 120, countTablet: 90, countPhone: 56,
            size: 0.040, phoneScale: 0.75, life: [9, 16], drift: 0.035, fall: 0.030, gust: 1.2, chase: 0.22 }
  },

  reduced: { amp: 0.42, speed: 0.55 }
};

export function tierOf() {
  const w = innerWidth;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (w < 900) return 'phone';
  if (coarse || w < 1200) return 'tablet';
  return 'desktop';
}
