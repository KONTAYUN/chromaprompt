import React, { useState } from 'react';
import { Copy, Check, Languages, Sparkles, SlidersHorizontal, BookOpen, ShieldCheck } from 'lucide-react';
import { AnalysisResult } from '../types';

interface PromptGeneratorProps {
  result: AnalysisResult;
  targetSubject: string;
  onTargetSubjectChange: (value: string) => void;
  stylePreference: string;
  onStylePreferenceChange: (value: string) => void;
  onReanalyzeWithPreferences: () => void;
  isAnalyzing: boolean;
}

export const PromptGenerator: React.FC<PromptGeneratorProps> = ({
  result,
  targetSubject,
  onTargetSubjectChange,
  stylePreference,
  onStylePreferenceChange,
  onReanalyzeWithPreferences,
  isAnalyzing,
}) => {
  // Bilingual switch: 'zh' (Chinese) or 'en' (English)
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  // Selected prompt format tab
  const [activeFormat, setActiveFormat] = useState<'general' | 'visual' | 'color'>('general');
  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable prompt text buffer
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});

  const getPromptText = (format: 'general' | 'visual' | 'color') => {
    const key = `${format}_${lang}`;
    if (editedPrompts[key] !== undefined) {
      return editedPrompts[key];
    }

    return result.prompts[format][lang];
  };

  const handlePromptChange = (text: string) => {
    const key = `${activeFormat}_${lang}`;
    setEditedPrompts((prev) => ({ ...prev, [key]: text }));
  };

  const handleCopy = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentPrompt = getPromptText(activeFormat);

  return (
    <div id="prompt-section" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white/[0.025] border border-white/[0.08] p-4">
        <h2 className="text-base font-semibold text-white">提示词</h2>
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
            <Languages className="w-4 h-4 text-slate-400 ml-1.5" />
            <button
              onClick={() => setLang('zh')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                lang === 'zh'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              中文提示词
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                lang === 'en'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              English Prompt
            </button>
        </div>
      </div>

      {/* Optional Theme / Subject Customization Box */}
      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
          <span>主题与风格（可选）</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <input
              type="text"
              value={targetSubject}
              onChange={(e) => onTargetSubjectChange(e.target.value)}
              placeholder="主题（可选）"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-3">
            <select
              value={stylePreference}
              onChange={(e) => onStylePreferenceChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">保持参考图质感</option>
              <option value="Cinematic Movie Still, 35mm photography">电影剧照与中画幅胶片感</option>
              <option value="Anime aesthetic, Makoto Shinkai watercolor">日系动漫手绘水彩</option>
              <option value="Octane 3D render, raytracing, C4D luxury">三维渲染与光线追踪</option>
              <option value="Haute Couture Vogue editorial photography">时尚杂志高定大片</option>
              <option value="Cyberpunk neon noir futuristic aesthetic">未来科幻霓虹夜调</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <button
              onClick={onReanalyzeWithPreferences}
              disabled={isAnalyzing}
              className="w-full h-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>重新生成</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Prompt Output Card */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {/* Format Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2.5 gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveFormat('general')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                activeFormat === 'general'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>通用提示词</span>
            </button>
            <button
              onClick={() => setActiveFormat('visual')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                activeFormat === 'visual'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>视觉描述</span>
            </button>
            <button
              onClick={() => setActiveFormat('color')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                activeFormat === 'color'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>色彩约束</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(currentPrompt, `${activeFormat}_${lang}`)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
            >
              {copiedKey === `${activeFormat}_${lang}` ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>已复制到剪贴板</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>一键复制此提示词</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Prompt Content Area with Interactive Textarea */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300">
                {activeFormat === 'general' && '通用提示词'}
                {activeFormat === 'visual' && '视觉描述'}
                {activeFormat === 'color' && '色彩约束'}
              </span>
            </div>
          </div>

          <textarea
            rows={5}
            value={currentPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs sm:text-sm font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500/80 resize-y selection:bg-indigo-500 selection:text-white"
          />

          {/* Quick Info & Usage tips */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-800/80">
            <div className="flex items-center gap-3">
              <span>HEX</span>
              <div className="flex items-center gap-1.5">
                {result.palette.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.hex}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Ambient & Lighting Physics Note */}
        {result.lightingAtmosphere && (
          <div className="bg-slate-950/70 border-t border-slate-800 px-5 py-3.5 text-xs">
            <span className="font-semibold text-slate-300 mr-2">
              {lang === 'zh' ? '光影：' : 'Lighting:'}
            </span>
            <span className="text-slate-400">
              {result.lightingAtmosphere[lang]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
