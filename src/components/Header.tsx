import { Moon, RotateCcw, Settings2, Sun } from 'lucide-react';
import type { Theme } from '../hooks';
import { Button, IconButton } from './ui';

interface HeaderProps {
  colors: string[];
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  hasImages: boolean;
  onReset: () => void;
}

function Mark({ colors }: { colors: string[] }) {
  const fallback = ['#ff8a5c', '#7c8cff', '#f4d06f'];
  const [a, b, c] = [0, 1, 2].map((i) => colors[i] ?? fallback[i]);
  return (
    <span className="relative block size-8" aria-hidden>
      <span className="absolute left-0 top-1 size-5 rounded-full transition-colors duration-700" style={{ backgroundColor: a }} />
      <span
        className="absolute right-0 top-1 size-5 rounded-full opacity-85 mix-blend-multiply transition-colors duration-700 dark:mix-blend-screen"
        style={{ backgroundColor: b }}
      />
      <span
        className="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 rounded-full opacity-85 mix-blend-multiply transition-colors duration-700 dark:mix-blend-screen"
        style={{ backgroundColor: c }}
      />
    </span>
  );
}

export function Header({ colors, theme, onToggleTheme, onOpenSettings, hasImages, onReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5" aria-label="ChromaPrompt 首页">
          <Mark colors={colors} />
          <span className="text-[17px] font-semibold tracking-tight">
            Chroma<span className="font-serif font-normal italic">Prompt</span>
          </span>
        </a>

        <div className="flex items-center gap-1.5">
          {hasImages && (
            <span className="hidden sm:block">
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="size-3.5" />
                重新开始
              </Button>
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={onOpenSettings} aria-label="模型设置">
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">模型设置</span>
          </Button>
          <IconButton onClick={onToggleTheme} aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
          {hasImages && (
            <span className="sm:hidden">
              <IconButton onClick={onReset} aria-label="重新开始">
                <RotateCcw className="size-4" />
              </IconButton>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
