import * as THREE from 'three';

export interface StarfieldHandle {
  points: THREE.Points;
  update: (elapsedSec: number, dt: number, nightMix: number) => void;
  dispose: () => void;
}

const STAR_PALETTE: Array<[number, number, number]> = [
  [0.68, 0.79, 1.0], // B/A cool blue-white
  [0.82, 0.88, 1.0], // A/F soft blue-white
  [0.97, 0.97, 1.0], // F/G crisp white
  [1.0, 0.96, 0.9], // G warm ivory
  [1.0, 0.88, 0.72], // K warm amber-gold
];

/**
 * Creates a GPU-animated starry night sky particle system with realistic
 * magnitude distribution, spectral colors, a tilted Milky Way band, and
 * subtle scintillation.
 */
export function createStarfield(options: {
  pixelRatio: number;
  initialNightMix: number;
  reducedMotion: boolean;
  softwareGl: boolean;
}): StarfieldHandle {
  const starCount = options.softwareGl ? 1100 : 2100;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const alphas = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const speeds = new Float32Array(starCount);
  const twinkleWeights = new Float32Array(starCount);

  let seed = 4219;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Approximate normal distribution via sum of uniforms for Milky Way band
  const gauss = () => (rand() + rand() + rand() - 1.5) * 0.65;

  // Tilt galactic plane (~28 deg around X, ~18 deg around Z)
  const tiltQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.49, 0.15, 0.31),
  );
  const tmpVec = new THREE.Vector3();

  for (let i = 0; i < starCount; i++) {
    const r = 20 + rand() * 24;
    const isBandStar = i < starCount * 0.36;

    if (isBandStar) {
      const lon = rand() * Math.PI * 2;
      const lat = Math.max(-1.2, Math.min(1.2, gauss() * 0.24));
      tmpVec.set(
        r * Math.cos(lat) * Math.cos(lon),
        r * Math.sin(lat),
        r * Math.cos(lat) * Math.sin(lon),
      );
      tmpVec.applyQuaternion(tiltQuat);
    } else {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      tmpVec.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    }

    positions[i * 3] = tmpVec.x;
    positions[i * 3 + 1] = tmpVec.y;
    positions[i * 3 + 2] = tmpVec.z;

    // Spectral color diversity
    const paletteRoll = rand();
    const colorIdx =
      paletteRoll < 0.14
        ? 0
        : paletteRoll < 0.34
          ? 1
          : paletteRoll < 0.64
            ? 2
            : paletteRoll < 0.86
              ? 3
              : 4;
    const [cr, cg, cb] = STAR_PALETTE[colorIdx];
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;

    // Realistic magnitude curve: abundant faint stars, clear medium stars, few bright stars
    const mag = Math.pow(rand(), 2.6);
    sizes[i] = 1.9 + mag * 5.6;
    alphas[i] = 0.38 + Math.pow(rand(), 1.35) * 0.42 + mag * 0.2;
    phases[i] = rand() * Math.PI * 2;
    speeds[i] = 0.5 + rand() * 1.5;
    // Gentle individual scintillation weight
    twinkleWeights[i] = 0.22 + rand() * 0.28;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute(
    'aTwinkle',
    new THREE.BufferAttribute(twinkleWeights, 1),
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: options.pixelRatio },
      uNightMix: { value: options.initialNightMix },
      uTwinkleAmp: { value: options.reducedMotion ? 0.0 : 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aTwinkle;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uTwinkleAmp;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vSize;

      void main() {
        // Gentle dual-wave scintillation per star
        float waveA = sin(uTime * aSpeed + aPhase);
        float waveB = cos(uTime * (aSpeed * 0.57) + aPhase * 1.63);
        float scint = (waveA * 0.65 + waveB * 0.35) * aTwinkle * uTwinkleAmp;

        vColor = aColor;
        vAlpha = aAlpha * clamp(1.0 + scint, 0.3, 1.35);
        vSize = aSize;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (1.0 + scint * 0.24);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uNightMix;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSize;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv) * 2.0;
        if (d > 1.0) discard;

        // Crisp star core + soft atmospheric bloom for brighter stars
        float core = exp(-d * d * 4.5);
        float halo = exp(-d * d * 1.7) * smoothstep(2.4, 7.2, vSize) * 0.52;
        float nightMask = smoothstep(0.35, 0.95, uNightMix);
        float alpha = (core + halo) * vAlpha * nightMask;

        gl_FragColor = vec4(vColor, clamp(alpha, 0.0, 1.0));
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = options.initialNightMix > 0.35;

  return {
    points,
    update(elapsedSec: number, dt: number, nightMix: number) {
      material.uniforms.uTime.value = elapsedSec;
      material.uniforms.uNightMix.value = nightMix;
      points.visible = nightMix > 0.35;
      if (!options.reducedMotion && points.visible) {
        points.rotation.y += dt * 0.0035;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
