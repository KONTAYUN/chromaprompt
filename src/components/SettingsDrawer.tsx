import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, List, ShieldCheck, X } from 'lucide-react';
import { ModelSettings } from '../types';
import { useEscape } from '../hooks';
import { Button, IconButton, Spinner } from './ui';

interface SettingsDrawerProps {
  settings: ModelSettings;
  modelOptions: string[];
  isFetchingModels: boolean;
  errorMessage: string | null;
  isSaved: boolean;
  onChange: (patch: Partial<ModelSettings>) => void;
  onFetchModels: () => void;
  onSave: () => void;
  onClose: () => void;
}

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-bg/50 px-3.5 text-sm outline-none transition placeholder:text-faint focus:border-line-strong';

export function SettingsDrawer({
  settings,
  modelOptions,
  isFetchingModels,
  errorMessage,
  isSaved,
  onChange,
  onFetchModels,
  onSave,
  onClose,
}: SettingsDrawerProps) {
  const [showKey, setShowKey] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Only narrow the list while the user is typing; opening it with the chevron shows every model.
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  useEscape(onClose);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const query = filter.trim().toLowerCase();
  const visibleModels = modelOptions.filter((model) => !query || model.toLowerCase().includes(query));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <aside className="animate-drawer-in absolute right-0 top-0 flex h-full w-full max-w-[28rem] flex-col border-l border-line bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 id="settings-title" className="text-lg font-semibold tracking-tight">
              模型设置
            </h2>
            <p className="mt-1 text-xs text-muted">用于 AI 深度分析，支持任何 OpenAI 兼容接口。不配置也能使用本地取色。</p>
          </div>
          <IconButton onClick={onClose} aria-label="关闭模型设置">
            <X className="size-4" />
          </IconButton>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <label className="block space-y-2">
            <span className="text-xs font-medium text-muted">API 地址</span>
            <input
              value={settings.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              autoFocus
              className={`${inputClass} font-mono`}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium text-muted">API Key</span>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(event) => onChange({ apiKey: event.target.value })}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} pr-11 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowKey((visible) => !visible)}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-faint transition hover:bg-surface-2 hover:text-fg"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="model-name" className="text-xs font-medium text-muted">
                模型
              </label>
              <button
                type="button"
                onClick={onFetchModels}
                disabled={isFetchingModels || !settings.baseUrl.trim()}
                className="inline-flex items-center gap-1.5 text-xs text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-50"
              >
                {isFetchingModels ? <Spinner className="size-3" /> : <List className="size-3" />}
                {isFetchingModels ? '读取中…' : '读取模型列表'}
              </button>
            </div>
            <div ref={menuRef} className="relative">
              <input
                id="model-name"
                value={settings.model}
                onChange={(event) => {
                  onChange({ model: event.target.value });
                  setFilter(event.target.value);
                  if (modelOptions.length) setMenuOpen(true);
                }}
                placeholder="例如 gpt-4o 或 qwen-vl-max"
                spellCheck={false}
                autoComplete="off"
                className={`${inputClass} pr-11 font-mono`}
              />
              <button
                type="button"
                onClick={() => {
                  setFilter('');
                  setMenuOpen((open) => !open);
                }}
                aria-label="打开模型列表"
                aria-expanded={menuOpen}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-faint transition hover:bg-surface-2 hover:text-fg"
              >
                <ChevronDown className={`size-4 transition ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="animate-pop-in absolute inset-x-0 top-full z-10 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-line-strong bg-surface p-1.5 shadow-card">
                  {modelOptions.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted">先点击右上方“读取模型列表”</p>
                  ) : visibleModels.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted">没有匹配的模型</p>
                  ) : (
                    visibleModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => {
                          onChange({ model });
                          setFilter('');
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-mono text-xs transition hover:bg-surface-2 ${
                          model === settings.model ? 'text-fg' : 'text-muted'
                        }`}
                      >
                        <span className="truncate">{model}</span>
                        {model === settings.model && <Check className="size-3.5 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {errorMessage && (
            <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-300">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3 rounded-2xl border border-line bg-surface-2/50 p-4 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-fg" />
            <p>
              设置只保存在这台设备的浏览器里。点击 AI 深度分析时，图片会经本站转发到你填写的模型服务，本站不保存图片，也不记录 API Key。
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <span className={`flex items-center gap-1.5 text-xs ${isSaved ? 'text-emerald-600 dark:text-emerald-400' : 'text-faint'}`}>
            {isSaved ? (
              <>
                <Check className="size-3.5" />
                已保存在本机
              </>
            ) : (
              '有未保存的修改'
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            <Button variant="primary" onClick={onSave}>
              保存
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
