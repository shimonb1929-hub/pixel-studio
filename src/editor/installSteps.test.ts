import { describe, expect, it } from 'vitest'
import { installDevice, installGuide } from './installSteps.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'

describe('installDevice', () => {
  it('tells the devices apart', () => {
    expect(installDevice(IPHONE)).toBe('iphone')
    expect(installDevice(MAC_SAFARI)).toBe('mac-safari')
    // An iPad says it is a Mac, but has a touch screen.
    expect(installDevice(MAC_SAFARI, 5)).toBe('iphone')
    expect(installDevice(MAC_CHROME)).toBe('desktop')
    expect(installDevice(ANDROID)).toBe('android')
    expect(installDevice(FIREFOX)).toBe('firefox')
    expect(installDevice(EDGE)).toBe('desktop')
  })

  it('has a few steps and where to find it afterwards for every device', () => {
    for (const device of ['iphone', 'mac-safari', 'android', 'firefox', 'desktop'] as const) {
      const guide = installGuide(device)
      expect(guide.steps.length).toBeGreaterThan(1)
      expect(guide.steps.length).toBeLessThanOrEqual(3)
      expect(guide.heading && guide.after).toBeTruthy()
    }
  })
})
