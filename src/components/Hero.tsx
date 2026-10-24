import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button, Eyebrow } from './ui';

interface HeroProps {
  onFiles: (files: File[]) => void;
  maxImages: number;
  /** True while a file is being dragged over the window (drops are handled by the app). */
  dragging: boolean;
}

const CHIPS = [
  { hex: '#E4572E', name: '朱红', en: 'Vermilion', rotate: '-8deg', x: '2%', y: '10%', delay: '0s' },
  { hex: '#F3A712', name: '藏红', en: 'Saffron', rotate: '-2deg', x: '26%', y: '2%', delay: '-1.6s' },
  { hex: '#A8C686', name: '鼠尾草', en: 'Sage', rotate: '5deg', x: '50%', y: '14%', delay: '-3.2s' },
  { hex: '#29335C', name: '午夜蓝', en: 'Midnight', rotate: '11deg', x: '72%', y: '6%', delay: '-4.8s' },
];

const STEPS = [
  { n: '01', title: '放入参考图', text: '拖入、粘贴或选择，一次可放多张。' },
  { n: '02', title: '本地取色', text: '在浏览器里即时得到色板，吸管可继续细调。' },
  { n: '03', title: '生成提示词', text: '可选接入你自己的模型，得到保持色彩一致的提示词。' },
];

function SwatchFan() {
  return (
    <div className="relative hidden h-[28rem] lg:block" aria-hidden>
      {CHIPS.map((chip, index) => (
        <div
          key={chip.hex}
          className="animate-float absolute w-[11.5rem]"
          style={{ left: chip.x, top: `calc(${chip.y} + ${index * 3.2}rem)`, animationDelay: chip.delay }}
        >
          <div
            className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
            style={{ transform: `rotate(${chip.rotate})` }}
          >
            <div className="h-44" style={{ backgroundColor: chip.hex }} />
            <div className="space-y-0.5 px-3.5 py-3">
              <p className="font-mono text-[13px] font-medium tracking-wide">{chip.hex}</p>
              <p className="text-xs text-muted">
                {chip.name} <span className="text-faint">· {chip.en}</span>
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Hero({ onFiles, maxImages, dragging }: HeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-20 pt-10 sm:px-6 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="animate-fade-up">
          <Eyebrow>
            <span className="h-px w-8 bg-line-strong" />
            Color reference workspace
          </Eyebrow>
          <h1 className="mt-6 text-[clamp(2.4rem,5.6vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
            从一张参考图，
            <br />
            取回一套
            <br />
            <span className="whitespace-nowrap bg-gradient-to-r from-[#ff8a5c] via-[#e86ba8] to-[#7c8cff] bg-clip-text text-transparent">
              可复用的色彩语言。
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted">
            提取主色、辅色与点缀色，量化它们的面积占比，再生成能让 AI 保持同一套配色的提示词。取色在你的浏览器里完成，图片不会离开这台设备，除非你主动使用 AI 深度分析。
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) onFiles(Array.from(event.target.files));
              event.target.value = '';
            }}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="选择参考图片"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`group mt-10 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border border-dashed px-6 py-10 text-center transition ${
              dragging
                ? 'scale-[1.01] border-fg bg-surface-2'
                : 'border-line-strong bg-surface/60 hover:border-fg/60 hover:bg-surface'
            }`}
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-fg transition group-hover:scale-105">
              <ImagePlus className="size-5" />
            </span>
            <div className="space-y-1.5">
              <p className="text-base font-medium">{dragging ? '松开以放入图片' : '拖入、粘贴或点击选择参考图'}</p>
              <p className="text-xs text-faint">JPG · PNG · WEBP · 最多 {maxImages} 张 · 也可以直接 Ctrl / ⌘ + V 粘贴</p>
            </div>
            <Button
              variant="primary"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
            >
              选择图片
            </Button>
          </div>
        </div>

        <SwatchFan />
      </div>

      <ol className="mt-20 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.n} className="animate-fade-up" style={{ animationDelay: `${150 + index * 90}ms` }}>
            <span className="font-serif text-2xl italic text-faint">{step.n}</span>
            <h3 className="mt-2 text-sm font-semibold">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
