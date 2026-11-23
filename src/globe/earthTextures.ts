import * as THREE from 'three';
import { NIGHT_LIGHT_CLUSTERS, WORLD_POLYGONS } from './worldLandData.ts';

function lonToX(lon: number, width: number): number {
  return ((lon + 180) / 360) * width;
}

function latToY(lat: number, height: number): number {
  return ((90 - lat) / 180) * height;
}

function traceLandPolygons(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  for (const poly of WORLD_POLYGONS) {
    if (poly.length < 3) continue;
    const pts = poly.map(([lon, lat]) => [
      lonToX(lon, width),
      latToY(lat, height),
    ]);
    const last = pts[pts.length - 1];
    const first = pts[0];
    ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % pts.length];
      const midX = (curr[0] + next[0]) / 2;
      const midY = (curr[1] + next[1]) / 2;
      ctx.quadraticCurveTo(curr[0], curr[1], midX, midY);
    }
    ctx.closePath();
  }
}

export interface EarthTexturePair {
  dayMap: THREE.CanvasTexture;
  nightMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createEarthTextures(maxAnisotropy: number): EarthTexturePair {
  const width = 2048;
  const height = 1024;

  // --- DAY TEXTURE ---
  const dayCanvas = document.createElement('canvas');
  dayCanvas.width = width;
  dayCanvas.height = height;
  const dCtx = dayCanvas.getContext('2d')!;

  // Ocean bathymetry gradient
  const oceanGrad = dCtx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#9fc7e8');
  oceanGrad.addColorStop(0.14, '#2f6a9e');
  oceanGrad.addColorStop(0.5, '#1d5284');
  oceanGrad.addColorStop(0.86, '#2f6a9e');
  oceanGrad.addColorStop(1, '#a9cde8');
  dCtx.fillStyle = oceanGrad;
  dCtx.fillRect(0, 0, width, height);

  // Subtle lat/lon cartographic grid lines on ocean
  dCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  dCtx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = lonToX(lon, width);
    dCtx.beginPath();
    dCtx.moveTo(x, 0);
    dCtx.lineTo(x, height);
    dCtx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = latToY(lat, height);
    dCtx.beginPath();
    dCtx.moveTo(0, y);
    dCtx.lineTo(width, y);
    dCtx.stroke();
  }

  // Soft coastal shallow shelf halo
  dCtx.save();
  traceLandPolygons(dCtx, width, height);
  dCtx.strokeStyle = 'rgba(104, 186, 214, 0.35)';
  dCtx.lineWidth = 12;
  dCtx.lineJoin = 'round';
  dCtx.stroke();
  dCtx.restore();

  // Landmasses clipped with biome gradient
  dCtx.save();
  traceLandPolygons(dCtx, width, height);
  dCtx.clip();

  const landGrad = dCtx.createLinearGradient(0, 0, 0, height);
  landGrad.addColorStop(0, '#eef4f8'); // Arctic snow
  landGrad.addColorStop(0.18, '#6e8c67'); // Boreal forest
  landGrad.addColorStop(0.35, '#8fa66a'); // Temperate
  landGrad.addColorStop(0.45, '#c8b683'); // Subtropical / desert belt
  landGrad.addColorStop(0.54, '#5a8f58'); // Equatorial lush green
  landGrad.addColorStop(0.68, '#b9a675'); // Southern savanna
  landGrad.addColorStop(0.84, '#7d926c');
  landGrad.addColorStop(0.9, '#edf3f7'); // Antarctica
  dCtx.fillStyle = landGrad;
  dCtx.fillRect(0, 0, width, height);

