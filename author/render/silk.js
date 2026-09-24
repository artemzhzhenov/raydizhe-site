/* Рендер шёлка: режимы silk (слова вытканы) и silkLight (слова светом).
 *
 * Почему слова и ткань — одно тело:
 *   1. буквы лежат в UV полотна и гнутся с ним тем же вершинным шейдером;
 *   2. свет букв ложится на складки — ореол умножен на свет по наклону;
 *   3. складка притеняет саму букву; внимание выравнивает — контраст встаёт;
 *   4. рука читателя чуть натягивает ткань рядом и поворачивает к себе
 *      свет — с инерцией, почти незаметно;
 *   5. успокаивается всё разом, одним числом uCalm.
 *
 * В режиме silk буквы не светятся: это нить в ткани, освещённая тем же
 * светом, что и складка, — без ореола. В silkLight буквы — свет.
 *
 * Ламп в срезе three нет: свет считается из наклона складки. */

const VERT = `
  uniform float uTime;
  uniform float uAmp;
  uniform float uCalm;
  uniform float uCalmAmp;
  uniform vec2 uHand;
  uniform float uTouch;
  uniform vec3 uSway;      // x — вбок, y — от стены, z — включено ли
  varying vec2 vUv;
  varying float vSlope;
  varying float vFold;
  void main() {
    vUv = uv;
    vec3 p = position;
    float x = uv.x - 0.5, y = uv.y - 0.5;
    float t = uTime;
    float amp = uAmp * mix(1.0, uCalmAmp, uCalm);
    // Рука: рядом с ней ткань натянута — складка мельче.
    vec2 hd = (uv - uHand) * vec2(2.4, 1.5);
    float near = exp(-dot(hd, hd) * 5.0) * uTouch;
    amp *= 1.0 - 0.55 * near;
    float drape = 0.45 + 0.55 * smoothstep(-0.5, 0.45, -y);
    float breathe = 1.0 + 0.20 * sin(t * 0.19);
    float fan = 1.0 + 0.12 * (0.5 - uv.y);
    float fx = x * fan;
    float a1 = fx * 19.0 + t * 0.11 + y * 0.8;
    float a2 = fx * 31.0 - t * 0.08 + 1.7;
    float a3 = fx * 11.0 + t * 0.06 + 3.1 - y * 1.3;
    float a4 = fx * 50.0 + t * 0.05 + 0.9;
    float folds = (sin(a1) * 0.44 + sin(a2) * 0.26 + sin(a3) * 0.36 + sin(a4) * 0.12) * amp * drape * breathe;
    float aS = x * 2.4 + y * 1.6 + t * 0.14;
    float swell = sin(aS) * amp * 0.9 * drape + sin(y * 3.4 + t * 0.23) * amp * 0.30 * drape;
    p.z += folds + swell;
    /* Штора: подвешена за верх, низ ходит на сквозняке. Две несоизмеримые
     * волны — ход не повторяется. При внимании читателя стихает. */
    float hang = smoothstep(-0.5, 0.5, -y);
    float sw = uSway.z * hang * hang * mix(1.0, 0.30, uCalm);
    p.x += (sin(t * 0.31 + uv.y * 2.0) * 0.65 + sin(t * 0.53 + 1.3 + uv.x * 3.0) * 0.35) * uSway.x * sw;
    p.z += sin(t * 0.27 + uv.x * 2.2 + 0.7) * uSway.y * sw;
    float dz = (cos(a1) * 19.0 * 0.44 + cos(a2) * 31.0 * 0.26 + cos(a3) * 11.0 * 0.36 + cos(a4) * 50.0 * 0.12)
             * amp * drape * breathe * fan
             + cos(aS) * 2.4 * amp * 0.9 * drape;
    vSlope = dz;
    vFold = (folds + swell) / max(amp, 1e-4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = `
  uniform sampler2D uText;
  uniform vec4 uRect;
  uniform float uProgress;
  uniform float uInkFade;
  uniform float uCalm;
  uniform float uTime;
  uniform float uMode;
  uniform vec2 uLight;
  uniform vec2 uPoolR;
  uniform vec3 uDark;
  uniform vec3 uWarm;
  uniform vec3 uSheen;
  uniform vec3 uInk;
  uniform vec3 uGlow;
  uniform float uTemp;
  uniform float uVeil;
  varying vec2 vUv;
  varying float vSlope;
  varying float vFold;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 tuv = clamp((vUv - uRect.xy) / uRect.zw + 0.5, 0.0, 1.0);
    vec3 tx = texture2D(uText, tuv).rgb;
    float ink = tx.r, halo = tx.g, order = tx.b;

    /* Свет находит слова: широкий мягкий фронт по порядку, край фронта
     * неровный — свет, а не загрузка. Буква сначала пятно, потом штрих. */
    order += (noise(tuv * vec2(38.0, 26.0) + uTime * 0.05) - 0.5) * 0.07;
    float reveal = smoothstep(order, order + 0.34, uProgress) * uInkFade;
    float glyph = mix(min(halo * 1.6, 1.0), ink, reveal) * reveal;
    float bleed = halo * reveal;

    float sl = vSlope * 5.0;
    float soft = sl / (1.0 + abs(sl));
    float key = 0.5 + 0.5 * soft;
    float ao = 0.70 + 0.30 * smoothstep(-1.1, 1.1, vFold);
    float sheen = pow(clamp(soft, 0.0, 1.0), 5.0);

    vec2 q = (vUv - uLight) / uPoolR;
    float pool = exp(-dot(q, q) * 1.6);

    float weave = 0.96
      + 0.030 * sin(vUv.x * 2600.0) * sin(vUv.y * 2100.0)
      + 0.035 * hash(floor(vUv * vec2(1100.0, 900.0)));

    vec3 warm = uWarm * uTemp;
    float lit = pool * (0.12 + 0.88 * key) * ao;
    vec3 cloth = mix(uDark, warm, lit) + uSheen * sheen * pool * 0.30 * ao;
    cloth *= weave;

    // silkLight: свет слов ложится на складки. silk: нить не светит.
    float wordLight = bleed * (0.40 + 0.60 * key) * ao;
    cloth += uGlow * uTemp * wordLight * 0.72 * uMode;

    /* silkLight: буква светится сама, складка её притеняет; внимание
     * выравнивает. silk: нить освещена тем же светом, что и ткань. */
    float inkLight = mix(0.76 + 0.34 * key, 1.02, uCalm) * (0.92 + 0.08 * ao);
    vec3 thread = uInk * (0.30 + 0.70 * key) * (0.45 + 0.55 * pool) * ao;
    vec3 letter = mix(thread, uInk * inkLight, uMode);
    // На вытканной нити внимание тоже поднимает контраст, но иначе — светом.
    letter = mix(letter, uInk * (0.55 + 0.45 * key), (1.0 - uMode) * uCalm * 0.6);
    vec3 col = mix(cloth, letter, clamp(glyph, 0.0, 1.0));

    vec2 e = abs(vUv - 0.5) * 2.0;
    float wx = sin(vUv.y * 6.0 + 1.3) * 0.040 + sin(vUv.y * 17.0 + uTime * 0.10) * 0.014;
    float ax = 1.0 - smoothstep(0.955 + wx, 1.0 + wx, e.x);
    float ay = 1.0 - smoothstep(0.96, 1.0, e.y);
    float selvedge = smoothstep(0.90, 0.96, e.x) * (1.0 - smoothstep(0.96, 1.0, e.x));
    col *= 1.0 - selvedge * 0.22;
    gl_FragColor = vec4(col, ax * ay * uVeil);
  }
