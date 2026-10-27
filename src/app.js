// Averages Lab: wiring for controls, simulation loop, tutorial, challenges and achievements.
import { population, POP_LIST, mulberry32, seedFrom, meanBins, binCounts, summarize, DEFAULT_CUSTOM, clamp } from './dist.js';
import { drawPopulation, drawMeans, geom, prepCanvas, niceTicks } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REPS = [50, 100, 200, 500, 1000, 2000, 3000, 5000];
const SPEEDS = {
  watch: { rate: 0.42, mode: 'full', dur: 2.6 },
  normal: { rate: 4, mode: 'full', dur: 1.4 },
  fast: { rate: 45, mode: 'bead', dur: 0.75 },
  turbo: { rate: 900, mode: 'none', dur: 0 },
  brisk: { rate: 260, mode: 'bead', dur: 0.6 }, // used by challenges: quick but still visible
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = new Intl.NumberFormat('en-US');

const S = {
  popId: 'die', p: 0.2, custom: [...DEFAULT_CUSTOM], n: 10, repsIdx: 4, seed: '2026',
  speed: reducedMotion ? 'fast' : 'normal', zoom: false,
  running: false, means: [], rng: null, pop: null, bins: null, acc: 0, dirty: true,
  customSel: 0, summary: { N: 0 }, completed: false,
};
let stage = null;

// ---------------------------------------------------------------- storage
const STORE_KEY = 'clt-averages-lab-v1';
const store = (() => {
  let data = { badges: [], tutorial: [], challenges: {}, correct: 0 };
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) data = { ...data, ...JSON.parse(raw) }; } catch (e) { /* storage unavailable */ }
  return {
    data,
    save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } },
  };
})();

// ---------------------------------------------------------------- formatting
const f3 = (v) => (v == null || !isFinite(v) ? '–' : (Math.abs(v) >= 1000 ? nf.format(Math.round(v)) : v.toFixed(3)));
const f2 = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(2));

// ---------------------------------------------------------------- core simulation
function rebuild({ keepMeans = false } = {}) {
  S.pop = population(S.popId, { p: S.p, weights: S.custom });
  S.bins = meanBins(S.pop, S.n, S.zoom);
  if (!keepMeans) {
    S.rng = mulberry32(seedFrom(S.seed));
    S.means = [];
    S.acc = 0;
    S.completed = false;
  }
  if (stage) {
    stage.configure(S.pop, S.n, S.bins);
    if (keepMeans) stage.loadMeans(S.means);
  }
  drawPop();
  S.dirty = true;
  updateUI();
}

function drawOne(mode, dur) {
  const n = S.n, vals = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) { const v = S.pop.sample(S.rng); vals[i] = v; s += v; }
  const m = s / n;
  S.means.push(m);
  if (stage) stage.addSample(vals, m, mode, dur);
  S.dirty = true;
  award('first');
  return m;
}

function target() { return REPS[S.repsIdx]; }

function setRunning(on) {
  if (on && S.means.length >= target()) {
    // finished run: start a fresh one with a new seed so the learner sees new randomness
    setSeed(String(Math.floor(1000 + Math.random() * 899000)));
    rebuild();
  }
  S.running = on;
  if (on) S.acc = Math.max(S.acc, 0.999);
  const b = $('#runBtn');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.textContent = on ? 'Pause' : (S.means.length >= target() ? 'Run again' : (S.means.length ? 'Resume' : 'Run'));
}

function stepOnce() {
  setRunning(false);
  if (S.means.length >= target()) { S.repsIdx = Math.min(REPS.length - 1, S.repsIdx + 1); syncControls(); }
  drawOne(reducedMotion ? 'bead' : 'full', 2.6);
  setRunning(false);
}

let last = performance.now();
let uiTimer = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.running) {
    const sp = SPEEDS[S.speed];
    S.acc += dt * sp.rate;
    let k = Math.floor(S.acc);
    S.acc -= k;
    while (k-- > 0 && S.means.length < target()) drawOne(sp.mode, sp.dur);
    if (S.means.length >= target()) {
      setRunning(false);
      onRunComplete();
    }
  }
  if (stage) stage.frame(dt);
  uiTimer -= dt;
  if (S.dirty && uiTimer <= 0) { updateUI(); uiTimer = 0.12; }
  requestAnimationFrame(loop);
}

/** Run a whole experiment instantly, without animation (used by challenges). */
function runInstant() {
  setRunning(false);
  while (S.means.length < target()) drawOne('none', 0);
  if (stage) stage.flush();
  updateUI();
}

// ---------------------------------------------------------------- UI update
function drawPop() {
  const c = $('#popChart');
  drawPopulation(c, S.pop, S.popId === 'custom' ? S.customSel : -1);
  c.setAttribute('aria-label', `${S.pop.name} population. ${S.pop.story}`);
  c.classList.toggle('editable', S.popId === 'custom');
  c.tabIndex = S.popId === 'custom' ? 0 : -1;
  $('#customHint').hidden = S.popId !== 'custom';
  $('#popStory').textContent = S.pop.story;
  $('#pField').hidden = S.popId !== 'bernoulli';
}

