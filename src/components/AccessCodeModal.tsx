import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

interface AccessCodeModalProps {
  onSubmit: (code: string) => Promise<void>;
  onClose: () => void;
}

export const AccessCodeModal: React.FC<AccessCodeModalProps> = ({ onSubmit, onClose }) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-[#121620] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="关闭访问口令"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">需要访问口令</h2>
            <p className="text-xs text-slate-500 mt-1">本站的模型转发功能已启用访问控制。</p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">访问口令</span>
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </label>

        {errorMessage && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!code.trim() || isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '验证中...' : '验证'}
          </button>
        </div>
      </form>
    </div>
  );
};
