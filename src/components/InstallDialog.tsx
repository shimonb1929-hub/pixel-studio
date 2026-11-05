import { installDevice, installGuide } from '../editor/installSteps.ts'
import { t } from '../i18n/i18n.ts'
import { Dialog } from './Dialog.tsx'

interface InstallDialogProps {
  installed: boolean
  // True when this browser can install it with one click.
  canInstall: boolean
  onInstall: () => void
  onClose: () => void
}

// Puts Pixel Studio on the computer, phone or tablet as an app with its own icon. Where the browser
// can do it with one click, one button does it; elsewhere the few steps for this device are shown.
export function InstallDialog({ installed, canInstall, onInstall, onClose }: InstallDialogProps) {
  if (installed)
    return (
      <Dialog title={t('Pixel Studio is installed')} submitLabel={t('Got it')} cancelLabel={t('Close')} onSubmit={onClose} onClose={onClose}>
        <p className="text-sm leading-relaxed text-ink-2">{t('Open it any time from its icon on your desktop, home screen, Start menu or Dock. It works without internet too.')}</p>
      </Dialog>
    )

  const subtitle = t('It gets its own icon, opens in its own window like any other program, and works without internet.')
  if (canInstall)
    return (
      <Dialog title={t('Get the Pixel Studio app')} subtitle={subtitle} submitLabel={t('Install')} cancelLabel={t('Not now')} onSubmit={onInstall} onClose={onClose}>
        <p className="text-sm leading-relaxed text-ink-2">{t('Click Install, then Install again in the small window that opens. An icon for Pixel Studio is put on your desktop and in your Start menu or Launchpad.')}</p>
      </Dialog>
    )

  const guide = installGuide(installDevice(navigator.userAgent, navigator.maxTouchPoints))
  return (
    <Dialog title={t('Get the Pixel Studio app')} subtitle={subtitle} submitLabel={t('Got it')} cancelLabel={t('Close')} onSubmit={onClose} onClose={onClose}>
      <div data-install-device={guide.device}>
        <h3 className="text-[13px] font-medium text-ink">{guide.heading}</h3>
        <ol className="mt-3 space-y-2.5">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
              <span dir="auto">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">{guide.after}</p>
      </div>
    </Dialog>
  )
}
