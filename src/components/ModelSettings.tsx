import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, KeyRound, List, Save, Server, X } from 'lucide-react';
import { ModelSettings as ModelSettingsValue } from '../types';

interface ModelSettingsProps {
  settings: ModelSettingsValue;
  modelOptions: string[];
  isFetchingModels: boolean;
  errorMessage: string | null;
  isSaved: boolean;
  onChange: (patch: Partial<ModelSettingsValue>) => void;
  onFetchModels: () => void;
  onSave: () => void;
  onClose: () => void;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  settings,
  modelOptions,
  isFetchingModels,
  errorMessage,
  isSaved,
  onChange,
  onFetchModels,
  onSave,
  onClose,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isModelMenuOpen]);

  const filteredModelOptions = modelOptions.filter((model) => {
    const query = settings.model.trim().toLowerCase();
    return !query || model.toLowerCase().includes(query);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121620] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative space-y-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="关闭模型设置"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">模型设置</h2>
            <p className="text-xs text-slate-500 mt-1">OpenAI 兼容接口</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">API Base URL</span>
            <input
              value={settings.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">API Key</span>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(event) => onChange({ apiKey: event.target.value })}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-200"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">模型名称</span>
            <div ref={modelMenuRef} className="relative">
              <input
                value={settings.model}
                onChange={(event) => onChange({ model: event.target.value })}
                placeholder="例如 gpt-4o 或 qwen-vl-max"
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setIsModelMenuOpen((open) => !open)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="打开模型列表"
                aria-expanded={isModelMenuOpen}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelMenuOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                  {modelOptions.length === 0 ? (
                    <div className="px-2.5 py-2 text-xs text-slate-500">请先读取模型列表</div>
                  ) : filteredModelOptions.length > 0 ? filteredModelOptions.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => {
                        onChange({ model });
                        setIsModelMenuOpen(false);
                      }}
                      className="block w-full truncate rounded-md px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                    >
                      {model}
                    </button>
                  )) : (
                    <div className="px-2.5 py-2 text-xs text-slate-500">没有匹配的模型</div>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onFetchModels}
            disabled={isFetchingModels || !settings.baseUrl.trim()}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <List className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-pulse' : ''}`} />
            {isFetchingModels ? '读取中...' : '读取模型列表'}
          </button>

          <div className="flex items-center gap-2">
            {isSaved && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 已保存在本机
              </span>
            )}
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              保存设置
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              关闭
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
          配置保存在当前浏览器。
        </p>
      </div>
    </div>
  );
};