function updateUI() {
  S.dirty = false;
  const pop = S.pop, N = S.means.length;
  const { counts, outside } = binCounts(S.means, S.bins);
  drawMeans($('#meansChart'), pop, S.n, S.bins, counts, N);
  const sm = summarize(S.means);
  S.summary = { ...sm, outside };
  const se = pop.finiteVar ? pop.sigma / Math.sqrt(S.n) : null;

  $('#st-mu').textContent = pop.finiteVar ? f3(pop.mu) : 'does not exist';
  $('#st-sigma').textContent = pop.finiteVar ? f3(pop.sigma) : 'infinite';
  $('#st-se').textContent = se ? f3(se) : 'not defined';
  $('#st-N').textContent = nf.format(N);
  $('#st-mbar').textContent = N ? f3(sm.mean) : '–';
  $('#st-sd').textContent = N > 1 ? f3(sm.sd) : '–';
  $('#st-ratio').textContent = N > 1 && se ? f2(sm.sd / se) : '–';
  $('#st-skew').textContent = N > 2 ? f2(sm.skew) : '–';
  $('#st-iqr').textContent = N > 3 ? f3(sm.iqr) : '–';
  if (N && se) {
    let inside = 0;
    for (const m of S.means) if (Math.abs(m - pop.mu) <= 1.96 * se) inside++;
    $('#st-in95').textContent = `${((100 * inside) / N).toFixed(1)}%`;
  } else $('#st-in95').textContent = '–';

  const text = readingText(sm, se, outside);
  $('#reading').innerHTML = text.html;
  $('#meansChart').setAttribute('aria-label', text.plain);
  const rb = $('#runBtn');
  if (!S.running) rb.textContent = N >= target() ? 'Run again' : (N ? 'Resume' : 'Run');
  checkBadges();
}

function shapeWord(skew) {
  const a = Math.abs(skew);
  if (a < 0.15) return 'close to symmetric, bell-like';
  if (a < 0.5) return skew > 0 ? 'slightly lopsided (longer right tail)' : 'slightly lopsided (longer left tail)';
  return skew > 0 ? 'clearly lopsided, with a long right tail' : 'clearly lopsided, with a long left tail';
}

function readingText(sm, se, outside) {
  const pop = S.pop, N = sm.N || 0;
  if (!N) {
    const plain = `No samples yet. Each sample takes n = ${S.n} values from the ${pop.name.toLowerCase()} population and averages them. Press Run or Step.`;
    return { plain, html: `<strong>What you will see:</strong> ${plain.replace('No samples yet. ', '')}` };
  }
  let s = `${nf.format(N)} sample means so far, centred at ${f3(sm.mean)}`;
  if (pop.finiteVar) s += ` (true μ = ${f3(pop.mu)}), with a spread of ${f3(sm.sd)} (theory σ/√n = ${f3(se)})`;
  else s += `, middle half spanning ${f3(sm.iqr)}`;
  s += `. Shape: ${shapeWord(sm.skew)}.`;
  const tips = [];
  if (S.n === 1) tips.push('With n = 1 each “mean” is just one value, so this histogram copies the population. Raise n.');
  if (!pop.finiteVar) tips.push(`Heavy tails: ${nf.format(outside)} means landed off the chart. Raising n will not narrow this distribution, because the variance is infinite.`);
  if (pop.id === 'skewed' && S.n > 1 && S.n < 30) tips.push('The population is strongly skewed and n is small, so the means keep part of that lopsided shape. Try n = 30, then 100.');
  if (pop.id === 'bernoulli') {
    const np = S.n * pop.p, nq = S.n * (1 - pop.p);
    if (Math.min(np, nq) < 10) tips.push(`Here np = ${np.toFixed(1)} and n(1 − p) = ${nq.toFixed(1)}. When either is below about 10, the means are lumpy and lopsided and the normal curve is only a rough fit.`);
  }
  if (pop.id === 'normal') tips.push('A normal population gives normal means for every n, even n = 2. The CLT matters for the other populations.');
  if (N < 200 && S.n > 1) tips.push('Few samples so far, so the bars are bumpy. More samples make the picture smoother but not narrower: only a bigger n does that.');
  const plain = `${s} ${tips.join(' ')}`;
  const html = `<strong>Reading the result:</strong> ${s}${tips.length ? ` <span class="small">${tips.join(' ')}</span>` : ''}`;
  return { plain, html };
}

function onRunComplete() {
  checkBadges(true);
  if (activeChallenge && activeChallenge.phase === 'running') finishChallenge();
}

// ---------------------------------------------------------------- controls
function setSeed(v) {
  S.seed = v;
  $('#seedInput').value = v;
}

