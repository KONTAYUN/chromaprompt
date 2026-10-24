import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'bg-primary text-inverse hover:opacity-90 disabled:opacity-40',
  secondary: 'border border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2.5 px-6 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition active:scale-[0.98] disabled:active:scale-100 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    />
  );
}

export function IconButton({
  variant = 'ghost',
  className = '',
  ...props
}: Omit<ButtonProps, 'size'>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${variantClass[variant]} ${className}`}
    />
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, className = '' }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center rounded-full border border-line bg-surface-2/60 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition ${
              active ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-faint ${className}`}>
      {children}
    </p>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function Panel({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`rounded-3xl border border-line bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}
