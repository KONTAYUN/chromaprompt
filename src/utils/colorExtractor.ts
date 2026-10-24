import { ColorItem } from '../types';
import { loadImage } from './image';

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function hexToHsl(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }

  return `${Math.round(h * 360)}°  ${Math.round(s * 100)}%  ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Readable text colour (light or dark ink) for a given background swatch. */
export function getContrastTextColor(hex: string): '#FFFFFF' | '#111114' {
  const lum = relativeLuminance(hex);
  const contrastWithWhite = 1.05 / (lum + 0.05);
  const contrastWithInk = (lum + 0.05) / 0.056;
  return contrastWithWhite >= contrastWithInk ? '#FFFFFF' : '#111114';
}

interface Cluster {
  r: number;
  g: number;
  b: number;
  n: number;
}

const MIN_COLOR_DISTANCE = 44;

function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  // Weighted RGB distance; closer to perceived difference than plain Euclidean.
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db) / 3;
}

/** Scale integer shares so they add up to exactly 100. */
function toPercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0) || 1;
  const raw = counts.map((n) => (n / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * Local palette extraction: histogram the downscaled image into 5-bit buckets,
 * pick the most common buckets that are visibly different from each other as
 * seeds, then fold every other bucket into its nearest seed so the average
 * colour and the share of the image are both representative.
 */
export async function extractPaletteFromImage(imageSrc: string, colorCount = 6): Promise<ColorItem[]> {
  try {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    const maxDim = 180;
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += data[i];
        bucket.g += data[i + 1];
        bucket.b += data[i + 2];
        bucket.n += 1;
      } else {
        buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], n: 1 });
      }
    }

    const clusters: Cluster[] = Array.from(buckets.values())
      .map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }))
      .sort((a, b) => b.n - a.n);
    if (clusters.length === 0) return [];

    const seeds: Cluster[] = [];
    for (const cluster of clusters) {
      if (seeds.length >= colorCount) break;
      if (seeds.every((seed) => distance(seed, cluster) >= MIN_COLOR_DISTANCE)) seeds.push(cluster);
    }

    const sums = seeds.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const cluster of clusters) {
      let best = 0;
      let bestDistance = Infinity;
      seeds.forEach((seed, index) => {
        const d = distance(seed, cluster);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      sums[best].r += cluster.r * cluster.n;
      sums[best].g += cluster.g * cluster.n;
      sums[best].b += cluster.b * cluster.n;
      sums[best].n += cluster.n;
    }

    const merged = sums
      .filter((s) => s.n > 0)
      .map((s) => ({ r: s.r / s.n, g: s.g / s.n, b: s.b / s.n, n: s.n }))
      .sort((a, b) => b.n - a.n);
    const percentages = toPercentages(merged.map((m) => m.n));

    // Roles: biggest two are dominant/secondary; of the rest, the darkest and the
    // lightest take the shadow and highlight roles, everything else is an accent.
    const rest = merged.slice(2).map((m, i) => ({ index: i + 2, lum: relativeLuminance(rgbToHex(m.r, m.g, m.b)) }));
    const darkest = rest.length > 1 ? rest.reduce((a, b) => (b.lum < a.lum ? b : a)).index : -1;
    const lightest = rest.length > 2 ? rest.reduce((a, b) => (b.lum > a.lum ? b : a)).index : -1;

    return merged.map((m, index) => {
      let role = 'accent';
      let roleLabelZh = '点缀色';
      if (index === 0) [role, roleLabelZh] = ['dominant', '主色调'];
      else if (index === 1) [role, roleLabelZh] = ['secondary', '辅色调'];
      else if (index === darkest) [role, roleLabelZh] = ['ambient_shadow', '环境暗部'];
      else if (index === lightest) [role, roleLabelZh] = ['lighting', '高光色'];

      return {
        hex: rgbToHex(m.r, m.g, m.b),
        nameEn: '',
        nameZh: '',
        role,
        roleLabelZh,
        percentage: percentages[index],
        rgb: { r: Math.round(m.r), g: Math.round(m.g), b: Math.round(m.b) },
      };
    });
  } catch (error) {
    console.error('Local colour extraction failed:', error);
    return [];
  }
}