function syncControls() {
  $('#popSelect').value = S.popId;
  $('#nRange').value = S.n; $('#nOut').textContent = S.n;
  $('#repsRange').value = S.repsIdx; $('#repsOut').textContent = nf.format(target());
  $('#pRange').value = S.p; $('#pOut').textContent = S.p.toFixed(2);
  $$('input[name="speed"]').forEach((r) => { r.checked = r.value === S.speed; });
  $('#zoomCheck').checked = S.zoom;
  $('#seedInput').value = S.seed;
}

function initControls() {
  const sel = $('#popSelect');
  for (const p of POP_LIST) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.label;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { S.popId = sel.value; setRunning(false); rebuild(); });
  $('#nRange').addEventListener('input', (e) => { S.n = +e.target.value; $('#nOut').textContent = S.n; setRunning(false); rebuild(); });
  $('#pRange').addEventListener('input', (e) => { S.p = +e.target.value; $('#pOut').textContent = S.p.toFixed(2); setRunning(false); rebuild(); });
  $('#repsRange').addEventListener('input', (e) => {
    S.repsIdx = +e.target.value;
    $('#repsOut').textContent = nf.format(target());
    if (S.means.length > target()) { setRunning(false); S.means.length = target(); rebuild({ keepMeans: true }); }
    else { S.completed = false; S.dirty = true; }
  });
  $$('input[name="speed"]').forEach((r) => r.addEventListener('change', () => { S.speed = r.value; }));
  $('#zoomCheck').addEventListener('change', (e) => { S.zoom = e.target.checked; rebuild({ keepMeans: true }); });
  $('#seedInput').addEventListener('change', (e) => {
    setSeed(e.target.value.trim() || '1');
    setRunning(false); rebuild(); award('seed');
  });
  $('#newSeed').addEventListener('click', () => {
    setSeed(String(Math.floor(1000 + Math.random() * 899000)));
    setRunning(false); rebuild(); award('seed');
  });
  $('#runBtn').addEventListener('click', () => setRunning(!S.running));
  $('#stepBtn').addEventListener('click', stepOnce);
  $('#resetBtn').addEventListener('click', () => { setRunning(false); rebuild(); });

  $$('[data-view]').forEach((b) => b.addEventListener('click', () => stage && stage.setView(b.dataset.view)));
  $('#rotL').addEventListener('click', () => stage && stage.orbit(-25));
  $('#rotR').addEventListener('click', () => stage && stage.orbit(25));
  $('#autoRot').addEventListener('change', (e) => stage && stage.setAutoRotate(e.target.checked));

  $$('input[name="depth"]').forEach((r) => r.addEventListener('change', () => {
    document.body.dataset.depth = r.value;
    try { localStorage.setItem('clt-depth', r.value); } catch (e) { /* ignore */ }
    redrawStatic();
  }));
  try {
    const d = localStorage.getItem('clt-depth');
    if (d) { document.body.dataset.depth = d; const r = $(`input[name="depth"][value="${d}"]`); if (r) r.checked = true; }
  } catch (e) { /* ignore */ }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const typing = t.matches('input[type="text"], select, textarea');
    const interactive = t.matches('button, a, input, select, summary, canvas, video');
    if (e.key === ' ' && !interactive && !typing) { e.preventDefault(); setRunning(!S.running); }
    else if ((e.key === 's' || e.key === 'S') && !typing) stepOnce();
    else if ((e.key === 'r' || e.key === 'R') && !typing) { setRunning(false); rebuild(); }
  });

  // custom population editing
  const pc = $('#popChart');
  let dragging = false;
  let pending = null;
  const editAt = (ev) => {
    const r = pc.getBoundingClientRect();
    const g = geom(pc);
    const x = ev.clientX - r.left - g.left, y = ev.clientY - r.top - g.top;
    const i = clamp(Math.floor((x / g.pw) * 10), 0, 9);
    // match drawPopulation scaling: maxY = max(weights)*1.12 on normalised weights is unstable while dragging,
    // so editing uses the raw 0..10 heights
    const val = clamp((1 - y / g.ph) * 10, 0, 10);
    S.custom[i] = Math.round(val * 10) / 10;
    S.customSel = i;
    S.pop = population('custom', { weights: S.custom });
    drawPop();
  };
  pc.addEventListener('pointerdown', (ev) => {
    if (S.popId !== 'custom') return;
    dragging = true; pc.setPointerCapture(ev.pointerId); setRunning(false); editAt(ev);
  });
  pc.addEventListener('pointermove', (ev) => { if (dragging) editAt(ev); });
  const end = () => { if (!dragging) return; dragging = false; rebuild(); };
  pc.addEventListener('pointerup', end);
  pc.addEventListener('pointercancel', end);
  pc.addEventListener('keydown', (e) => {
    if (S.popId !== 'custom') return;
    let used = true;
    if (e.key === 'ArrowLeft') S.customSel = Math.max(0, S.customSel - 1);
    else if (e.key === 'ArrowRight') S.customSel = Math.min(9, S.customSel + 1);
    else if (e.key === 'ArrowUp') S.custom[S.customSel] = Math.min(10, S.custom[S.customSel] + 0.5);
    else if (e.key === 'ArrowDown') S.custom[S.customSel] = Math.max(0, S.custom[S.customSel] - 0.5);
    else used = false;
    if (!used) return;
    e.preventDefault();
    S.pop = population('custom', { weights: S.custom });
    drawPop();
    clearTimeout(pending);
    pending = setTimeout(() => { setRunning(false); rebuild(); }, 350);
  });
}

