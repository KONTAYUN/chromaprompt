import { Palette, Sparkles, RefreshCw, Settings2 } from 'lucide-react';

interface NavbarProps {
  onReset: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  hasImages: boolean;
  onOpenModelSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onReset,
  onAnalyze,
  isAnalyzing,
  hasImages,
  onOpenModelSettings,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#0a0c10]/90 backdrop-blur-xl border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[4.5rem] flex items-center justify-between gap-3 sm:gap-8 overflow-hidden">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            ChromaPrompt
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
          <a
            href="#upload-section"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            上传图片
          </a>
          <a
            href="#eyedropper-section"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            吸色器
          </a>
          <a
            href="#palette-section"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            色板
          </a>
          <a
            href="#prompt-section"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            提示词
          </a>
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenModelSettings}
            title="配置 OpenAI 兼容模型"
            className="px-2.5 sm:px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">模型设置</span>
          </button>
          {hasImages && (
            <button
              onClick={onReset}
              title="清空并重置"
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onAnalyze}
            disabled={!hasImages || isAnalyzing}
            className={`px-2.5 sm:px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
              !hasImages || isAnalyzing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAnalyzing ? '正在分析色谱...' : 'AI 深度分析'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
