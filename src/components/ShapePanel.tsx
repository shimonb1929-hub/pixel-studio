import { ArrowRight, Blend, CircleHelp, ImagePlus, Move, PenTool, Square, X } from 'lucide-react'
import { cssGradient, type Gradient } from '../editor/gradient.ts'
import { GradientEditor } from './GradientEditor.tsx'
import { isLineShape } from '../editor/objects.ts'
import type { ShapeFill, ShapeGeometry, ShapeOutline } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

export type ColorTarget = 'fill' | 'outline'

// Diagonal line through an empty swatch: "nothing here".
const NONE_SWATCH = 'linear-gradient(to top right, transparent calc(50% - 1px), #c4320a calc(50% - 1px), #c4320a calc(50% + 1px), transparent calc(50% + 1px)), #ffffff'

function Swatch({ label, color, active, onClick, description }: { label: string; color: string | null; active: boolean; onClick: () => void; description: string }) {
  return (
    <Tooltip title={label} description={description} className="flex">
      <button
        type="button"
        aria-label={`${label} color`}
        aria-pressed={active}
        onClick={onClick}
        className={`flex h-9 items-center gap-2 rounded-lg border px-2 text-[12px] font-medium transition-colors ${
          active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle hover:text-ink'
        }`}
      >
        <span className="h-5 w-5 rounded-md border border-[rgb(16_24_40/0.15)]" style={{ background: color ?? NONE_SWATCH }} aria-hidden />
        {label}
      </button>
    </Tooltip>
  )
}

export interface ShapePhotoControls {
  zoom: number
  moving: boolean
  onZoom: (zoom: number) => void
  onToggleMove: () => void
  onRemove: () => void
}

interface ShapePanelProps {
  // "New shapes" while choosing how the next shape looks, or the selected shape's name.
  title: string
  editing: boolean
  geometry: ShapeGeometry
  fill: ShapeFill
  outline: ShapeOutline | null
  colorTarget: ColorTarget
  onColorTarget: (target: ColorTarget) => void
  onGeometry: (patch: Partial<ShapeGeometry>) => void
  onNoFill: () => void
  onNoOutline: () => void
  onOutlineWidth: (width: number) => void
  // A plain color or a gradient inside.
  onFillKind: (kind: 'color' | 'gradient') => void
  onGradient: (gradient: Gradient, label: string, mergeKey?: string) => void
  gradientStop: number
  onGradientStop: (index: number) => void
  // Shows the shape's points with the Pen, so they can be moved one by one.
  onEditPoints?: () => void
  // Only for a shape already on the design.
  onChoosePhoto?: () => void
  photo: ShapePhotoControls | null
}

const MAX_OUTLINE = 60

