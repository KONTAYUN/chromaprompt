import { Copy, Cpu, Sparkles } from 'lucide-react';
import { AnalysisResult } from '../types';
import { getContrastTextColor, hexToHsl, hexToRgb } from '../utils/colorExtractor';
import { EXPORT_LABELS, ExportFormat, formatPalette } from '../utils/palette';
import { Button, Eyebrow, Panel } from './ui';
import { useToast } from './toast';

interface PalettePanelProps {
  result: AnalysisResult;
}

// Stable per colour (so adding a sample does not replay every card's entrance); the index only disambiguates duplicates.
function colorKey(palette: AnalysisResult['palette'], index: number): string {
  const hex = palette[index].hex;
  return palette.findIndex((c) => c.hex === hex) === index ? hex : `${hex}-${index}`;
}

export function PalettePanel({ result }: PalettePanelProps) {
  const { copy } = useToast();
  const { palette } = result;
  const title = result.themeTitleZh || result.themeTitle;
  const meta = [
    { label: '色彩关系', value: result.colorHarmonyZh || result.colorHarmony },
    { label: '冷暖倾向', value: result.temperature },
    { label: '反差与饱和', value: result.saturationMood },
  ].filter((item) => item.value);

  return (
    <section id="palette-section" aria-labelledby="palette-title" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>
            {result.source === 'ai' ? <Sparkles className="size-3.5" /> : <Cpu className="size-3.5" />}
            {result.source === 'ai' ? 'AI 分析' : '本地取色'} · 色板
          </Eyebrow>
          <h2 id="palette-title" className="mt-3 text-3xl font-semibold tracking-tight">
            {title}
          </h2>
          {result.themeTitle && result.themeTitleZh && <p className="mt-1 font-serif text-base italic text-muted">{result.themeTitle}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-faint">复制为</span>
          {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((format) => (
            <Button
              key={format}
              size="sm"
              onClick={() => copy(formatPalette(palette, format), `已复制 ${EXPORT_LABELS[format]} 色板`)}
            >
              <Copy className="size-3" />
              {EXPORT_LABELS[format]}
            </Button>
          ))}
        </div>
      </div>

      {meta.length > 0 && (
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {meta.map((item) => (
            <div key={item.label} className="bg-surface px-4 py-3.5">
              <dt className="text-[11px] uppercase tracking-wider text-faint">{item.label}</dt>
              <dd className="mt-1.5 text-sm leading-snug">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Panel className="p-2">
        <div className="flex h-16 gap-[3px] overflow-hidden rounded-[1.15rem]" role="img" aria-label="色彩面积占比">
          {palette.map((color, index) => {
            const ink = getContrastTextColor(color.hex);
            return (
              <button
                key={colorKey(palette, index)}
                type="button"
                onClick={() => copy(color.hex, `已复制 ${color.hex}`, color.hex)}
                title={`${color.hex} · ${color.percentage}%`}
                className="relative flex min-w-0 items-end px-2.5 pb-2 transition-[filter] hover:brightness-110"
                style={{ flex: `${Math.max(color.percentage, 3)} 1 0%`, backgroundColor: color.hex, color: ink }}
              >
                {color.percentage >= 8 && <span className="font-mono text-[11px] font-medium opacity-80">{color.percentage}%</span>}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                className="relative flex aspect-[5/4] w-full flex-col justify-between p-3 text-left"
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
