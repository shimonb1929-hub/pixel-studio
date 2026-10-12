import { live, msg } from './i18n/i18n.ts'
export interface SizePreset {
  id: string
  name: string
  // What people usually make at this size, in plain words.
  use: string
  width: number
  height: number
}

export const SIZE_PRESETS: SizePreset[] = live([
  { id: 'square', name: msg('Square post'), use: msg('Social posts and profile pictures.'), width: 1080, height: 1080 },
  { id: 'story', name: msg('Phone story'), use: msg('Full-screen phone stories and phone wallpapers.'), width: 1080, height: 1920 },
  { id: 'screen', name: msg('Wide screen'), use: msg('Slides, video thumbnails and computer wallpapers.'), width: 1920, height: 1080 },
  { id: 'banner', name: msg('Website banner'), use: msg('Website headers and link previews.'), width: 1200, height: 630 },
  { id: 'a4', name: msg('A4 page'), use: msg('Flyers, worksheets and letters to print. Sharp enough for paper.'), width: 2480, height: 3508 },
  { id: 'letter', name: msg('Letter page'), use: msg('US-size flyers and letters to print. Sharp enough for paper.'), width: 2550, height: 3300 },
  { id: 'poster', name: msg('Poster'), use: msg('Large A3 posters to print. Big and sharp.'), width: 3508, height: 4961 },
])