// The look of the selected shape (or of new ones): its colors, outline and corners.
export function ShapePanel(props: ShapePanelProps) {
  const { geometry, fill, outline } = props
  const line = isLineShape(geometry)
  const fillColor = fill.kind === 'color' ? fill.color : fill.kind === 'gradient' ? cssGradient(fill.gradient) : null
  const target = line ? 'outline' : props.colorTarget

  return (
    <section aria-label="Shape" className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip
          title="Shape"
          description="How the shape looks. Pick Fill or Outline, then choose a color in the Color panel above. Shapes stay sharp at any size."
        >
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            <bdi className="truncate">{props.title}</bdi>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!line && (
          <Swatch
            label="Fill"
            color={fill.kind === 'photo' ? null : fillColor}
            active={target === 'fill'}
            onClick={() => props.onColorTarget('fill')}
            description="The inside of the shape. While this is picked, the Color panel colors the inside."
          />
        )}
        <Swatch
          label={line ? 'Line' : 'Outline'}
          color={outline?.color ?? null}
          active={target === 'outline'}
          onClick={() => props.onColorTarget('outline')}
          description={line ? 'The color of the line. Choose it in the Color panel.' : 'The line around the shape. While this is picked, the Color panel colors the outline.'}
        />
        {target === 'fill' && !line && fill.kind !== 'photo' && (
          <div role="radiogroup" aria-label="Fill kind" className="flex shrink-0 gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
            {(
              [
                { kind: 'color', label: 'Color', icon: Square, description: 'Fill the inside with one plain color.' },
                { kind: 'gradient', label: 'Gradient', icon: Blend, description: 'Fill the inside with colors that fade smoothly into each other. Start from a ready-made one, then change it as you like.' },
              ] as const
            ).map((choice) => (
              <Tooltip key={choice.kind} title={choice.label} description={choice.description}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={fill.kind === choice.kind}
                  aria-label={choice.label}
                  onClick={() => props.onFillKind(choice.kind)}
                  className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${
                    fill.kind === choice.kind ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <choice.icon size={14} strokeWidth={1.9} />
                  {choice.label}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        {target === 'fill' && fill.kind !== 'none' && (
          <Button variant="ghost" className="h-9 px-2 text-[12px]" onClick={props.onNoFill} tip={{ title: 'No fill', description: 'Leave the inside empty and see-through, so only the outline shows.' }}>
            <X size={14} />
            No fill
          </Button>
        )}
        {target === 'outline' && outline && !line && (
          <Button variant="ghost" className="h-9 px-2 text-[12px]" onClick={props.onNoOutline} tip={{ title: 'No outline', description: 'Take away the line around the shape.' }}>
            <X size={14} />
            No outline
          </Button>
        )}
      </div>

      {target === 'fill' && fill.kind === 'gradient' && (
        <div className="mt-3">
          <GradientEditor gradient={fill.gradient} stop={Math.min(props.gradientStop, fill.gradient.stops.length - 1)} onStop={props.onGradientStop} onChange={props.onGradient} />
        </div>
      )}

      <div className={`flex flex-col gap-3 ${outline || line || geometry.type === 'rectangle' || geometry.type === 'polygon' || geometry.type === 'star' ? 'mt-4' : ''}`}>
        {(outline || line) && (
          <Slider
            label={line ? 'Thickness' : 'Outline width'}
            help={line ? 'How thick the line is.' : 'How thick the line around the shape is.'}
            value={Math.sqrt((outline?.width ?? 0) / MAX_OUTLINE)}
            display={`${outline?.width ?? 0} px`}
            onChange={(position) => props.onOutlineWidth(Math.max(line ? 1 : 0, Math.round(position * position * MAX_OUTLINE)))}
          />
        )}
        {geometry.type === 'rectangle' && (
          <Slider
            label="Round corners"
            help="How round the corners are. All the way right makes the short sides fully round, like a pill."
            value={geometry.corners}
            display={`${Math.round(geometry.corners * 100)}%`}
            onChange={(position) => props.onGeometry({ corners: Math.round(position * 100) / 100 })}
          />
        )}
        {(geometry.type === 'polygon' || geometry.type === 'star') && (
          <Slider
            label={geometry.type === 'star' ? 'Points' : 'Sides'}
            help={geometry.type === 'star' ? 'How many points the star has.' : 'How many sides: 3 is a triangle, 6 a hexagon.'}
            value={(geometry.sides - 3) / 9}
            display={String(geometry.sides)}
            onChange={(position) => props.onGeometry({ sides: 3 + Math.round(position * 9) })}
          />
        )}
        {line && (
          <Tooltip title="Arrow head" description="Put an arrow head on the end of the line." className="flex">
            <button
              type="button"
              aria-pressed={geometry.arrow}
              aria-label="Arrow head"
              onClick={() => props.onGeometry({ arrow: !geometry.arrow })}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
                geometry.arrow ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <ArrowRight size={15} />
              Arrow head
            </button>
          </Tooltip>
        )}
      </div>

      {props.onEditPoints && (
        <Button
          variant="secondary"
          className="mt-4 h-8 w-full px-3 text-[12px]"
          onClick={props.onEditPoints}
          tip={{ title: 'Edit points', description: 'Show the points of this shape, so you can drag them, bend its sides into curves, or add more points. Any shape can be reshaped this way.' }}
        >
          <PenTool size={15} />
          Edit points
        </Button>
      )}

      {props.editing && !line && (
        <div className="mt-4 border-t border-line pt-3">
          {props.photo ? (
            <div className="flex flex-col gap-3">
              <Slider
                label="Photo size"
                help="Make the photo bigger inside the shape. It always fills the whole shape."
                value={(props.photo.zoom - 1) / 3}
                display={`${Math.round(props.photo.zoom * 100)}%`}
                onChange={(position) => props.photo!.onZoom(Math.round((1 + position * 3) * 100) / 100)}
              />
              <div className="flex items-center gap-1.5">
                <Tooltip title="Move photo" description="While this is on, drag on the shape to slide the photo inside it, to show the part you want." className="flex">
                  <button
                    type="button"
                    aria-pressed={props.photo.moving}
                    aria-label="Move photo"
                    onClick={props.photo.onToggleMove}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
                      props.photo.moving ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                    }`}
                  >
                    <Move size={15} />
                    Move photo
                  </button>
                </Tooltip>
                <Button variant="ghost" className="h-8 px-2.5 text-[12px]" onClick={props.photo.onRemove} tip={{ title: 'Remove photo', description: 'Take the photo out, and fill the shape with a color again.' }}>
                  <X size={14} />
                  Remove photo
                </Button>
              </div>
            </div>
          ) : (
            props.onChoosePhoto && (
              <Button
                variant="secondary"
                className="h-8 w-full px-3 text-[12px]"
                onClick={props.onChoosePhoto}
                tip={{ title: 'Fill with a photo', description: 'Put a photo inside this shape. You can also drop a picture file right onto the shape.' }}
              >
                <ImagePlus size={15} />
                Fill with a photo…
              </Button>
            )
          )}
        </div>
      )}
    </section>
  )
}