`;

const BG_FRAG = `
  uniform float uAspect;
  uniform vec2 uCenter;
  uniform float uVeil;
  varying vec2 vUv;
  void main() {
    vec2 p = vec2((vUv.x - uCenter.x) * uAspect, vUv.y - uCenter.y);
    float g = exp(-dot(p, p) * 3.2);
    vec3 col = mix(vec3(0.078, 0.063, 0.051), vec3(0.135, 0.100, 0.072), g);
    gl_FragColor = vec4(col, uVeil);
  }
`;

function rgb(THREE, hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export function createSilkRender(THREE, renderer, cfg, env) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 3.0);

  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BG_FRAG,
    uniforms: { uAspect: { value: 1 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uVeil: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false
  }));
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  const tierAmp = cfg.silk.ampByTier[env.tier] || 1;
  const baseAmp = cfg.silk.amp * tierAmp * (env.reduced ? cfg.reduced.amp : 1);
  const uniforms = {
    uText: { value: null },
    uRect: { value: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } },
    uProgress: { value: 0 },
    uInkFade: { value: 0 },
    uCalm: { value: 0 },
    uTime: { value: 0 },
    uMode: { value: env.mode === 'silk' ? 0 : 1 },
    uAmp: { value: cfg.silk.amp * tierAmp * (env.reduced ? cfg.reduced.amp : 1) },
    uCalmAmp: { value: cfg.silk.calmAmp },
    uHand: { value: new THREE.Vector2(0.5, 0.5) },
    uTouch: { value: 0 },
    uSway: { value: new THREE.Vector3(cfg.silk.sway.x, cfg.silk.sway.z, 1) },
    uTemp: { value: 1 },
    uVeil: { value: 1 },
    uLight: { value: new THREE.Vector2(0.5, 0.55) },
    uPoolR: { value: new THREE.Vector2(0.4, 0.3) },
    uDark: { value: rgb(THREE, 0x1a140f) },
    uWarm: { value: rgb(THREE, 0x6e4d30) },
    uSheen: { value: rgb(THREE, 0xf0cc9a) },
    uInk: { value: rgb(THREE, 0xf4e6cc) },
    uGlow: { value: rgb(THREE, 0xd9a05b) }
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, cfg.segments.x, cfg.segments.y), material);
  panel.rotation.y = cfg.silk.tilt.y;
  panel.rotation.x = cfg.silk.tilt.x;
  scene.add(panel);

  const touch = cfg.silk.touch[env.tier] || 0;
  const follow = cfg.silk.lightFollow[env.tier] || 0;
  const state = { rect: null, sx: 1, sy: 1, vis: { w: 1, h: 1 }, text: null };

  function resize(w, h, text, index) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bg.material.uniforms.uAspect.value = w / h;
    const narrow = camera.aspect < 1;
    const L = narrow ? cfg.layout.narrow : cfg.layout.wide;
    const place = (narrow ? cfg.layout.narrowPlaces : cfg.layout.places)[index] || { x: 0, y: 0 };
    const visH = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
    const visW = visH * camera.aspect;
    const TW = text.canvas.width, TH = text.canvas.height;
    let textW = visW * L.textW;
    const textH = textW * text.blockH / text.blockW;
    if (textH > visH * L.textMaxH) textW *= visH * L.textMaxH / textH;
    const texW = textW * TW / text.blockW;
    const texH = texW * TH / TW;
    const panelW = Math.max(visW * L.panelW, texW * 1.15);
    const panelH = Math.max(visH * L.panelH, texH * 1.6);
    panel.scale.set(panelW, panelH, panelH);
    state.sx = visW / panelW; state.sy = visH / panelH;
    state.vis = { w: visW, h: visH };
    state.text = text;
    const cx = 0.5 + place.x * state.sx - (text.cx - 0.5) * texW / panelW;
    const cy = 0.5 + place.y * state.sy - (text.cy - 0.5) * texH / panelH;
    const r = uniforms.uRect.value;
    r.x = cx; r.y = cy; r.z = texW / panelW; r.w = texH / panelH;
    state.rect = { x: cx, y: cy, w: r.z, h: r.w };
    uniforms.uPoolR.value.set(r.z * 1.05, r.w * 1.35);
    bg.material.uniforms.uCenter.value.set(0.5 + place.x, 0.5 + place.y);
  }

  function setTexture(tex) { uniforms.uText.value = tex; }

  function set(v) {
    uniforms.uTime.value = v.time;
    uniforms.uCalm.value = v.calm;
    uniforms.uProgress.value = v.progress;
    uniforms.uInkFade.value = v.inkFade;
    uniforms.uTemp.value = v.temp;
    /* Шёлк проступает из вуали: пока он редкий, он и колышется сильнее —
     * ткань ещё не собралась. */
    const veil = v.veil === undefined ? 1 : v.veil;
    uniforms.uVeil.value = veil;
    bg.material.uniforms.uVeil.value = veil;
    uniforms.uAmp.value = baseAmp * (1 + (cfg.silk.gatherAmp - 1) * (1 - veil));
    // Прокрутка ведёт вдоль полотна: оно чуть уезжает вверх.
    panel.position.y = -v.scroll * cfg.layout.scrollShift * (state.rect ? state.sy : 1) * panel.scale.y;
    if (state.rect) {
      const t = v.time;
      const hx = 0.5 + v.hand.x * state.sx, hy = 0.5 + v.hand.y * state.sy;
      uniforms.uHand.value.set(hx, hy);
      uniforms.uTouch.value = touch * v.hand.on;
      const lx = state.rect.x - state.rect.w * 0.06 + Math.sin(t * 0.083) * state.rect.w * 0.05;
      const ly = state.rect.y + state.rect.h * 0.10 + Math.sin(t * 0.061 + 1.3) * state.rect.h * 0.05;
      const f = follow * v.hand.on;
      uniforms.uLight.value.set(lx + (hx - lx) * f, ly + (hy - ly) * f);
    }
  }

  /* Где сейчас фронт проступания — для лепестков: точка в долях кадра.
   * Наклон полотна не учитываем: лепесткам хватает и так. */
  function front(progress) {
    const text = state.text, r = state.rect;
    if (!text || !r) return null;
    const bands = text.bands, TW = text.canvas.width, TH = text.canvas.height;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (progress >= b.from && progress <= b.to) {
        const u = (progress - b.from) / Math.max(1e-6, b.to - b.from);
        const x = b.x0 + (b.x1 - b.x0) * u;
        const pu = r.x + (x / TW - 0.5) * r.w, pv = r.y - (b.base / TH - 0.5) * r.h;
        return { x: 0.5 + (pu - 0.5) / state.sx, y: 0.5 + (pv - 0.5) / state.sy, u: u };
      }
    }
    return null;
  }

  function render() { renderer.render(scene, camera); }
  return { resize: resize, setTexture: setTexture, set: set, render: render, uniforms: uniforms, camera: camera, scene: scene, front: front, state: state };
}
