// Made by scripts/ocr/fetch.mjs. Do not edit by hand; run `node scripts/ocr/fetch.mjs`.
// Where the files of Words from a picture are on our own site, and how big the downloads are.

// tesseract.js 7.0.0, tesseract.js-core 7.0.0, language models 4.0.0_best_int.
export const OCR_FOLDER = 'ocr/7.0.0'

export type OcrLanguage = 'eng' | 'heb' | 'yid'

// In bytes: the engine (downloaded once) and each language (downloaded the first time it's used).
export const OCR_ENGINE_BYTES = 4017074
export const OCR_LANGUAGE_BYTES: Record<OcrLanguage, number> = {
  eng: 2952873,
  heb: 580576,
  yid: 445286
}
