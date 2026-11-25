import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../components/Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { play, setSoundsOn, soundsOn } from './sounds.ts'
import { caption, readingTime, wordsSpoken, type Tour, type TourHost } from './tour.ts'

interface TourPlayerProps {
  tour: Tour
  host: TourHost
  onClose: () => void
}

interface Spot {
  x: number
  y: number
  width: number
  height: number
}

const PAD = 8
// A short breath between one line and the next.
const GAP_MS = 650

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function spotOf(selector: string | undefined): Spot | null {
  if (!selector) return null
  const element = document.querySelector(selector)
  if (!element) return null
  const r = element.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

const sameSpot = (a: Spot | null, b: Spot | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5)

// Little shapes bursting out from a point: circles, squares and stars, never anything else.
function Burst({ x, y, seed, big }: { x: number; y: number; seed: number; big?: boolean }) {
  const colors = ['#3366ff', '#ffb020', '#22c38e', '#ff5d8f', '#8b5cf6', '#00b8d9']
  const count = big ? 36 : 12
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[46] overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + seed
        const distance = (big ? 160 : 60) + ((i * 37 + seed * 100) % (big ? 220 : 50))
        const size = big ? 8 + (i % 4) * 3 : 6 + (i % 3) * 2
        const kind = i % 3
        return (
          <span
            key={`${seed}-${i}`}
            className="tour-burst absolute"
            style={
              {
                left: x - size / 2,
                top: y - size / 2,
                width: size,
                height: size,
                background: colors[i % colors.length],
                borderRadius: kind === 0 ? '50%' : kind === 1 ? '2px' : 0,
                clipPath: kind === 2 ? 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' : undefined,
                '--dx': `${Math.cos(angle) * distance}px`,
                '--dy': `${Math.sin(angle) * distance}px`,
                animationDelay: `${(i % 5) * 18}ms`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}

export function TourPlayer({ tour, host, onClose }: TourPlayerProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [sounds, setSounds] = useState(soundsOn)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [burst, setBurst] = useState<{ x: number; y: number; seed: number; big?: boolean } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hostRef = useRef(host)
  hostRef.current = host
  const step = tour.steps[index]
  const last = index === tour.steps.length - 1
  const words = useMemo(() => caption(step.line).split(/\s+/).filter(Boolean), [step])
  const spoken = wordsSpoken(words, progress)
  const motion = !reducedMotion()

  // The app draws again whenever the design changes (the tour changes it too), which gives a new
  // onClose each time; steps only start again when the step itself changes.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Each demo runs once, even when a step is heard again, so nothing is added twice.
  const ranRef = useRef(new Set<string>())
  const indexRef = useRef(index)
  indexRef.current = index
  // Skipping ahead or closing still finishes what the step was making, quietly, so nothing is left
  // half done.
  const finishStep = useCallback(() => {
    const i = indexRef.current
    tour.steps[i].parts?.forEach((part, n) => {
      const key = `${i}:${n}`
      if (ranRef.current.has(key)) return
      ranRef.current.add(key)
      part.run(hostRef.current)
    })
  }, [tour.steps])
  const go = useCallback(
    (next: number) => {
      if (next === indexRef.current) return
      finishStep()
      if (next >= tour.steps.length) {
        closeRef.current()
        return
      }
      setIndex(Math.max(0, next))
    },
    [finishStep, tour.steps.length],
  )
  const close = useCallback(() => {
    finishStep()
    closeRef.current()
  }, [finishStep])

  const playingRef = useRef(playing)
  playingRef.current = playing

  // Each step: do what it shows, then speak (or show the words for as long as they take to read).
  // Pausing stops the voice and the clock where they are; playing goes on from there.
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let frame = 0
    const ran = ranRef.current
    const once = (key: string, run: () => void) => {
      if (ran.has(key)) return false
      ran.add(key)
      run()
      return true
    }
    setProgress(0)
    once(`${index}`, () => step.run?.(hostRef.current))
    play(step.sound ?? (step.target ? 'whoosh' : 'chime'))

    const runParts = (fraction: number) => {
      step.parts?.forEach((part, i) => {
        if (fraction < part.at) return
        if (once(`${index}:${i}`, () => part.run(hostRef.current))) play(part.sound ?? 'pop')
      })
    }
    const finish = () => {
      if (cancelled) return
      runParts(1)
      setProgress(1)
      // While paused, wait here; playing again moves on.
      const moveOn = () => {
        if (cancelled) return
        if (playingRef.current) go(index + 1)
        else timer = window.setTimeout(moveOn, 200)
      }
      timer = window.setTimeout(moveOn, GAP_MS)
    }

    // Without a recording (or when it can't play), a clock stands in for it.
    let readSoFar = 0
    let readFrom = performance.now()
    const length = readingTime(step.line) * 1000
    const tickReading = () => {
      if (cancelled) return
      const now = performance.now()
      if (playingRef.current) readSoFar += now - readFrom
      readFrom = now
      const fraction = Math.min(1, readSoFar / length)
      setProgress(fraction)
      runParts(fraction)
      if (fraction >= 1) finish()
      else frame = requestAnimationFrame(tickReading)
    }

    const audio = step.audio ? new Audio(step.audio) : null
    audioRef.current = audio
    if (audio) {
      audio.muted = !soundsOn()
      let fellBack = false
      const fallBack = () => {
        if (fellBack || cancelled) return
        fellBack = true
        audioRef.current = null
        cancelAnimationFrame(frame)
        readFrom = performance.now()
        tickReading()
      }
      const tickAudio = () => {
        if (cancelled || fellBack) return
        const fraction = audio.duration ? audio.currentTime / audio.duration : 0
        setProgress(fraction)
        runParts(fraction)
        frame = requestAnimationFrame(tickAudio)
      }
      audio.addEventListener('ended', finish)
      audio.addEventListener('error', fallBack)
      if (playingRef.current) audio.play().catch(fallBack)
      frame = requestAnimationFrame(tickAudio)
    } else tickReading()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      audio?.pause()
    }
  }, [index, step, go])

  // Pause and play the voice in place.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing && audio.paused && !audio.ended) void audio.play().catch(() => {})
    else if (!playing) audio.pause()
  }, [playing])

  // The spotlight follows its target as the layout moves (panels opening, the window resizing).
  useLayoutEffect(() => {
    let frame = 0
    let previous: Spot | null = null
    const follow = () => {
      const next = spotOf(step.target)
      if (!sameSpot(previous, next)) {
        previous = next
        setSpot(next)
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [step])

  // A little burst of shapes where the spotlight lands, and a big one at the end.
  useEffect(() => {
    if (!motion) return
    const target = spotOf(step.target)
    if (last) setBurst({ x: window.innerWidth / 2, y: window.innerHeight / 2, seed: index, big: true })
    else if (target) setBurst({ x: target.x + target.width / 2, y: target.y + target.height / 2, seed: index })
    else setBurst(null)
    if (last) play('sparkle')
  }, [index, last, motion, step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') go(index + 1)
      else if (event.key === 'ArrowLeft') go(index - 1)
      else if (event.key === ' ') setPlaying((p) => !p)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, index, close])

  const toggleSounds = () => {
    setSoundsOn(!sounds)
    setSounds(!sounds)
    if (audioRef.current) audioRef.current.muted = sounds
  }
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !sounds
  })

  const w = typeof window === 'undefined' ? 0 : window.innerWidth
  const h = typeof window === 'undefined' ? 0 : window.innerHeight
  const ring = 'transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)]'

  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-modal="true" aria-label={tour.title} data-tour-player={tour.id}>
      {/* The dim around the spotlight. Clicks stay on the tour, so nothing changes by accident. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-hole">
            <rect width={w} height={h} fill="white" />
            {spot && <rect className={motion ? ring : ''} x={spot.x} y={spot.y} width={spot.width} height={spot.height} rx={14} fill="black" />}
          </mask>
        </defs>
        <rect width={w} height={h} fill="rgb(16 20 32 / 0.5)" mask="url(#tour-hole)" />
      </svg>
      {spot && (
        <div
          aria-hidden
          className={`pointer-events-none absolute rounded-[14px] ring-[3px] ring-accent ${motion ? `${ring} tour-glow` : ''}`}
          style={{ left: spot.x, top: spot.y, width: spot.width, height: spot.height }}
        />
      )}
      {burst && <Burst key={`${burst.seed}-${burst.big}`} {...burst} />}

      <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5 md:justify-end md:pe-5">
        <div key={index} className={`w-full max-w-xl rounded-card md:max-w-md border border-line bg-surface p-5 shadow-float ${motion ? 'tour-card' : ''}`}>
          <div className="flex items-center gap-3">
            <span aria-hidden className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft ${motion && playing ? 'tour-orb' : ''}`}>
              <span className="h-3.5 w-3.5 rounded-full bg-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">{tour.title}</div>
              <div className="text-xs tabular-nums text-ink-3">{t('Step {n} of {total}', { n: index + 1, total: tour.steps.length })}</div>
            </div>
            <Tooltip title={sounds ? t('Sound on') : t('Sound off')} description={t('Turn the voice and the little sounds on or off. The words stay on the screen.')}>
              <button type="button" aria-label={sounds ? t('Sound on') : t('Sound off')} onClick={toggleSounds} className="rounded-lg p-2 text-ink-2 hover:bg-subtle hover:text-ink">
                {sounds ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </Tooltip>
            <Tooltip title={t('Close tour')} description={t('Stop the tour. Everything it made stays on your design.')} shortcut="Esc">
              <button type="button" aria-label={t('Close tour')} onClick={close} className="rounded-lg p-2 text-ink-2 hover:bg-subtle hover:text-ink">
                <X size={18} />
              </button>
            </Tooltip>
          </div>

          <p dir="ltr" lang="en" className="mt-4 min-h-[3.5em] text-[19px] font-medium leading-snug text-ink" aria-live="polite">
            {words.map((word, i) => (
              <span key={i} className={`transition-colors duration-200 ${i < spoken ? 'text-ink' : 'text-ink-3/60'}`}>
                {word}{' '}
              </span>
            ))}
          </p>

          <div className="mt-4 flex gap-1" aria-hidden>
            {tour.steps.map((s, i) => (
              <div key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : 0 }} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Tooltip title={t('Back')} description={t('Hear the step before this one again.')} shortcut="←">
              <button type="button" onClick={() => go(index - 1)} aria-disabled={index === 0 || undefined} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink aria-disabled:opacity-40">
                <ChevronLeft size={16} className="rtl:rotate-180" />
                {t('Back')}
              </button>
            </Tooltip>
            <Tooltip title={playing ? t('Pause') : t('Play')} description={playing ? t('Stop here for a moment, to look or try it yourself.') : t('Go on with the tour.')} shortcut={t('Space')}>
              <button type="button" aria-label={playing ? t('Pause') : t('Play')} onClick={() => setPlaying(!playing)} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-sm hover:bg-accent-hover">
                {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}
              </button>
            </Tooltip>
            <Tooltip title={last ? t('Finish') : t('Next')} description={last ? t('End the tour and start making.') : t('Skip ahead to the next step.')} shortcut="→">
              <button type="button" onClick={() => go(index + 1)} className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15">
                {last ? t('Finish') : t('Next')}
                <ChevronRight size={16} className="rtl:rotate-180" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