  // Soft radial organic terrain variation (no hard circle edges)
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 420; i++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = 24 + rand() * 75;
    const g = dCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col =
      rand() > 0.5 ? 'rgba(42, 78, 45, 0.16)' : 'rgba(222, 208, 168, 0.16)';
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    dCtx.fillStyle = g;
    dCtx.beginPath();
    dCtx.arc(cx, cy, r, 0, Math.PI * 2);
    dCtx.fill();
  }
  dCtx.restore();

  // Crisp subtle coastline edge
  dCtx.save();
  traceLandPolygons(dCtx, width, height);
  dCtx.strokeStyle = 'rgba(235, 245, 250, 0.42)';
  dCtx.lineWidth = 1.6;
  dCtx.stroke();
  dCtx.restore();

  // Subtle wispy clouds
  for (let i = 0; i < 120; i++) {
    const cx = rand() * width;
    const cy = (0.12 + rand() * 0.76) * height;
    const rx = 35 + rand() * 90;
    const ry = 8 + rand() * 18;
    const grad = dCtx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    dCtx.fillStyle = grad;
    dCtx.beginPath();
    dCtx.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
    dCtx.fill();
  }

  // --- NIGHT TEXTURE ---
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = width;
  nightCanvas.height = height;
  const nCtx = nightCanvas.getContext('2d')!;

  // Deep midnight ocean
  const nightOcean = nCtx.createLinearGradient(0, 0, 0, height);
  nightOcean.addColorStop(0, '#091124');
  nightOcean.addColorStop(0.5, '#070c1a');
  nightOcean.addColorStop(1, '#091124');
  nCtx.fillStyle = nightOcean;
  nCtx.fillRect(0, 0, width, height);

  // Subtle graticule in night mode
  nCtx.strokeStyle = 'rgba(120, 155, 215, 0.05)';
  nCtx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = lonToX(lon, width);
    nCtx.beginPath();
    nCtx.moveTo(x, 0);
    nCtx.lineTo(x, height);
    nCtx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = latToY(lat, height);
    nCtx.beginPath();
    nCtx.moveTo(0, y);
    nCtx.lineTo(width, y);
    nCtx.stroke();
  }

  // Dark slate landmasses with subtle coastline rim
  nCtx.save();
  traceLandPolygons(nCtx, width, height);
  nCtx.fillStyle = '#111a2e';
  nCtx.fill();
  nCtx.strokeStyle = 'rgba(105, 148, 224, 0.28)';
  nCtx.lineWidth = 1.6;
  nCtx.stroke();
  nCtx.restore();

  // Ambient city lights clipped to landmasses
  nCtx.save();
  traceLandPolygons(nCtx, width, height);
  nCtx.clip();

  for (const [lon, lat, strength] of NIGHT_LIGHT_CLUSTERS) {
    const x = lonToX(lon, width);
    const y = latToY(lat, height);
    const haloR = 16 + strength * 22;
    const g = nCtx.createRadialGradient(x, y, 0.5, x, y, haloR);
    g.addColorStop(0, `rgba(255, 218, 145, ${0.42 * strength})`);
    g.addColorStop(0.35, `rgba(245, 165, 70, ${0.18 * strength})`);
    g.addColorStop(1, 'rgba(245, 165, 70, 0)');
    nCtx.fillStyle = g;
    nCtx.beginPath();
    nCtx.arc(x, y, haloR, 0, Math.PI * 2);
    nCtx.fill();

    // Scattered micro-town dots around major metro
    const dots = Math.floor(8 + strength * 14);
    for (let d = 0; d < dots; d++) {
      const ang = rand() * Math.PI * 2;
      const dist = rand() * haloR * 0.72;
      const dx = x + Math.cos(ang) * dist;
      const dy = y + Math.sin(ang) * dist;
      const r = 0.8 + rand() * 1.4;
      nCtx.fillStyle = `rgba(255, 225, 160, ${0.25 + rand() * 0.45})`;
      nCtx.beginPath();
      nCtx.arc(dx, dy, r, 0, Math.PI * 2);
      nCtx.fill();
    }
  }
  nCtx.restore();

  const dayMap = new THREE.CanvasTexture(dayCanvas);
  dayMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.anisotropy = maxAnisotropy;
  dayMap.needsUpdate = true;

  const nightMap = new THREE.CanvasTexture(nightCanvas);
  nightMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.anisotropy = maxAnisotropy;
  nightMap.needsUpdate = true;

  return {
    dayMap,
    nightMap,
    dispose: () => {
      dayMap.dispose();
      nightMap.dispose();
    },
  };
}
