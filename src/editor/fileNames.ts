export type ExportFormat = 'png' | 'jpeg'

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; mime: string; extension: string }> = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png' },
  jpeg: { label: 'JPG', mime: 'image/jpeg', extension: 'jpg' },
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
