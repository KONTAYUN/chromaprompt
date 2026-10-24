import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { ImageUploader } from './components/ImageUploader';
import { PaletteDisplay } from './components/PaletteDisplay';
import { PromptGenerator } from './components/PromptGenerator';
import { ModelSettings } from './components/ModelSettings';
import { UploadedImage, AnalysisResult, ColorItem, ModelSettings as ModelSettingsValue } from './types';
import { extractPaletteFromImage } from './utils/colorExtractor';
import { analyzeColorsWithProvider, fetchProviderModels, fetchProviderModelsFallback } from './utils/openaiClient';
import { AlertCircle } from 'lucide-react';

const MODEL_SETTINGS_STORAGE_KEY = 'chromaprompt:model-settings:v1';
const DEFAULT_MODEL_SETTINGS: ModelSettingsValue = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
};

function loadModelSettings(): ModelSettingsValue {
  if (typeof window === 'undefined') return DEFAULT_MODEL_SETTINGS;

  try {
    const saved = window.localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_MODEL_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<ModelSettingsValue>;
    return {
      ...DEFAULT_MODEL_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

export default function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom prompt parameters
  const [targetSubject, setTargetSubject] = useState('');
  const [stylePreference, setStylePreference] = useState('');
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSettingsValue>(loadModelSettings);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelSettingsError, setModelSettingsError] = useState<string | null>(null);
  const [modelSettingsSaved, setModelSettingsSaved] = useState(true);

  const handleAddImages = async (files: File[]) => {
    const newUploads: UploadedImage[] = [];

    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      newUploads.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        dataUrl,
        sizeFormatted: `${sizeMb} MB`,
      });
    }

    const updatedImages = [...images, ...newUploads];
    setImages(updatedImages);

    // Set first uploaded image as active
    if (newUploads.length > 0) {
      setActiveImageId(newUploads[0].id);

      // Instantly extract local canvas colors for immediate feedback
      try {
        const localPalette = await extractPaletteFromImage(newUploads[0].dataUrl, 5);
        if (localPalette.length > 0) {
          generateQuickLocalResult(localPalette);
        }
      } catch (e) {
        console.error('Local color extract error', e);
      }
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (id: string) => {
    const filtered = images.filter((img) => img.id !== id);
    setImages(filtered);
    if (activeImageId === id) {
      setActiveImageId(filtered[0]?.id || null);
    }
    if (filtered.length === 0) {
      setAnalysisResult(null);
    }
  };

  const handleReset = () => {
    setImages([]);
    setActiveImageId(null);
    setAnalysisResult(null);
    setErrorMessage(null);
    setTargetSubject('');
    setStylePreference('');
  };

  const handleModelSettingsChange = (patch: Partial<ModelSettingsValue>) => {
    setModelSettings((current) => ({ ...current, ...patch }));
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) {
      setModelOptions([]);
    }
    setModelSettingsSaved(false);
    setModelSettingsError(null);
  };

  const handleSaveModelSettings = () => {
    try {
      window.localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(modelSettings));
      setModelSettingsSaved(true);
      setModelSettingsError(null);
    } catch {
      setModelSettingsError('浏览器拒绝写入本地存储，请检查隐私模式或站点存储权限。');
    }
  };

  const handleFetchModels = async () => {
    if (!modelSettings.baseUrl.trim()) {
      setModelSettingsError('请先填写 API Base URL。');
      return;
    }

    setIsFetchingModels(true);
    setModelSettingsError(null);

    try {
      let models: string[];
      try {
        models = await fetchProviderModels(modelSettings);
      } catch {
        // Some OpenAI-compatible providers do not expose browser CORS. Fall
        // back automatically to the site's model-list relay.
        models = await fetchProviderModelsFallback(modelSettings);
      }
      setModelOptions(models);
      if (models.length === 0) {
        setModelSettingsError('服务返回成功，但没有发现可用模型；你仍可以手动填写模型名称。');
      } else if (!modelSettings.model) {
        setModelSettings((current) => ({ ...current, model: models[0] }));
        setModelSettingsSaved(false);
      }
    } catch (error: any) {
      setModelSettingsError(error?.message || '读取模型列表失败，请检查地址和密钥。');
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Generate an instant initial result while waiting or as instant local fallback
  const generateQuickLocalResult = (palette: ColorItem[]) => {
    const hexList = palette.map((p) => p.hex).join(', ');
    const dominantHex = palette[0]?.hex || '#05D9E8';
    const accentHex = palette[1]?.hex || '#FF2A85';

    setAnalysisResult({
      themeTitle: '',
      themeTitleZh: '本地色彩采样',
      colorHarmony: '',
      colorHarmonyZh: '',
      temperature: '',
      saturationMood: '',
      palette,
      prompts: {
        general: {
          en: `Faithful reconstruction of the reference image: preserve the same subject, composition, framing, perspective, proportions, lighting direction, materials, and visual hierarchy. Use the exact HEX palette ${hexList} and avoid adding details that are not visible in the reference.`,
          zh: `尽可能还原参考图：保持相同主体、构图、取景、视角、比例、光线方向、材质与视觉层级。使用精确 HEX 色板 ${hexList}，不要添加参考图中没有的内容。`,
        },
        visual: {
          en: `Describe the reference as a sensory visual experience: ${dominantHex} anchors the image while ${accentHex} creates emphasis. Preserve the observed light, contrast, depth, texture, atmosphere, and material response without inventing a new scene.`,
          zh: `以感官化的视觉语言描述参考图：以 ${dominantHex} 为画面基底，以 ${accentHex} 形成视觉强调。保留原图可见的光线、反差、空间纵深、纹理、氛围与材质反应，不改变场景。`,
        },
        color: {
          en: `Color constraint only: reproduce the exact HEX palette ${hexList}, preserve the observed hue relationships, value structure, saturation balance, dominant-to-accent proportions, shadow colors, and highlight colors. Do not introduce unrelated colors.`,
          zh: `仅描述色彩约束：精确复现 HEX 色板 ${hexList}，保持原图的色相关系、明度结构、饱和度平衡、主色到点缀色的比例，以及暗部和高光色。不引入无关颜色。`,
        },
      },
    });
  };

  // Perform optional OpenAI-compatible semantic analysis. Local extraction remains available without a model.
  const handleAnalyzeColors = async () => {
    if (images.length === 0) return;

    if (!modelSettings.baseUrl.trim() || !modelSettings.model.trim()) {
      setShowModelSettings(true);
      setModelSettingsError('请先填写 API Base URL 和模型名称；不配置模型时，页面仍可使用本地色彩提取。');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const data = await analyzeColorsWithProvider(
        modelSettings,
        images,
        targetSubject.trim(),
        stylePreference,
      );
      setAnalysisResult(data);
    } catch (err: any) {
      console.warn('AI analysis notice:', err);
      // If error occurred, provide helpful message but fallback to canvas quantization so user can still work!
      if (images.length > 0 && activeImageId) {
        const activeImg = images.find((i) => i.id === activeImageId) || images[0];
        const localPalette = await extractPaletteFromImage(activeImg.dataUrl, 5);
        if (localPalette.length > 0) {
          generateQuickLocalResult(localPalette);
        }
      }
      const rawMessage = err?.message || '';
      const readableMessage = /failed to fetch|load failed|networkerror|network request failed/i.test(rawMessage)
        ? '模型服务未开放浏览器跨域请求。'
        : rawMessage || '请求异常';
      setErrorMessage(`AI 分析失败：${readableMessage}，已回退到本地色板。`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSampledColorAdd = (hex: string) => {
    if (!analysisResult) return;
    // Check if color already exists
    if (analysisResult.palette.some((c) => c.hex.toLowerCase() === hex.toLowerCase())) {
      return;
    }
    const newColor: ColorItem = {
      hex,
      nameEn: '',
      nameZh: '',
      role: 'accent',
      roleLabelZh: '吸色采样',
      percentage: 10,
    };
    const updatedPalette = [newColor, ...analysisResult.palette];
    const hexList = updatedPalette.map((p) => p.hex).join(', ');

    const appendPaletteUpdate = (text: string, language: 'en' | 'zh') => {
      const baseText = text.replace(/\n\n(?:\[ChromaPrompt palette update\]|Color palette update:|色彩更新：)[\s\S]*$/i, '').trimEnd();
      const update = language === 'en'
        ? `Color palette update: reproduce the exact HEX palette ${hexList}.`
        : `色彩更新：精确复现 HEX 色板 ${hexList}。`;
      return `${baseText}\n\n${update}`;
    };

    setAnalysisResult({
      ...analysisResult,
      palette: updatedPalette,
      prompts: {
        ...analysisResult.prompts,
        general: {
          en: appendPaletteUpdate(analysisResult.prompts.general.en, 'en'),
          zh: appendPaletteUpdate(analysisResult.prompts.general.zh, 'zh'),
        },
        visual: {
          en: appendPaletteUpdate(analysisResult.prompts.visual.en, 'en'),
          zh: appendPaletteUpdate(analysisResult.prompts.visual.zh, 'zh'),
        },
        color: {
          en: `Color constraint: reproduce the exact HEX palette ${hexList} and preserve the original hue, value, saturation, shadow, and highlight relationships.`,
          zh: `色彩约束：精确复现 HEX 色板 ${hexList}，保持原图的色相、明度、饱和度、暗部与高光关系。`,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 flex flex-col font-sans">
      <Navbar
        onReset={handleReset}
        onAnalyze={handleAnalyzeColors}
        onOpenModelSettings={() => {
          setModelSettingsError(null);
          setShowModelSettings(true);
        }}
        isAnalyzing={isAnalyzing}
        hasImages={images.length > 0}
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* Quiet, single-purpose introduction */}
        <div className="max-w-3xl space-y-3 pt-2">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            从参考图开始，建立一套可复用的色彩语言。
          </h1>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Upload & Viewer Section */}
        <ImageUploader
          images={images}
          activeImageId={activeImageId}
          onSelectActiveImage={setActiveImageId}
          onAddImages={handleAddImages}
          onRemoveImage={handleRemoveImage}
          onSampledColorAdd={handleSampledColorAdd}
        />

        {/* Color Palette Analysis Section */}
        {analysisResult && (
          <>
            <PaletteDisplay result={analysisResult} />

            {/* Prompt Generator Section with English/Chinese Switcher */}
            <PromptGenerator
              result={analysisResult}
              targetSubject={targetSubject}
              onTargetSubjectChange={setTargetSubject}
              stylePreference={stylePreference}
              onStylePreferenceChange={setStylePreference}
              onReanalyzeWithPreferences={handleAnalyzeColors}
              isAnalyzing={isAnalyzing}
            />
          </>
        )}
      </main>

      {showModelSettings && (
        <ModelSettings
          settings={modelSettings}
          modelOptions={modelOptions}
          isFetchingModels={isFetchingModels}
          errorMessage={modelSettingsError}
          isSaved={modelSettingsSaved}
          onChange={handleModelSettingsChange}
          onFetchModels={handleFetchModels}
          onSave={handleSaveModelSettings}
          onClose={() => setShowModelSettings(false)}
        />
      )}

      <footer className="border-t border-white/[0.06] bg-[#080a0e] py-6 mt-16 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">ChromaPrompt Studio</span>
            <span>·</span>
            <span>Color reference workspace</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
