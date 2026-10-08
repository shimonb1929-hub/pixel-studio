import { describe, expect, it } from 'vitest'
import {
  BRUSH_PRESETS,
  describeSmoothing,
  ERASER_PRESETS,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  sizeToSlider,
  sliderToSize,
  stepBrushSize,
} from './brushes.ts'

describe('size slider', () => {
  it('covers the whole size range', () => {
    expect(sliderToSize(0)).toBe(MIN_BRUSH_SIZE)
    expect(sliderToSize(1)).toBe(MAX_BRUSH_SIZE)
    expect(sizeToSlider(MIN_BRUSH_SIZE)).toBe(0)
    expect(sizeToSlider(MAX_BRUSH_SIZE)).toBe(1)
  })

  it('round-trips sizes', () => {
    for (const size of [1, 2, 4, 10, 28, 90, 250, 500]) {
      expect(sliderToSize(sizeToSlider(size))).toBe(size)
    }
  })

  it('gives small sizes most of the slider', () => {
    expect(sliderToSize(0.5)).toBeLessThan(150)
  })

  it('clamps out-of-range values', () => {
    expect(sliderToSize(-1)).toBe(MIN_BRUSH_SIZE)
    expect(sliderToSize(2)).toBe(MAX_BRUSH_SIZE)
    expect(sizeToSlider(9999)).toBe(1)
  })
})

describe('stepBrushSize', () => {
  it('steps evenly up and down', () => {
    expect(stepBrushSize(4, 1)).toBe(5)
    expect(stepBrushSize(10, 1)).toBe(15)
    expect(stepBrushSize(15, -1)).toBe(10)
    expect(stepBrushSize(10, -1)).toBe(9)
    expect(stepBrushSize(100, 1)).toBe(125)
    expect(stepBrushSize(125, -1)).toBe(100)
  })

  it('never leaves the size range', () => {
    expect(stepBrushSize(1, -1)).toBe(MIN_BRUSH_SIZE)
    expect(stepBrushSize(MAX_BRUSH_SIZE, 1)).toBe(MAX_BRUSH_SIZE)
  })
})

describe('presets', () => {
  it('have unique ids and sensible values', () => {
    for (const presets of [BRUSH_PRESETS, ERASER_PRESETS]) {
      expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length)
      for (const { settings } of presets) {
        expect(settings.size).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE)
        expect(settings.size).toBeLessThanOrEqual(MAX_BRUSH_SIZE)
        for (const value of [settings.softness, settings.opacity, settings.flow, settings.smoothing]) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('describeSmoothing', () => {
  it('explains each level', () => {
    expect(describeSmoothing(0)).toMatch(/Off/)
    expect(describeSmoothing(0.2)).toMatch(/little/)
    expect(describeSmoothing(0.6)).toMatch(/clean/)
    expect(describeSmoothing(0.9)).toMatch(/trail/)
  })
})
