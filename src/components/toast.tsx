import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { copyText } from '../utils/clipboard';

type Tone = 'ok' | 'warn';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  swatch?: string;
}

interface ToastApi {
  notify: (message: string, tone?: Tone, swatch?: string) => void;
  /** Copies text and confirms with a toast; `swatch` shows a colour chip. */
  copy: (text: string, label?: string, swatch?: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastApi>({
  notify: () => {},
  copy: async () => false,
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, tone: Tone = 'ok', swatch?: string) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, message, tone, swatch }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2400);
  }, []);

  const copy = useCallback(
    async (text: string, label = '已复制', swatch?: string) => {
      const ok = await copyText(text);
      if (ok) notify(label, 'ok', swatch);
      else notify('复制失败，请手动选择文字复制', 'warn');
      return ok;
    },
    [notify],
  );

  const api = useMemo(() => ({ notify, copy }), [notify, copy]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="animate-pop-in flex items-center gap-2.5 rounded-full border border-line-strong bg-surface py-2 pl-3 pr-4 text-sm text-fg shadow-card"
          >
            {item.swatch ? (
              <span className="size-4 rounded-full border border-line-strong" style={{ backgroundColor: item.swatch }} />
            ) : item.tone === 'ok' ? (
              <Check className="size-4 text-fg" />
            ) : (
              <TriangleAlert className="size-4 text-amber-500" />
            )}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
