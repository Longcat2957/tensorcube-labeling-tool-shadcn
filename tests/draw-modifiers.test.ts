import { describe, it, expect } from 'vitest'
import { applyDrawModifiers } from '../src/renderer/src/lib/canvas/interaction/mouseHandlers'

describe('applyDrawModifiers', () => {
  it('returns pointer end unchanged when no modifier', () => {
    const r = applyDrawModifiers(10, 20, 40, 35, false, false)
    expect(r).toEqual({ startX: 10, startY: 20, endX: 40, endY: 35 })
  })

  it('shift: square, positive direction', () => {
    const r = applyDrawModifiers(0, 0, 30, 50, true, false)
    // max(30,50)=50, sign dx=+, sign dy=+
    expect(r).toEqual({ startX: 0, startY: 0, endX: 50, endY: 50 })
  })

  it('shift: square, negative direction preserved', () => {
    const r = applyDrawModifiers(100, 100, 70, 40, true, false)
    // |dx|=30, |dy|=60, side=60. dx<0 → -, dy<0 → -
    expect(r).toEqual({ startX: 100, startY: 100, endX: 40, endY: 40 })
  })

  it('alt: start is center, axis-aligned', () => {
    const r = applyDrawModifiers(50, 50, 80, 70, false, true)
    // hw=30, hh=20 → [20,30] x [30,70] box
    expect(r).toEqual({ startX: 20, startY: 30, endX: 80, endY: 70 })
  })

  it('shift+alt: center + square', () => {
    const r = applyDrawModifiers(50, 50, 90, 60, true, true)
    // hw=max(40,10)=40
    expect(r).toEqual({ startX: 10, startY: 10, endX: 90, endY: 90 })
  })

  it('alt with negative deltas still expands both directions', () => {
    const r = applyDrawModifiers(50, 50, 30, 40, false, true)
    // hw=20, hh=10 → box [30..70]x[40..60]
    expect(r).toEqual({ startX: 30, startY: 40, endX: 70, endY: 60 })
  })
})
