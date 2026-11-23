import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useI18n } from '../i18n/I18nContext.tsx';
import { createEarthTextures } from '../globe/earthTextures.ts';
import { createDaySky } from '../globe/daySky.ts';
import { latLonToVector3 } from '../globe/latLonMath.ts';
import { createStarfield } from '../globe/starfield.ts';
import { markerIntensity } from '../shared/presenceLogic.ts';
import type { CityPresence, GlobeTheme } from '../shared/types.ts';

const MAX_MARKERS = 2048;
const GLOBE_RADIUS = 1.0;
const MARKER_RADIUS = 1.012;
const DEFAULT_CAMERA_DIST = 3.05;
const FOCUS_CAMERA_DIST = 2.05;

export interface HoveredMarkerInfo {
  city: CityPresence;
  x: number;
  y: number;
}

interface MarkerAnimState {
  city: CityPresence;
  pos: THREE.Vector3;
  opacity: number;
  targetOpacity: number;
  intensity: number;
  targetIntensity: number;
  pulse: number;
}

interface GlobeCanvasProps {
  theme: GlobeTheme;
  cities: CityPresence[];
  userCityKey: string | null;
  selectedCity: CityPresence | null;
  focusRequest: { city: CityPresence; nonce: number } | null;
  resetViewNonce: number;
  pulsedCityKeys: string[];
  interactive: boolean;
  onSelectCity: (city: CityPresence | null) => void;
  onHoverCity: (info: HoveredMarkerInfo | null) => void;
  onReady?: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function GlobeCanvas({
  theme,
  cities,
  userCityKey,
  selectedCity,
  focusRequest,
  resetViewNonce,
  pulsedCityKeys,
  interactive,
  onSelectCity,
  onHoverCity,
  onReady,
}: GlobeCanvasProps) {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  // Store reactive props in refs so WebGL scene mounts once
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const selectedCityRef = useRef(selectedCity);
  selectedCityRef.current = selectedCity;

  const userCityKeyRef = useRef(userCityKey);
  userCityKeyRef.current = userCityKey;

  const onSelectRef = useRef(onSelectCity);
  onSelectRef.current = onSelectCity;

  const onHoverRef = useRef(onHoverCity);
  onHoverRef.current = onHoverCity;

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const markerMapRef = useRef(new Map<string, MarkerAnimState>());
  const flyTargetRef = useRef<{ dir: THREE.Vector3; dist: number } | null>(
    null,
  );
  const userInteractingRef = useRef(false);
  const lastInteractionTimeRef = useRef(0);

  // Sync incoming cities list into smoothly animated marker map without rebuilding geometry
  useEffect(() => {
    const map = markerMapRef.current;
    const activeKeys = new Set<string>();
    const pulseSet = new Set(pulsedCityKeys);

    for (const city of cities) {
      if (city.lat === null || city.lon === null) continue;
      activeKeys.add(city.key);
      const existing = map.get(city.key);
      const targetInt = markerIntensity(city.n, 12);
      if (existing) {
        existing.city = city;
        existing.targetOpacity = 1;
        existing.targetIntensity = targetInt;
        if (pulseSet.has(city.key)) {
          existing.pulse = 1;
        }
      } else {
        const pos = latLonToVector3(city.lat, city.lon, MARKER_RADIUS);
        map.set(city.key, {
          city,
          pos,
          opacity: 0,
          targetOpacity: 1,
          intensity: targetInt,
          targetIntensity: targetInt,
          pulse: 1,
        });
      }
    }

    for (const [key, entry] of map.entries()) {
      if (!activeKeys.has(key)) {
        entry.targetOpacity = 0;
      }
    }
  }, [cities, pulsedCityKeys]);

  // Handle explicit focus city request (from click or accessible cities list)
  useEffect(() => {
    if (!focusRequest) return;
    const { lat, lon } = focusRequest.city;
    if (lat === null || lon === null) return;
    const dir = latLonToVector3(lat, lon, 1).normalize();
    flyTargetRef.current = { dir, dist: FOCUS_CAMERA_DIST };
  }, [focusRequest]);

  // Handle reset to global planet view
  useEffect(() => {
    if (resetViewNonce === 0) return;
    flyTargetRef.current = {
      dir: new THREE.Vector3(0.35, 0.25, 0.9).normalize(),
      dist: DEFAULT_CAMERA_DIST,
    };
  }, [resetViewNonce]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglUnavailable(true);
      onReadyRef.current?.();
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored,
    );

    const scene = new THREE.Scene();
    const nightBg = new THREE.Color('#060913');
    const dayBg = new THREE.Color('#c8ddf0');
    const bgColor = (themeRef.current === 'night' ? nightBg : dayBg).clone();
    scene.background = bgColor;

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.set(1.05, 0.72, 2.78).setLength(DEFAULT_CAMERA_DIST);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 1.48;
    controls.maxDistance = 4.9;
    controls.autoRotate = false;

    controls.addEventListener('start', () => {
      userInteractingRef.current = true;
      lastInteractionTimeRef.current = performance.now();
      flyTargetRef.current = null;
    });
    controls.addEventListener('end', () => {
      userInteractingRef.current = false;
      lastInteractionTimeRef.current = performance.now();
    });

    // Procedural Day & Night Earth Textures
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createEarthTextures(maxAniso);

    // Earth Globe with smooth Day/Night GLSL crossfade & Fresnel rim
    const earthGeom = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48);
    const initialNightMix = themeRef.current === 'night' ? 1.0 : 0.0;
    const sunDir = new THREE.Vector3(0.92, 0.38, -0.05).normalize();
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDayMap: { value: textures.dayMap },
        uNightMap: { value: textures.nightMap },
        uNightMix: { value: initialNightMix },
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;
        void main() {
          vUv = uv;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDayMap;
        uniform sampler2D uNightMap;
        uniform float uNightMix;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;

        void main() {
          vec3 dayCol = texture2D(uDayMap, vUv).rgb;
          vec3 nightCol = texture2D(uNightMap, vUv).rgb;

          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(cameraPosition - vPosWorld);

          // Soft sunlight shading for day sphere volume
          float ndl = dot(N, normalize(uSunDir));
          float dayLight = 0.52 + 0.55 * smoothstep(-0.35, 0.85, ndl);
          vec3 dayLit = dayCol * dayLight;

          // Subtle twilight rim on night side
          float nightShade = 0.85 + 0.25 * max(0.0, dot(N, V));
          vec3 nightLit = nightCol * nightShade;

          vec3 base = mix(dayLit, nightLit, uNightMix);

          // Atmospheric limb Fresnel
          float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.2);
          vec3 dayRim = vec3(0.55, 0.78, 1.0);
          vec3 nightRim = vec3(0.18, 0.36, 0.72);
          vec3 rimCol = mix(dayRim, nightRim, uNightMix);
          base += rimCol * fresnel * mix(0.45, 0.38, uNightMix);

          gl_FragColor = vec4(base, 1.0);
        }
      `,
    });
    const earthMesh = new THREE.Mesh(earthGeom, earthMat);
    scene.add(earthMesh);

    // Outer Atmospheric Halo (smooth edge fade to zero)
    const atmosGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.12, 48, 36);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uNightMix: { value: initialNightMix },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;
        void main() {
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uNightMix;
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;
        void main() {
          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(cameraPosition - vPosWorld);
          // BackSide normal points away from camera on limb; dot(N, -V) approaches 0 at outer silhouette
          float edge = clamp(dot(N, -V), 0.0, 1.0);
          float rim = pow(edge, 3.6) * smoothstep(0.0, 0.35, edge);
          vec3 dayHalo = vec3(0.32, 0.64, 0.98);
          vec3 nightHalo = vec3(0.15, 0.35, 0.78);
          vec3 col = mix(dayHalo, nightHalo, uNightMix);
          gl_FragColor = vec4(col, rim * mix(0.45, 0.55, uNightMix));
        }
      `,
    });
    const atmosMesh = new THREE.Mesh(atmosGeom, atmosMat);
    scene.add(atmosMesh);

    // Dynamic Atmospheric Day Sky (gradient dome + sun glow + clouds + sunlit bokeh)
    const daySky = createDaySky({
      pixelRatio: renderer.getPixelRatio(),
      initialNightMix,
      sunDir,
      reducedMotion: Boolean(prefersReducedMotion),
      softwareGl: isSoftwareGl,
    });
    scene.add(daySky.group);

    // Dynamic Twinkling Starry Night Sky (active & fading smoothly in Night mode)
    const starfield = createStarfield({
      pixelRatio: renderer.getPixelRatio(),
      initialNightMix,
      reducedMotion: Boolean(prefersReducedMotion),
      softwareGl: isSoftwareGl,
    });
    scene.add(starfield.points);

    // Single-Geometry Presence Markers (pre-allocated capacity, updated via attributes)
    const markerPositions = new Float32Array(MAX_MARKERS * 3);
    const markerIntensities = new Float32Array(MAX_MARKERS);
    const markerOpacities = new Float32Array(MAX_MARKERS);
    const markerPulses = new Float32Array(MAX_MARKERS);

    const markerGeom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(markerPositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const intAttr = new THREE.BufferAttribute(markerIntensities, 1);
    intAttr.setUsage(THREE.DynamicDrawUsage);
    const opAttr = new THREE.BufferAttribute(markerOpacities, 1);
    opAttr.setUsage(THREE.DynamicDrawUsage);
    const pulseAttr = new THREE.BufferAttribute(markerPulses, 1);
    pulseAttr.setUsage(THREE.DynamicDrawUsage);

    markerGeom.setAttribute('position', posAttr);
    markerGeom.setAttribute('aIntensity', intAttr);
    markerGeom.setAttribute('aOpacity', opAttr);
    markerGeom.setAttribute('aPulse', pulseAttr);
    markerGeom.setDrawRange(0, 0);

    const markerMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: renderer.getPixelRatio() },
        uNightMix: { value: initialNightMix },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      vertexShader: `
        attribute float aIntensity;
        attribute float aOpacity;
        attribute float aPulse;
        uniform float uPixelRatio;
        varying float vIntensity;
        varying float vOpacity;
        varying float vPulse;

        void main() {
          vIntensity = aIntensity;
          vOpacity = aOpacity;
          vPulse = aPulse;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float baseSize = mix(18.0, 48.0, aIntensity) + aPulse * 14.0;
          gl_PointSize = baseSize * uPixelRatio * (2.6 / max(0.8, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uNightMix;
        varying float vIntensity;
        varying float vOpacity;
        varying float vPulse;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv) * 2.0;
          if (d > 1.0) discard;

          // Soft glowing outer halo + crisp bright core
          float halo = exp(-d * d * 4.2) * (0.45 + 0.55 * vIntensity);
          float core = smoothstep(0.32, 0.06, d);

          // Night: warm amber-gold glow; Day: saturated amber-coral beacon
          vec3 nightGlow = vec3(0.98, 0.65, 0.16);
          vec3 nightCore = vec3(1.0, 0.94, 0.72);
          vec3 dayGlow = vec3(0.92, 0.40, 0.08);
          vec3 dayCore = vec3(1.0, 0.96, 0.85);

          vec3 glowCol = mix(dayGlow, nightGlow, uNightMix);
          vec3 coreCol = mix(dayCore, nightCore, uNightMix);

          // Expanding pulse ring when someone joins
          float pulseRing = smoothstep(0.18, 0.0, abs(d - (0.35 + (1.0 - vPulse) * 0.55))) * vPulse * 0.7;

          vec3 col = mix(glowCol, coreCol, core) + glowCol * pulseRing;
          float alpha = clamp(halo * mix(0.72, 0.95, uNightMix) + core * 0.95 + pulseRing, 0.0, 1.0) * vOpacity;

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const markerPoints = new THREE.Points(markerGeom, markerMat);
    markerPoints.frustumCulled = false;
    scene.add(markerPoints);

    // Selection / User City subtle ring
    const ringGeom = new THREE.RingGeometry(0.017, 0.022, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const selectionRing = new THREE.Mesh(ringGeom, ringMat);
    selectionRing.visible = false;
    scene.add(selectionRing);

    // Scratch helpers (zero GC inside animation loop)
    const _vec3A = new THREE.Vector3();
    const _vec3B = new THREE.Vector3();
    const _camDir = new THREE.Vector3();
    const _proj = new THREE.Vector3();
    const _normal = new THREE.Vector3();

    // Pointer hover & click detection on visible markers
    let pointerDownPos: { x: number; y: number } | null = null;
    let lastHoverCheck = 0;

    function pickMarkerAt(clientX: number, clientY: number): HoveredMarkerInfo | null {
      if (!interactiveRef.current) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      _camDir.copy(camera.position).normalize();
      let bestDistSq = 22 * 22; // 22px generous touch/click radius
      let bestInfo: HoveredMarkerInfo | null = null;

      for (const entry of markerMapRef.current.values()) {
        if (entry.opacity < 0.15) continue;
        // Back-face cull: only markers facing the camera
        _normal.copy(entry.pos).normalize();
        if (_normal.dot(_camDir) < 0.08) continue;

        _proj.copy(entry.pos).project(camera);
        const sx = ((_proj.x + 1) / 2) * rect.width;
        const sy = ((-_proj.y + 1) / 2) * rect.height;
        const dx = sx - px;
        const dy = sy - py;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestInfo = { city: entry.city, x: sx, y: sy };
        }
      }
      return bestInfo;
    }

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 45) return;
      lastHoverCheck = now;
      const hit = pickMarkerAt(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      onHoverRef.current(hit);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (dx * dx + dy * dy > 36) return; // Was a drag, not a click

      const hit = pickMarkerAt(e.clientX, e.clientY);
      if (hit) {
        onSelectRef.current(hit.city);
        if (hit.city.lat !== null && hit.city.lon !== null) {
          const dir = latLonToVector3(hit.city.lat, hit.city.lon, 1).normalize();
          flyTargetRef.current = { dir, dist: FOCUS_CAMERA_DIST };
        }
      } else if (selectedCityRef.current) {
        onSelectRef.current(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Resize handling
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Notify parent once first scene setup completes
    onReadyRef.current?.();

    let frameId = 0;
    let disposed = false;
    let isHidden = document.hidden;
    let lastTime = performance.now();
    let currentNightMix = initialNightMix;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed || isHidden) return;

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // 1. Day/Night crossfade damping & dynamic Day/Night sky ensembles
      const targetNight = themeRef.current === 'night' ? 1.0 : 0.0;
      currentNightMix = THREE.MathUtils.damp(currentNightMix, targetNight, 4.5, dt);
      earthMat.uniforms.uNightMix.value = currentNightMix;
      atmosMat.uniforms.uNightMix.value = currentNightMix;
      markerMat.uniforms.uNightMix.value = currentNightMix;
      daySky.update(now / 1000, dt, currentNightMix);
      starfield.update(now / 1000, dt, currentNightMix);
      bgColor.copy(dayBg).lerp(nightBg, currentNightMix);
      scene.background = bgColor;

      // 2. Smooth camera fly-to or gentle idle auto-rotation
      if (flyTargetRef.current) {
        const { dir, dist } = flyTargetRef.current;
        _vec3A.copy(camera.position).normalize();
        _vec3B.copy(dir);
        _vec3A.lerp(_vec3B, 1 - Math.exp(-5.0 * dt)).normalize();
        const curDist = camera.position.length();
        const nextDist = THREE.MathUtils.damp(curDist, dist, 5.0, dt);
        camera.position.copy(_vec3A).multiplyScalar(nextDist);
        if (
          _vec3A.distanceTo(_vec3B) < 0.008 &&
          Math.abs(nextDist - dist) < 0.015
        ) {
          flyTargetRef.current = null;
        }
      } else if (
        !prefersReducedMotion &&
        !userInteractingRef.current &&
        !selectedCityRef.current &&
        now - lastInteractionTimeRef.current > 2500
      ) {
        // Slow planetary rotation around Y axis
        const rotAngle = dt * 0.045;
        const cosA = Math.cos(rotAngle);
        const sinA = Math.sin(rotAngle);
        const cx = camera.position.x;
        const cz = camera.position.z;
        camera.position.x = cx * cosA - cz * sinA;
        camera.position.z = cx * sinA + cz * cosA;
      }

      controls.update();

      // 3. Update single-geometry marker attributes smoothly (fade in/out, pulse decay)
      let count = 0;
      const map = markerMapRef.current;
      for (const [key, entry] of map.entries()) {
        const fadeSpeed = prefersReducedMotion ? 100 : 7.5;
        entry.opacity = THREE.MathUtils.damp(
          entry.opacity,
          entry.targetOpacity,
          fadeSpeed,
          dt,
        );
        entry.intensity = THREE.MathUtils.damp(
          entry.intensity,
          entry.targetIntensity,
          6.0,
          dt,
        );
        if (entry.pulse > 0.001 && !prefersReducedMotion) {
          entry.pulse = Math.max(0, entry.pulse - dt * 1.1);
        } else {
          entry.pulse = 0;
        }

        if (entry.targetOpacity === 0 && entry.opacity < 0.02) {
          map.delete(key);
          continue;
        }

        if (count < MAX_MARKERS) {
          markerPositions[count * 3] = entry.pos.x;
          markerPositions[count * 3 + 1] = entry.pos.y;
          markerPositions[count * 3 + 2] = entry.pos.z;
          markerIntensities[count] = entry.intensity;
          markerOpacities[count] = entry.opacity;
          markerPulses[count] = entry.pulse;
          count += 1;
        }
      }

      posAttr.needsUpdate = true;
      intAttr.needsUpdate = true;
      opAttr.needsUpdate = true;
      pulseAttr.needsUpdate = true;
      markerGeom.setDrawRange(0, count);

      // 4. Position selection or user city indicator ring
      const highlightKey = selectedCityRef.current?.key ?? userCityKeyRef.current;
      const highlightEntry = highlightKey ? map.get(highlightKey) : undefined;
      if (highlightEntry && highlightEntry.opacity > 0.1) {
        selectionRing.visible = true;
        _normal.copy(highlightEntry.pos).normalize();
        selectionRing.position.copy(_normal).multiplyScalar(MARKER_RADIUS + 0.004);
        selectionRing.lookAt(_normal.clone().multiplyScalar(2));
        ringMat.color.setHex(
          themeRef.current === 'night' ? 0xfde68a : 0xc2410c,
        );
        ringMat.opacity = highlightEntry.opacity * 0.85;
      } else {
        selectionRing.visible = false;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    const handleVisibilityChange = () => {
      isHidden = document.hidden;
      if (!isHidden && !disposed) {
        lastTime = performance.now();
        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (isSoftwareGl) {
      // Draw initial frame promptly, then pace via afterDraw
      frameId = requestAnimationFrame(() => tick());
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost,
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored,
      );
      controls.dispose();
      earthGeom.dispose();
      earthMat.dispose();
      atmosGeom.dispose();
      atmosMat.dispose();
      daySky.dispose();
      starfield.dispose();
      markerGeom.dispose();
      markerMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      textures.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className="relative w-full h-full"
      data-testid="globe-canvas-container"
      aria-label={t.globe.ariaLabel}
    >
      <div ref={mountRef} className="w-full h-full" />
      {webglUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#091124] text-slate-200 p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="font-display text-xl font-semibold">
              {t.appName}
            </p>
            <p className="text-sm text-slate-300">
              {t.globe.webglUnavailable}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
