import * as THREE from 'three';
import { computeDaySkyBlend, createSeededRandom } from './daySkyMath.ts';

export interface DaySkyHandle {
  group: THREE.Group;
  update: (elapsedSec: number, dt: number, nightMix: number) => void;
  dispose: () => void;
}

const MOTE_PALETTE: Array<[number, number, number]> = [
  [1.0, 0.92, 0.7], // Warm sunlit gold
  [1.0, 0.98, 0.91], // Soft ivory sunlight
  [0.88, 0.95, 1.0], // Crisp sky glint
  [1.0, 0.89, 0.78], // Gentle peach warmth
];

/**
 * Creates the atmospheric Daytime sky ensemble:
 * 1) Zenith-to-horizon gradient sky dome with soft sun glow & procedural drifting cirrus clouds
 * 2) Parallax drifting soft cloud wisps in outer sky space
 * 3) Subtle floating sunlit bokeh particles / light motes
 */
export function createDaySky(options: {
  pixelRatio: number;
  initialNightMix: number;
  sunDir: THREE.Vector3;
  reducedMotion: boolean;
  softwareGl: boolean;
}): DaySkyHandle {
  const group = new THREE.Group();
  const initialBlend = computeDaySkyBlend(options.initialNightMix);
  group.visible = initialBlend.visible;

  const sunDirNorm = options.sunDir.clone().normalize();
  const motionAmp = options.reducedMotion ? 0.0 : 1.0;

  // ---------------------------------------------------------------------------
  // 1. Atmospheric Sky Dome (gradient + sun halo + procedural drifting cirrus)
  // ---------------------------------------------------------------------------
  const domeGeom = new THREE.SphereGeometry(
    62,
    options.softwareGl ? 32 : 48,
    options.softwareGl ? 20 : 32,
  );
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDayAlpha: { value: initialBlend.skyAlpha },
      uSunDir: { value: sunDirNorm },
      uMotionAmp: { value: motionAmp },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uDayAlpha;
      uniform vec3 uSunDir;
      uniform float uMotionAmp;
      varying vec3 vWorldDir;

      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise3D(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(
            mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
            f.y
          ),
          mix(
            mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
            f.y
          ),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.52;
        for (int i = 0; i < 3; i++) {
          v += a * noise3D(p);
          p = p * 2.07 + vec3(13.1, 7.4, 5.7);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        if (uDayAlpha <= 0.005) discard;

        vec3 dir = normalize(vWorldDir);
        float y = dir.y;

        // Vertical atmospheric gradient (rich cerulean zenith -> luminous pastel horizon -> cool lower sky)
        vec3 zenithCol = vec3(0.28, 0.56, 0.89);
        vec3 midSkyCol = vec3(0.56, 0.77, 0.95);
        vec3 horizonCol = vec3(0.84, 0.91, 0.98);
        vec3 nadirCol = vec3(0.50, 0.69, 0.88);

        float upperMix = smoothstep(0.0, 0.78, max(0.0, y));
        float lowerMix = smoothstep(0.0, 0.72, max(0.0, -y));
        vec3 sky = mix(horizonCol, midSkyCol, smoothstep(0.0, 0.32, abs(y)));
        sky = mix(sky, zenithCol, upperMix * 0.92);
        sky = mix(sky, nadirCol, lowerMix * 0.82);

        // Atmospheric scattering & soft sun halo aligned with globe key light (uSunDir)
        float sunCos = max(0.0, dot(dir, normalize(uSunDir)));
        float broadGlow = pow(sunCos, 1.8) * 0.28;
        float sunHalo = pow(sunCos, 14.0) * 0.48;
        float sunCore = smoothstep(0.994, 0.9995, sunCos) * 0.85;
        vec3 warmSunTint = vec3(1.0, 0.93, 0.80);
        sky = mix(sky, warmSunTint, clamp(broadGlow + sunHalo, 0.0, 0.62));
        sky += vec3(1.0, 0.97, 0.88) * sunCore;

        // Subtle warm atmospheric horizon band
        float horizonBand = exp(-y * y * 8.5);
        sky += vec3(0.10, 0.08, 0.05) * horizonBand * (0.40 + 0.60 * sunCos);

        // Soft drifting cirrus / cumulus bands in 3D spherical coordinates (no pole seams)
        float drift = uTime * 0.018 * uMotionAmp;
        vec3 cloudCoord = dir * vec3(2.6, 4.2, 2.6) + vec3(drift, drift * 0.2, -drift * 0.6);
        float c1 = fbm(cloudCoord);
        float c2 = fbm(cloudCoord * 1.9 + vec3(4.2, -1.3, 2.9) + vec3(drift * 0.55, 0.0, 0.0));
        float cloudDensity = smoothstep(0.46, 0.74, c1 * 0.68 + c2 * 0.38);

        // Gently emphasize clouds across mid-sky & horizon bands
        float cloudBelt = 0.52 + 0.48 * exp(-pow((y - 0.06) * 2.0, 2.0));
        cloudDensity *= cloudBelt * 0.74;

        vec3 cloudLit = mix(vec3(0.96, 0.98, 1.0), vec3(1.0, 0.97, 0.91), pow(sunCos, 1.4));
        sky = mix(sky, cloudLit, cloudDensity);

        gl_FragColor = vec4(sky, uDayAlpha);
      }
    `,
  });
  const domeMesh = new THREE.Mesh(domeGeom, domeMat);
  domeMesh.renderOrder = -10;
  domeMesh.frustumCulled = false;
  group.add(domeMesh);

  // ---------------------------------------------------------------------------
  // 2. Parallax Drifting Soft Cloud Wisps (outer shell behind markers & globe)
  // ---------------------------------------------------------------------------
  const wispCount = options.softwareGl ? 65 : 110;
  const wispPos = new Float32Array(wispCount * 3);
  const wispSizes = new Float32Array(wispCount);
  const wispAlphas = new Float32Array(wispCount);
  const wispPhases = new Float32Array(wispCount);

  const rand = createSeededRandom(8317);
  const tmp = new THREE.Vector3();

  for (let i = 0; i < wispCount; i++) {
    const r = 24 + rand() * 18;
    const theta = rand() * Math.PI * 2;
    // Favor gentle mid-latitude & equatorial cloud belts around the planet
    const yBias = (rand() + rand() - 1.0) * 0.78;
    const horiz = Math.sqrt(Math.max(0.05, 1 - yBias * yBias));
    tmp.set(r * horiz * Math.cos(theta), r * yBias, r * horiz * Math.sin(theta));

    wispPos[i * 3] = tmp.x;
    wispPos[i * 3 + 1] = tmp.y;
    wispPos[i * 3 + 2] = tmp.z;

    wispSizes[i] = 120 + rand() * 155;
    wispAlphas[i] = 0.09 + rand() * 0.11;
    wispPhases[i] = rand() * Math.PI * 2;
  }

  const wispGeom = new THREE.BufferGeometry();
  wispGeom.setAttribute('position', new THREE.BufferAttribute(wispPos, 3));
  wispGeom.setAttribute('aSize', new THREE.BufferAttribute(wispSizes, 1));
  wispGeom.setAttribute('aAlpha', new THREE.BufferAttribute(wispAlphas, 1));
  wispGeom.setAttribute('aPhase', new THREE.BufferAttribute(wispPhases, 1));

  const wispMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: options.pixelRatio },
      uDayAlpha: { value: initialBlend.skyAlpha },
      uMotionAmp: { value: motionAmp },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uMotionAmp;

      varying float vAlpha;
      varying float vPhase;

      void main() {
        vAlpha = aAlpha;
        vPhase = aPhase;

        vec3 pos = position;
        float sway = sin(uTime * 0.08 + aPhase) * 0.9 * uMotionAmp;
        pos.y += sway * 0.45;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * uPixelRatio * (26.0 / max(10.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uDayAlpha;
      varying float vAlpha;
      varying float vPhase;

      void main() {
        if (uDayAlpha <= 0.005) discard;
        vec2 uv = gl_PointCoord - vec2(0.5);
        // Slightly elongated soft cloud puff aspect
        vec2 stretched = vec2(uv.x * 1.4, uv.y * 2.1);
        float d = length(stretched);
        if (d > 1.0) discard;

        float puff = exp(-d * d * 3.2) * smoothstep(1.0, 0.12, d);
        vec3 col = mix(vec3(0.96, 0.98, 1.0), vec3(1.0, 0.97, 0.93), 0.5 + 0.5 * sin(vPhase));
        gl_FragColor = vec4(col, puff * vAlpha * uDayAlpha);
      }
    `,
  });

  const cloudWisps = new THREE.Points(wispGeom, wispMat);
  cloudWisps.renderOrder = -6;
  cloudWisps.frustumCulled = false;
  group.add(cloudWisps);

  // ---------------------------------------------------------------------------
  // 3. Floating Sunlit Bokeh / Light Motes (serene daytime particle depth)
  // ---------------------------------------------------------------------------
  const moteCount = options.softwareGl ? 180 : 320;
  const motePos = new Float32Array(moteCount * 3);
  const moteCol = new Float32Array(moteCount * 3);
  const moteSize = new Float32Array(moteCount);
  const moteAlpha = new Float32Array(moteCount);
  const motePhase = new Float32Array(moteCount);
  const moteSpeed = new Float32Array(moteCount);

  for (let i = 0; i < moteCount; i++) {
    // Distributed from mid-field (r=6) to deep sky (r=22) so nothing clips the globe (r=1) or camera (r<=4.9)
    const r = 6.0 + rand() * 16.0;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);

    motePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    motePos[i * 3 + 1] = r * Math.cos(phi);
    motePos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const roll = rand();
    const idx = roll < 0.35 ? 0 : roll < 0.72 ? 1 : roll < 0.9 ? 2 : 3;
    const [cr, cg, cb] = MOTE_PALETTE[idx];
    moteCol[i * 3] = cr;
    moteCol[i * 3 + 1] = cg;
    moteCol[i * 3 + 2] = cb;

    const bokeh = Math.pow(rand(), 1.7);
    moteSize[i] = 8.5 + bokeh * 20.0;
    moteAlpha[i] = 0.25 + rand() * 0.28;
    motePhase[i] = rand() * Math.PI * 2;
    moteSpeed[i] = 0.22 + rand() * 0.45;
  }

  const moteGeom = new THREE.BufferGeometry();
  moteGeom.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeom.setAttribute('aColor', new THREE.BufferAttribute(moteCol, 3));
  moteGeom.setAttribute('aSize', new THREE.BufferAttribute(moteSize, 1));
  moteGeom.setAttribute('aAlpha', new THREE.BufferAttribute(moteAlpha, 1));
  moteGeom.setAttribute('aPhase', new THREE.BufferAttribute(motePhase, 1));
  moteGeom.setAttribute('aSpeed', new THREE.BufferAttribute(moteSpeed, 1));

  const moteMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: options.pixelRatio },
      uDayAlpha: { value: initialBlend.skyAlpha },
      uMotionAmp: { value: motionAmp },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;
      attribute float aSpeed;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uMotionAmp;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float driftT = uTime * aSpeed * uMotionAmp;
        vec3 pos = position;
        pos.x += sin(driftT + aPhase) * 0.55 * uMotionAmp;
        pos.y += cos(driftT * 0.72 + aPhase * 1.3) * 0.45 * uMotionAmp;
        pos.z += sin(driftT * 0.53 + aPhase * 0.7) * 0.45 * uMotionAmp;

        float shimmer = 0.78 + 0.22 * sin(uTime * (aSpeed * 1.8) + aPhase) * uMotionAmp;
        vColor = aColor;
        vAlpha = aAlpha * shimmer;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * uPixelRatio * (13.0 / max(4.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uDayAlpha;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        if (uDayAlpha <= 0.005) discard;
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv) * 2.0;
        if (d > 1.0) discard;

        // Soft out-of-focus sunlit bokeh disc with gentle luminous core
        float disc = smoothstep(1.0, 0.18, d);
        float core = exp(-d * d * 3.8) * 0.55;
        float alpha = (disc * 0.65 + core) * vAlpha * uDayAlpha;

        gl_FragColor = vec4(vColor, clamp(alpha, 0.0, 1.0));
      }
    `,
  });

  const sunMotes = new THREE.Points(moteGeom, moteMat);
  sunMotes.renderOrder = -4;
  sunMotes.frustumCulled = false;
  group.add(sunMotes);

  return {
    group,
    update(elapsedSec: number, dt: number, nightMix: number) {
      const blend = computeDaySkyBlend(nightMix);
      group.visible = blend.visible;
      if (!blend.visible) return;

      domeMat.uniforms.uTime.value = elapsedSec;
      domeMat.uniforms.uDayAlpha.value = blend.skyAlpha;

      wispMat.uniforms.uTime.value = elapsedSec;
      wispMat.uniforms.uDayAlpha.value = blend.skyAlpha;

      moteMat.uniforms.uTime.value = elapsedSec;
      moteMat.uniforms.uDayAlpha.value = blend.skyAlpha;

      if (!options.reducedMotion) {
        cloudWisps.rotation.y += dt * 0.0045;
        sunMotes.rotation.y -= dt * 0.0022;
      }
    },
    dispose() {
      domeGeom.dispose();
      domeMat.dispose();
      wispGeom.dispose();
      wispMat.dispose();
      moteGeom.dispose();
      moteMat.dispose();
    },
  };
}
