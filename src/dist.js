// Populations, a seeded random number generator and summary statistics.
// Everything here is plain math, with no drawing code, so it can be tested on its own.

/** Small, fast, seeded PRNG (mulberry32). Same seed gives the same experiment. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accepts a number or any text ("lab-7") and turns it into a 32-bit seed. */
export function seedFrom(input) {
  const s = String(input ?? '').trim();
  if (/^\d+$/.test(s)) return (Number(s) >>> 0) || 1;
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

/** Standard normal draw (Box-Muller). */
export function randn(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const phi = (z) => Math.exp(-0.5 * z * z) / SQRT2PI;

export const POP_LIST = [
  { id: 'uniform', label: 'Uniform (flat)' },
  { id: 'normal', label: 'Normal (already a bell)' },
  { id: 'skewed', label: 'Highly skewed (waiting times)' },
  { id: 'bernoulli', label: 'Binary yes / no (Bernoulli)' },
  { id: 'die', label: 'Fair die (1 to 6)' },
  { id: 'bimodal', label: 'Two peaks (bimodal)' },
  { id: 'custom', label: 'Custom (draw your own)' },
  { id: 'cauchy', label: 'Heavy tails (Cauchy: breaks the CLT)' },
];

export const DEFAULT_CUSTOM = [6, 3, 1.2, 0.5, 0.2, 0.2, 0.5, 1.2, 3, 6];

/**
 * Returns a population object:
 *  lo, hi      plotting range of single values
 *  mu, sigma   exact population mean and standard deviation (null if they do not exist)
 *  center      where the distribution is centred (mu, or the median for Cauchy)
 *  discrete    true for lattice valued populations (step = lattice spacing)
 *  sample(rng) one random value
 *  pdf(x)      density (continuous) ; values [{x,p}] for discrete
 */
export function population(id, opts = {}) {
  switch (id) {
    case 'uniform':
      return {
        id, name: 'Uniform', lo: 0, hi: 10, mu: 5, sigma: 10 / Math.sqrt(12), center: 5, finiteVar: true,
        sample: (r) => 10 * r(),
        pdf: (x) => (x >= 0 && x <= 10 ? 0.1 : 0),
        story: 'Every value between 0 and 10 is equally likely, like picking a random spot on a 10 metre rope.',
      };
    case 'normal': {
      const m = 5, s = 1.5;
      return {
        id, name: 'Normal', lo: 0, hi: 10, mu: m, sigma: s, center: m, finiteVar: true,
        sample: (r) => m + s * randn(r),
        pdf: (x) => phi((x - m) / s) / s,
        story: 'Already bell shaped, for example the heights of adult plants in one field (in tens of cm).',
      };
    }
    case 'skewed': {
      const m = 2;
      return {
        id, name: 'Skewed', lo: 0, hi: 12, mu: m, sigma: m, center: m, finiteVar: true,
        sample: (r) => -m * Math.log(1 - r()),
        pdf: (x) => (x < 0 ? 0 : Math.exp(-x / m) / m),
        story: 'Minutes until the next customer reaches a help desk. Most waits are short, a few are very long (an exponential distribution).',
      };
    }
    case 'bernoulli': {
      const p = clamp(opts.p ?? 0.2, 0.01, 0.99);
      return {
        id, name: 'Bernoulli', lo: 0, hi: 1, mu: p, sigma: Math.sqrt(p * (1 - p)), center: p, finiteVar: true,
        discrete: true, step: 1, p,
        values: [{ x: 0, p: 1 - p }, { x: 1, p }],
        sample: (r) => (r() < p ? 1 : 0),
        story: `Each person answers yes (1) or no (0). The chance of a yes is p = ${p.toFixed(2)}. The mean of a sample is the share of yes answers.`,
      };
    }
    case 'die':
      return {
        id, name: 'Die', lo: 1, hi: 6, mu: 3.5, sigma: Math.sqrt(35 / 12), center: 3.5, finiteVar: true,
        discrete: true, step: 1,
        values: [1, 2, 3, 4, 5, 6].map((x) => ({ x, p: 1 / 6 })),
        sample: (r) => 1 + Math.floor(6 * r()),
        story: 'One roll of a fair six-sided die. Every face from 1 to 6 has the same chance: a flat population.',
      };
    case 'bimodal': {
      const a = 2.5, b = 7.5, s = 0.8;
      return {
        id, name: 'Bimodal', lo: 0, hi: 10, mu: 5, sigma: Math.sqrt(s * s + 6.25), center: 5, finiteVar: true,
        sample: (r) => (r() < 0.5 ? a : b) + s * randn(r),
        pdf: (x) => 0.5 * (phi((x - a) / s) + phi((x - b) / s)) / s,
        story: 'Two groups mixed together, such as commute times for people who walk and people who drive. Almost nobody sits at the overall mean of 5.',
      };
    }
    case 'custom': {
      const w = (opts.weights && opts.weights.length === 10 ? opts.weights : DEFAULT_CUSTOM).map((v) => Math.max(0, v));
      let tot = w.reduce((s, v) => s + v, 0);
      const pw = tot > 0 ? w.map((v) => v / tot) : w.map(() => 0.1);
      let mu = 0, m2 = 0;
      pw.forEach((p, i) => { const c = i + 0.5; mu += p * c; m2 += p * (c * c + 1 / 12); });
      const cum = []; let acc = 0; pw.forEach((p) => { acc += p; cum.push(acc); });
      return {
        id, name: 'Custom', lo: 0, hi: 10, mu, sigma: Math.sqrt(Math.max(m2 - mu * mu, 1e-9)), center: mu, finiteVar: true,
        weights: pw, raw: w,
        sample: (r) => {
          const u = r();
          let i = cum.findIndex((c) => u < c);
          if (i < 0) i = 9;
          return i + r();
        },
        pdf: (x) => (x < 0 || x >= 10 ? 0 : pw[Math.floor(x)]),
        story: 'Your own population. Drag on the population chart (or use the arrow keys on it) to reshape it.',
      };
    }
    case 'cauchy': {
      const loc = 5, sc = 0.5;
      return {
        id, name: 'Cauchy', lo: 0, hi: 10, mu: null, sigma: null, center: loc, scale: sc, finiteVar: false,
        sample: (r) => loc + sc * Math.tan(Math.PI * (r() - 0.5)),
        pdf: (x) => 1 / (Math.PI * sc * (1 + ((x - loc) / sc) ** 2)),
        story: 'Heavy tails: now and then a value lands extremely far away. Its variance is infinite and even its mean does not exist, so the CLT does not apply.',
      };
    }
    default:
      return population('uniform');
  }
}

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/**
 * Histogram layout for the sample means.
 * For lattice populations (die, Bernoulli) the means can only take values lo + k*step/n,
 * so bins are aligned to that lattice. Otherwise plain equal-width bins.
 */
export function meanBins(pop, n, zoom) {
  const se = pop.finiteVar ? pop.sigma / Math.sqrt(n) : pop.scale;
  let a = pop.lo, b = pop.hi;
  if (zoom) {
    const half = Math.max(4.2 * se, pop.discrete ? (2.5 * pop.step) / n : 0);
    a = pop.center - half; b = pop.center + half;
  }
  if (pop.discrete) {
    const lat = pop.step / n;
    const nominal = 70;
    const m = Math.max(1, Math.ceil((b - a) / lat / nominal));
    const w = m * lat;
    const origin = pop.lo - lat / 2;
    const k0 = Math.floor((a - origin) / w);
    const start = origin + k0 * w;
    const nb = Math.max(1, Math.ceil((b + lat / 2 - start) / w));
    return { lo: start, w, nb, hi: start + nb * w };
  }
  const nb = 60;
  return { lo: a, w: (b - a) / nb, nb, hi: b };
}

export function binCounts(values, bins) {
  const c = new Array(bins.nb).fill(0);
  let outside = 0;
  for (const v of values) {
    const k = Math.floor((v - bins.lo) / bins.w);
    if (k >= 0 && k < bins.nb) c[k]++;
    else outside++;
  }
  return { counts: c, outside };
}

/** Mean, SD (n-1), skewness, quartiles of an array of sample means. */
export function summarize(arr) {
  const N = arr.length;
  if (!N) return { N: 0 };
  let s = 0;
  for (const v of arr) s += v;
  const mean = s / N;
  let m2 = 0, m3 = 0;
  for (const v of arr) { const d = v - mean; m2 += d * d; m3 += d * d * d; }
  const varPop = m2 / N;
  const sd = N > 1 ? Math.sqrt(m2 / (N - 1)) : 0;
  const skew = varPop > 0 ? (m3 / N) / Math.pow(varPop, 1.5) : 0;
  const sorted = Float64Array.from(arr).sort();
  const q = (p) => {
    const i = (N - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  return { N, mean, sd, skew, q1: q(0.25), median: q(0.5), q3: q(0.75), iqr: q(0.75) - q(0.25) };
}
