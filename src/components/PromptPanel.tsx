import { useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Copy, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react';
import { AnalysisResult } from '../types';
import { Button, Eyebrow, Panel, Segmented, Spinner } from './ui';
import { useToast } from './toast';

type Format = 'general' | 'visual' | 'color';
type Lang = 'zh' | 'en';

interface PromptPanelProps {
  result: AnalysisResult;
  targetSubject: string;
  onTargetSubjectChange: (value: string) => void;
  stylePreference: string;
  onStylePreferenceChange: (value: string) => void;
  onRegenerate: () => void;
  isAnalyzing: boolean;
  /** Manual edits for this image, keyed by prompt type and language. */
  edits: Record<string, string>;
  onEditsChange: (edits: Record<string, string>) => void;
}

const FORMATS: { value: Format; label: string; hint: string; icon: typeof Sparkles }[] = [
  { value: 'general', label: '通用还原', hint: '尽可能还原整张参考图', icon: Sparkles },
  { value: 'visual', label: '视觉描述', hint: '偏感官的画面描述', icon: BookOpen },
  { value: 'color', label: '色彩约束', hint: '只约束配色，不涉及内容', icon: ShieldCheck },
];

const STYLE_PRESETS = [
  { label: '保持原图质感', value: '' },
  { label: '电影剧照', value: 'Cinematic Movie Still, 35mm photography' },
  { label: '日系水彩', value: 'Anime aesthetic, Makoto Shinkai watercolor' },
  { label: '三维渲染', value: 'Octane 3D render, raytracing, C4D luxury' },
  { label: '时尚大片', value: 'Haute Couture Vogue editorial photography' },
  { label: '赛博霓虹', value: 'Cyberpunk neon noir futuristic aesthetic' },
];

export function PromptPanel({
  result,
  targetSubject,
  onTargetSubjectChange,
  stylePreference,
  onStylePreferenceChange,
  onRegenerate,
  isAnalyzing,
  edits,
  onEditsChange,
}: PromptPanelProps) {
  const { copy } = useToast();
  const [format, setFormat] = useState<Format>('general');
  const [lang, setLang] = useState<Lang>('zh');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const key = `${format}_${lang}`;
  const generated = result.prompts[format][lang];
  const edited = edits[key];
  const text = edited ?? generated;
  const isEdited = edited !== undefined && edited !== generated;
  const current = FORMATS.find((item) => item.value === format)!;

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.max(area.scrollHeight, 200)}px`;
  }, [text, format, lang]);

  return (
    <section id="prompt-section" aria-labelledby="prompt-title" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            <Wand2 className="size-3.5" />
            提示词
          </Eyebrow>
          <h2 id="prompt-title" className="mt-3 text-2xl font-semibold tracking-tight">
            带着这套配色去创作
          </h2>
        </div>
        <Segmented
          label="提示词语言"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="flex flex-col overflow-hidden lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <Segmented
              label="提示词类型"
              value={format}
              onChange={setFormat}
              options={FORMATS.map((item) => ({
                value: item.value,
                label: (
                  <>
                    <item.icon className="size-3.5" />
                    {item.label}
                  </>
                ),
              }))}
            />
            <div className="flex items-center gap-1.5">
              {isEdited && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = { ...edits };
                    delete next[key];
                    onEditsChange(next);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  还原
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => copy(text, '提示词已复制')}>
                <Copy className="size-3.5" />
                复制
              </Button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5">
            <p className="text-xs text-faint">{current.hint}，可直接编辑后再复制。</p>
            <textarea
              ref={areaRef}
              value={text}
              onChange={(event) => onEditsChange({ ...edits, [key]: event.target.value })}
              spellCheck={false}
              aria-label={current.label}
              className="block min-h-[12.5rem] w-full flex-1 resize-none rounded-2xl border border-line bg-bg/50 p-4 text-[15px] leading-[1.75] text-fg outline-none transition focus:border-line-strong"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
              <div className="flex flex-wrap items-center gap-1.5">
                {result.palette.map((color, index) => (
                  <span
                    key={`${color.hex}-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-1 pr-2 font-mono text-[11px] text-muted"
                  >
                    <span className="size-3 rounded-full border border-line-strong" style={{ backgroundColor: color.hex }} />
                    {color.hex}
                  </span>
                ))}
              </div>
              <span className="font-mono">{text.length} 字符</span>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Panel className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="size-4 text-muted" />
              微调后重新生成
            </div>
            <p className="-mt-2 text-xs leading-relaxed text-muted">指定主题或风格，让模型在保留色彩的前提下改写提示词。</p>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">主题（可选）</span>
              <input
                value={targetSubject}
                onChange={(event) => onTargetSubjectChange(event.target.value)}
                placeholder="例如：雨夜街头的黑猫"
                className="h-10 w-full rounded-xl border border-line bg-bg/50 px-3.5 text-sm outline-none transition placeholder:text-faint focus:border-line-strong"
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">风格</span>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_PRESETS.map((preset) => {
                  const active = stylePreference === preset.value;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onStylePreferenceChange(preset.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        active ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:border-line-strong hover:text-fg'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button variant="primary" className="w-full" onClick={onRegenerate} disabled={isAnalyzing}>
              {isAnalyzing ? <Spinner /> : <Sparkles className="size-4" />}
              {isAnalyzing ? '生成中…' : '重新生成'}
            </Button>
          </Panel>

          {result.lightingAtmosphere && (
            <Panel className="p-5">
              <p className="text-sm font-medium">{lang === 'zh' ? '光影' : 'Lighting'}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{result.lightingAtmosphere[lang]}</p>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
