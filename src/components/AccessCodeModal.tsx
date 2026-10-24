import { useState, type FormEvent } from 'react';
import { Lock, X } from 'lucide-react';
import { useEscape } from '../hooks';
import { Button, IconButton, Spinner } from './ui';

interface AccessCodeModalProps {
  onSubmit: (code: string) => Promise<void>;
  onClose: () => void;
}

export function AccessCodeModal({ onSubmit, onClose }: AccessCodeModalProps) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEscape(onClose);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(code);
    } catch (error: any) {
      setErrorMessage(error?.message || '验证失败，请重试。');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <div className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="animate-pop-in relative w-full max-w-sm space-y-5 rounded-3xl border border-line bg-surface p-6 shadow-2xl"
      >
        <IconButton onClick={onClose} aria-label="关闭" className="absolute right-4 top-4">
          <X className="size-4" />
        </IconButton>

        <span className="flex size-11 items-center justify-center rounded-full border border-line bg-surface-2">
          <Lock className="size-5" />
        </span>
        <div>
          <h2 id="access-title" className="text-lg font-semibold tracking-tight">
            需要访问口令
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">本站的模型转发功能已启用访问控制，请输入管理员提供的口令。</p>
        </div>

        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="访问口令"
          aria-label="访问口令"
          className="h-11 w-full rounded-xl border border-line bg-bg/50 px-3.5 text-sm outline-none transition placeholder:text-faint focus:border-line-strong"
        />

        {errorMessage && (
          <p role="alert" className="text-xs text-amber-600 dark:text-amber-300">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={!code.trim() || isSubmitting}>
            {isSubmitting && <Spinner />}
            {isSubmitting ? '验证中…' : '验证'}
          </Button>
        </div>
      </form>
    </div>
  );
}
