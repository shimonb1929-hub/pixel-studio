// 'project' keeps every layer, so the design can be opened again in Pixel Studio.
export type ExportFormat = 'png' | 'jpeg' | 'project'

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; mime: string; extension: string }> = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png' },
  jpeg: { label: 'JPG', mime: 'image/jpeg', extension: 'jpg' },
  project: { label: 'Project', mime: 'application/x-pixel-studio', extension: 'pixel' },
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim()
}

export function exportFileName(baseName: string, format: ExportFormat): string {
  return `${sanitizeFileName(baseName) || 'image'}.${EXPORT_FORMATS[format].extension}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// "Square post 2" when "Square post" is taken, so designs in a list can be told apart.
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken)
  if (!used.has(name)) return name
  let n = 2
  while (used.has(`${name} ${n}`)) n++
  return `${name} ${n}`
}

// "My design 4" when "My design 3" is the highest so far (or `atLeast` is 3).
export function nextNumberedName(prefix: string, taken: string[], atLeast = 0): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`)
  const highest = taken.reduce((max, name) => {
    const match = pattern.exec(name)
    return match ? Math.max(max, Number(match[1])) : max
  }, atLeast)
  return `${prefix} ${highest + 1}`
}
