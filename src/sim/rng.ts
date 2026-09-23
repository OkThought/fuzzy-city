export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export class Rng {
  state: number;
  constructor(seed: string | number) {
    this.state = typeof seed === "string" ? hash(seed) : seed;
  }
  next = (): number => {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  pick<T>(values: T[]): T {
    return values[Math.floor(this.next() * values.length)];
  }
  normal(): number {
    return clamp((this.next() + this.next() + this.next() + this.next()) / 4);
  }
  shuffle<T>(values: T[]): T[] {
    const a = [...values];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
export function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}
export function normalize(
  weights: Record<string, number>,
): Record<string, number> {
  const values = Object.values(weights);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("Invalid probability weights");
  return Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, v / total]),
  );
}
export function sample(
  probabilities: Record<string, number>,
  draw: number,
): string {
  if (draw < 0 || draw >= 1) throw new Error("Invalid RNG sample");
  let sum = 0;
  for (const [key, value] of Object.entries(probabilities)) {
    sum += value;
    if (draw < sum) return key;
  }
  return Object.keys(probabilities).at(-1)!;
}
export function entropy(p: number): number {
  return p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}
