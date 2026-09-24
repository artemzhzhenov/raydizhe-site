/* Лепестки роз пылью (режим silkPetals).
 *
 * Лепестков много, и они мелкие: не стайка, а лёгкая метель. Их несёт
 * медленный вихрь, то тише, то порывом. Каждый падает, переворачивается в
 * воздухе и в конце пути растворяется: край осыпается, как в «Красавице и
 * чудовище», и на месте осыпи на миг теплеет свет. Потом рождается новый.
 *
 * Только красный лепесток с фотографии от автора (атлас
 * petals.png, клетка 0). Когда свет находит строку, часть лепестков
 * тянется к ней — как в режиме petals, но легче.
 *
 * Считается на процессоре: пара сотен точек — дешевле любой симуляции. */

const VERT = `
  attribute vec3 aSeed;     // x — размер, y — фаза, z — скорость переворота
  attribute float aKind;
  attribute float aLife;
  uniform float uSize;
  uniform float uTime;
  varying float vKind;
  varying float vLife;
  varying float vRot;
  varying float vFlip;
  varying float vSeed;
  void main() {
    vKind = aKind;
    vLife = aLife;
    vSeed = aSeed.y;
    vRot = aSeed.y * 6.283 + uTime * (0.25 + 0.45 * aSeed.z) * (aSeed.y > 0.5 ? 1.0 : -1.0);
    // Переворот: лепесток то встаёт ребром, то ложится плашмя.
    vFlip = cos(uTime * (0.6 + 1.1 * aSeed.z) + aSeed.y * 12.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (0.40 + 0.60 * aSeed.x);
  }
`;

const FRAG = `
  uniform sampler2D uMap;
  uniform vec2 uGrid;
  uniform float uReady;
  uniform float uDim;
  uniform float uShow;
  varying float vKind;
  varying float vLife;
  varying float vRot;
  varying float vFlip;
  varying float vSeed;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vRot), co = cos(vRot);
    c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
    // Ребром лепесток сжат по ширине — так читается объём, а не наклейка.
    float squash = max(0.14, abs(vFlip));
    c.x /= squash;
    vec2 r = c + 0.5;
    if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) discard;
    vec2 uv = vec2(r.x, 1.0 - r.y);
    vec2 cell = vec2(mod(vKind, uGrid.x), uGrid.y - 1.0 - floor(vKind / uGrid.x));
    vec4 t = texture2D(uMap, (uv + cell) / uGrid);
    if (t.a < 0.02) discard;

    /* Растворение: осыпается от края внутрь, неровно. Поле эрозии — шум
     * плюс расстояние от середины; порог растёт к концу жизни. */
    float dis = smoothstep(0.62, 1.0, vLife);
    float e = noise(r * 7.0 + vSeed * 31.0) * 0.62 + (1.0 - length(r - 0.5) * 1.7) * 0.38;
    if (e < dis * 1.05) discard;
    // На кромке осыпи — короткая тёплая искра, сдержанно.
    float rim = (1.0 - smoothstep(dis * 1.05, dis * 1.05 + 0.07, e)) * step(0.001, dis);

    vec3 col = t.rgb * uDim;
    // Изнанка чуть темнее: лепесток перевернулся.
    col *= vFlip < 0.0 ? 0.78 : 1.0;
    col = mix(col, vec3(1.0, 0.78, 0.55), rim * 0.55);
    float fadeIn = smoothstep(0.0, 0.08, vLife);
    gl_FragColor = vec4(col, t.a * fadeIn * uReady * uShow);
  }
`;

