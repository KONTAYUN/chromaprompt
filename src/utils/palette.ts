import { AnalysisResult, ColorItem } from '../types';

/** Prompts built from a locally sampled palette, shown instantly and when no model is configured. */
export function buildLocalResult(palette: ColorItem[], runId: number): AnalysisResult {
  const hexList = palette.map((p) => p.hex).join(', ');
  const dominantHex = palette[0]?.hex || '#000000';
  const accentHex = palette[1]?.hex || dominantHex;

  return {
    themeTitle: '',
    themeTitleZh: '本地色彩采样',
    colorHarmony: '',
    colorHarmonyZh: '',
    temperature: '',
    saturationMood: '',
    palette,
    source: 'local',
    runId,
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
  };
}

const PALETTE_UPDATE_TAIL = /\n\n(?:\[ChromaPrompt palette update\]|Color palette update:|色彩更新：)[\s\S]*$/i;

/** Adds an eyedropper colour to the palette and refreshes the HEX list in the generated prompts. */
export function addSampledColor(result: AnalysisResult, hex: string): AnalysisResult | null {
  if (result.palette.some((c) => c.hex.toLowerCase() === hex.toLowerCase())) return null;

  const sampled: ColorItem = {
    hex,
    nameEn: '',
    nameZh: '',
    role: 'accent',
    roleLabelZh: '吸色采样',
    percentage: 10,
  };
  const palette = [sampled, ...result.palette];
  const hexList = palette.map((p) => p.hex).join(', ');

  const withUpdate = (text: string, language: 'en' | 'zh') => {
    const base = text.replace(PALETTE_UPDATE_TAIL, '').trimEnd();
    const update =
      language === 'en'
        ? `Color palette update: reproduce the exact HEX palette ${hexList}.`
        : `色彩更新：精确复现 HEX 色板 ${hexList}。`;
    return `${base}\n\n${update}`;
  };

  return {
    ...result,
    palette,
    prompts: {
      general: { en: withUpdate(result.prompts.general.en, 'en'), zh: withUpdate(result.prompts.general.zh, 'zh') },
      visual: { en: withUpdate(result.prompts.visual.en, 'en'), zh: withUpdate(result.prompts.visual.zh, 'zh') },
      color: {
        en: `Color constraint: reproduce the exact HEX palette ${hexList} and preserve the original hue, value, saturation, shadow, and highlight relationships.`,
        zh: `色彩约束：精确复现 HEX 色板 ${hexList}，保持原图的色相、明度、饱和度、暗部与高光关系。`,
      },
    },
  };
}

export type ExportFormat = 'hex' | 'css' | 'json';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  hex: 'HEX',
  css: 'CSS',
  json: 'JSON',
};

export function formatPalette(palette: ColorItem[], format: ExportFormat): string {
  if (format === 'hex') return palette.map((c) => c.hex).join(', ');
  if (format === 'css') {
    const lines = palette.map((c, i) => `  --palette-${i + 1}: ${c.hex};${c.roleLabelZh ? ` /* ${c.roleLabelZh} */` : ''}`);
    return `:root {\n${lines.join('\n')}\n}`;
  }
  return JSON.stringify(
    palette.map((c) => ({
      hex: c.hex,
      role: c.role,
      percentage: c.percentage,
      ...(c.nameEn ? { name: c.nameEn } : {}),
      ...(c.nameZh ? { nameZh: c.nameZh } : {}),
    })),
    null,
    2,
  );
}
