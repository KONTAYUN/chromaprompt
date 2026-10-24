import { Copy, Cpu, Settings2, Sparkles } from 'lucide-react';
import { AnalysisResult } from '../types';
import { getContrastTextColor } from '../utils/colorExtractor';
import { EXPORT_LABELS, ExportFormat, formatPalette } from '../utils/palette';
import { Button, Eyebrow, Panel, Spinner } from './ui';
import { useToast } from './toast';

interface InsightProps {
  result: AnalysisResult | null;
  /** True while the selected image is being analysed. */
  isAnalyzing: boolean;
  /** True while a different image is being analysed (one analysis runs at a time). */
  busyElsewhere: boolean;
  elapsedSeconds: number;
  modelName: string;
  onAnalyze: () => void;
  onOpenSettings: () => void;
}

/** Summary card next to the image: palette overview, export, and the AI action. */
export function Insight({ result, isAnalyzing, busyElsewhere, elapsedSeconds, modelName, onAnalyze, onOpenSettings }: InsightProps) {
  const { copy } = useToast();
  const palette = result?.palette ?? [];
  const title = result ? result.themeTitleZh || result.themeTitle : '尚未取到色板';
  const meta = result
    ? [
        { label: '色彩关系', value: result.colorHarmonyZh || result.colorHarmony },
        { label: '冷暖倾向', value: result.temperature },
        { label: '反差与饱和', value: result.saturationMood },
      ].filter((item) => item.value)
    : [];

  return (
    <Panel id="insight-section" className="flex h-full scroll-mt-24 flex-col gap-5 p-6">
      <div className="min-w-0">
        <Eyebrow>
          {result?.source === 'ai' ? <Sparkles className="size-3.5" /> : <Cpu className="size-3.5" />}
          {result?.source === 'ai' ? 'AI 分析' : '本地取色'} · 色板
        </Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
        {result?.themeTitle && result.themeTitleZh && <p className="mt-1 font-serif text-base italic text-muted">{result.themeTitle}</p>}
        {!result && <p className="mt-2 text-sm text-muted">没能从这张图里取到颜色，可以换一张图，或直接使用 AI 深度分析。</p>}
      </div>

      {meta.length > 0 && (
        <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {meta.map((item) => (
            <div key={item.label} className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-3">
              <dt className="pt-0.5 text-xs text-faint">{item.label}</dt>
              <dd className="text-sm leading-snug">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* A local sample has no model commentary, so list the colours instead of leaving the card hollow. */}
      {meta.length === 0 && palette.length > 0 && (
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {palette.map((color, index) => (
            <li key={`${color.hex}-${index}`} className={`bg-surface ${palette.length % 2 === 1 && index === palette.length - 1 ? 'col-span-2' : ''}`}>
              <button
                type="button"
                onClick={() => copy(color.hex, `已复制 ${color.hex}`, color.hex)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-2"
              >
                <span className="size-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: color.hex }} />
                <span className="flex-1 font-mono text-sm">{color.hex}</span>
                <span className="font-mono text-xs text-faint">{color.percentage}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {palette.length > 0 && (
        <div className="space-y-3">
          <div className="flex h-14 gap-[3px] overflow-hidden rounded-xl" role="img" aria-label="色彩面积占比">
            {palette.map((color, index) => (
              <button
                key={`${color.hex}-${index}`}
                type="button"
                onClick={() => copy(color.hex, `已复制 ${color.hex}`, color.hex)}
                title={`${color.hex} · ${color.percentage}%`}
                className="flex min-w-0 items-end px-2 pb-1.5 transition-[filter] hover:brightness-110"
                style={{ flex: `${Math.max(color.percentage, 3)} 1 0%`, backgroundColor: color.hex, color: getContrastTextColor(color.hex) }}
              >
                {color.percentage >= 8 && <span className="font-mono text-[11px] font-medium opacity-80">{color.percentage}%</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-faint">复制为</span>
            {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((format) => (
              <Button key={format} size="sm" onClick={() => copy(formatPalette(palette, format), `已复制 ${EXPORT_LABELS[format]} 色板`)}>
                <Copy className="size-3" />
                {EXPORT_LABELS[format]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-3 border-t border-line pt-5">
        <Button variant="primary" size="lg" className="w-full" onClick={onAnalyze} disabled={isAnalyzing || busyElsewhere}>
          {isAnalyzing ? (
            <>
              <Spinner />
              模型正在观察画面… {elapsedSeconds}s
            </>
          ) : busyElsewhere ? (
            <>
              <Spinner />
              另一张图正在分析…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              AI 深度分析
            </>
          )}
        </Button>

        {isAnalyzing ? (
          <div role="status" className="space-y-2">
            <div className="relative h-0.5 overflow-hidden rounded-full bg-line">
              <div className="animate-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent" />
            </div>
            <p className="text-xs leading-relaxed text-muted">推理类模型可能需要 1–3 分钟，请保持页面打开。</p>
          </div>
        ) : (
          <p className="flex items-center justify-between gap-3 text-xs text-faint">
            {modelName ? (
              <span className="truncate">
                模型 <span className="font-mono text-muted">{modelName}</span>
              </span>
            ) : (
              <span>尚未配置模型，仍可使用本地取色</span>
            )}
            <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1 text-muted underline-offset-4 hover:text-fg hover:underline">
              <Settings2 className="size-3" />
              {modelName ? '更改' : '去配置'}
            </button>
          </p>
        )}
      </div>
    </Panel>
  );
}
