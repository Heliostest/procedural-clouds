export const WORLD_AXIS_COLS: [number, number, number][] = [
  [1.0, 0.27, 0.27],
  [0.4, 1.0, 0.35],
  [0.32, 0.55, 1.0],
];

export interface AxisLabel {
  text: string;
  pos: [number, number, number];
  color: string;
}

export interface AxisScales {
  altitudeScale: number;
  horizontalScale: number;
}

function pickTickStep(span: number): number {
  if (span <= 0) return 1;
  const target = span / 6;
  const exp = Math.floor(Math.log10(target));
  const base = Math.pow(10, exp);
  const f = target / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

function pushBox(
  out: number[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  col: [number, number, number],
): void {
  const corners: [number, number, number][] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [2, 6, 7], [2, 7, 3],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ];
  for (const [a, b, c] of faces) {
    for (const i of [a, b, c]) {
      const p = corners[i];
      out.push(p[0], p[1], p[2], col[0], col[1], col[2]);
    }
  }
}

export function formatAxisTick(v: number): string {
  const a = Math.abs(v);
  if (a < 1e-6) return '0';
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return v.toFixed(2);
}

function scaledTick(world: number, scale: number): string {
  return formatAxisTick(world * scale);
}

export function buildAxisMesh(boxHalfExtent: number, cloudHeight: number): Float32Array {
  const out: number[] = [];
  const e = boxHalfExtent;
  const h = cloudHeight;
  const r = Math.max(0.012, Math.min(e, h) * 0.005);
  const tickH = r * 2.5;
  const tickW = r * 0.65;
  const tickL = r * 1.8;

  pushBox(out, -e, -r, -r, e, r, r, WORLD_AXIS_COLS[0]);
  pushBox(out, -r, 0, -r, r, h, r, WORLD_AXIS_COLS[1]);
  pushBox(out, -r, -r, -e, r, r, e, WORLD_AXIS_COLS[2]);

  const xStep = pickTickStep(e * 2);
  for (let t = Math.ceil(-e / xStep) * xStep; t <= e + 1e-6; t += xStep) {
    if (Math.abs(t) < 1e-6) continue;
    pushBox(out, t - tickW, 0, -tickL, t + tickW, tickH, tickL, WORLD_AXIS_COLS[0]);
  }

  const yStep = pickTickStep(h);
  for (let t = yStep; t <= h + 1e-6; t += yStep) {
    pushBox(out, -tickL, t - tickW, -tickL * 0.35, tickL, t + tickW, tickL * 0.35, WORLD_AXIS_COLS[1]);
  }

  const zStep = pickTickStep(e * 2);
  for (let t = Math.ceil(-e / zStep) * zStep; t <= e + 1e-6; t += zStep) {
    if (Math.abs(t) < 1e-6) continue;
    pushBox(out, -tickL * 0.35, 0, t - tickW, tickL * 0.35, tickH, t + tickW, WORLD_AXIS_COLS[2]);
  }

  return new Float32Array(out);
}

export function buildAxisLabels(boxHalfExtent: number, cloudHeight: number, scales: AxisScales): AxisLabel[] {
  const labels: AxisLabel[] = [];
  const e = boxHalfExtent;
  const h = cloudHeight;
  const hs = scales.horizontalScale;
  const vs = scales.altitudeScale;
  const off = Math.max(0.15, Math.min(e, h) * 0.06);
  const col = (c: [number, number, number]) =>
    `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

  labels.push({ text: '0', pos: [0, -off, 0], color: '#ccc' });
  labels.push({ text: `+X ${scaledTick(e, hs)}`, pos: [e + off, 0, 0], color: col(WORLD_AXIS_COLS[0]) });
  labels.push({ text: `+Y ${scaledTick(h, vs)}`, pos: [0, h + off, 0], color: col(WORLD_AXIS_COLS[1]) });
  labels.push({ text: `+Z ${scaledTick(e, hs)}`, pos: [0, 0, e + off], color: col(WORLD_AXIS_COLS[2]) });
  labels.push({ text: `-X ${scaledTick(-e, hs)}`, pos: [-e - off, 0, 0], color: col(WORLD_AXIS_COLS[0]) });
  labels.push({ text: `-Z ${scaledTick(-e, hs)}`, pos: [0, 0, -e - off], color: col(WORLD_AXIS_COLS[2]) });

  const xStep = pickTickStep(e * 2);
  for (let t = Math.ceil(-e / xStep) * xStep; t <= e + 1e-6; t += xStep) {
    if (Math.abs(t) < 1e-6) continue;
    labels.push({ text: scaledTick(t, hs), pos: [t, off * 2.2, off], color: col(WORLD_AXIS_COLS[0]) });
  }

  const yStep = pickTickStep(h);
  for (let t = yStep; t <= h + 1e-6; t += yStep) {
    labels.push({ text: scaledTick(t, vs), pos: [off, t, off], color: col(WORLD_AXIS_COLS[1]) });
  }

  const zStep = pickTickStep(e * 2);
  for (let t = Math.ceil(-e / zStep) * zStep; t <= e + 1e-6; t += zStep) {
    if (Math.abs(t) < 1e-6) continue;
    labels.push({ text: scaledTick(t, hs), pos: [off, off * 2.2, t], color: col(WORLD_AXIS_COLS[2]) });
  }

  return labels;
}

export interface AxisLabelOverlay {
  update(
    show: boolean,
    viewProj: Float32Array,
    canvas: HTMLCanvasElement,
    boxHalfExtent: number,
    cloudHeight: number,
    scales: AxisScales,
  ): void;
}

export function createAxisLabelOverlay(): AxisLabelOverlay {
  const root = document.createElement('div');
  root.id = 'axis-labels';
  document.body.appendChild(root);

  let sig = '';
  let entries: { el: HTMLSpanElement; label: AxisLabel }[] = [];

  function rebuild(boxHalfExtent: number, cloudHeight: number, scales: AxisScales): void {
    const nextSig = `${boxHalfExtent}:${cloudHeight}:${scales.altitudeScale}:${scales.horizontalScale}`;
    if (nextSig === sig) return;
    sig = nextSig;
    root.replaceChildren();
    entries = buildAxisLabels(boxHalfExtent, cloudHeight, scales).map((label) => {
      const el = document.createElement('span');
      el.className = 'axis-label';
      el.textContent = label.text;
      el.style.color = label.color;
      root.appendChild(el);
      return { el, label };
    });
  }

  function project(viewProj: Float32Array, w: number, h: number, p: [number, number, number]): [number, number, number] | null {
    const [x, y, z] = p;
    const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
    const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
    const cz = viewProj[2] * x + viewProj[6] * y + viewProj[10] * z + viewProj[14];
    const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
    if (cw <= 0.001) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const depth = cz / cw;
    return [(ndcX * 0.5 + 0.5) * w, (1 - (ndcY * 0.5 + 0.5)) * h, depth];
  }

  return {
    update(show, viewProj, canvas, boxHalfExtent, cloudHeight, scales) {
      root.style.display = show ? 'block' : 'none';
      if (!show) return;
      rebuild(boxHalfExtent, cloudHeight, scales);
      const rect = canvas.getBoundingClientRect();
      const w = canvas.width;
      const h = canvas.height;
      for (const { el, label } of entries) {
        const p = project(viewProj, w, h, label.pos);
        if (!p || p[2] < -1 || p[2] > 1) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        el.style.left = `${rect.left + (p[0] / w) * rect.width}px`;
        el.style.top = `${rect.top + (p[1] / h) * rect.height}px`;
      }
    },
  };
}
