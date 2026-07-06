import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Invert } from './math/mat4';

export interface CameraFrame {
  invViewProj: Float32Array;
  viewProj: Float32Array;
  eye: [number, number, number];
}

export interface OrbitCamera {
  setSceneBounds(boxHalfExtentWorld: number, cloudHeightWorld: number): void;
  update(): void;
  computeFrame(aspect: number): CameraFrame;
}

export function createOrbitCamera(canvas: HTMLCanvasElement): OrbitCamera {
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
  const target: [number, number, number] = [0, 2, 0];
  const up: [number, number, number] = [0, 1, 0];

  let isDragging = false;
  let lastMouse: [number, number] = [0, 0];

  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastMouse = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse[0];
    const dy = e.clientY - lastMouse[1];
    targetTheta -= dx * 0.005;
    targetPhi = Math.max(0.1, Math.min(1.4, targetPhi + dy * 0.005));
    lastMouse = [e.clientX, e.clientY];
  });

  canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener('wheel', (e) => {
    targetDist = Math.max(minDist, Math.min(maxDist, targetDist + e.deltaY * Math.max(0.005, maxDist * 0.0005)));
    e.preventDefault();
  }, { passive: false });

  return {
    setSceneBounds(boxHalfExtentWorld, cloudHeightWorld) {
      const e = Math.max(0.01, boxHalfExtentWorld);
      const h = Math.max(0.01, cloudHeightWorld);
      const sig = `${e}:${h}`;
      if (sig === boundsSig) return;
      const first = boundsSig === '';
      boundsSig = sig;
      const radius = Math.hypot(e, e, h * 0.5);
      target[0] = 0;
      target[1] = h * 0.42;
      target[2] = 0;
      minDist = Math.max(0.5, radius * 0.18);
      maxDist = Math.max(20, radius * 4);
      near = Math.max(0.02, radius * 0.002);
      far = Math.max(100, radius * 10);
      if (first) {
        camDist = Math.max(minDist, radius * 1.1);
        targetDist = camDist;
      } else {
        targetDist = Math.max(minDist, Math.min(maxDist, targetDist));
      }
    },
    update() {
      camTheta += (targetTheta - camTheta) * 0.12;
      camPhi += (targetPhi - camPhi) * 0.12;
      camDist += (targetDist - camDist) * 0.12;
    },
    computeFrame(aspect: number): CameraFrame {
      const eye: [number, number, number] = [
        target[0] + camDist * Math.cos(camPhi) * Math.sin(camTheta),
        target[1] + camDist * Math.sin(camPhi),
        target[2] + camDist * Math.cos(camPhi) * Math.cos(camTheta),
      ];
      const proj = mat4Perspective(Math.PI / 4, aspect, near, far);
      const view = mat4LookAt(eye, target, up);
      const viewProj = mat4Multiply(proj, view);
      const invViewProj = mat4Invert(viewProj);
      return { invViewProj, viewProj, eye };
    },
  };
}
