export interface ColorItem {
  hex: string;
  nameEn: string;
  nameZh: string;
  role: 'dominant' | 'secondary' | 'accent' | 'ambient_shadow' | 'lighting' | string;
  roleLabelZh: string;
  percentage: number;
  usageNote?: string;
  usageNoteZh?: string;
  rgb?: { r: number; g: number; b: number };
}

export interface PromptSet {
  en: string;
  zh: string;
}

export interface AnalysisResult {
  themeTitle: string;
  themeTitleZh: string;
  colorHarmony: string;
  colorHarmonyZh: string;
  temperature: string;
  saturationMood: string;
  palette: ColorItem[];
  prompts: {
    general: PromptSet;
    visual: PromptSet;
    color: PromptSet;
  };
  lightingAtmosphere?: PromptSet;
}

export interface UploadedImage {
  id: string;
  name: string;
  dataUrl: string;
  width?: number;
  height?: number;
  sizeFormatted?: string;
}

export interface ModelSettings {
  /** OpenAI-compatible API base URL, for example https://api.openai.com/v1. */
  baseUrl: string;
  /** Kept in the browser and sent only for the current request. */
  apiKey: string;
  /** Model id accepted by the configured provider. */
  model: string;
}
