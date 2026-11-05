import { shapePath } from '../editor/objects.ts'
import { SvgPath } from '../editor/svgExport.ts'
import type { ShapeGeometry } from '../editor/types.ts'
import { WARP_KINDS, type Warp, type WarpKind } from '../editor/warp.ts'
import { live, msg, t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { Slider } from './ui.tsx'

// Each bend, in plain words.
const KINDS: Record<WarpKind | 'none', { label: string; description: string }> = live({
  none: { label: msg('No bend'), description: msg('No bend: the shape as it was drawn.') },
  arch: { label: msg('Arch'), description: msg('Curves up in the middle like a rainbow, or down like a smile.') },
  bulge: { label: msg('Bulge'), description: msg('Swells out in the middle like a balloon, or pinches in.') },
  wave: { label: msg('Wave'), description: msg('Rolls up and down like a wave.') },
  flag: { label: msg('Flag'), description: msg('Waves more and more toward the end, like a flag in the wind.') },
  twist: { label: msg('Twist'), description: msg('Turns around its middle, like a whirlpool.') },
})

// A small sample: the shape itself, bent this way.
function Sample({ geometry, warp }: { geometry: ShapeGeometry; warp: Warp | null }) {
  const sample: ShapeGeometry = { ...geometry, warp: warp ?? undefined }
  if (!warp) delete sample.warp
  const d = shapePath(sample, 30, 22, 0, new SvgPath()).d
  return (
    <svg width="36" height="28" viewBox="-18 -14 36 28" aria-hidden>
      <path d={d} fill="currentColor" fillRule={geometry.parts?.length ? 'evenodd' : 'nonzero'} />
    </svg>
  )
}

interface BendEditorProps {
  geometry: ShapeGeometry
  onChange: (warp: Warp | null, mergeKey?: string) => void
}

// Bend a shape (pro: Envelope Distort, Warp): pick a bend from samples of the shape itself, then
// how much. It stays changeable: No bend takes it off.
export function BendEditor({ geometry, onChange }: BendEditorProps) {
  const warp = geometry.warp ?? null
  const kinds: (WarpKind | 'none')[] = ['none', ...WARP_KINDS]
  return (
    <div className="flex flex-col gap-2">
      <Tooltip title={t('Bend shape')} description={t('Bends the shape into an arch, a bulge, a wave, a flag or a twist. It stays changeable: No bend takes it off.')} className="flex self-start">
        <span className="cursor-help text-[12px] font-medium text-ink-2">{t('Bend shape')}</span>
      </Tooltip>
      <div role="radiogroup" aria-label={t('Bend shape')} className="grid grid-cols-3 gap-1.5">
        {kinds.map((kind) => {
          const on = (warp?.kind ?? 'none') === kind
          const sample = kind === 'none' ? null : { kind, amount: on && warp?.amount ? warp.amount : 0.6 }
          return (
            <Tooltip key={kind} title={KINDS[kind].label} description={KINDS[kind].description} className="flex">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={KINDS[kind].label}
                onClick={() => onChange(kind === 'none' ? null : { kind, amount: warp?.amount || 0.5 })}
                className={`flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-[11px] font-medium transition-colors ${
                  on ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                }`}
              >
                <Sample geometry={geometry} warp={sample} />
                {KINDS[kind].label}
              </button>
            </Tooltip>
          )
        })}
      </div>
      {warp && (
        <Slider
          label={t('How much bend')}
          help={t('Slide right to bend more, left to bend the other way. The middle is straight.')}
          value={(warp.amount + 1) / 2}
          display={`${Math.round(warp.amount * 100)}%`}
          step={1 / 100}
          pro="Warp, Envelope Distort"
          onChange={(position) => onChange({ ...warp, amount: Math.round((position * 2 - 1) * 100) / 100 }, 'shape-warp')}
        />
      )}
    </div>
  )
}
