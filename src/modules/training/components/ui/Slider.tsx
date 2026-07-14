import type { ChangeEvent } from 'react'

interface SliderProps {
  label: string
  value: number
  onChange: (v: number) => void
}

/**
 * Custom 0–10 slider: an invisible native range input stretched over a
 * hand-styled track, so touch/drag/keyboard/screen-reader behavior is free
 * while the visuals stay fully custom.
 */
export function Slider({ label, value, onChange }: SliderProps) {
  const pct = value * 10
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))

  return (
    <div className="select-none">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-dim">{label}</span>
        <span className="stat-num text-4xl leading-none text-accent">{value}</span>
      </div>
      <div className="relative h-12">
        <div className="pointer-events-none absolute inset-x-[14px] top-1/2 -translate-y-1/2">
          <div className="slider-track relative">
            <div className="slider-fill absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between">
              {Array.from({ length: 11 }).map((_, i) => (
                <span
                  key={i}
                  className={`slider-tick h-1 w-1 rounded-full ${i * 10 <= pct ? 'bg-bg/50' : 'bg-ink-faint/50'}`}
                />
              ))}
            </div>
            <div
              className="slider-handle absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 shadow-glow-accent"
              style={{ left: `${pct}%` }}
            >
              <div className="slider-handle-dot absolute inset-1.5 rounded-pill bg-accent" />
            </div>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={handleChange}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}