// ---------------------------------------------------------------- badges
const BADGES = [
  { id: 'first', icon: '1', name: 'First draw', desc: 'Draw your first sample.' },
  { id: 'century', icon: 'C', name: 'Century', desc: 'Collect 100 sample means in one run.' },
  { id: 'bell', icon: '∩', name: 'Bell ringer', desc: 'Get a bell (|skewness| < 0.15) from 1,000+ means of a non-normal population.' },
  { id: 'skew', icon: 'S', name: 'Skew tamer', desc: 'Run the skewed population with n ≥ 30 and 1,000+ means.' },
  { id: 'seed', icon: '#', name: 'Reproducible', desc: 'Change the random seed.' },
  { id: 'tutorial', icon: 'A', name: 'Vocabulary complete', desc: 'Finish the tutorial.' },
  { id: 'forecaster', icon: '✓', name: 'Sharp forecaster', desc: 'Make 3 correct predictions in the challenges.' },
  { id: 'graduate', icon: '★', name: 'Lab graduate', desc: 'Complete all six challenges.' },
  { id: 'breaker', icon: '∞', name: 'Theorem breaker', desc: 'Run the Cauchy population with n ≥ 30 and 500+ means.' },
  { id: 'designer', icon: '✎', name: 'Designer', desc: 'Draw a custom population and collect 500+ means.' },
];

function renderBadges() {
  const list = $('#badgeList');
  list.innerHTML = '';
  for (const b of BADGES) {
    const got = store.data.badges.includes(b.id);
    const li = document.createElement('li');
    li.className = got ? 'earned' : '';
    li.innerHTML = `<span class="badge-icon" aria-hidden="true">${b.icon}</span><span><b>${b.name}</b>${b.desc}<span class="sr-only">${got ? ' Earned.' : ' Not earned yet.'}</span></span>`;
    list.appendChild(li);
  }
  const n = store.data.badges.length;
  $('#badgeCount').textContent = `${n} / ${BADGES.length}`;
  $('#badgeMeter').setAttribute('aria-valuenow', n);
  $('#badgeMeter span').style.width = `${(100 * n) / BADGES.length}%`;
}

function award(id) {
  if (store.data.badges.includes(id)) return;
  store.data.badges.push(id);
  store.save();
  renderBadges();
  const b = BADGES.find((x) => x.id === id);
  toast(`Achievement unlocked: ${b.name}`);
}

