export type Obstacle = { x: number; z: number; rx: number; rz: number; shape?: 'ellipse' | 'box'; height?: number };
export const WORLD_EDGE = 145;
export const EYE_HEIGHT = 1.85;
export const SPAWN = { x: 18, z: 116, yaw: 0.15, pitch: 0.24 };
export function groundHeight(x:number,z:number) {
  if(Math.abs(Math.abs(z)-143)<1.6&&Math.abs(x)<130)return .17;
  if(Math.abs(x)>140||Math.abs(z)>140)return -.02;
  for(const cx of [-96,0,96])for(const cz of [-90,0,90])
    if(Math.abs(x-cx)<(cx===0?36.5:35)&&Math.abs(z-cz)<(cz===0?36.5:30))return .125;
  return .04;
}
export function isWalkable(x: number, z: number, obstacles: Obstacle[], radius = 0.34) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WORLD_EDGE || Math.abs(z) > WORLD_EDGE) return false;
  return !obstacles.some(o => o.shape === 'box'
    ? Math.abs(x - o.x) < o.rx + radius && Math.abs(z - o.z) < o.rz + radius
    : ((x - o.x) / (o.rx + radius)) ** 2 + ((z - o.z) / (o.rz + radius)) ** 2 < 1);
}
export function moveWithCollisions(x: number, z: number, dx: number, dz: number, obstacles: Obstacle[]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let i = 0; i < steps; i++) {
    if (isWalkable(x + dx / steps, z, obstacles)) x += dx / steps;
    if (isWalkable(x, z + dz / steps, obstacles)) z += dz / steps;
  }
  return { x, z };
}
export function movementVector(forward: number, right: number, yaw: number, speed: number, dt: number) {
  const n = Math.max(1, Math.hypot(forward, right));
  return { dx: (right * Math.cos(yaw) - forward * Math.sin(yaw)) / n * speed * dt,
    dz: (-right * Math.sin(yaw) - forward * Math.cos(yaw)) / n * speed * dt };
}
