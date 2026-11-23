import * as THREE from 'three';

/**
 * Converts geographic latitude/longitude (degrees) to 3D Cartesian coordinates
 * aligned exactly with Three.js SphereGeometry equirectangular UV mapping.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const lambda = ((lon + 180) * Math.PI) / 180;

  const sinPhi = Math.sin(phi);
  target.set(
    -radius * sinPhi * Math.cos(lambda),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(lambda),
  );
  return target;
}
