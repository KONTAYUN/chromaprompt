import { Copy } from 'lucide-react';
import { AnalysisResult } from '../types';
import { getContrastTextColor, hexToHsl, hexToRgb } from '../utils/colorExtractor';
import { Eyebrow } from './ui';
import { useToast } from './toast';

// Stable per colour (so adding a sample does not replay every card's entrance); the index only disambiguates duplicates.
function colorKey(palette: AnalysisResult['palette'], index: number): string {
  const hex = palette[index].hex;
  return palette.findIndex((c) => c.hex === hex) === index ? hex : `${hex}-${index}`;
}

/** Every colour as a swatch card; click a card to copy its HEX. */
export function PalettePanel({ result }: { result: AnalysisResult }) {
  const { copy } = useToast();
  const { palette } = result;

  return (
    <section id="palette-section" aria-labelledby="palette-title" className="scroll-mt-24 space-y-5">
      <div>
        <Eyebrow>全部颜色 · {palette.length} 种</Eyebrow>
        <h2 id="palette-title" className="mt-3 text-2xl font-semibold tracking-tight">
          色板明细
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {palette.map((color, index) => {
          const ink = getContrastTextColor(color.hex);
          const rgb = color.rgb || hexToRgb(color.hex);
          return (
            <article
              key={colorKey(palette, index)}
              className="animate-fade-up group overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <button
                type="button"
                onClick={() => copy(color.hex, `已复制 ${color.hex}`, color.hex)}
                aria-label={`复制 ${color.hex}`}
                className="relative flex aspect-[3/2] w-full flex-col justify-between p-3 text-left"
                style={{ backgroundColor: color.hex, color: ink }}
              >
                <span
                  className="self-start rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-md"
                  style={{ backgroundColor: ink === '#FFFFFF' ? 'rgb(0 0 0 / 0.28)' : 'rgb(255 255 255 / 0.42)' }}
                >
                  {color.roleLabelZh || color.role}
                </span>
                <span className="flex items-end justify-between">
                  <span className="font-mono text-[17px] font-semibold tracking-wide">{color.hex}</span>
                  <span className="font-mono text-xs opacity-80">{color.percentage}%</span>
                </span>
                <Copy className="absolute right-3 top-3.5 size-3.5 opacity-0 transition group-hover:opacity-70" />
              </button>

              <div className="space-y-2.5 p-3.5">
                {(color.nameZh || color.nameEn) && (
                  <div className="min-w-0">
                    {color.nameZh && <p className="truncate text-sm font-semibold">{color.nameZh}</p>}
                    {color.nameEn && <p className="truncate text-xs text-muted">{color.nameEn}</p>}
                  </div>
                )}
                {color.usageNoteZh && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{color.usageNoteZh}</p>}
                <dl className="space-y-1 font-mono text-[11px] text-faint">
                  <div className="flex justify-between gap-2">
                    <dt>RGB</dt>
                    <dd className="text-muted">
                      {rgb.r} {rgb.g} {rgb.b}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>HSL</dt>
                    <dd className="truncate text-muted">{hexToHsl(color.hex)}</dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
