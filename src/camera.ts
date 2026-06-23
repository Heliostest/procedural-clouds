import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Invert } from './math/mat4';

export interface CameraFrame {
  invViewProj: Float32Array;
  eye: [number, number, number];
}

export interface OrbitCamera {
  update(): void;
  computeFrame(aspect: number): CameraFrame;
}

export function createOrbitCamera(canvas: HTMLCanvasElement): OrbitCamera {
  let camTheta = Math.PI / 4;
  let camPhi = 0.5;
  let camDist = 10.0;
  let targetTheta = camTheta;
  let targetPhi = camPhi;
  let targetDist = camDist;
  const target: [number, number, number] = [0.0, 0.5, 0.0];
  const up: [number, number, number] = [0.0, 1.0, 0.0];

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
    targetDist = Math.max(2.0, Math.min(20.0, targetDist + e.deltaY * 0.005));
    e.preventDefault();
  }, { passive: false });

  return {
    update() {
      camTheta += (targetTheta - camTheta) * 0.12;
      camPhi += (targetPhi - camPhi) * 0.12;
      camDist += (targetDist - camDist) * 0.12;
    },
    computeFrame(aspect: number): CameraFrame {
      const eye: [number, number, number] = [
        camDist * Math.cos(camPhi) * Math.sin(camTheta),
        camDist * Math.sin(camPhi),
        camDist * Math.cos(camPhi) * Math.cos(camTheta),
      ];
      const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 100.0);
      const view = mat4LookAt(eye, target, up);
      const viewProj = mat4Multiply(proj, view);
      const invViewProj = mat4Invert(viewProj);
      return { invViewProj, eye };
    },
  };
}