function checkBadges() {
  const N = S.means.length, sm = S.summary, pop = S.pop;
  if (N >= 100) award('century');
  if (N >= 1000 && pop.finiteVar && pop.id !== 'normal' && Math.abs(sm.skew) < 0.15 && S.n > 1) award('bell');
  if (N >= 1000 && pop.id === 'skewed' && S.n >= 30) award('skew');
  if (N >= 500 && pop.id === 'cauchy' && S.n >= 30) award('breaker');
  if (N >= 500 && pop.id === 'custom') award('designer');
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function flash(el) {
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function goLab() {
  $('#lab').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function applySettings(o) {
  setRunning(false);
  if (o.pop) S.popId = o.pop;
  if (o.n) S.n = o.n;
  if (o.p) S.p = o.p;
  if (o.reps) S.repsIdx = REPS.indexOf(o.reps);
  if (o.speed) S.speed = o.speed;
  if ('zoom' in o) S.zoom = o.zoom;
  syncControls();
  rebuild();
}

// ---------------------------------------------------------------- tutorial
const TUT = [
  {
    term: 'Population',
    def: 'All the values you could possibly observe.',
    ex: 'Here: minutes customers wait at a help desk. Most waits are short and a few are very long, so the shape is lopsided (we say <em>skewed</em>).',
    deeper: 'Its mean μ = 2 and standard deviation σ = 2 are fixed numbers. In real research they are unknown, and estimating them is the whole point.',
    action: 'Show the population',
    run() { applySettings({ pop: 'skewed', n: 5, reps: 1000, zoom: false }); goLab(); stage && stage.highlight('pop'); flash($('#popChart').parentElement); },
  },
  {
    term: 'Sample',
    def: 'A handful of values picked at random from the population. The letter n says how many.',
    ex: 'We pick n = 5 waiting times. Watch five small purple balls rise out of the population wall.',
    deeper: 'Random selection matters: it is what makes the values independent and the sample fair.',
    action: 'Draw one sample',
    run() { if (S.popId !== 'skewed' || S.n !== 5) applySettings({ pop: 'skewed', n: 5, reps: 1000, zoom: false }); goLab(); stepOnce(); },
  },
  {
    term: 'Sample mean (<span class="xbar">x</span>)',
    def: 'The average of one sample: add the n values and divide by n.',
    ex: 'The five balls merge into one golden bead. Its position is <span class="xbar">x</span>. Another sample gives a different bead, a little to the left or right.',
    deeper: '<span class="xbar">x</span> is a <em>random variable</em>: before you sample, you do not know its value, but you can describe its distribution.',
    action: 'Draw another sample',
    run() { if (S.popId !== 'skewed') applySettings({ pop: 'skewed', n: 5, reps: 1000 }); goLab(); stepOnce(); },
  },
  {
    term: 'Sampling distribution',
    def: 'What you get when you repeat the sampling many times and pile up all the <span class="xbar">x</span> values.',
    ex: 'This is the golden histogram at the front of the 3D view. The Central Limit Theorem is a statement about this pile, not about the population.',
    deeper: 'In practice you only ever see one sample. The sampling distribution is the thought experiment that tells you how far that one <span class="xbar">x</span> could be from μ.',
    action: 'Collect 1,000 means',
    run() { if (S.popId !== 'skewed') applySettings({ pop: 'skewed', n: 5, reps: 1000 }); S.speed = 'turbo'; syncControls(); goLab(); setRunning(true); },
  },
  {
    term: 'Standard deviation (σ)',
    def: 'The typical distance of one single value from the population mean.',
    ex: 'For these waiting times σ = 2 minutes. A single wait is often about 2 minutes away from the average wait.',
    deeper: 'σ² is the variance: the average squared distance from μ. The CLT needs it to be finite.',
    action: 'Highlight σ',
    run() { goLab(); flash($('#st-sigma').parentElement); },
  },
  {
    term: 'Standard error (σ/√n)',
    def: 'The typical distance of a sample mean from μ. Averages wobble less than single values, so it is smaller than σ.',
    ex: 'With n = 5: 2 / √5 ≈ 0.89. With n = 20: 2 / √20 ≈ 0.45. Four times the data, half the wobble.',
    deeper: 'Compare “SD of the means” (measured) with σ/√n (theory) in the Live numbers panel. Their ratio should be close to 1.',
    action: 'Try n = 20',
    run() { applySettings({ pop: 'skewed', n: 20, reps: 1000, speed: 'turbo' }); goLab(); setRunning(true); flash($('#st-se').parentElement); },
  },
  {
    term: 'Putting it together',
    def: 'The CLT: for large enough n, <span class="xbar">x</span> is approximately normal, centred at μ, with spread σ/√n.',
    ex: 'Notice what it does <em>not</em> say. The waiting times themselves stay skewed. Only the averages turn into a bell.',
    deeper: 'Next: test your intuition in the “What if?” challenges, or open the Master\'s level for the formal statements.',
    action: 'Go to the challenges',
    run() { $('#challenges').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }); },
  },
];
let tutIdx = 0;

function renderTutorial() {
  const dots = $('#tutDots');
  dots.innerHTML = '';
  TUT.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tut-dot' + (store.data.tutorial.includes(i) ? ' done' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === tutIdx ? 'true' : 'false');
    b.textContent = `${i + 1}. ${t.term.replace(/ \(.*\)/, '')}`;
    b.addEventListener('click', () => { tutIdx = i; renderTutorial(); });
    dots.appendChild(b);
  });
  const t = TUT[tutIdx];
  $('#tutBody').innerHTML = `<p class="eyebrow">Step ${tutIdx + 1} of ${TUT.length}</p><h3>${t.term}</h3><p class="def">${t.def}</p><p class="example">${t.ex}</p><p class="ba-up small">${t.deeper}</p>`;
  $('#tutAction').textContent = t.action;
  $('#tutPrev').disabled = tutIdx === 0;
  $('#tutNext').textContent = tutIdx === TUT.length - 1 ? 'Finish' : 'Next';
  if (!store.data.tutorial.includes(tutIdx)) { store.data.tutorial.push(tutIdx); store.save(); }
  if (store.data.tutorial.length >= TUT.length) award('tutorial');
}

function initTutorial() {
  $('#tutPrev').addEventListener('click', () => { tutIdx = Math.max(0, tutIdx - 1); renderTutorial(); });
  $('#tutNext').addEventListener('click', () => {
    if (tutIdx === TUT.length - 1) { award('tutorial'); $('#lab').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }); return; }
    tutIdx++; renderTutorial();
  });
  $('#tutAction').addEventListener('click', () => TUT[tutIdx].run());
  renderTutorial();
}

