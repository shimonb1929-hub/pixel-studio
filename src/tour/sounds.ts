// Light sounds for the tours, made on the spot by the browser (no sound files): a soft chime when
// a new step starts, a pop when something appears, a whoosh when the spotlight moves, and a little
// sparkle at the end. What the tour does on the page gets its own sound too: a brush swish while
// painting, a soft rub for the eraser, little taps for typing, a slide for moving, a rising note
// for growing, a shimmer for a glow and a bright "ta-da" when a color or look changes. They stay
// quiet under the voice, and can be turned off.

export type SoundName = 'chime' | 'pop' | 'whoosh' | 'sparkle' | 'tick' | 'brush' | 'rub' | 'type' | 'slide' | 'grow' | 'shine' | 'change'

const KEY = 'pixel-studio-tour-sounds'
let context: AudioContext | null = null

export function soundsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Private windows may not keep it; the choice still holds until the page closes.
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

// One soft note that swells in and fades out.
function note(ctx: AudioContext, frequency: number, start: number, length: number, volume: number, type: OscillatorType = 'sine', slideTo?: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, length / 4))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

function noise(ctx: AudioContext, start: number, length: number, volume: number, low = 400, high = 2400) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.8
  filter.frequency.setValueAtTime(low, start)
  filter.frequency.exponentialRampToValueAtTime(high, start + length * 0.6)
  filter.frequency.exponentialRampToValueAtTime(low * 1.75, start + length)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + length * 0.45)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
}

export function play(name: SoundName) {
  if (!soundsOn()) return
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime + 0.01
  switch (name) {
    case 'chime':
      note(ctx, 784, now, 0.35, 0.05)
      note(ctx, 1175, now + 0.08, 0.45, 0.04)
      break
    case 'pop':
      note(ctx, 520, now, 0.12, 0.08, 'sine', 980)
      break
    case 'whoosh':
      noise(ctx, now, 0.35, 0.035)
      break
    case 'sparkle':
      ;[1047, 1319, 1568, 2093].forEach((f, i) => note(ctx, f, now + i * 0.07, 0.4, 0.035, 'triangle'))
      break
    case 'tick':
      note(ctx, 1400, now, 0.05, 0.03, 'square')
      break
    case 'brush':
      // Two soft strokes of a brush on paper.
      noise(ctx, now, 0.45, 0.03, 1200, 4200)
      noise(ctx, now + 0.4, 0.5, 0.025, 1000, 3600)
      break
    case 'rub':
      for (let i = 0; i < 4; i++) noise(ctx, now + i * 0.13, 0.12, 0.03, 300, 900)
      break
    case 'type':
      for (let i = 0; i < 6; i++) note(ctx, 1500 + (i % 3) * 180, now + i * 0.075, 0.035, 0.022, 'square')
      break
    case 'slide':
      noise(ctx, now, 0.45, 0.025)
      note(ctx, 330, now, 0.45, 0.025, 'sine', 520)
      break
    case 'grow':
      note(ctx, 300, now, 0.5, 0.05, 'sine', 760)
      break
    case 'shine':
      note(ctx, 880, now, 0.7, 0.025, 'triangle', 1760)
      ;[1568, 2093, 2637].forEach((f, i) => note(ctx, f, now + 0.15 + i * 0.09, 0.35, 0.02, 'triangle'))
      break
    case 'change':
      note(ctx, 660, now, 0.14, 0.045, 'triangle')
      note(ctx, 990, now + 0.1, 0.3, 0.04, 'triangle')
      break
  }
}
