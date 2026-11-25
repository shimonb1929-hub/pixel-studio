// Lines already recorded with the tour voice, word for word, and kept in public/tour/tools-<id>.mp3.
// The tours are written once the app's look and tools are final; these were recorded early and are
// reused where a tool still works the same. A recording only matches its own words, so never change
// a line here without recording it again.
export const VOICE = 'Liam (ElevenLabs)'

export const RECORDED: Record<string, string> = {
  intro: "[excited] Hey! Welcome to Pixel Studio. Let's zoom through every tool, super quick. Ready? Let's go!",
  move: 'Arrange picks anything. Drag it to move, pull a corner to resize, and spin the round handle to turn it.',
  select: 'Select grabs just one part of a picture, so only that part changes.',
  crop: 'Crop trims your design down to the part you want to keep.',
  shape: 'Shapes draws boxes, circles, stars and arrows, and they stay sharp at any size!',
  pen: 'Curve lets you draw your very own shape, point by point. Perfect for a logo or a leaf.',
  text: 'Text writes words, in English, Hebrew or Yiddish.',
  photo: 'Photo puts your own picture on the page. Drop it on a shape, and it goes right inside!',
  brush: 'Brush paints by hand, just like on paper.',
  eraser: 'Eraser rubs the paint away.',
}