// ---------------------------------------------------------------- challenges
const CH = [
  {
    id: 'bigger-n', title: 'Bigger samples', level: 'All levels', sub: 'n = 4 → 16, uniform population',
    before: { pop: 'uniform', n: 4, reps: 2000, zoom: false }, after: { n: 16 },
    q: 'We make every sample four times bigger: n = 4 → n = 16. What happens to the spread (SD) of the sample means?',
    options: [['wider', 'It gets wider'], ['half', 'It shrinks to about half'], ['quarter', 'It shrinks to about a quarter'], ['same', 'It stays the same']],
    correct: 'half',
    explain: (B, A, se) => `The SD of the means went from <b>${f3(B.sd)}</b> to <b>${f3(A.sd)}</b>, a ratio of ${f2(B.sd / A.sd)}. The standard error is σ/√n, and √16 / √4 = 2. Four times the data buys twice the precision, not four times.`,
  },
  {
    id: 'more-reps', title: 'More repetitions', level: 'All levels', sub: '200 → 5,000 samples, same n',
    before: { pop: 'uniform', n: 10, reps: 200, zoom: false }, after: { reps: 5000 },
    q: 'We keep n = 10 but collect 5,000 sample means instead of 200. What happens to the spread of the sample means?',
    options: [['shrink', 'It shrinks a lot'], ['same', 'It stays about the same; the histogram just gets smoother'], ['grow', 'It grows']],
    correct: 'same',
    explain: (B, A, se) => `SD of the means: <b>${f3(B.sd)}</b> with 200 samples and <b>${f3(A.sd)}</b> with 5,000. Both sit close to σ/√n = ${f3(se)}. More repetitions draw a clearer picture of the sampling distribution, but only a larger n makes it narrower. This is one of the most common mix-ups in statistics.`,
  },
  {
    id: 'skew', title: 'Taming skew', level: 'All levels', sub: 'Waiting times, n = 2 → 50',
    before: { pop: 'skewed', n: 2, reps: 2000, zoom: false }, after: { n: 50 },
    q: 'The waiting-time population is strongly skewed, and at n = 2 the means are still lopsided. What will the means look like at n = 50?',
    options: [['skewed', 'Just as lopsided as the population'], ['bell', 'Close to a symmetric bell'], ['flat', 'Flat']],
    correct: 'bell',
    explain: (B, A) => `Skewness of the means dropped from <b>${f2(B.skew)}</b> to <b>${f2(A.skew)}</b>. Theory says it shrinks like 2/√n: about 1.41 at n = 2 and 0.28 at n = 50. The population itself never changed. Only the averages lost their lopsidedness, and the stronger the skew, the larger the n you need.`,
  },
  {
    id: 'center', title: 'Where is the centre?', level: 'All levels', sub: 'Two-peaked population, n = 1 → 25',
    before: { pop: 'bimodal', n: 1, reps: 2000, zoom: false }, after: { n: 25 },
    q: 'This population has peaks at 2.5 and 7.5, and almost no values near 5. With n = 25, where will the sample means pile up?',
    options: [['two', 'Two piles, at 2.5 and 7.5'], ['one', 'One pile near 5, where single values are rare'], ['even', 'Spread evenly from 0 to 10']],
    correct: 'one',
    explain: (B, A, se) => `With n = 1 each “mean” is a single value, so the histogram copied the two peaks. At n = 25 the means are centred at <b>${f3(A.mean)}</b> with SD <b>${f3(A.sd)}</b> (theory ${f3(se)}). The theorem does not care about the gap: averages gather around μ, a value single observations hardly ever take.`,
  },
  {
    id: 'rare', title: 'Rare “yes” answers', level: 'Bachelor+', sub: 'p = 0.10, n = 10 → 100',
    before: { pop: 'bernoulli', p: 0.1, n: 10, reps: 2000, zoom: false }, after: { n: 100 },
    q: 'Only 10% of people answer yes (p = 0.10). At n = 10 the share of yes answers is lumpy and piled near 0. What happens at n = 100?',
    options: [['closer', 'Much closer to a bell, though still a little lopsided'], ['exact', 'Exactly normal'], ['nochange', 'No visible change']],
    correct: 'closer',
    explain: (B, A) => `Skewness fell from <b>${f2(B.skew)}</b> to <b>${f2(A.skew)}</b>. For yes/no data the skewness of the mean is (1 − 2p)/√(np(1 − p)), so rare events need big samples. A common guide asks for np ≥ 10 and n(1 − p) ≥ 10; here np = 10, right at the edge. “Exactly normal” is never true: the share can only take the values 0, 0.01, 0.02 and so on.`,
  },
  {
    id: 'break', title: 'Breaking the theorem', level: 'Advanced', sub: 'Cauchy population, n = 1 → 100',
    before: { pop: 'cauchy', n: 1, reps: 2000, zoom: false }, after: { n: 100 },
    q: 'The Cauchy population has tails so heavy that its variance is infinite. What happens to the spread of the means when n goes from 1 to 100?',
    options: [['ten', 'It shrinks 10 times, like σ/√n'], ['none', 'It does not shrink at all'], ['two', 'It shrinks about 2 times']],
    correct: 'none',
    explain: (B, A) => `The middle half of the means (IQR) was <b>${f3(B.iqr)}</b> at n = 1 and <b>${f3(A.iqr)}</b> at n = 100: no improvement. The mean of n Cauchy values has exactly the same Cauchy distribution as one value, because a single wild value can drag the whole average. This is why the CLT needs finite variance, and why heavy-tailed data call for robust tools such as the median.`,
  },
];
let activeChallenge = null;

