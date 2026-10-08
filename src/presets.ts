export interface SizePreset {
  id: string
  name: string
  // What people usually make at this size, in plain words.
  use: string
  width: number
  height: number
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'square', name: 'Square post', use: 'Social posts and profile pictures.', width: 1080, height: 1080 },
  { id: 'story', name: 'Phone story', use: 'Full-screen phone stories and phone wallpapers.', width: 1080, height: 1920 },
  { id: 'screen', name: 'Wide screen', use: 'Slides, video thumbnails and computer wallpapers.', width: 1920, height: 1080 },
  { id: 'banner', name: 'Website banner', use: 'Website headers and link previews.', width: 1200, height: 630 },
  { id: 'a4', name: 'A4 page', use: 'Flyers, worksheets and letters to print. Sharp enough for paper.', width: 2480, height: 3508 },
  { id: 'letter', name: 'Letter page', use: 'US-size flyers and letters to print. Sharp enough for paper.', width: 2550, height: 3300 },
  { id: 'poster', name: 'Poster', use: 'Large A3 posters to print. Big and sharp.', width: 3508, height: 4961 },
]