export function createRoseDust(THREE, field, cfg, env) {
  const D = cfg.petals.dust;
  const N = env.tier === 'phone' ? D.countPhone : (env.tier === 'tablet' ? D.countTablet : D.count);
  const kinds = D.kinds;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(N), 1));
  geo.setAttribute('aLife', new THREE.Float32BufferAttribute(new Float32Array(N), 1));
  const posA = geo.attributes.position.array;
  const seedA = geo.attributes.aSeed.array;
  const kindA = geo.attributes.aKind.array;
  const lifeA = geo.attributes.aLife.array;

  const tex = new THREE.Texture(document.createElement('canvas'));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uMap: { value: tex }, uSize: { value: 30 }, uTime: { value: 0 },
      uGrid: { value: new THREE.Vector2(cfg.petals.atlas.cols, cfg.petals.atlas.rows) },
      uReady: { value: 0 }, uDim: { value: cfg.petals.atlas.dim }, uShow: { value: 1 }
    },
    transparent: true, depthTest: false, depthWrite: false
  });
  const img = new Image();
  img.onload = function () {
    tex.image = img;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    mat.uniforms.uReady.value = 1;
  };
  img.src = cfg.petals.atlas.src;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  field.scene.add(points);

  /* Рождение: чаще сверху и с наветренной стороны (слева), иногда прямо в
   * кадре — чтобы метель не выглядела конвейером. */
  const P = [];
  function spawn(p, anywhere) {
    const r = Math.random();
    if (anywhere || r < 0.25) { p.x = Math.random() - 0.5; p.y = Math.random() * 1.0 - 0.4; }
    else if (r < 0.70) { p.x = Math.random() * 1.1 - 0.6; p.y = 0.55 + Math.random() * 0.1; }
    else { p.x = -0.6 - Math.random() * 0.05; p.y = Math.random() * 0.9 - 0.2; }
    p.vx = 0; p.vy = 0;
    p.life = anywhere ? Math.random() * 0.8 : 0;
    p.dur = D.life[0] + Math.random() * (D.life[1] - D.life[0]);
    p.chases = Math.random() < D.chase;
    p.ox = (Math.random() - 0.5) * 0.30; p.oy = (Math.random() - 0.5) * 0.10;
  }
  for (let i = 0; i < N; i++) {
    const p = {};
    spawn(p, true);
    P.push(p);
    seedA[i * 3] = Math.pow(Math.random(), 1.6);   // мелких больше, чем крупных
    seedA[i * 3 + 1] = Math.random();
    seedA[i * 3 + 2] = Math.random();
    kindA[i] = kinds[Math.floor(Math.random() * kinds.length)];
  }
  geo.attributes.aSeed.needsUpdate = true;
  geo.attributes.aKind.needsUpdate = true;

  const slow = env.reduced ? cfg.reduced.speed : 1;

  function update(dt, v) {
    dt *= slow;
    const t = v.time;
    mat.uniforms.uTime.value = t;
    mat.uniforms.uShow.value = v.petals === undefined ? 1 : v.petals;
    const vis = field.state.vis;
    const f = (v.phase === 'emerge') ? field.front(v.progress) : null;
    // Порыв: ветер то стихает, то поднимается — медленно, раз в ~20 секунд.
    const gust = 1 + D.gust * Math.pow(0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1.1), 2);
    // Внимание читателя: метель стихает, чтобы не мешать читать.
    const calm = 1 - 0.55 * v.calm;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      /* Вихрь: несколько медленных волн поверх ровного сноса слева направо
       * и падения. Лепесток догоняет поток с запаздыванием — это и есть
       * лёгкость. */
      const wx = (D.drift + 0.05 * Math.sin(p.y * 5.3 + t * 0.29) + 0.035 * Math.sin(p.x * 7.1 - t * 0.21 + i)) * gust * calm;
      const wy = (-D.fall + 0.045 * Math.cos(p.x * 6.2 + t * 0.26) + 0.02 * Math.sin(t * 0.9 + i * 2.3)) * calm;
      let tx = wx, ty = wy;
      if (f && p.chases) {
        tx += (f.x - 0.5 + p.ox - p.x) * 0.55;
        ty += (f.y - 0.5 + p.oy - p.y) * 0.55;
      }
      const k = 1 - Math.exp(-dt / 0.9);
      p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life += dt / p.dur;
      if (p.life >= 1 || p.y < -0.62 || p.x > 0.65) spawn(p, false);
      posA[i * 3] = p.x * vis.w; posA[i * 3 + 1] = p.y * vis.h; posA[i * 3 + 2] = 0.05;
      lifeA[i] = p.life;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;
  }

  function resize(w, h) {
    // На узком экране строка мельче — и лепесток меньше, иначе он закрывает слово.
    mat.uniforms.uSize.value = D.size * (env.tier === 'phone' ? D.phoneScale : 1) * h * Math.min(devicePixelRatio || 1, 2);
  }

  return { update: update, resize: resize };
}