function renderChallengeGrid() {
  const g = $('#challengeGrid');
  g.innerHTML = '';
  CH.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'challenge-card' + (store.data.challenges[c.id] ? ' done' : '');
    if (activeChallenge && activeChallenge.c.id === c.id) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<span class="ch-num">Challenge ${i + 1}</span><span class="ch-title">${c.title}</span><span class="ch-sub">${c.sub}</span><span class="ch-level">${c.level}</span>`;
    b.addEventListener('click', () => startChallenge(c));
    g.appendChild(b);
  });
}

function startChallenge(c) {
  activeChallenge = { c, phase: 'predict', choice: null };
  applySettings(c.before);
  runInstant();
  activeChallenge.B = { ...S.summary };
  renderChallengeGrid();
  renderChallengePanel();
  const p = $('#challengePanel');
  p.hidden = false;
  p.focus({ preventScroll: true });
  p.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
}

function describe(o) {
  const pop = POP_LIST.find((p) => p.id === o.pop).label;
  return `${pop}${o.p ? `, p = ${o.p}` : ''}, n = ${o.n}, ${nf.format(o.reps)} samples`;
}

function renderChallengePanel() {
  const a = activeChallenge, c = a.c, p = $('#challengePanel');
  const opts = c.options.map(([id, text]) => {
    let cls = 'option';
    if (a.phase === 'result') cls += id === c.correct ? ' correct' : (id === a.choice ? ' wrong' : '');
    return `<label class="${cls}"><input type="radio" name="pred" value="${id}" ${a.choice === id ? 'checked' : ''} ${a.phase !== 'predict' ? 'disabled' : ''}><span>${text}${a.phase === 'result' && id === c.correct ? ' <b>(correct)</b>' : ''}</span></label>`;
  }).join('');
  let body = `<p class="eyebrow">${c.level}</p><h3>${c.title}</h3>
    <p>The lab now shows the <b>starting point</b>: ${describe(c.before)}. <a href="#lab" class="peek">Have a look at it</a>, then come back and predict.</p>
    <p><strong>${c.q}</strong></p>
    <fieldset class="options"><legend class="sr-only">Your prediction</legend>${opts}</fieldset>`;
  if (a.phase === 'predict') {
    body += `<div class="ch-actions"><button type="button" class="btn btn-primary" id="lockBtn" ${a.choice ? '' : 'disabled'}>Lock in my prediction and run the test</button></div>`;
  } else if (a.phase === 'running') {
    body += `<p class="feedback" role="status">Running the test in the lab… The result will appear here when all samples are in.</p>`;
  } else {
    const se = S.pop.finiteVar ? S.pop.sigma / Math.sqrt(S.n) : null;
    const good = a.choice === c.correct;
    const B = a.B, A = a.A;
    const metric = c.id === 'break'
      ? [['IQR of means', f3(B.iqr), f3(A.iqr)]]
      : [['SD of means', f3(B.sd), f3(A.sd)], ['Skewness', f2(B.skew), f2(A.skew)]];
    body += `<div class="feedback ${good ? 'good' : 'try'}" role="status">
      <p><strong>${good ? 'Spot on. Your intuition matches the statistics.' : 'Not this time, and that is useful: it marks exactly where intuition and statistics part ways.'}</strong></p>
      <div class="compare"><div><b>Before</b>${metric.map((m) => `${m[0]}: ${m[1]}`).join('<br>')}</div><div><b>After</b>${metric.map((m) => `${m[0]}: ${m[2]}`).join('<br>')}</div></div>
      <p>${c.explain(B, A, se)}</p></div>
      <div class="ch-actions"><button type="button" class="btn" id="seeLab">See it in the lab</button>${nextChallenge() ? `<button type="button" class="btn btn-primary" id="nextCh">Next challenge</button>` : ''}</div>`;
  }
  p.innerHTML = body;
  $$('input[name="pred"]', p).forEach((r) => r.addEventListener('change', () => { a.choice = r.value; $('#lockBtn').disabled = false; }));
  const lock = $('#lockBtn', p);
  if (lock) lock.addEventListener('click', runChallengeTest);
  const see = $('#seeLab', p);
  if (see) see.addEventListener('click', goLab);
  const nx = $('#nextCh', p);
  if (nx) nx.addEventListener('click', () => startChallenge(nextChallenge()));
}

function nextChallenge() {
  const i = CH.indexOf(activeChallenge.c);
  return CH[i + 1] || null;
}

function runChallengeTest() {
  const a = activeChallenge;
  a.phase = 'running';
  renderChallengePanel();
  a.prevSpeed = S.speed === 'brisk' ? 'normal' : S.speed;
  applySettings({ ...a.c.before, ...a.c.after, speed: reducedMotion ? 'turbo' : (a.c.after.reps >= 3000 ? 'turbo' : 'brisk') });
  goLab();
  setRunning(true);
}

function finishChallenge() {
  const a = activeChallenge;
  a.A = { ...S.summary };
  a.phase = 'result';
  S.speed = a.prevSpeed || 'normal';
  syncControls();
  const good = a.choice === a.c.correct;
  store.data.challenges[a.c.id] = { done: true, correct: good };
  store.data.correct = Object.values(store.data.challenges).filter((x) => x.correct).length;
  store.save();
  if (store.data.correct >= 3) award('forecaster');
  if (CH.every((c) => store.data.challenges[c.id])) award('graduate');
  renderChallengeGrid();
  renderChallengePanel();
  toast(good ? 'Prediction correct!' : 'Result is in: see the explanation');
  const p = $('#challengePanel');
  setTimeout(() => {
    p.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    p.focus({ preventScroll: true });
  }, 900);
}

// ---------------------------------------------------------------- dice figure + transcript
function drawDice() {
  const c = $('#diceChart');
  if (!c) return;
  const { ctx, w, h } = prepCanvas(c);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dists = [];
  let cur = [1, 1, 1, 1, 1, 1];
  dists.push(cur);
  for (let k = 2; k <= 3; k++) {
    const next = new Array(cur.length + 5).fill(0);
    cur.forEach((v, i) => { for (let f = 0; f < 6; f++) next[i + f] += v; });
    dists.push(next);
    cur = next;
  }
  const rowH = (h - 30) / 3;
  const L = 34, R = 10, pw = w - L - R;
  const X = (avg) => L + ((avg - 0.75) / 5.5) * pw;
  ctx.font = '12px "Atkinson Hyperlegible", system-ui, sans-serif';
  dists.forEach((d, r) => {
    const k = r + 1, top = r * rowH + 8, base = top + rowH - 18;
    const max = Math.max(...d);
    const bw = Math.max(3, (pw / 5.5 / k) * (k === 1 ? 0.5 : 0.74));
    ctx.fillStyle = r === 0 ? css('--pop') : css('--mean');
    d.forEach((v, i) => {
      const avg = (i + k) / k;
      const hh = (v / max) * (rowH - 46);
      ctx.fillRect(X(avg) - bw / 2, base - hh, bw, hh);
    });
    ctx.fillStyle = css('--ink');
    ctx.textAlign = 'left';
    ctx.font = '600 13px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${k} ${k === 1 ? 'die' : 'dice'}: ${6 ** k} combinations`, L, top);
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = css('--line');
    ctx.beginPath(); ctx.moveTo(L, base + 0.5); ctx.lineTo(w - R, base + 0.5); ctx.stroke();
    ctx.fillStyle = css('--ink-2');
    ctx.font = '12px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let t = 1; t <= 6; t++) ctx.fillText(String(t), X(t), base + 13);
  });
  ctx.fillStyle = css('--ink-2');
  ctx.fillText('average of the dice', L + pw / 2, h - 4);
}

