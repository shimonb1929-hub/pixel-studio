import { describe, expect, it } from 'vitest'
import {
  applyAffine,
  boxCorners,
  boxFromRect,
  boxMatrix,
  boxPoint,
  describeChange,
  dragHandle,
  flipBox,
  hitHandle,
  multiplyAffine,
  normalizeAngle,
  rotateBox90,
  translateAffine,
  type TransformBox,
} from './transform.ts'

const free = { keepProportions: false, snapAngle: false }
const box = (): TransformBox => boxFromRect({ x: 100, y: 100, width: 100, height: 50 })

function expectPoint(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x)
  expect(actual.y).toBeCloseTo(y)
}

describe('boxMatrix', () => {
  it('maps the source picture onto the box corners, even when turned and flipped', () => {
    for (const b of [box(), { ...box(), rotation: 0.7 }, flipBox({ ...box(), rotation: -1.2 }, 'horizontal')]) {
      const m = boxMatrix(b, 20, 10)
      const corners = boxCorners(b)
      expectPoint(applyAffine(m, { x: 0, y: 0 }), corners[0].x, corners[0].y)
      expectPoint(applyAffine(m, { x: 20, y: 0 }), corners[1].x, corners[1].y)
      expectPoint(applyAffine(m, { x: 20, y: 10 }), corners[2].x, corners[2].y)
      expectPoint(applyAffine(m, { x: 0, y: 10 }), corners[3].x, corners[3].y)
    }
  })

  it('combines with other transforms', () => {
    const m = multiplyAffine(translateAffine(5, 7), boxMatrix(box(), 100, 50))
    expectPoint(applyAffine(m, { x: 0, y: 0 }), 105, 107)
  })
})

describe('dragHandle', () => {
  it('moves the whole box', () => {
    const moved = dragHandle(box(), 'move', { x: 0, y: 0 }, { x: 10, y: -5 }, free)
    expect([moved.cx, moved.cy]).toEqual([160, 120])
  })

  it('stretches freely from a corner while the opposite corner stays put', () => {
    const b = box()
    const next = dragHandle(b, 'se', { x: 200, y: 150 }, { x: 210, y: 170 }, free)
    expect(next.width).toBeCloseTo(110)
    expect(next.height).toBeCloseTo(70)
    expectPoint(boxPoint(next, -1, -1), 100, 100)
  })

  it('keeps the shape when asked', () => {
    const next = dragHandle(box(), 'se', { x: 200, y: 150 }, { x: 220, y: 150 }, { ...free, keepProportions: true })
    expect(next.width / next.height).toBeCloseTo(2)
    expectPoint(boxPoint(next, -1, -1), 100, 100)
  })

  it('stretches one side from an edge handle', () => {
    const next = dragHandle(box(), 'e', { x: 200, y: 125 }, { x: 230, y: 999 }, { ...free, keepProportions: true })
    expect(next.width).toBeCloseTo(130)
    expect(next.height).toBeCloseTo(50)
    expectPoint(boxPoint(next, -1, 0), 100, 125)
  })

  it('flips when a handle is dragged past the other side', () => {
    const next = dragHandle(box(), 'e', { x: 200, y: 125 }, { x: 60, y: 125 }, free)
    expect(next.width).toBeCloseTo(-40)
  })

  it('never shrinks to nothing', () => {
    const next = dragHandle(box(), 'e', { x: 200, y: 125 }, { x: 100, y: 125 }, free)
    expect(Math.abs(next.width)).toBeGreaterThanOrEqual(1)
  })

  it('keeps the opposite corner put on a turned box', () => {
    const b = { ...box(), rotation: 0.5 }
    const fixed = boxPoint(b, -1, -1)
    const next = dragHandle(b, 'se', boxPoint(b, 1, 1), { x: 260, y: 230 }, free)
    expectPoint(boxPoint(next, -1, -1), fixed.x, fixed.y)
  })

  it('turns around the center, in 15° steps when snapping', () => {
    const b = box()
    const turned = dragHandle(b, 'rotate', { x: 250, y: 125 }, { x: 150, y: 225 }, free)
    expect(turned.rotation).toBeCloseTo(Math.PI / 2)
    const snapped = dragHandle(b, 'rotate', { x: 250, y: 125 }, { x: 250, y: 140 }, { ...free, snapAngle: true })
    expect(snapped.rotation).toBeCloseTo(Math.PI / 12)
  })
})

describe('flip, rotate 90 and angles', () => {
  it('flips and turns', () => {
    expect(flipBox(box(), 'vertical').height).toBe(-50)
    expect(rotateBox90(box(), 1).rotation).toBeCloseTo(Math.PI / 2)
    expect(rotateBox90(rotateBox90(box(), -1), 1).rotation).toBe(0)
  })

  it('keeps angles between -180° and 180°', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2)
  })
})

describe('hitHandle', () => {
  it('finds handles, the inside and the rotation knob', () => {
    const b = box()
    expect(hitHandle(b, { x: 200, y: 150 }, 1, { rotate: true })).toBe('se')
    expect(hitHandle(b, { x: 150, y: 100 }, 1, { rotate: true })).toBe('n')
    expect(hitHandle(b, { x: 150, y: 125 }, 1, { rotate: true })).toBe('move')
    expect(hitHandle(b, { x: 150, y: 72 }, 1, { rotate: true })).toBe('rotate')
    expect(hitHandle(b, { x: 400, y: 400 }, 1, { rotate: true })).toBeNull()
  })

  it('leaves out rotation when it is not allowed, like for cropping', () => {
    expect(hitHandle(box(), { x: 150, y: 72 }, 1, { rotate: false })).toBeNull()
  })

  it('makes handles the same size on screen at any zoom', () => {
    expect(hitHandle(box(), { x: 204, y: 154 }, 4, { rotate: false })).toBeNull()
    expect(hitHandle(box(), { x: 204, y: 154 }, 1, { rotate: false })).toBe('se')
  })
})

describe('describeChange', () => {
  it('names what changed in plain words', () => {
    const b = box()
    expect(describeChange({ ...b, cx: 0 }, b)).toBe('Move')
    expect(describeChange({ ...b, width: 200 }, b)).toBe('Resize')
    expect(describeChange({ ...b, rotation: 1 }, b)).toBe('Rotate')
    expect(describeChange(flipBox(b, 'horizontal'), b)).toBe('Flip')
    expect(describeChange({ ...b, width: 200, rotation: 1 }, b)).toBe('Resize and rotate')
  })
})
