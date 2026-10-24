import React, { useState } from 'react';
import { Copy, Check, Layers } from 'lucide-react';
import { AnalysisResult } from '../types';
import { getContrastTextColor, hexToHsl, hexToRgb } from '../utils/colorExtractor';

interface PaletteDisplayProps {
  result: AnalysisResult;
}

export const PaletteDisplay: React.FC<PaletteDisplayProps> = ({ result }) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1800);
  };

  const copyAllHex = () => {
    const allHexStr = result.palette.map((c) => c.hex).join(', ');
    navigator.clipboard.writeText(allHexStr);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const hasMetadata = Boolean(
    result.colorHarmonyZh || result.colorHarmony || result.temperature || result.saturationMood
  );

  return (
    <div id="palette-section" className="space-y-6">
      {/* Title & Harmony Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>HEX 色板</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <span>{result.themeTitleZh || result.themeTitle}</span>
              {result.themeTitle && (
                <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                  {result.themeTitle}
                </span>
              )}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyAllHex}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">已复制所有HEX代码</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>复制全部 HEX</span>
                </>
              )}
            </button>
          </div>
        </div>

        {hasMetadata && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
            <div className="text-slate-500 font-medium mb-1">色彩关系</div>
            <div className="text-slate-200 font-semibold">{result.colorHarmonyZh || result.colorHarmony}</div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">{result.colorHarmony}</div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
            <div className="text-slate-500 font-medium mb-1">冷暖倾向</div>
            <div className="text-slate-200 font-semibold">{result.temperature}</div>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
            <div className="text-slate-500 font-medium mb-1">反差与饱和度</div>
            <div className="text-slate-200 font-semibold">{result.saturationMood}</div>
          </div>
        </div>}

        {/* Proportional Color Distribution Bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">面积占比</span>
            <span className="text-[11px] text-slate-500">点击色块复制 HEX</span>
          </div>

          <div className="w-full h-8 rounded-xl overflow-hidden flex shadow-inner border border-slate-800 bg-slate-950 p-1 gap-0.5">
            {result.palette.map((color, idx) => {
              const textColor = getContrastTextColor(color.hex);
              return (
                <div
                  key={idx}
                  style={{
                    width: `${Math.max(0, color.percentage)}%`,
                    backgroundColor: color.hex,
                  }}
                  onClick={() => copyHex(color.hex)}
                  className="h-full rounded transition-transform hover:scale-105 hover:z-10 cursor-pointer flex items-center justify-center relative group"
                  title={`${color.nameZh} (${color.hex}): ${color.percentage}%`}
                >
                  <span
                    className="text-[10px] font-mono font-bold tracking-tight opacity-0 group-hover:opacity-100 transition-opacity truncate px-1"
                    style={{ color: textColor }}
                  >
                    {color.hex}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed Palette Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-stretch">
        {result.palette.map((color, idx) => {
          const textColor = getContrastTextColor(color.hex);
          const rgb = color.rgb || hexToRgb(color.hex);
          const hsl = hexToHsl(color.hex);
          const isCopied = copiedHex === color.hex;

          return (
            <div
              key={idx}
              className="bg-slate-900/60 rounded-xl border border-white/[0.08] overflow-hidden hover:border-indigo-400/40 transition-all flex flex-col"
            >
              {/* Swatch Header Box */}
              <div
                className="h-24 w-full p-3 flex flex-col justify-between relative cursor-pointer group"
                style={{ backgroundColor: color.hex }}
                onClick={() => copyHex(color.hex)}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded backdrop-blur-md"
                    style={{
                      backgroundColor: textColor === '#FFFFFF' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)',
                      color: textColor,
                    }}
                  >
                    {color.roleLabelZh || color.role}
                  </span>

                  <button
                    type="button"
                    className="p-1.5 rounded backdrop-blur-md opacity-80 group-hover:opacity-100 transition-all hover:scale-110"
                    style={{
                      backgroundColor: textColor === '#FFFFFF' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)',
                      color: textColor,
                    }}
                    title="点击复制HEX代码"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-end justify-between">
                  <span
                    className="text-lg font-mono font-bold tracking-wider"
                    style={{ color: textColor }}
                  >
                    {color.hex}
                  </span>
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: textColor }}
                  >
                    {color.percentage}%
                  </span>
                </div>
              </div>

              {/* Swatch Body Specs */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                {(color.nameZh || color.nameEn || color.usageNoteZh) && <div>
                  {color.nameZh && <div className="text-sm font-semibold text-slate-100 truncate">{color.nameZh}</div>}
                  {color.nameEn && <div className="text-xs text-slate-500 truncate mt-0.5">{color.nameEn}</div>}
                  {color.usageNoteZh && <div className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{color.usageNoteZh}</div>}
                </div>}

                {/* Technical Color Specs */}
                <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">RGB:</span>
                    <span className="text-slate-300">
                      {rgb.r}, {rgb.g}, {rgb.b}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">HSL:</span>
                    <span className="text-slate-300 truncate max-w-[150px]">{hsl}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
