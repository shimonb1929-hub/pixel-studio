import { msg, t } from '../i18n/i18n.ts'

// Which kind of device and browser this is, for the steps that put Pixel Studio on it as an app.
export type InstallDevice = 'iphone' | 'mac-safari' | 'android' | 'firefox' | 'desktop'

export interface InstallGuide {
  device: InstallDevice
  // What it's called on this device, and where the icon ends up afterwards.
  heading: string
  steps: string[]
  after: string
}

export function installDevice(userAgent: string, touchPoints = 0): InstallDevice {
  const ua = userAgent.toLowerCase()
  // iPads say they are Macs, but a Mac has no touch screen.
  if (/iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && touchPoints > 1)) return 'iphone'
  if (/android/.test(ua)) return 'android'
  if (/firefox|fxios/.test(ua)) return 'firefox'
  if (/macintosh/.test(ua) && /safari/.test(ua) && !/chrome|chromium|edg\//.test(ua)) return 'mac-safari'
  return 'desktop'
}

const GUIDES: Record<InstallDevice, Omit<InstallGuide, 'device'>> = {
  iphone: {
    heading: msg('On an iPhone or iPad'),
    steps: [
      msg('Tap the Share button: a square with an arrow pointing up.'),
      msg('Scroll down and tap Add to Home Screen.'),
      msg('Tap Add.'),
    ],
    after: msg('Pixel Studio is now on your home screen. Tap it to open it like any other app.'),
  },
  'mac-safari': {
    heading: msg('On a Mac in Safari'),
    steps: [msg('At the top of the screen, click File.'), msg('Click Add to Dock.'), msg('Click Add.')],
    after: msg('Pixel Studio is now in your Dock and in Launchpad. Click it to open it in its own window.'),
  },
  android: {
    heading: msg('On an Android phone or tablet'),
    steps: [
      msg('Tap the menu button: three dots at the top right.'),
      msg('Tap Install app, or Add to Home screen.'),
      msg('Tap Install.'),
    ],
    after: msg('Pixel Studio is now on your home screen. Tap it to open it like any other app.'),
  },
  firefox: {
    heading: msg('In Firefox'),
    steps: [
      msg('Firefox on a computer can’t install apps, so open this page in Chrome or Edge.'),
      msg('Click the install button at the right end of the address bar: a small screen with an arrow.'),
      msg('Click Install.'),
    ],
    after: msg('Pixel Studio gets its own icon on your desktop and in your Start menu or Launchpad.'),
  },
  desktop: {
    heading: msg('On a computer'),
    steps: [
      msg('Click the install button at the right end of the address bar: a small screen with an arrow.'),
      msg('If you don’t see it, open the browser’s menu (the three dots) and choose Install Pixel Studio.'),
      msg('Click Install.'),
    ],
    after: msg('Pixel Studio gets its own icon on your desktop and in your Start menu or Launchpad.'),
  },
}

// In the language the app is showing now.
export function installGuide(device: InstallDevice): InstallGuide {
  const guide = GUIDES[device]
  return { device, heading: t(guide.heading), steps: guide.steps.map((step) => t(step)), after: t(guide.after) }
}
