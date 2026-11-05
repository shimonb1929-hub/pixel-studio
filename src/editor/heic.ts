// iPhone and many Android phones save photos as HEIC (also called HEIF). Safari opens them by
// itself, but Chrome and Edge can't, so Pixel Studio reads them with libheif. It is only loaded
// the first time a HEIC photo is opened, and it comes from Pixel Studio's own site, like the AI.

// HEIC files start with a "ftyp" box naming the kind of file, in bytes 4 to 12.
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avci'])

export async function isHeic(file: Blob): Promise<boolean> {
  if (/^image\/hei[cf]/i.test(file.type)) return true
  if ('name' in file && typeof file.name === 'string' && /\.hei[cf]$/i.test(file.name)) return true
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (head.length < 12) return false
  const text = String.fromCharCode(...head.subarray(4, 12))
  return text.startsWith('ftyp') && HEIF_BRANDS.has(text.slice(4))
}

interface HeifImage {
  get_width(): number
  get_height(): number
  is_primary(): boolean
  display(target: ImageData, done: (result: ImageData | null) => void): void
  free(): void
}

interface HeifModule {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
}

let loading: Promise<HeifModule> | null = null

function loadLibheif(): Promise<HeifModule> {
  loading ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((library) => {
    const made = (library as { default: () => HeifModule | Promise<HeifModule> }).default()
    return Promise.resolve(made)
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

// The main photo in the file, with the phone's turn already applied.
export async function decodeHeic(file: Blob, maxSide: number): Promise<HTMLCanvasElement | { width: number; height: number }> {
  const [library, bytes] = await Promise.all([loadLibheif(), file.arrayBuffer()])
  const images = new library.HeifDecoder().decode(new Uint8Array(bytes))
  const image = images.find((each) => each.is_primary()) ?? images[0]
  if (!image) throw new Error('no picture in the HEIC file')
  try {
    const width = image.get_width()
    const height = image.get_height()
    if (width > maxSide || height > maxSide) return { width, height }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    const data = context.createImageData(width, height)
    await new Promise<void>((resolve, reject) => {
      image.display(data, (result) => (result ? resolve() : reject(new Error('the HEIC photo could not be read'))))
    })
    context.putImageData(data, 0, 0)
    return canvas
  } finally {
    for (const each of images) each.free()
  }
}