async function loadTranscript() {
  try {
    const res = await fetch('video/clt-captions.vtt');
    if (!res.ok) return;
    const txt = await res.text();
    const blocks = txt.split(/\r?\n\r?\n/).slice(1);
    const out = [];
    for (const b of blocks) {
      const lines = b.trim().split(/\r?\n/);
      const tl = lines.find((l) => l.includes('-->'));
      if (!tl) continue;
      const start = tl.split('-->')[0].trim().replace(/^00:/, '').replace(/\.\d+$/, '');
      out.push(`<p><span class="ts">${start}</span>${lines.slice(lines.indexOf(tl) + 1).join(' ')}</p>`);
    }
    $('#transcript').innerHTML = out.join('');
  } catch (e) { /* offline or file missing */ }
}

function redrawStatic() {
  drawPop();
  S.dirty = true;
  drawDice();
}

// ---------------------------------------------------------------- boot
async function boot() {
  initControls(); // creates the population options first
  syncControls();
  renderBadges();
  initTutorial();
  renderChallengeGrid();
  rebuild();
  drawDice();
  loadTranscript();
  const ro = new ResizeObserver(() => redrawStatic());
  ro.observe($('#popChart'));
  ro.observe($('#meansChart'));
  ro.observe($('#diceChart'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawStatic);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawStatic);
  requestAnimationFrame(loop);

  try {
    const mod = await import('./scene3d.js');
    const st = new mod.Stage($('#stage'), { reducedMotion });
    if (st.ok) {
      stage = st;
      stage.configure(S.pop, S.n, S.bins);
      stage.loadMeans(S.means);
    } else throw new Error('WebGL unavailable');
  } catch (e) {
    $('#stage').innerHTML = '<p class="stage-fallback">The 3D view needs WebGL, which is not available in this browser. The flat charts below show the same simulation.</p>';
  }
  window.__lab = { S, get stage() { return stage; }, setRunning, stepOnce, rebuild, applySettings, runInstant };
}

boot();
