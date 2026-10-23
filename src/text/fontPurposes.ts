import { live, msg } from '../i18n/i18n.ts'

// What fonts are good for, so someone who doesn't know font names can find one by what they are
// making: a poster, a long text, a page of Torah, an invitation or something for children. Chosen
// by hand; a font can be good for more than one thing, and fonts not named here are still in the
// full list.

export type FontPurpose = 'top' | 'headline' | 'reading' | 'torah' | 'invitation' | 'kids'

export interface FontPurposeInfo {
  value: FontPurpose
  label: string
  description: string
  fonts: string[]
}

export const FONT_PURPOSES: FontPurposeInfo[] = live([
  {
    value: 'top',
    label: msg('Top picks'),
    description: msg('A few favorites that look good on almost anything. A great place to start.'),
    fonts: [
      'heebo', 'rubik', 'assistant', 'frank-ruhl-libre', 'secular-one', 'varela-round', 'david-libre', 'suez-one',
      'inter', 'montserrat', 'poppins', 'playfair-display', 'lora', 'oswald', 'bebas-neue', 'dancing-script',
      'great-vibes', 'caveat', 'pacifico', 'merriweather',
    ],
  },
  {
    value: 'headline',
    label: msg('Headlines'),
    description: msg('Big, strong letters for titles, posters and signs that are seen from far away.'),
    fonts: [
      'secular-one', 'suez-one', 'karantina', 'makabi-yg', 'yehuda-clm', 'rubik', 'heebo', 'drugulin-clm', 'keter-yg',
      'bebas-neue', 'anton', 'oswald', 'league-gothic', 'archivo-black', 'alfa-slab-one', 'abril-fatface', 'bungee',
      'staatliches', 'big-shoulders-display', 'climate-crisis', 'unbounded', 'russo-one', 'titan-one', 'bowlby-one-sc',
      'antonio', 'teko', 'passion-one', 'ultra', 'dm-serif-display', 'fjalla-one', 'league-spartan', 'paytone-one',
    ],
  },
  {
    value: 'reading',
    label: msg('Easy reading'),
    description: msg('Calm, clear letters for longer text: articles, booklets, menus and letters.'),
    fonts: [
      'heebo', 'assistant', 'noto-sans-hebrew', 'open-sans', 'arimo', 'ibm-plex-sans-hebrew', 'frank-ruhl-libre',
      'david-libre', 'noto-serif-hebrew', 'alef', 'tinos', 'simple-clm', 'nachlieli-clm',
      'inter', 'atkinson-hyperlegible', 'lexend', 'source-sans-3', 'roboto', 'lato', 'nunito', 'source-serif-4',
      'literata', 'merriweather', 'lora', 'newsreader', 'pt-serif', 'noto-serif', 'crimson-pro', 'eb-garamond',
    ],
  },
  {
    value: 'torah',
    label: msg('Torah & seforim'),
    description: msg('Traditional Hebrew letters like in seforim, a siddur or a Sefer Torah, and Rashi script. Taamey and Ezra fonts show every vowel and cantillation mark.'),
    fonts: [
      'stam-ashkenaz-clm', 'stam-sefarad-clm', 'keter-yg', 'keter-aram-tsova', 'taamey-frank-clm', 'taamey-david-clm',
      'taamey-ashkenaz', 'ezra-sil', 'noto-rashi-hebrew', 'frank-ruehl-clm', 'frank-ruhl-libre', 'david-clm',
      'david-libre', 'drugulin-clm', 'shofar', 'hadasim-clm', 'noto-serif-hebrew', 'cardo', 'libertinus-serif',
    ],
  },
  {
    value: 'invitation',
    label: msg('Invitations'),
    description: msg('Elegant letters for weddings, events, cards and thank-you notes.'),
    fonts: [
      'frank-ruhl-libre', 'bellefair', 'bona-nova', 'ellinia-clm', 'keter-aram-tsova', 'taamey-frank-clm',
      'great-vibes', 'allura', 'alex-brush', 'pinyon-script', 'parisienne', 'tangerine', 'sacramento', 'italianno',
      'rouge-script', 'petit-formal-script', 'monsieur-la-doulaise', 'imperial-script', 'corinthia', 'windsong',
      'lavishly-yours', 'ephesis', 'birthstone', 'allison', 'style-script', 'playfair-display', 'cormorant-garamond',
      'cinzel', 'cinzel-decorative', 'bodoni-moda', 'marcellus', 'gilda-display', 'prata', 'yeseva-one',
    ],
  },
  {
    value: 'kids',
    label: msg('Kids & fun'),
    description: msg('Round, friendly and playful letters for children, games, classrooms and parties.'),
    fonts: [
      'fredoka', 'varela-round', 'amatic-sc', 'gveret-levin', 'playpen-sans-hebrew', 'shmulik-clm', 'm-plus-rounded-1c',
      'rubik-bubbles', 'rubik-puddles', 'rubik-doodle-shadow', 'rubik-moonrocks',
      'comic-neue', 'comic-relief', 'chewy', 'luckiest-guy', 'bubblegum-sans', 'sniglet', 'baloo-2', 'grandstander',
      'gluten', 'dynapuff', 'short-stack', 'schoolbell', 'patrick-hand', 'andika', 'edu-sa-beginner', 'playpen-sans',
      'fuzzy-bubbles', 'coiny', 'cherry-bomb-one', 'emilys-candy', 'bangers', 'lilita-one', 'mali', 'sriracha',
    ],
  },
])

