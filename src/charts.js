// Flat 2D charts: exact, readable companions to the 3D view.
// Population = hatched area (outlined). Sample means = solid bars. Normal approximation = dashed line.
import { phi } from './dist.js';

const M = { l: 46, r: 14, t: 16, b: 38 };

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prepCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 220;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, pw: w - M.l - M.r, ph: h - M.t - M.b };
}

export function geom(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  return { left: M.l, top: M.t, pw: w - M.l - M.r, ph: h - M.t - M.b };
}

function hatch(ctx, color) {
  const p = document.createElement('canvas');
  p.width = p.height = 8;
  const c = p.getContext('2d');
  c.strokeStyle = color;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(0, 8); c.lineTo(8, 0);
  c.moveTo(-2, 2); c.lineTo(2, -2);
  c.moveTo(6, 10); c.lineTo(10, 6);
  c.stroke();
  return ctx.createPattern(p, 'repeat');
}

export function niceTicks(a, b, count) {
  const span = b - a;
  if (!(span > 0)) return [a];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function fmtTick(v) {
  const r = Math.round(v * 1000) / 1000;
  if (Number.isInteger(r)) return String(r);
  return Math.abs(r) < 1 ? r.toFixed(2).replace(/0$/, '') : r.toFixed(1);
}

function axes(ctx, w, h, xTicks, X, yTicks, Y, yLabel) {
  const ink2 = css('--ink-2'), line = css('--line');
  ctx.font = '12px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.fillStyle = ink2;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) {
    const x = X(t);
    ctx.beginPath(); ctx.moveTo(x, h - M.b); ctx.lineTo(x, h - M.b + 5); ctx.stroke();
    ctx.fillText(fmtTick(t), x, h - M.b + 8);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of yTicks) {
    const y = Y(t);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(w - M.r, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(fmtTick(t), M.l - 6, y);
  }
  ctx.strokeStyle = ink2;
  ctx.beginPath(); ctx.moveTo(M.l, h - M.b + 0.5); ctx.lineTo(w - M.r, h - M.b + 0.5); ctx.stroke();
  ctx.save();
  ctx.translate(12, M.t + (h - M.t - M.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = ink2;
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function muLine(ctx, x, top, bottom, label) {
  ctx.save();
  ctx.strokeStyle = css('--ink');
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css('--ink');
  ctx.font = '600 12px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + 4, top);
  ctx.restore();
}

/** Population chart. Returns nothing; editable custom handled by caller via geom(). */
export function drawPopulation(canvas, pop, selectedBin = -1) {
  const { ctx, w, h, pw, ph } = prepCanvas(canvas);
  const popC = css('--pop');
  const pad = pop.discrete ? pop.step * 0.6 : 0;
  const lo = pop.lo - pad, hi = pop.hi + pad;
  const X = (v) => M.l + ((v - lo) / (hi - lo)) * pw;
  let maxY, yLabel;
  if (pop.discrete) {
    maxY = Math.max(...pop.values.map((v) => v.p)) * 1.12;
    yLabel = 'probability';
  } else if (pop.id === 'custom') {
    maxY = 10;
    yLabel = 'relative height';
  } else {
    let m = 0;
    for (let i = 0; i <= 200; i++) m = Math.max(m, pop.pdf(lo + ((hi - lo) * i) / 200));
    maxY = m * 1.12;
    yLabel = 'density';
  }
  const Y = (v) => M.t + ph - (v / maxY) * ph;
  axes(ctx, w, h, pop.discrete ? pop.values.map((v) => v.x) : niceTicks(lo, hi, 6), X, niceTicks(0, maxY, 4), Y, yLabel);

  ctx.fillStyle = hatch(ctx, popC);
  ctx.strokeStyle = popC;
  ctx.lineWidth = 2;
  if (pop.discrete) {
    const bw = Math.min(60, (pw / (pop.hi - pop.lo + 2 * pad)) * pop.step * 0.55);
    for (const v of pop.values) {
      const x = X(v.x) - bw / 2, y = Y(v.p);
      ctx.fillRect(x, y, bw, M.t + ph - y);
      ctx.strokeRect(x + 1, y + 1, bw - 2, M.t + ph - y - 1);
    }
  } else if (pop.id === 'custom') {
    pop.raw.forEach((p, i) => {
      const x0 = X(i) + 2, x1 = X(i + 1) - 2, y = Y(p);
      ctx.fillRect(x0, y, x1 - x0, M.t + ph - y);
      ctx.strokeRect(x0, y, x1 - x0, M.t + ph - y);
      if (i === selectedBin) {
        ctx.save();
        ctx.strokeStyle = css('--ink');
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x0 - 2, M.t, x1 - x0 + 4, ph);
        ctx.restore();
      }
    });
  } else {
    ctx.beginPath();
    ctx.moveTo(X(lo), Y(0));
    for (let i = 0; i <= 300; i++) {
      const v = lo + ((hi - lo) * i) / 300;
      ctx.lineTo(X(v), Y(Math.min(pop.pdf(v), maxY)));
    }
    ctx.lineTo(X(hi), Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  muLine(ctx, X(pop.center), M.t, M.t + ph, pop.finiteVar ? 'μ' : 'centre (no μ)');
}

/** Histogram of sample means with the normal approximation N(μ, σ²/n). */
export function drawMeans(canvas, pop, n, bins, counts, N) {
  const { ctx, w, h, pw, ph } = prepCanvas(canvas);
  const X = (v) => M.l + ((v - bins.lo) / (bins.hi - bins.lo)) * pw;
  const se = pop.finiteVar ? pop.sigma / Math.sqrt(n) : null;
  const curveAt = (x) => (se ? (N * bins.w * phi((x - pop.mu) / se)) / se : 0);
  const peak = se ? curveAt(pop.mu) : 0;
  const maxC = Math.max(...counts, 1);
  const maxY = Math.max(maxC, N ? Math.min(peak, maxC * 3) : 0, 4) * 1.1;
  const Y = (v) => M.t + ph - (v / maxY) * ph;
  axes(ctx, w, h, niceTicks(bins.lo, bins.hi, 6), X, niceTicks(0, maxY, 4), Y, 'number of samples');

  ctx.fillStyle = css('--mean');
  const bw = pw / bins.nb;
  counts.forEach((c, i) => {
    if (!c) return;
    const x = M.l + i * bw, y = Y(c);
    ctx.fillRect(x + Math.min(1, bw * 0.1), y, Math.max(1, bw - Math.min(2, bw * 0.2)), M.t + ph - y);
  });

  if (se && N > 0) {
    ctx.save();
    ctx.strokeStyle = css('--curve');
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const x = bins.lo + ((bins.hi - bins.lo) * i) / 300;
      const y = Y(Math.min(curveAt(x), maxY));
      if (i === 0) ctx.moveTo(X(x), y); else ctx.lineTo(X(x), y);
    }
    ctx.stroke();
    ctx.restore();
  }
  muLine(ctx, X(pop.center), M.t, M.t + ph, pop.finiteVar ? 'μ' : 'centre');
  if (!N) {
    ctx.fillStyle = css('--ink-2');
    ctx.font = '15px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Press Run or Step to draw samples', M.l + pw / 2, M.t + ph / 2 - 10);
  }
}
