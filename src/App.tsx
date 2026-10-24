import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { AnalysisResult, ModelSettings, UploadedImage } from './types';
import { useElapsedSeconds, useTheme } from './hooks';
import { extractPaletteFromImage } from './utils/colorExtractor';
import { formatBytes, loadImage, readFileAsDataUrl } from './utils/image';
import { addSampledColor, buildLocalResult } from './utils/palette';
import {
  AccessRequiredError,
  analyzeColorsWithProvider,
  fetchProviderModels,
  fetchProviderModelsFallback,
  submitAccessCode,
} from './utils/openaiClient';
import { AccessCodeModal } from './components/AccessCodeModal';
import { Backdrop } from './components/Backdrop';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Insight } from './components/Insight';
import { PalettePanel } from './components/PalettePanel';
import { PromptPanel } from './components/PromptPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Stage } from './components/Stage';
import { useToast } from './components/toast';

const MODEL_SETTINGS_STORAGE_KEY = 'chromaprompt:model-settings:v1';
const MAX_IMAGES = 6;
/** Upper bound for the in-browser palette (the model decides its own count, 5 to 8). */
const PALETTE_SIZE = 8;
const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
};

function loadModelSettings(): ModelSettings {
  try {
    const saved = window.localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_MODEL_SETTINGS;
    return { ...DEFAULT_MODEL_SETTINGS, ...(JSON.parse(saved) as Partial<ModelSettings>) };
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export default function App() {
  const { notify } = useToast();
  const [theme, toggleTheme] = useTheme();

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  // Analyses are kept per image for this page session only; a refresh clears them.
  const [results, setResults] = useState<Record<string, AnalysisResult>>({});
  const [promptEdits, setPromptEdits] = useState<Record<string, Record<string, string>>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileDragging, setFileDragging] = useState(false);

  const activeImage = images.find((image) => image.id === activeImageId) ?? images[0] ?? null;
  const activeId = activeImage?.id ?? "";
  const result = activeImage ? (results[activeImage.id] ?? null) : null;
  const isAnalyzing = analyzingId !== null && analyzingId === activeImage?.id;
  const busyElsewhere = analyzingId !== null && !isAnalyzing;
  const elapsedSeconds = useElapsedSeconds(analyzingId !== null);

  const [targetSubject, setTargetSubject] = useState('');
  const [stylePreference, setStylePreference] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(loadModelSettings);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(true);

  const [showAccessModal, setShowAccessModal] = useState(false);
  const accessRetryRef = useRef<(() => void) | null>(null);

  // Async handlers read the latest state through refs instead of stale closures.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const runCounter = useRef(0);

  const modelReady = Boolean(modelSettings.baseUrl.trim() && modelSettings.model.trim());
  const paletteColors = result?.palette.map((color) => color.hex) ?? [];

  // Every image gets an instant in-browser palette; a model result for it, if any, always wins.
  const ensureLocalPalette = useCallback(async (image: UploadedImage) => {
    if (resultsRef.current[image.id]) return;
    const palette = await extractPaletteFromImage(image.dataUrl, PALETTE_SIZE);
    if (palette.length === 0) return;
    setResults((current) => (current[image.id] ? current : { ...current, [image.id]: buildLocalResult(palette, ++runCounter.current) }));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        notify('请选择图片文件（JPG / PNG / WEBP）', 'warn');
        return;
      }

      const room = MAX_IMAGES - imagesRef.current.length;
      if (room <= 0) {
        notify(`最多放入 ${MAX_IMAGES} 张参考图`, 'warn');
        return;
      }
      const accepted = imageFiles.slice(0, room);
      if (accepted.length < imageFiles.length) notify(`最多放入 ${MAX_IMAGES} 张，已忽略多出的图片`, 'warn');

      const settled = await Promise.allSettled(
        accepted.map(async (file): Promise<UploadedImage> => {
          const dataUrl = await readFileAsDataUrl(file);
          const decoded = await loadImage(dataUrl).catch(() => {
            throw new Error(`${file.name} 无法解码`);
          });
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: file.name,
            dataUrl,
            width: decoded.naturalWidth,
            height: decoded.naturalHeight,
            sizeFormatted: formatBytes(file.size),
          };
        }),
      );

      const uploads: UploadedImage[] = [];
      for (const item of settled) {
        if (item.status === 'fulfilled') uploads.push(item.value);
        else notify(item.reason?.message || '有一张图片读取失败', 'warn');
      }
      if (uploads.length === 0) return;

      setImages((current) => [...current, ...uploads]);
      setActiveImageId(uploads[0].id);
      setErrorMessage(null);
      for (const upload of uploads) void ensureLocalPalette(upload);
    },
    [ensureLocalPalette, notify],
  );

  // Paste images from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  // Drop images anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setFileDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setFileDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setFileDragging(false);
      void addFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);

  const handleSelectImage = (id: string) => {
    setActiveImageId(id);
    const image = images.find((item) => item.id === id);
    if (image) void ensureLocalPalette(image);
  };

  const handleRemoveImage = (id: string) => {
    const rest = images.filter((image) => image.id !== id);
    setImages(rest);
    setResults(({ [id]: _removed, ...others }) => others);
    setPromptEdits(({ [id]: _removed, ...others }) => others);
    if (rest.length === 0) {
      setActiveImageId(null);
      setErrorMessage(null);
      return;
    }
    if (activeId === id) setActiveImageId(rest[0].id);
  };

  const handleReset = () => {
    setImages([]);
    setActiveImageId(null);
    setResults({});
    setPromptEdits({});
    setErrorMessage(null);
    setTargetSubject("");
    setStylePreference("");
  };

  const handleSample = (hex: string) => {
    if (!activeId) return;
    setResults((current) => {
      const next = current[activeId] ? addSampledColor(current[activeId], hex) : null;
      return next ? { ...current, [activeId]: next } : current;
    });
  };

  // ---- model settings ------------------------------------------------------

  const handleSettingsChange = (patch: Partial<ModelSettings>) => {
    setModelSettings((current) => ({ ...current, ...patch }));
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) setModelOptions([]);
    setSettingsSaved(false);
    setSettingsError(null);
  };

  const handleSaveSettings = () => {
    try {
      window.localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(modelSettings));
      setSettingsSaved(true);
      setSettingsError(null);
      notify('模型设置已保存在本机');
    } catch {
      setSettingsError('浏览器拒绝写入本地存储，请检查隐私模式或站点存储权限。');
    }
  };

  // The relay may require an access code; ask for it, then repeat whatever was blocked.
  const requestAccess = (retry: () => void) => {
    accessRetryRef.current = retry;
    setShowAccessModal(true);
  };

  const handleSubmitAccessCode = async (code: string) => {
    await submitAccessCode(code);
    setShowAccessModal(false);
    const retry = accessRetryRef.current;
    accessRetryRef.current = null;
    retry?.();
  };

  const handleFetchModels = async () => {
    if (!modelSettings.baseUrl.trim()) {
      setSettingsError('请先填写 API 地址。');
      return;
    }

    setIsFetchingModels(true);
    setSettingsError(null);
    try {
      let models: string[];
      try {
        models = await fetchProviderModels(modelSettings);
      } catch {
        // Many providers do not allow browser CORS; fall back to the site relay.
        models = await fetchProviderModelsFallback(modelSettings);
      }
      setModelOptions(models);
      if (models.length === 0) {
        setSettingsError('服务返回成功，但没有发现可用模型；你仍可以手动填写模型名称。');
      } else if (!modelSettings.model) {
        setModelSettings((current) => ({ ...current, model: models[0] }));
        setSettingsSaved(false);
      }
    } catch (error: any) {
      if (error instanceof AccessRequiredError) {
        requestAccess(handleFetchModels);
        return;
      }
      setSettingsError(error?.message || '读取模型列表失败，请检查地址和密钥。');
    } finally {
      setIsFetchingModels(false);
    }
  };

  // ---- AI analysis ---------------------------------------------------------

  // Analyses exactly the selected image; one analysis runs at a time.
  const handleAnalyze = async () => {
    const image = activeImage;
    if (!image || analyzingId !== null) return;

    if (!modelReady) {
      setSettingsError("请先填写 API 地址和模型名称；不配置模型时，仍可使用本地取色。");
      setShowSettings(true);
      return;
    }

    setAnalyzingId(image.id);
    setErrorMessage(null);
    try {
      const data = await analyzeColorsWithProvider(modelSettings, image, targetSubject.trim(), stylePreference);
      if (!imagesRef.current.some((item) => item.id === image.id)) return; // removed while analysing
      setResults((current) => ({ ...current, [image.id]: { ...data, source: "ai", runId: ++runCounter.current } }));
      setPromptEdits(({ [image.id]: _replaced, ...others }) => others);
      if (activeIdRef.current !== image.id) {
        notify(`「${image.name}」的 AI 分析已完成，点击缩略图查看`);
      } else if (window.matchMedia("(max-width: 1023px)").matches) {
        window.setTimeout(() => document.getElementById("insight-section")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    } catch (error: any) {
      if (error instanceof AccessRequiredError) {
        requestAccess(handleAnalyze);
        return;
      }
      console.warn("AI analysis failed:", error);

      let outcome = "已保留上一次的结果。";
      if (!resultsRef.current[image.id]) {
        await ensureLocalPalette(image);
        outcome = "已回退到本地色板。";
      }
      const raw: string = error?.message || "";
      const readable = /failed to fetch|load failed|networkerror|network request failed/i.test(raw)
        ? "无法连接到本站服务，请检查网络"
        : raw || "请求异常";
      const which = imagesRef.current.length > 1 ? `（${image.name}）` : "";
      setErrorMessage(`AI 分析失败${which}：${readable}。${outcome}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const openSettings = () => {
    setSettingsError(null);
    setShowSettings(true);
  };

  const hasImages = images.length > 0;

  return (
    <div className="relative isolate min-h-screen" style={{ '--accent': paletteColors[0] ?? '#7c8cff' } as CSSProperties}>
      <Backdrop colors={paletteColors} />
      <Header
        colors={paletteColors}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={openSettings}
        hasImages={hasImages}
        onReset={handleReset}
      />

      {!hasImages ? (
        <Hero onFiles={addFiles} maxImages={MAX_IMAGES} dragging={fileDragging} />
      ) : (
        <main className="mx-auto max-w-[1360px] space-y-12 px-4 pb-24 pt-8 sm:px-6" aria-busy={isAnalyzing}>
          {errorMessage && (
            <div role="alert" className="animate-pop-in flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-700 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 leading-relaxed">{errorMessage}</p>
              <button type="button" onClick={() => setErrorMessage(null)} aria-label="关闭提示" className="opacity-60 transition hover:opacity-100">
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="grid items-stretch gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <Stage
                images={images}
                activeId={activeImageId}
                maxImages={MAX_IMAGES}
                onSelect={handleSelectImage}
                onAddFiles={addFiles}
                onRemove={handleRemoveImage}
                onSample={handleSample}
                analyzedIds={Object.keys(results).filter((id) => results[id].source === "ai")}
                analyzingId={analyzingId}
              />
            </div>
            <div className={`min-w-0 transition-opacity duration-500 lg:col-span-5 ${isAnalyzing ? "opacity-90" : ""}`}>
              <Insight
                result={result}
                isAnalyzing={isAnalyzing}
                busyElsewhere={busyElsewhere}
                elapsedSeconds={elapsedSeconds}
                modelName={modelReady ? modelSettings.model : ""}
                onAnalyze={handleAnalyze}
                onOpenSettings={openSettings}
              />
            </div>
          </div>

          {result && (
            <div className={`space-y-12 transition-opacity duration-500 ${isAnalyzing ? "pointer-events-none opacity-45" : ""}`}>
              <PalettePanel result={result} />
              <PromptPanel
                result={result}
                targetSubject={targetSubject}
                onTargetSubjectChange={setTargetSubject}
                stylePreference={stylePreference}
                onStylePreferenceChange={setStylePreference}
                onRegenerate={handleAnalyze}
                isAnalyzing={isAnalyzing}
                edits={promptEdits[activeId] ?? {}}
                onEditsChange={(next) => setPromptEdits((current) => ({ ...current, [activeId]: next }))}
              />
            </div>
          )}
        </main>
      )}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            Chroma<span className="font-serif italic">Prompt</span> · 色彩参考工作台
          </span>
          <span>取色在浏览器本地完成；AI 分析时图片经本站转发到你填写的模型服务，不会被保存。</span>
        </div>
      </footer>

      {hasImages && fileDragging && (
        <div className="animate-fade-in pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-bg/80 backdrop-blur-md">
          <div className="rounded-3xl border border-dashed border-fg/60 px-14 py-12 text-center">
            <p className="text-lg font-medium">松开以添加参考图</p>
            <p className="mt-1.5 text-sm text-muted">还可以放入 {Math.max(0, MAX_IMAGES - images.length)} 张</p>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsDrawer
          settings={modelSettings}
          modelOptions={modelOptions}
          isFetchingModels={isFetchingModels}
          errorMessage={settingsError}
          isSaved={settingsSaved}
          onChange={handleSettingsChange}
          onFetchModels={handleFetchModels}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAccessModal && (
        <AccessCodeModal
          onSubmit={handleSubmitAccessCode}
          onClose={() => {
            accessRetryRef.current = null;
            setShowAccessModal(false);
          }}
        />
      )}
    </div>
  );
}
