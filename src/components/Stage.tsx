import { useEffect, useRef, useState } from 'react';
import { Loader2, Pipette, Plus, Sparkles, X } from 'lucide-react';
import { UploadedImage } from '../types';
import { rgbToHex } from '../utils/colorExtractor';
import { copyText } from '../utils/clipboard';
import { Button, Panel } from './ui';
import { useToast } from './toast';

interface StageProps {
  images: UploadedImage[];
  activeId: string | null;
  maxImages: number;
  onSelect: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSample: (hex: string) => void;
  /** Images that already have a model analysis, and the one being analysed right now. */
  analyzedIds: string[];
  analyzingId: string | null;
}

const LOUPE_GRID = 15;
const LOUPE_SIZE = 128;
const MAX_SAMPLE_SIDE = 4096;

interface SampleSource {
  id: string;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export function Stage({ images, activeId, maxImages, onSelect, onAddFiles, onRemove, onSample, analyzedIds, analyzingId }: StageProps) {
  const { notify } = useToast();
  const active = images.find((image) => image.id === activeId) ?? images[0];

  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<SampleSource | null>(null);
  const [picking, setPicking] = useState(false);
  const [probe, setProbe] = useState<{ x: number; y: number; hex: string } | null>(null);

  useEffect(() => {
    if (!picking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [picking]);

  useEffect(() => {
    setProbe(null);
  }, [active?.id, picking]);

  const ensureSource = (): SampleSource | null => {
    const img = imgRef.current;
    if (!img || !active || !img.naturalWidth) return null;
    if (sourceRef.current?.id === active.id) return sourceRef.current;

    const scale = Math.min(1, MAX_SAMPLE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    sourceRef.current = { id: active.id, ctx, width: canvas.width, height: canvas.height };
    return sourceRef.current;
  };

  const handlePointer = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!picking) return;
    const source = ensureSource();
    const img = imgRef.current;
    if (!source || !img) return;

    const rect = img.getBoundingClientRect();
    const px = Math.floor(((event.clientX - rect.left) / rect.width) * source.width);
    const py = Math.floor(((event.clientY - rect.top) / rect.height) * source.height);
    if (px < 0 || py < 0 || px >= source.width || py >= source.height) {
      setProbe(null);
      return;
    }

    const half = Math.floor(LOUPE_GRID / 2);
    const region = source.ctx.getImageData(px - half, py - half, LOUPE_GRID, LOUPE_GRID);
    loupeRef.current?.getContext('2d')?.putImageData(region, 0, 0);
    const centre = (half * LOUPE_GRID + half) * 4;
    setProbe({ x: event.clientX, y: event.clientY, hex: rgbToHex(region.data[centre], region.data[centre + 1], region.data[centre + 2]) });
  };

  const handleSample = async () => {
    if (!picking || !probe) return;
    onSample(probe.hex);
    const copied = await copyText(probe.hex);
    notify(copied ? `${probe.hex} 已复制并加入色板` : `${probe.hex} 已加入色板`, 'ok', probe.hex);
  };

  const loupeBelow = probe ? probe.y < LOUPE_SIZE + 56 : false;

  return (
    <Panel className="flex h-full flex-col overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) onAddFiles(Array.from(event.target.files));
          event.target.value = '';
        }}
      />

      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{active?.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-faint">
            {[active?.width && active?.height ? `${active.width} × ${active.height}` : null, active?.sizeFormatted].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant={picking ? 'primary' : 'secondary'} size="sm" aria-pressed={picking} onClick={() => setPicking((value) => !value)}>
          <Pipette className="size-3.5" />
          {picking ? '吸色中 · Esc 退出' : '吸管取色'}
        </Button>
      </div>

      {/* A fixed 16:9 frame (the most common reference ratio); other ratios get a soft blurred fill. */}
      <div className="px-3">
        <div className="relative isolate aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2 sm:aspect-video">
          {active && (
            <>
              <div
                aria-hidden
                className="absolute inset-0 -z-10 scale-125 bg-cover bg-center opacity-50 blur-3xl saturate-150"
                style={{ backgroundImage: `url(${active.dataUrl})` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  ref={imgRef}
                  key={active.id}
                  src={active.dataUrl}
                  alt={active.name}
                  draggable={false}
                  onPointerMove={handlePointer}
                  onPointerDown={handlePointer}
                  onPointerLeave={() => setProbe(null)}
                  onClick={handleSample}
                  style={{ touchAction: picking ? 'none' : 'auto' }}
                  className={`block max-h-full max-w-full select-none object-contain ${picking ? 'cursor-crosshair' : ''}`}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 px-5 py-4">
        {/* Padding (cancelled by the negative margin) leaves room for the selection ring and remove button, which overflow would otherwise clip. */}
        <div className="-m-2 flex items-center gap-2 overflow-x-auto p-2">
          {images.map((image) => {
            const isActive = image.id === active?.id;
            return (
              <div key={image.id} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(image.id)}
                  aria-label={`查看 ${image.name}`}
                  aria-current={isActive}
                  className={`block size-12 overflow-hidden rounded-xl transition ${
                    isActive ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={image.dataUrl} alt="" draggable={false} className="size-full object-cover" />
                </button>
                {image.id === analyzingId ? (
                  <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-fg shadow-sm" title="AI 正在分析">
                    <Loader2 className="size-3 animate-spin" />
                  </span>
                ) : (
                  analyzedIds.includes(image.id) && (
                    <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-fg shadow-sm" title="已有 AI 分析">
                      <Sparkles className="size-3" />
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => onRemove(image.id)}
                  aria-label={`移除 ${image.name}`}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-muted opacity-0 shadow-sm transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
          {images.length < maxImages && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label="追加参考图"
              className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-line-strong text-faint transition hover:border-fg/60 hover:text-fg"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        {images.length > 1 && <p className="hidden shrink-0 text-xs text-faint sm:block">AI 只分析当前选中的这张</p>}
      </div>

      {picking && (
        <div
          className="pointer-events-none fixed z-[60]"
          style={{
            left: probe?.x ?? 0,
            top: probe?.y ?? 0,
            display: probe ? 'block' : 'none',
            transform: loupeBelow ? 'translate(-50%, 28px)' : 'translate(-50%, calc(-100% - 28px))',
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative overflow-hidden rounded-full border-[3px] border-white shadow-[0_8px_30px_rgb(0_0_0/0.45)]"
              style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
            >
              <canvas ref={loupeRef} width={LOUPE_GRID} height={LOUPE_GRID} className="size-full bg-black [image-rendering:pixelated]" />
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white mix-blend-difference"
                style={{ width: LOUPE_SIZE / LOUPE_GRID, height: LOUPE_SIZE / LOUPE_GRID }}
              />
            </div>
            <span className="flex items-center gap-2 rounded-full bg-black/80 py-1 pl-1.5 pr-3 font-mono text-xs font-medium text-white backdrop-blur">
              <span className="size-4 rounded-full border border-white/40" style={{ backgroundColor: probe?.hex }} />
              {probe?.hex}
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
