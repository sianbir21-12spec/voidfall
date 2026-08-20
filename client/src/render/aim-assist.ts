import { Vector3 } from 'three';

import type { World } from '../../../shared/sim/world.ts';
import type { SceneManager } from './scene-manager.ts';
import type { InputController } from '../input/input-controller.ts';
import type { ProjectionService } from './projection.ts';
import {
  DEFAULT_BULLET_SPEED,
  DEFAULT_BULLET_TIMER,
} from '../../../shared/sim/entities/bullet.ts';

// The crosshair locks onto a ship when within its on-screen footprint plus this
// margin; the floor keeps tiny/distant ships comfortably selectable.
const LOCK_MARGIN = 16;
const MIN_LOCK_RADIUS = 34;
const LEAD_HOVER_RADIUS = 48;
const BULLET_SPEED = DEFAULT_BULLET_SPEED * 1000;
const BULLET_LIFETIME = DEFAULT_BULLET_TIMER / 1000;

type Velocity = { x: number; y: number; z: number };
type LinvelBody = { linvel(): Velocity };

function interceptTime(
  muzzle: Vector3,
  target: Vector3,
  velocity: Velocity,
): number | null {
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const dz = target.z - muzzle.z;
  const a = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z - BULLET_SPEED * BULLET_SPEED;
  const b = 2 * (dx * velocity.x + dy * velocity.y + dz * velocity.z);
  const c = dx * dx + dy * dy + dz * dz;

  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) ? t : null;
}

// Snap the actual weapon ray to an exact world-space point. Previously the
// assist only changed `aim.distance`, leaving the ray pointed at whichever pixel
// happened to be inside a generous lock circle. At long range a few pixels of
// error become hundreds of world units, so the visible lead circle could be under
// the cursor while the guns fired beside it. Weapon.ts consumes origin + direction
// + distance, so snapping all three makes the projectile converge on this point.
function snapAimToPoint(
  camera: SceneManager['camera'],
  input: InputController['input'],
  point: Vector3,
): void {
  const direction = point.clone().sub(camera.position);
  const distance = direction.length();
  if (distance <= 1e-4) return;
  direction.multiplyScalar(1 / distance);
  input.aim.origin.copy(camera.position);
  input.aim.direction.copy(direction);
  input.aim.distance = distance;
}

export class AimAssistService {
  world: World;
  sceneManager: SceneManager;
  inputController: InputController;
  projection: ProjectionService;
  lastVel: Vector3;
  aimedShipId: number | null;

  constructor(
    world: World,
    sceneManager: SceneManager,
    inputController: InputController,
    projection: ProjectionService,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.inputController = inputController;
    this.projection = projection;
    this.lastVel = new Vector3();
    this.aimedShipId = null;
  }

  update(): void {
    const camera = this.sceneManager.camera;
    const input = this.inputController.input;
    const aim = input.aim;
    this.aimedShipId = null;
    aim.distance = aim.maxDistance;

    const mouseInPixels = {
      x: aim.ndc.x * (window.innerWidth / 2),
      y: aim.ndc.y * (window.innerHeight / 2),
    };

    // The lead marker has priority. Recompute its exact world-space intercept and
    // snap the weapon ray to it rather than merely changing ray distance.
    for (const [id, leadPos] of this.projection.leads) {
      const dx = mouseInPixels.x - leadPos.x;
      const dy = mouseInPixels.y - leadPos.y;
      if (dx * dx + dy * dy >= LEAD_HOVER_RADIUS * LEAD_HOVER_RADIUS) continue;

      const target = this.world.get(id);
      const owner = this.world.get((this.world as World & { localPlayerId?: number }).localPlayerId ?? -1);
      const body = target?.body as unknown as LinvelBody | null;
      if (!target || !owner || !body?.linvel) continue;

      const t = interceptTime(owner.transform.position, target.transform.position, body.linvel());
      if (t === null || t > BULLET_LIFETIME) continue;

      const point = target.transform.position.clone().add(
        new Vector3(body.linvel().x, body.linvel().y, body.linvel().z).multiplyScalar(t),
      );
      snapAimToPoint(camera, input, point);
      this.aimedShipId = id;
      return;
    }

    // Ship-body lock: snap to the ship centre. This removes the old long-range
    // parallax error where any pixel inside the lock circle was accepted but the
    // bullet still followed that off-centre camera ray.
    for (const [id, indicator] of this.projection.indicators) {
      if (!indicator.onscreen) continue;
      const entity = this.world.get(id);
      if (!entity) continue;

      const dx = mouseInPixels.x - indicator.position.x;
      const dy = mouseInPixels.y - indicator.position.y;
      const radius = Math.max(MIN_LOCK_RADIUS, indicator.screenRadius + LOCK_MARGIN);
      if (dx * dx + dy * dy >= radius * radius) continue;

      snapAimToPoint(camera, input, entity.transform.position);
      this.aimedShipId = id;
      return;
    }
  }
}
