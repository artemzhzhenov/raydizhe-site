/* Стихи в воздухе — прямо над общей сценой сайта, без подложки.
 *
 * Один полноэкранный прозрачный проход: вне букв холст пуст, и под ним
 * видна та же тёплая стена и та же вуаль, что на всём сайте. Буквы
 * проступают светом по строкам (порядок — канал B текстуры набора), свет
 * находит их неровно, как и на шёлке.
 *
 * Свет сдержанный: не неон, а слова, поймавшие свет. Контраст держит не
 * плашка, а едва заметная тёплая тень вокруг самих букв (канал G — их
 * ореол): сцена под текстом бывает светлее, и без тени строка тонет.
 *
 * Внимание читателя выравнивает яркость букв — читать становится легче.
 * Отсюда же лепестки берут, где сейчас проступает строка (front). */

const FRAG = `
  uniform sampler2D uText;
  uniform vec4 uRect;
  uniform float uProgress;
  uniform float uInkFade;
  uniform float uCalm;
  uniform float uTime;
  uniform float uShow;
  uniform float uTemp;
  uniform float uShade;
  uniform vec3 uInk;
  uniform vec3 uGlow;
  uniform vec3 uShadow;
  varying vec2 vUv;

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
    order += (noise(tuv * vec2(38.0, 26.0) + uTime * 0.05) - 0.5) * 0.07;
    float reveal = smoothstep(order, order + 0.34, uProgress) * uInkFade;
    float glyph = clamp(mix(min(halo * 1.6, 1.0), ink, reveal) * reveal, 0.0, 1.0);
    float bleed = halo * reveal;

    // Буква — свет; складки нет, так что свет чуть дышит сам.
    float breath = 0.94 + 0.06 * sin(uTime * 0.35 + tuv.x * 3.0);
    float inkLight = mix(breath, 1.0, uCalm);
    vec3 letter = uInk * inkLight + uGlow * uTemp * 0.10;

    // Тень вокруг букв и тёплый отсвет в ней: контраст без плашки.
    float shade = bleed * uShade;
    vec3 around = mix(uShadow, uGlow * uTemp * 0.55, clamp(bleed * 0.5, 0.0, 1.0));

    float a = clamp(glyph + shade * (1.0 - glyph), 0.0, 1.0);
    vec3 col = mix(around, letter, a > 0.0 ? glyph / a : 0.0);
    gl_FragColor = vec4(col, a * uShow);
  }
`;

function rgb(THREE, hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export function createAirRender(THREE, renderer, cfg, env) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 3.0);
  const A = cfg.air;
  const uniforms = {
    uText: { value: null },
    uRect: { value: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } },
    uProgress: { value: 0 }, uInkFade: { value: 0 }, uCalm: { value: 0 }, uTime: { value: 0 },
    uShow: { value: 0 }, uTemp: { value: 1 }, uShade: { value: A.shade },
    uInk: { value: rgb(THREE, A.ink) },
    uGlow: { value: rgb(THREE, A.glow) },
    uShadow: { value: rgb(THREE, A.shadow) }
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG, uniforms: uniforms, transparent: true, depthTest: false, depthWrite: false
  }));
  quad.frustumCulled = false;
  scene.add(quad);

  const state = { rect: null, vis: { w: 1, h: 1 }, text: null };

  function resize(w, h, text, index) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const narrow = camera.aspect < 1;
    const L = narrow ? cfg.layout.narrow : cfg.layout.wide;
    const place = (narrow ? cfg.layout.narrowPlaces : cfg.layout.places)[index] || { x: 0, y: 0 };
    const visH = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
    const visW = visH * camera.aspect;
    state.vis = { w: visW, h: visH };
    const TW = text.canvas.width, TH = text.canvas.height;
    let textW = visW * L.textW;
    const textH = textW * text.blockH / text.blockW;
    if (textH > visH * L.textMaxH) textW *= visH * L.textMaxH / textH;
    const texW = textW * TW / text.blockW;
    const texH = texW * TH / TW;
    const cx = 0.5 + place.x - (text.cx - 0.5) * texW / visW;
    const cy = 0.5 + place.y - (text.cy - 0.5) * texH / visH;
    const r = uniforms.uRect.value;
    r.x = cx; r.y = cy; r.z = texW / visW; r.w = texH / visH;
    state.rect = { x: cx, y: cy, w: r.z, h: r.w };
    state.text = text;
  }

  function setTexture(tex) { uniforms.uText.value = tex; }

  function set(v) {
    uniforms.uTime.value = v.time;
    uniforms.uCalm.value = v.calm;
    uniforms.uProgress.value = v.progress;
    uniforms.uInkFade.value = v.inkFade;
    uniforms.uTemp.value = v.temp;
    uniforms.uShow.value = v.veil === undefined ? 1 : v.veil;
  }

  /* Где сейчас проступает строка — для лепестков, в долях кадра. */
  function front(progress) {
    const text = state.text, r = state.rect;
    if (!text || !r) return null;
    const bands = text.bands, TW = text.canvas.width, TH = text.canvas.height;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (progress >= b.from && progress <= b.to) {
        const u = (progress - b.from) / Math.max(1e-6, b.to - b.from);
        const x = b.x0 + (b.x1 - b.x0) * u;
        return { x: r.x + (x / TW - 0.5) * r.w, y: r.y - (b.base / TH - 0.5) * r.h, u: u };
      }
    }
    return null;
  }

  function render() { renderer.render(scene, camera); }
  return { resize: resize, setTexture: setTexture, set: set, render: render, uniforms: uniforms, camera: camera, scene: scene, front: front, state: state };
}
