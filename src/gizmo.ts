import type { CameraFrame } from './camera';
import type { BodyStore } from './body';
import { bodyCenterWorld, GIZMO_AXIS_LEN, GIZMO_RING_RADIUS } from './body';
import type { CloudParams } from './params';
import { bodyToTransportedRenderSpace } from './space';
import type { WindOffsetM } from './wind';

const AXIS: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const PICK_PX = 12;

interface GizmoDeps {
  canvas: HTMLCanvasElement;
  params: CloudParams;
  store: BodyStore;
  getCam(): CameraFrame | null;
  getWindOffsetM(bodyId: string): WindOffsetM;
  onChange(): void;
}

interface Drag {
  axis: number;
  mode: 'move' | 'rotate' | 'scale';
  startX: number;
  startY: number;
  screenDirX: number;
  screenDirY: number;
  pxPerWorld: number;
  centerSX: number;
  centerSY: number;
  startAngle: number;
  startBounds: number[];
  startBase: number;
  startThickness: number;
  startRot: [number, number, number];
}

export interface GizmoController {
  isDragging(): boolean;
}

export function createGizmoController(deps: GizmoDeps): GizmoController {
  const { canvas, params, store } = deps;
  let drag: Drag | null = null;

  function project(vp: Float32Array, p: number[]): [number, number] | null {
    const c = [0, 0, 0, 0];
    const v = [p[0], p[1], p[2], 1];
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let col = 0; col < 4; col++) s += vp[col * 4 + r] * v[col];
      c[r] = s;
    }
    if (c[3] <= 1e-5) return null;
    const ndcX = c[0] / c[3];
    const ndcY = c[1] / c[3];
    const rect = canvas.getBoundingClientRect();
    return [(ndcX * 0.5 + 0.5) * rect.width, (1 - (ndcY * 0.5 + 0.5)) * rect.height];
  }

  function pointer(e: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-6;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    return Math.hypot(px - cx, py - cy);
  }

  function selectedBody() {
    return params.selectedBody ? store.list().find((b) => b.id === params.selectedBody) ?? null : null;
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!params.gizmoMode || !params.selectedBody) return;
    const cam = deps.getCam();
    const b = selectedBody();
    if (!cam || !b) return;
    const worldBody = bodyToTransportedRenderSpace(b, deps.getWindOffsetM(b.id), params);
    const center = bodyCenterWorld(worldBody, params.cloudHeight / params.verticalMetersPerWorldUnit);
    const cS = project(cam.viewProj, center);
    if (!cS) return;
    const [px, py] = pointer(e);

    let bestAxis = -1;
    let bestDist = PICK_PX;

    if (params.gizmoMode === 'move' || params.gizmoMode === 'scale') {
      for (let a = 0; a < 3; a++) {
        const tip = [center[0] + AXIS[a][0] * GIZMO_AXIS_LEN, center[1] + AXIS[a][1] * GIZMO_AXIS_LEN, center[2] + AXIS[a][2] * GIZMO_AXIS_LEN];
        const tS = project(cam.viewProj, tip);
        if (!tS) continue;
        const d = distToSeg(px, py, cS[0], cS[1], tS[0], tS[1]);
        if (d < bestDist) { bestDist = d; bestAxis = a; }
      }
    } else {
      const N = 32;
      for (let a = 0; a < 3; a++) {
        for (let k = 0; k < N; k++) {
          const t = (k / N) * Math.PI * 2;
          const c = Math.cos(t) * GIZMO_RING_RADIUS;
          const s = Math.sin(t) * GIZMO_RING_RADIUS;
          const rp = a === 0 ? [center[0], center[1] + c, center[2] + s]
            : a === 1 ? [center[0] + c, center[1], center[2] + s]
              : [center[0] + c, center[1] + s, center[2]];
          const sP = project(cam.viewProj, rp);
          if (!sP) continue;
          const d = Math.hypot(px - sP[0], py - sP[1]);
          if (d < bestDist) { bestDist = d; bestAxis = a; }
        }
      }
    }

    if (bestAxis < 0) return;

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    let screenDirX = 0, screenDirY = 0, pxPerWorld = 1;
    if (params.gizmoMode === 'move' || params.gizmoMode === 'scale') {
      const tip = [center[0] + AXIS[bestAxis][0] * GIZMO_AXIS_LEN, center[1] + AXIS[bestAxis][1] * GIZMO_AXIS_LEN, center[2] + AXIS[bestAxis][2] * GIZMO_AXIS_LEN];
      const tS = project(cam.viewProj, tip)!;
      const ddx = tS[0] - cS[0];
      const ddy = tS[1] - cS[1];
      const len = Math.hypot(ddx, ddy) || 1e-6;
      screenDirX = ddx / len;
      screenDirY = ddy / len;
      pxPerWorld = len / GIZMO_AXIS_LEN;
    }

    drag = {
      axis: bestAxis,
      mode: params.gizmoMode,
      startX: px,
      startY: py,
      screenDirX,
      screenDirY,
      pxPerWorld,
      centerSX: cS[0],
      centerSY: cS[1],
      startAngle: Math.atan2(py - cS[1], px - cS[0]),
      startBounds: b.bounds.slice(),
      startBase: b.base,
      startThickness: b.thickness,
      startRot: [b.rot[0], b.rot[1], b.rot[2]],
    };
  }, true);

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    const b = selectedBody();
    if (!b) { drag = null; return; }
    const [px, py] = pointer(e);

    if (drag.mode === 'move') {
      const dpix = (px - drag.startX) * drag.screenDirX + (py - drag.startY) * drag.screenDirY;
      const dw = dpix / drag.pxPerWorld;
      const dm = dw * (drag.axis === 1 ? params.verticalMetersPerWorldUnit : params.horizontalMetersPerWorldUnit);
      if (drag.axis === 1) {
        b.base = Math.max(0, Math.min(params.cloudHeight - 1, drag.startBase + dm));
      } else {
        const sb = drag.startBounds;
        if (drag.axis === 0) { b.bounds = [sb[0] + dm, sb[1], sb[2] + dm, sb[3]]; }
        else { b.bounds = [sb[0], sb[1] + dm, sb[2], sb[3] + dm]; }
      }
    } else if (drag.mode === 'scale') {
      const dpix = (px - drag.startX) * drag.screenDirX + (py - drag.startY) * drag.screenDirY;
      const sb = drag.startBounds;
      let ref = drag.startThickness / params.verticalMetersPerWorldUnit;
      if (drag.axis === 0) ref = ((sb[2] - sb[0]) / 2) / params.horizontalMetersPerWorldUnit;
      else if (drag.axis === 2) ref = ((sb[3] - sb[1]) / 2) / params.horizontalMetersPerWorldUnit;
      const factor = Math.max(0.05, 1 + dpix / (drag.pxPerWorld * Math.max(ref, 0.05)));
      if (drag.axis === 1) {
        const cy = drag.startBase + drag.startThickness / 2;
        const newTh = Math.max(1, drag.startThickness * factor);
        b.base = Math.max(0, cy - newTh / 2);
        b.thickness = Math.min(params.cloudHeight - b.base, newTh);
      } else {
        const cx = (sb[0] + sb[2]) / 2;
        const cz = (sb[1] + sb[3]) / 2;
        let hw = (sb[2] - sb[0]) / 2;
        let hd = (sb[3] - sb[1]) / 2;
        if (drag.axis === 0) hw = Math.max(50, hw * factor);
        else hd = Math.max(50, hd * factor);
        b.bounds = [cx - hw, cz - hd, cx + hw, cz + hd];
      }
    } else {
      const ang = Math.atan2(py - drag.centerSY, px - drag.centerSX);
      const d = ang - drag.startAngle;
      b.rot[drag.axis] = drag.startRot[drag.axis] - d;
    }
    b.placementLocked = true;
    deps.onChange();
  }, true);

  function end(e: PointerEvent): void {
    if (!drag) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    drag = null;
  }
  canvas.addEventListener('pointerup', end, true);
  canvas.addEventListener('pointercancel', end, true);

  return {
    isDragging: () => drag !== null,
  };
}
