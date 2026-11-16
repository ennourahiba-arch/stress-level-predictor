export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#151631" />
        <path d="M22 46V18h12a8 8 0 0 1 0 16H22m12 0l9 12" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 53c11-4 25-4 36 0" fill="none" stroke="#FF806D" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="hidden font-display text-xl font-extrabold tracking-tight min-[400px]:inline">Rehearsal</span>
    </span>
  );
}
