// The 3D "lab bench": population wall at the back, sample-means histogram at the front.
// Raw values rise out of the population, merge into one golden bead (the sample mean),
// and the bead drops into the histogram of sample means.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { phi } from './dist.js';

const XH = 6;          // world x runs from -XH to +XH
const POP_Z = -3.2;    // population row
const MEAN_Z = 1.9;    // sample means row
const POP_H = 3.0;     // tallest population bar
const MEAN_H = 3.4;    // tallest means column
const MAX_BALLS = 1800;
const MAX_BEADS = 400;

const COLORS = {
  bg: 0x14132a, floor: 0x1b1a36, grid1: 0x3a3766, grid2: 0x26244a,
  pop: 0x8b72ff, ball: 0xc9bcff, mean: 0xf2b533, curve: 0x37d0b9, pole: 0xf5f0e6,
};

export class Stage {
  constructor(container, { reducedMotion = false } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.ok = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      this.ok = false;
      return;
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    r.domElement.setAttribute('aria-hidden', 'true');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLORS.bg, 18, 34);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 40;
    this.controls.autoRotateSpeed = 0.6;
    this.setView('angle');

    // lights
    this.scene.add(new THREE.HemisphereLight(0xdcd6ff, 0x1a1830, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun);

    // floor + grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(16, 32, COLORS.grid1, COLORS.grid2);
    grid.position.y = 0.002;
    this.scene.add(grid);

    // rails under each row, so the two rows read as separate shelves
    for (const z of [POP_Z, MEAN_Z]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(2 * XH + 0.6, 0.06, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x2a2850, roughness: 0.8 })
      );
      rail.position.set(0, 0.03, z);
      this.scene.add(rail);
    }

    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0); // grow upward from the floor
    this.popMat = new THREE.MeshStandardMaterial({ color: COLORS.pop, roughness: 0.45, metalness: 0.05, transparent: true, opacity: 0.88, emissive: COLORS.pop, emissiveIntensity: 0.08 });
    this.popBars = new THREE.InstancedMesh(box, this.popMat, 80);
    this.popBars.count = 0;
    this.scene.add(this.popBars);

    this.meanMat = new THREE.MeshStandardMaterial({ color: COLORS.mean, roughness: 0.35, metalness: 0.15, emissive: COLORS.mean, emissiveIntensity: 0.12 });
    this.meanCols = new THREE.InstancedMesh(box, this.meanMat, 240);
    this.meanCols.count = 0;
    this.scene.add(this.meanCols);

    this.balls = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.085, 12, 8),
      new THREE.MeshStandardMaterial({ color: COLORS.ball, emissive: COLORS.pop, emissiveIntensity: 0.5 }),
      MAX_BALLS
    );
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.scene.add(this.balls);
    this.beads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.17, 18, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.mean, emissive: COLORS.mean, emissiveIntensity: 0.65, roughness: 0.25 }),
      MAX_BEADS
    );
    this.beads.count = 0;
    this.beads.frustumCulled = false;
    this.scene.add(this.beads);

    // centre poles (mu)
    const poleMat = new THREE.MeshBasicMaterial({ color: COLORS.pole, transparent: true, opacity: 0.55 });
    this.popPole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.6, 0.03), poleMat);
    this.meanPole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.9, 0.03), poleMat);
    this.scene.add(this.popPole, this.meanPole);

    this.curveMat = new THREE.MeshStandardMaterial({ color: COLORS.curve, emissive: COLORS.curve, emissiveIntensity: 0.55, roughness: 0.4 });
    this.curveMesh = null;

    // labels
    this.labels = [];
    this.titlePop = this.makeLabel('POPULATION  ·  single values', { size: 0.34, color: '#c9bcff' });
    this.titlePop.position.set(-XH, POP_H + 1.7, POP_Z);
    this.titleMean = this.makeLabel('SAMPLE MEANS  ·  one bead per sample', { size: 0.3, color: '#f7cd6a' });
    this.titleMean.position.set(-XH, 0.02, MEAN_Z + 1.05);
    this.titleMean.center.set(0, 0);
    this.muPopLabel = this.makeLabel('μ', { size: 0.3, color: '#f5f0e6' });
    this.muMeanLabel = this.makeLabel('μ', { size: 0.3, color: '#f5f0e6' });
    this.xbarLabel = this.makeLabel(' ', { size: 0.4, color: '#ffe3a1', bg: 'rgba(20,19,42,0.85)' });
    this.xbarLabel.visible = false;
    this.tickGroupPop = new THREE.Group();
    this.tickGroupMean = new THREE.Group();
    this.scene.add(this.tickGroupPop, this.tickGroupMean);

    this.samples = [];
    this.colHeights = [];
    this.counts = [];
    this.landed = 0;
    this.pulse = { pop: 0, mean: 0 };
    this._dummy = new THREE.Object3D();
    this._curveDirty = true;
    this._curveTimer = 0;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
  }

  // ---------- helpers ----------
  makeLabel(text, { size = 0.4, color = '#fff', bg = null } = {}) {
    const canvas = document.createElement('canvas');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.center.set(0, 0.5);
    sprite.userData = { canvas, tex, size, color, bg };
    this.setLabel(sprite, text);
    this.scene.add(sprite);
    return sprite;
  }

  setLabel(sprite, text) {
    const { canvas, tex, size, color, bg } = sprite.userData;
    if (sprite.userData.text === text) return;
    sprite.userData.text = text;
    const ctx = canvas.getContext('2d');
    const px = 64;
    const font = `600 ${px}px "Bricolage Grotesque", "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 36;
    const h = Math.ceil(px * 1.45);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      tex.dispose(); // reallocate the GPU texture at the new size
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.font = font;
    if (bg) {
      ctx.fillStyle = bg;
      roundRect(ctx, 0, 0, w, h, 18);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 18, h / 2 + 2);
    tex.needsUpdate = true;
    const worldH = size * 1.45;
    sprite.scale.set((worldH * w) / h, worldH, 1);
  }

  makeTicks(group, values, xOf, z, color) {
    for (const c of [...group.children]) {
      group.remove(c);
      c.material.map.dispose();
      c.material.dispose();
    }
    for (const v of values) {
      const s = this.makeLabel(fmtTick(v), { size: 0.26, color });
      this.scene.remove(s);
      s.center.set(0.5, 1);
      s.position.set(xOf(v), -0.02, z + 0.62);
      group.add(s);
    }
  }

  setView(name) {
    this.view = name;
    const c = this.camera, t = this.controls.target;
    if (name === 'front') { c.position.set(0, 3.2, 14.5); t.set(0, 1.9, -0.6); }
    else if (name === 'top') { c.position.set(0, 16, 3.5); t.set(0, 0, -0.6); }
    else { c.position.set(-2.6, 6.4, 12.4); t.set(0, 1.8, -0.7); }
    const aspect = this.camera.aspect || 16 / 9;
    if (aspect < 1.25) {
      // portrait phones: step back so both rows fit
      const k = 1.25 / Math.max(aspect, 0.55);
      c.position.sub(t).multiplyScalar(k).add(t);
    }
    this.controls.update();
  }

  orbit(deg) {
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
    this.camera.position.copy(t).add(off);
    this.controls.update();
  }

  setAutoRotate(on) { this.controls.autoRotate = on; }

  resize() {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    const portrait = w / h < 1.25;
    if (portrait !== this._portrait) { this._portrait = portrait; this.setView(this.view || 'angle'); }
  }

  // ---------- data ----------
  popX(v) {
    const p = this.pop;
    const pad = p.discrete ? p.step * 0.6 : 0;
    return -XH + ((v - (p.lo - pad)) / (p.hi - p.lo + 2 * pad)) * 2 * XH;
  }

  meanX(v) {
    const b = this.bins;
    return -XH + ((v - b.lo) / (b.hi - b.lo)) * 2 * XH;
  }

  /** Called whenever the population, n or axis mode changes. Clears the means row. */
  configure(pop, n, bins) {
    this.pop = pop; this.n = n; this.bins = bins;
    this.samples = [];
    this.counts = new Array(bins.nb).fill(0);
    this.colHeights = new Array(bins.nb).fill(0);
    this.landed = 0;
    this.outside = 0;
    this.xbarLabel.visible = false;

    // population bars
    const d = this._dummy;
    const bars = [];
    if (pop.discrete) {
      const maxP = Math.max(...pop.values.map((v) => v.p));
      const bw = (2 * XH) / (pop.hi - pop.lo + 1.2 * pop.step) * pop.step * 0.62;
      for (const v of pop.values) bars.push({ x: this.popX(v.x), h: (v.p / maxP) * POP_H, w: bw });
    } else {
      const nb = 48, w = (pop.hi - pop.lo) / nb;
      const dens = [];
      for (let i = 0; i < nb; i++) dens.push(pop.pdf(pop.lo + (i + 0.5) * w));
      const maxD = Math.max(...dens) || 1;
      dens.forEach((v, i) => bars.push({ x: this.popX(pop.lo + (i + 0.5) * w), h: Math.max(0.015, (v / maxD) * POP_H), w: ((2 * XH) / nb) * 0.86 }));
    }
    bars.forEach((b, i) => {
      d.position.set(b.x, 0.06, POP_Z);
      d.scale.set(b.w, b.h, 0.75);
      d.updateMatrix();
      this.popBars.setMatrixAt(i, d.matrix);
    });
    this.popBars.count = bars.length;
    this.popBars.instanceMatrix.needsUpdate = true;
    this.popBarH = (v) => {
      if (pop.discrete) {
        const maxP = Math.max(...pop.values.map((q) => q.p));
        const f = pop.values.find((q) => q.x === v);
        return f ? (f.p / maxP) * POP_H : 0.1;
      }
      const nb = 48, w = (pop.hi - pop.lo) / nb;
      let maxD = 0;
      for (let i = 0; i < nb; i++) maxD = Math.max(maxD, pop.pdf(pop.lo + (i + 0.5) * w));
      return Math.min(POP_H, (pop.pdf(v) / (maxD || 1)) * POP_H);
    };
    // cache max density once
    if (!pop.discrete) {
      const nb = 48, w = (pop.hi - pop.lo) / nb;
      let maxD = 0;
      for (let i = 0; i < nb; i++) maxD = Math.max(maxD, pop.pdf(pop.lo + (i + 0.5) * w));
      this.popBarH = (v) => Math.min(POP_H, (pop.pdf(v) / (maxD || 1)) * POP_H);
    }

    // poles and ticks
    const cx = pop.center;
    this.popPole.position.set(this.popX(cx), 1.86, POP_Z + 0.45);
    this.meanPole.position.set(this.meanX(cx), 2.0, MEAN_Z + 0.45);
    const muText = pop.finiteVar ? `μ = ${fmt(cx)}` : `centre = ${fmt(cx)}`;
    this.setLabel(this.muPopLabel, muText);
    this.setLabel(this.muMeanLabel, muText);
    this.muPopLabel.position.set(this.popX(cx) + 0.1, 3.75, POP_Z + 0.45);
    this.muMeanLabel.position.set(this.meanX(cx) + 0.1, 4.05, MEAN_Z + 0.45);

    const popTicks = pop.discrete ? pop.values.map((v) => v.x) : niceTicks(pop.lo, pop.hi, 5);
    this.makeTicks(this.tickGroupPop, popTicks, (v) => this.popX(v), POP_Z, '#b9b2d8');
    this.makeTicks(this.tickGroupMean, niceTicks(bins.lo, bins.hi, 6), (v) => this.meanX(v), MEAN_Z, '#e8d3a0');
    this.layoutColumns(true);
    this._curveDirty = true;
  }

  /** Launches the animation for one sample. mode: 'full' | 'bead' | 'none' */
  addSample(values, mean, mode, dur) {
    if (mode === 'none' || this.reducedMotion && mode !== 'bead') {
      if (mode === 'none') { this.land(mean); return; }
      mode = 'bead';
    }
    const ballCount = this.samples.reduce((s, q) => s + (q.mode === 'full' ? q.values.length : 0), 0);
    if (mode === 'full' && ballCount + values.length > MAX_BALLS) mode = 'bead';
    if (this.samples.length >= MAX_BEADS) { this.land(mean); return; }
    const jit = values.map(() => [Math.random() - 0.5, Math.random() - 0.5]);
    this.samples.push({ values, mean, mode, t: 0, dur, jit, label: mode === 'full' && dur > 1.8 });
  }

  land(mean) {
    const b = this.bins;
    const k = Math.floor((mean - b.lo) / b.w);
    if (k >= 0 && k < b.nb) this.counts[k]++;
    else this.outside++;
    this.landed++;
    this._curveDirty = true;
  }

  /** Rebuild the means row from an existing list of sample means (no animation). */
  loadMeans(arr) {
    for (const m of arr) this.land(m);
    this.layoutColumns(true);
  }

  /** Remove animations in flight and land them immediately. */
  flush() {
    for (const s of this.samples) this.land(s.mean);
    this.samples = [];
    this.xbarLabel.visible = false;
  }

  scaleMax() {
    const maxC = Math.max(1, ...this.counts);
    if (!this.pop.finiteVar || !this.landed) return maxC;
    const se = this.pop.sigma / Math.sqrt(this.n);
    const peak = (this.landed * this.bins.w) / (se * Math.sqrt(2 * Math.PI));
    return Math.max(maxC, Math.min(peak, maxC * 3));
  }

  layoutColumns(instant = false, dt = 0.016) {
    const b = this.bins, d = this._dummy;
    const sm = this.scaleMax();
    const cw = ((2 * XH) / b.nb) * 0.82;
    const k = instant ? 1 : Math.min(1, dt * 9);
    for (let i = 0; i < b.nb; i++) {
      const target = (this.counts[i] / sm) * MEAN_H;
      this.colHeights[i] += (target - this.colHeights[i]) * k;
      const h = this.colHeights[i];
      const empty = this.counts[i] === 0 && h < 0.004;
      d.position.set(this.meanX(b.lo + (i + 0.5) * b.w), 0.06, MEAN_Z);
      if (empty) d.scale.set(0.0001, 0.0001, 0.0001); else d.scale.set(cw, Math.max(0.004, h), 0.55);
      d.updateMatrix();
      this.meanCols.setMatrixAt(i, d.matrix);
    }
    this.meanCols.count = b.nb;
    this.meanCols.instanceMatrix.needsUpdate = true;
  }

  rebuildCurve() {
    if (this.curveMesh) {
      this.scene.remove(this.curveMesh);
      this.curveMesh.geometry.dispose();
      this.curveMesh = null;
    }
    if (!this.pop.finiteVar || this.landed < 1) return;
    const se = this.pop.sigma / Math.sqrt(this.n);
    const mu = this.pop.mu;
    const sm = this.scaleMax();
    const pts = [];
    const b = this.bins;
    const a = Math.max(b.lo, mu - 4.5 * se), z = Math.min(b.hi, mu + 4.5 * se);
    for (let i = 0; i <= 120; i++) {
      const x = a + ((z - a) * i) / 120;
      const y = ((this.landed * b.w * phi((x - mu) / se)) / se / sm) * MEAN_H;
      pts.push(new THREE.Vector3(this.meanX(x), 0.08 + y, MEAN_Z + 0.34));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.curveMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.045, 6, false), this.curveMat);
    this.scene.add(this.curveMesh);
  }

  highlight(which) { this.pulse[which] = 1.6; }

  // ---------- per-frame ----------
  frame(dt) {
    if (!this.ok || !this.pop) return;
    const d = this._dummy;
    let bi = 0, ki = 0;
    const done = [];
    let labelSample = null;
    for (const s of this.samples) {
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      const Mx = this.popX(s.mean), My = 5.0, Mz = -0.9;
      const split = s.mode === 'full' ? 0.62 : 0;
      if (s.mode === 'full' && u < split) {
        for (let j = 0; j < s.values.length && bi < MAX_BALLS; j++) {
          const v = s.values[j];
          const sx = this.popX(v), sy = this.popBarH(v) + 0.15, sz = POP_Z + s.jit[j][0] * 0.5;
          const px = sx, py = 4.1 + s.jit[j][1] * 0.9, pz = POP_Z + 0.9;
          let x, y, z, sc;
          if (u < 0.3) {
            const e = easeOut(u / 0.3);
            x = sx; y = sy + (py - sy) * e; z = sz + (pz - sz) * e; sc = e;
          } else {
            const e = easeInOut((u - 0.3) / (split - 0.3));
            x = px + (Mx - px) * e; y = py + (My - py) * e; z = pz + (Mz - pz) * e; sc = 1 - 0.45 * e;
          }
          d.position.set(x, y, z);
          d.scale.setScalar(Math.max(0.001, sc));
          d.updateMatrix();
          this.balls.setMatrixAt(bi++, d.matrix);
        }
      }
      if (u >= split) {
        const e = (u - split) / (1 - split);
        const k = Math.floor((s.mean - this.bins.lo) / this.bins.w);
        const inside = k >= 0 && k < this.bins.nb;
        const Lx = this.meanX(Math.min(this.bins.hi, Math.max(this.bins.lo, s.mean)));
        const Ly = (inside ? this.colHeights[k] : 0) + 0.2;
        const x = Mx + (Lx - Mx) * easeInOut(e);
        const z = Mz + (MEAN_Z - Mz) * easeInOut(e);
        const y = My + (Ly - My) * e * e + Math.sin(Math.PI * e) * 0.9;
        const grow = s.mode === 'full' ? Math.min(1, e * 5) : 1;
        d.position.set(x, y, z);
        d.scale.setScalar(grow * (inside ? 1 : 1 - e));
        d.updateMatrix();
        if (ki < MAX_BEADS) this.beads.setMatrixAt(ki++, d.matrix);
        if (s.label) labelSample = { s, x, y, z };
      }
      if (u >= 1) done.push(s);
    }
    for (const s of done) this.land(s.mean);
    if (done.length) this.samples = this.samples.filter((s) => !done.includes(s));
    this.balls.count = bi;
    this.beads.count = ki;
    this.balls.instanceMatrix.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true;

    if (labelSample) {
      this.xbarLabel.visible = true;
      this.setLabel(this.xbarLabel, `sample mean ${fmt(labelSample.s.mean)}`);
      this.xbarLabel.position.set(labelSample.x + 0.3, labelSample.y + 0.45, labelSample.z);
    } else {
      this.xbarLabel.visible = false;
    }

    this.layoutColumns(false, dt);
    this._curveTimer -= dt;
    if (this._curveDirty && this._curveTimer <= 0) {
      this.rebuildCurve();
      this._curveDirty = false;
      this._curveTimer = 0.15;
    }

    for (const key of ['pop', 'mean']) {
      if (this.pulse[key] > 0) this.pulse[key] = Math.max(0, this.pulse[key] - dt);
    }
    const pp = this.pulse.pop, pm = this.pulse.mean;
    this.popMat.emissiveIntensity = 0.08 + (pp > 0 ? 0.6 * Math.abs(Math.sin(pp * 6)) : 0);
    this.meanMat.emissiveIntensity = 0.12 + (pm > 0 ? 0.6 * Math.abs(Math.sin(pm * 6)) : 0);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  get busy() { return this.samples.length > 0; }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); }
function fmtTick(v) {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(r) < 1 ? 2 : 1);
}
export function niceTicks(a, b, count) {
  const span = b - a;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
