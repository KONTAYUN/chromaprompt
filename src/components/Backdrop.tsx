interface BackdropProps {
  colors: string[];
}

const BLOBS = [
  { size: '46rem', style: { top: '-14rem', right: '-10rem' } },
  { size: '38rem', style: { top: '28%', left: '-14rem' } },
  { size: '34rem', style: { bottom: '-12rem', right: '12%' } },
  { size: '28rem', style: { top: '6%', left: '34%' } },
];

/** Soft colour wash taken from the current palette; falls back to a neutral dotted field. */
export function Backdrop({ colors }: BackdropProps) {
  const active = colors.slice(0, BLOBS.length);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className={`bg-dots absolute inset-0 transition-opacity duration-1000 ${active.length ? 'opacity-0' : 'opacity-60'}`} />
      {BLOBS.map((blob, index) => (
        <div
          key={index}
          className="absolute rounded-full blur-[120px] transition-[background-color,opacity] duration-[1400ms] ease-out"
          style={{
            ...blob.style,
            width: blob.size,
            height: blob.size,
            backgroundColor: active[index] ?? 'transparent',
            opacity: active[index] ? 'var(--glow)' : 0,
          }}
        />
      ))}
    </div>
  );
}
