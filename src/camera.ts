import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Invert } from './math/mat4';

export interface CameraFrame {
  invViewProj: Float32Array;
  viewProj: Float32Array;
  eye: [number, number, number];
}

export interface OrbitCameraOptions {
  shouldOrbit?: (e: PointerEvent) => boolean;
}

export interface OrbitCamera {
  setSceneBounds(boxHalfExtentWorld: number, cloudHeightWorld: number): void;
  setLookAt(eye: readonly [number, number, number], lookTarget: readonly [number, number, number]): void;
  getTarget(): [number, number, number];
  update(deltaSeconds: number): void;
  computeFrame(aspect: number): CameraFrame;
}

const MOVE_SPEED_PER_DIST = 1.0;
const VERT_SPEED_PER_DIST = 0.7;
const SHIFT_MULT = 2.5;
const ANGLE_SMOOTH = 0.12;
const DIST_SMOOTH = 0.12;
const TARGET_SMOOTH = 0.28;
const BOUNDS_MARGIN = 1.35;
const MAX_LOOK_UP = -0.45;
const MAX_LOOK_DOWN = 1.4;

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

export function createOrbitCamera(canvas: HTMLCanvasElement, options: OrbitCameraOptions = {}): OrbitCamera {
  let camTheta = Math.PI / 4;
  let camPhi = 0.5;
  let camDist = 10;
  let targetTheta = camTheta;
  let targetPhi = camPhi;
  let targetDist = camDist;
  let minDist = 2;
  let maxDist = 80;
  let near = 0.1;
  let far = 200;
  let boundsSig = '';
  let minTargetY = 0;
  let maxTargetY = 10;
  let maxTargetXZ = 15;
  let minEyeY = 0.05;
  const target: [number, number, number] = [0, 2, 0];
  const smoothTarget: [number, number, number] = [0, 2, 0];
  const up: [number, number, number] = [0, 1, 0];

  const keys = new Set<string>();
  let isDragging = false;
  let lastMouse: [number, number] = [0, 0];

  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;

  function clampTarget(): void {
    target[0] = Math.max(-maxTargetXZ, Math.min(maxTargetXZ, target[0]));
    target[1] = Math.max(minTargetY, Math.min(maxTargetY, target[1]));
    target[2] = Math.max(-maxTargetXZ, Math.min(maxTargetXZ, target[2]));
  }

  /** Lowest pitch that keeps eye.y >= minEyeY for the given look-at height and distance. */
  function pitchFloor(lookY: number, dist: number): number {
    const minSin = (minEyeY - lookY) / Math.max(dist, 1e-4);
    return Math.max(MAX_LOOK_UP, Math.asin(Math.max(-1, Math.min(1, minSin))));
  }

  function clampPitch(phi: number, lookY: number, dist: number): number {
    return Math.max(pitchFloor(lookY, dist), Math.min(MAX_LOOK_DOWN, phi));
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (options.shouldOrbit && !options.shouldOrbit(e)) return;
    if (e.button !== 0) return;
    isDragging = true;
    lastMouse = [e.clientX, e.clientY];
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse[0];
    const dy = e.clientY - lastMouse[1];
    targetTheta -= dx * 0.005;
    targetPhi = clampPitch(targetPhi + dy * 0.005, smoothTarget[1], Math.max(camDist, targetDist));
    lastMouse = [e.clientX, e.clientY];
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  });

  canvas.addEventListener('wheel', (e) => {
    targetDist = Math.max(minDist, Math.min(maxDist, targetDist + e.deltaY * Math.max(0.005, maxDist * 0.0005)));
    targetPhi = clampPitch(targetPhi, smoothTarget[1], targetDist);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
    const k = e.code;
    if (
      k === 'KeyW' || k === 'KeyA' || k === 'KeyS' || k === 'KeyD' ||
      k === 'KeyQ' || k === 'KeyE' ||
      k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' ||
      k === 'ShiftLeft' || k === 'ShiftRight'
    ) {
      keys.add(k);
      if (k.startsWith('Arrow') || k === 'KeyW' || k === 'KeyA' || k === 'KeyS' || k === 'KeyD' || k === 'KeyQ' || k === 'KeyE') {
        e.preventDefault();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
  });

  return {
    setSceneBounds(boxHalfExtentWorld, cloudHeightWorld) {
      const e = Math.max(0.01, boxHalfExtentWorld);
      const h = Math.max(0.01, cloudHeightWorld);
      const sig = `${e}:${h}`;
      if (sig === boundsSig) return;
      const first = boundsSig === '';
      boundsSig = sig;
      const radius = Math.hypot(e, e, h * 0.5);
      maxTargetXZ = e * BOUNDS_MARGIN;
      minTargetY = 0;
      maxTargetY = h * 1.2;
      minEyeY = Math.max(0.05, radius * 0.004);
      minDist = Math.max(0.5, radius * 0.18);
      maxDist = Math.max(20, radius * 4);
      near = Math.max(0.02, radius * 0.002);
      far = Math.max(100, radius * 10);
      if (first) {
        target[0] = 0;
        target[1] = h * 0.42;
        target[2] = 0;
        smoothTarget[0] = target[0];
        smoothTarget[1] = target[1];
        smoothTarget[2] = target[2];
        camDist = Math.max(minDist, radius * 1.1);
        targetDist = camDist;
      } else {
        clampTarget();
        targetDist = Math.max(minDist, Math.min(maxDist, targetDist));
      }
    },
    setLookAt(eye, lookTarget) {
      target[0] = lookTarget[0];
      target[1] = lookTarget[1];
      target[2] = lookTarget[2];
      clampTarget();
      smoothTarget[0] = target[0];
      smoothTarget[1] = target[1];
      smoothTarget[2] = target[2];
      const dx = eye[0] - target[0];
      const dy = eye[1] - target[1];
      const dz = eye[2] - target[2];
      const dist = Math.max(1e-4, Math.hypot(dx, dy, dz));
      camDist = Math.max(minDist, Math.min(maxDist, dist));
      targetDist = camDist;
      camTheta = Math.atan2(dx, dz);
      targetTheta = camTheta;
      const phi = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
      camPhi = clampPitch(phi, target[1], camDist);
      targetPhi = camPhi;
    },
    getTarget() {
      return [smoothTarget[0], smoothTarget[1], smoothTarget[2]];
    },
    update(deltaSeconds: number) {
      const dt = Math.max(0, Math.min(0.1, deltaSeconds));
      const boost = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? SHIFT_MULT : 1;
      const move = camDist * MOVE_SPEED_PER_DIST * boost * dt;
      const vert = camDist * VERT_SPEED_PER_DIST * boost * dt;

      let forward = 0;
      let strafe = 0;
      let elev = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
      if (keys.has('KeyE')) elev += 1;
      if (keys.has('KeyQ')) elev -= 1;

      if (forward !== 0 || strafe !== 0) {
        const fx = -Math.sin(camTheta);
        const fz = -Math.cos(camTheta);
        const rx = Math.cos(camTheta);
        const rz = -Math.sin(camTheta);
        const len = Math.hypot(forward, strafe) || 1;
        const nf = forward / len;
        const ns = strafe / len;
        target[0] += (fx * nf + rx * ns) * move;
        target[2] += (fz * nf + rz * ns) * move;
      }
      if (elev !== 0) target[1] += elev * vert;
      clampTarget();
      targetPhi = clampPitch(targetPhi, target[1], targetDist);

      const ts = 1 - Math.pow(1 - TARGET_SMOOTH, dt * 60);
      const as_ = 1 - Math.pow(1 - ANGLE_SMOOTH, dt * 60);
      const ds = 1 - Math.pow(1 - DIST_SMOOTH, dt * 60);
      smoothTarget[0] += (target[0] - smoothTarget[0]) * ts;
      smoothTarget[1] += (target[1] - smoothTarget[1]) * ts;
      smoothTarget[2] += (target[2] - smoothTarget[2]) * ts;
      camTheta += (targetTheta - camTheta) * as_;
      camDist += (targetDist - camDist) * ds;
      camPhi += (targetPhi - camPhi) * as_;
      camPhi = clampPitch(camPhi, smoothTarget[1], camDist);
      targetPhi = clampPitch(targetPhi, smoothTarget[1], camDist);
    },
    computeFrame(aspect: number): CameraFrame {
      const phi = clampPitch(camPhi, smoothTarget[1], camDist);
      const eyeY = Math.max(minEyeY, smoothTarget[1] + camDist * Math.sin(phi));
      const eye: [number, number, number] = [
        smoothTarget[0] + camDist * Math.cos(phi) * Math.sin(camTheta),
        eyeY,
        smoothTarget[2] + camDist * Math.cos(phi) * Math.cos(camTheta),
      ];
      const proj = mat4Perspective(Math.PI / 4, aspect, near, far);
      const view = mat4LookAt(eye, smoothTarget, up);
      const viewProj = mat4Multiply(proj, view);
      const invViewProj = mat4Invert(viewProj);
      return { invViewProj, viewProj, eye };
    },
  };
}
