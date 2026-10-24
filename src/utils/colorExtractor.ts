import { ColorItem } from '../types';

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex, 16);
  if (cleanHex.length === 3) {
    const r = ((bigint >> 8) & 0xf) * 17;
    const g = ((bigint >> 4) & 0xf) * 17;
    const b = (bigint & 0xf) * 17;
    return { r, g, b };
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

export function hexToHsl(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export function getContrastTextColor(hex: string): '#FFFFFF' | '#0F172A' {
  const { r, g, b } = hexToRgb(hex);
  // Calculate relative luminance according to WCAG
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#0F172A' : '#FFFFFF';
}

/**
 * Local canvas color extractor using fast bucket quantization
 */
export async function extractPaletteFromImage(
  imageSrc: string,
  colorCount = 6
): Promise<ColorItem[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve([]);
        }

        // Downscale for speedy extraction
        const maxDim = 150;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h).data;
        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();
        const totalPixels = w * h;

        // Sample pixels with a step
        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue; // Skip transparent

          // Group by 24-step color quantization
          const qr = Math.round(r / 28) * 28;
          const qg = Math.round(g / 28) * 28;
          const qb = Math.round(b / 28) * 28;
          const key = `${qr},${qg},${qb}`;

          const existing = colorBuckets.get(key);
          if (existing) {
            existing.count += 4;
            existing.r = (existing.r + r) / 2;
            existing.g = (existing.g + g) / 2;
            existing.b = (existing.b + b) / 2;
          } else {
            colorBuckets.set(key, { r, g, b, count: 4 });
          }
        }

        const sorted = Array.from(colorBuckets.values()).sort((a, b) => b.count - a.count);
        const topClusters = sorted.slice(0, colorCount);
        const clusterSum = topClusters.reduce((sum, item) => sum + item.count, 0) || totalPixels;

        const roleLabels: { role: string; zh: string }[] = [
          { role: 'dominant', zh: '主色调' },
          { role: 'secondary', zh: '辅色调' },
          { role: 'accent', zh: '点缀色' },
          { role: 'ambient_shadow', zh: '环境暗部' },
          { role: 'lighting', zh: '环境光感' },
          { role: 'accent', zh: '高光点缀' },
        ];

        const palette: ColorItem[] = topClusters.map((cluster, idx) => {
          const hex = rgbToHex(cluster.r, cluster.g, cluster.b);
          const pct = Math.max(5, Math.round((cluster.count / clusterSum) * 100));
          const roleDef = roleLabels[idx] || { role: 'secondary', zh: '辅色调' };

          return {
            hex,
            nameEn: '',
            nameZh: '',
            role: roleDef.role,
            roleLabelZh: roleDef.zh,
            percentage: pct,
            rgb: { r: Math.round(cluster.r), g: Math.round(cluster.g), b: Math.round(cluster.b) },
          };
        });

        resolve(palette);
      } catch (err) {
        console.error('Canvas color extract error:', err);
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageSrc;
  });
}
