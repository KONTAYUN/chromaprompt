import { AnalysisResult, ModelSettings, UploadedImage } from '../types';

const SYSTEM_PROMPT = `You are a visual analysis and image-prompt specialist. Study the reference image(s) carefully before writing anything. Your job is faithful observation and reconstruction, not invention.

First identify the visible subject, composition, framing, perspective, spatial relationships, scale, camera position, depth, materials, texture, lighting direction, contrast, atmosphere, and color structure. Do not infer a story or add objects that are not supported by the image.

Return only one valid JSON object with this shape:
{
  "themeTitle": "short English palette name",
  "themeTitleZh": "中文色彩主题名",
  "colorHarmony": "English harmony description",
  "colorHarmonyZh": "中文调和关系",
  "temperature": "temperature description",
  "saturationMood": "saturation and contrast description",
  "palette": [{
    "hex": "#RRGGBB",
    "nameEn": "short descriptive English color name",
    "nameZh": "简洁中文色名",
    "role": "dominant|secondary|accent|ambient_shadow|lighting",
    "roleLabelZh": "中文角色",
    "percentage": 1,
    "usageNote": "brief visible location or role",
    "usageNoteZh": "简短说明画面位置或作用"
  }],
  "prompts": {
    "general": {"en": "...", "zh": "..."},
    "visual": {"en": "...", "zh": "..."},
    "color": {"en": "...", "zh": "..."}
  },
  "lightingAtmosphere": {"en": "...", "zh": "..."}
}

Rules for the three prompts:
- general: a model-agnostic prompt whose goal is to recreate the reference as closely as possible. Include the observed subject, composition, framing, perspective, lighting, materials, and exact HEX palette. Do not add model names, version numbers, flags, aspect-ratio parameters, or unsupported content.
- visual: a restrained sensory visual description focused on what the eye experiences: light, contrast, depth, texture, atmosphere, motion, material response, and spatial presence. Keep it grounded in the image and avoid hype.
- color: a concise color-only constraint. Include every HEX value and explain its role, proportion, hue relationship, value structure, saturation, shadows, and highlights. Do not add scene or style instructions.

Extract 5 to 8 representative colors. Percentages must be whole numbers that sum to 100. Use exact six-digit HEX values. Write all Chinese fields and Chinese prompt variants in natural Chinese; write English fields and English prompt variants in clear English. Never return markdown fences or commentary outside the JSON object.`;

export function normalizeProviderBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:chat\/completions|models)$/i, '');
}

function providerHeaders(apiKey: string, includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

function providerErrorMessage(payload: any, fallback: string): string {
  if (typeof payload?.error === 'string') return payload.error;
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  return fallback;
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/** Thrown when the site relay needs an access code the visitor has not entered yet. */
export class AccessRequiredError extends Error {
  constructor() {
    super('需要访问口令。');
    this.name = 'AccessRequiredError';
  }
}

async function relayFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.code === 'AUTH_REQUIRED') throw new AccessRequiredError();
  }
  return response;
}

export async function submitAccessCode(code: string): Promise<void> {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(providerErrorMessage(await readJsonResponse(response), `验证失败（HTTP ${response.status}）。`));
  }
}

export async function fetchProviderModels(settings: ModelSettings): Promise<string[]> {
  const baseUrl = normalizeProviderBaseUrl(settings.baseUrl);
  const response = await fetch(`${baseUrl}/models`, {
    // GET does not need Content-Type; keeping this header out reduces the
    // preflight requirements for providers that do support browser CORS.
    headers: providerHeaders(settings.apiKey, false),
  });
  return parseProviderModelsResponse(response);
}

/**
 * Fetch only the provider's model list through the current site's server.
 * This is an explicit CORS fallback for providers that do not expose browser
 * CORS headers. Image analysis uses the same relay so the browser never needs
 * to call a provider directly.
 */
export async function fetchProviderModelsFallback(settings: ModelSettings): Promise<string[]> {
  const baseUrl = normalizeProviderBaseUrl(settings.baseUrl);
  const response = await relayFetch(`/api/models?url=${encodeURIComponent(baseUrl)}`, {
    headers: providerHeaders(settings.apiKey),
  });
  return parseProviderModelsResponse(response);
}

async function parseProviderModelsResponse(response: Response): Promise<string[]> {
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(providerErrorMessage(payload, `读取模型列表失败（HTTP ${response.status}）。`));
  }

  const entries = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  const modelIds = entries
    .map((entry: any) => typeof entry === 'string' ? entry : entry?.id || entry?.name)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
  return Array.from(new Set<string>(modelIds)).sort();
}

function extractMessageText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => typeof part?.text === 'string')
      .map((part: any) => part.text)
      .join('\n');
  }
  return '';
}

function parseModelJson(text: string): AnalysisResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型返回的内容不是有效 JSON。');

  const result = JSON.parse(cleaned.slice(start, end + 1)) as AnalysisResult;
  if (!result || !Array.isArray(result.palette) || !result.prompts || !result.prompts.general || !result.prompts.visual || !result.prompts.color) {
    throw new Error('模型返回的 JSON 缺少调色板或提示词字段。');
  }
  return result;
}

async function requestChatCompletion(settings: ModelSettings, body: Record<string, unknown>): Promise<any> {
  const baseUrl = normalizeProviderBaseUrl(settings.baseUrl);
  // Image analysis always uses the same-origin relay. This avoids a browser
  // CORS failure followed by a duplicate provider request.
  const response = await relayFetch(`/api/chat/completions?url=${encodeURIComponent(baseUrl)}`, {
    method: 'POST',
    headers: providerHeaders(settings.apiKey),
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);
  // The relay keeps long requests alive by sending the 200 status line early,
  // so an upstream failure can arrive as `{ "error": ... }` with an OK status.
  if (!response.ok || payload?.error) {
    throw new Error(providerErrorMessage(payload, `模型服务返回 HTTP ${response.status}。`));
  }
  return payload;
}

export async function analyzeColorsWithProvider(
  settings: ModelSettings,
  images: UploadedImage[],
  targetSubject: string,
  stylePreference: string,
): Promise<AnalysisResult> {
  const imageParts = images.slice(0, 3).map((image) => ({
    type: 'image_url',
    image_url: {
      url: image.dataUrl,
      detail: 'high',
    },
  }));

  const userPrompt = `Analyze ${imageParts.length} reference image(s) as one visual system.
${targetSubject ? `Optional subject direction: "${targetSubject}". Apply it only when it does not contradict the reference composition.` : 'No subject change requested. Preserve the visible subject and scene.'}
${stylePreference ? `Optional style direction: "${stylePreference}". Use it as a restrained adjustment, while preserving the reference structure.` : 'No additional style direction. Infer only what is visibly present.'}

Prioritize accurate observation over decorative language. Return only the JSON object defined in the system instruction.`;

  const requestBody: Record<string, unknown> = {
    model: settings.model.trim(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          ...imageParts,
          { type: 'text', text: userPrompt },
        ],
      },
    ],
    temperature: 0.2,
    // Keep the upstream connection active while a reasoning model is working.
    // The site relay converts the stream back into one JSON completion for the
    // browser, so the UI does not need a separate streaming code path.
    stream: true,
  };

  const responsePayload = await requestChatCompletion(settings, requestBody);
  return parseModelJson(extractMessageText(responsePayload));
}
