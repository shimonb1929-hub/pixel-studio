import { X } from 'lucide-react'
import { PATTERN_KINDS, patternPath, type Pattern, type PatternKind } from '../editor/pattern.ts'
import { live, msg, t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

// The look of each pattern, in plain words.
const KINDS: Record<PatternKind, { label: string; description: string }> = live({
  dots: { label: msg('Dots'), description: msg('Round dots in neat rows, like polka dots.') },
  stripes: { label: msg('Stripes'), description: msg('Wide stripes, like a deck chair or candy.') },
  checks: { label: msg('Checks'), description: msg('Squares in two colors, like a checkerboard.') },
  grid: { label: msg('Grid'), description: msg('Thin lines across and down, like graph paper.') },
  zigzag: { label: msg('Zigzag'), description: msg('Rows of sharp ups and downs.') },
  waves: { label: msg('Waves'), description: msg('Rows of soft, rolling waves.') },
  stars: { label: msg('Stars'), description: msg('Little stars in neat rows.') },
  hearts: { label: msg('Hearts'), description: msg('Little hearts in neat rows.') },
})

// Writes the little shapes as SVG path data, for the small samples.
class PathData {
  d = ''
  moveTo(x: number, y: number) {
    this.d += `M${x.toFixed(2)} ${y.toFixed(2)}`
  }
  lineTo(x: number, y: number) {
    this.d += `L${x.toFixed(2)} ${y.toFixed(2)}`
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  closePath() {
    this.d += 'Z'
  }
  roundRect() {}
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.d += `M${(cx + rx).toFixed(2)} ${cy.toFixed(2)}A${rx} ${ry} 0 1 1 ${(cx - rx).toFixed(2)} ${cy.toFixed(2)}A${rx} ${ry} 0 1 1 ${(cx + rx).toFixed(2)} ${cy.toFixed(2)}Z`
  }
}

// A small square showing a pattern in the shape's own colors.
function Sample({ pattern }: { pattern: Pattern }) {
  const d = patternPath({ ...pattern, size: 12 }, 36, 36, new PathData()).d
  return (
    <svg width="36" height="36" viewBox="-18 -18 36 36" aria-hidden className="rounded-md border border-[rgb(16_24_40/0.12)]">
      <rect x="-18" y="-18" width="36" height="36" fill={pattern.background ?? '#ffffff'} />
      <path d={d} fill={pattern.color} />
    </svg>
  )
}

interface PatternEditorProps {
  pattern: Pattern
  // The longer side of the shape, so the size slider reaches a few big repeats.
  side: number
  // Which color the Color panel changes: the little shapes (0) or what is behind them (1).
  part: number
  onPart: (part: number) => void
  onChange: (pattern: Pattern, label: string, mergeKey?: string) => void
}

const MIN_SIZE = 4

// Pattern fills (pro: Pattern swatches): pick a pattern from samples in the shape's own colors,
// then its two colors, how big it is and how far it is turned.
export function PatternEditor({ pattern, side, part, onPart, onChange }: PatternEditorProps) {
  const maxSize = Math.max(MIN_SIZE * 2, side / 2)
  // Sizes spread evenly by how they look: small patterns get most of the slider.
  const toPosition = (size: number) => Math.log(size / MIN_SIZE) / Math.log(maxSize / MIN_SIZE)
  const fromPosition = (position: number) => Math.round(MIN_SIZE * Math.pow(maxSize / MIN_SIZE, position))
  const colors = [
    { label: t('Little shapes'), description: t('The color of the dots, stripes or other little shapes. Choose it in the Color panel.'), color: pattern.color },
    { label: t('Behind'), description: t('The color behind the little shapes. Choose it in the Color panel.'), color: pattern.background },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('Pattern')} className="grid grid-cols-4 gap-1.5">
        {PATTERN_KINDS.map((kind) => (
          <Tooltip key={kind} title={KINDS[kind].label} description={KINDS[kind].description} className="flex">
            <button
              type="button"
              role="radio"
              aria-checked={pattern.kind === kind}
              aria-label={KINDS[kind].label}
              onClick={() => onChange({ ...pattern, kind }, t('Pattern'))}
              className={`flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-[11px] font-medium transition-colors ${
                pattern.kind === kind ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <Sample pattern={{ ...pattern, kind }} />
              {KINDS[kind].label}
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c, i) => (
          <Tooltip key={i} title={c.label} description={c.description} className="flex">
            <button
              type="button"
              aria-pressed={part === i}
              aria-label={t('{part} color', { part: c.label })}
              onClick={() => onPart(i)}
              className={`flex h-8 items-center gap-2 rounded-lg border px-2 text-[12px] font-medium transition-colors ${
                part === i ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <span className="h-4 w-4 rounded border border-[rgb(16_24_40/0.15)]" style={{ background: c.color ?? 'repeating-conic-gradient(#d0d5dd 0 25%, #ffffff 0 50%) 0 0 / 8px 8px' }} aria-hidden />
              {c.label}
            </button>
          </Tooltip>
        ))}
        {pattern.background && (
          <Button
            variant="ghost"
            className="h-8 px-2 text-[12px]"
            onClick={() => {
              onChange({ ...pattern, background: null }, t('See-through behind'))
              onPart(0)
            }}
            tip={{ title: t('See-through behind'), description: t('Nothing behind the little shapes, so what is under the shape shows through between them.') }}
          >
            <X size={14} />
            {t('See-through behind')}
          </Button>
        )}
      </div>
      <Slider
        label={t('Pattern size')}
        help={t('How big the little shapes are and how far apart they repeat.')}
        value={toPosition(pattern.size)}
        display={`${Math.round(pattern.size)} px`}
        pro="Scale (pattern)"
        onChange={(position) => onChange({ ...pattern, size: fromPosition(position) }, t('Pattern size'), 'pattern-size')}
      />
      <Slider
        label={t('Pattern turn')}
        help={t('Turns the pattern inside the shape, for slanted stripes or a tilted grid. The shape itself stays as it is.')}
        value={(((pattern.angle % 180) + 180) % 180) / 180}
        display={`${Math.round((((pattern.angle % 180) + 180) % 180))}°`}
        step={1 / 180}
        pro="Rotate (pattern)"
        onChange={(position) => onChange({ ...pattern, angle: Math.round(position * 180) % 180 }, t('Pattern turn'), 'pattern-angle')}
      />
    </div>
  )
}
