// What the tour guide says, word for word. Each line was recorded once with the tour voice and is
// kept in public/tour (the quick tour's in tools-<id>.mp3), so tours speak offline and behind
// filters. A recording only matches its own words, so never change a line here without recording
// it again. Words in [brackets] only told the voice how to sound; they aren't shown.
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
  fade: 'Fade softly melts part of something away, and you can always bring it back.',
  fill: 'Fill colors in a whole area with one click, like a coloring book.',
  adjust: 'Adjust changes light and color. Try a ready look, like Black and white.',
  heal: 'Fix spots makes dust and scratches disappear. Like magic!',
  more: "Under More tools you'll find even more: Copy paint, Push and pull, Picker and Zoom.",
  end: "[excited] That's the whole toolbox! Hover over any button to see what it does. Now go make something awesome!",
}

// The poster tour: a whole design from an empty page to a download, in public/tour/poster-<id>.mp3.
export const POSTER: Record<string, string> = {
  intro: "[excited] Let's make a real poster, start to finish, and learn a trick at every step. Here we go!",
  page: "First, the page color. Click the empty page, then pick a color. Let's go with a soft sky blue.",
  sun: 'Now Shapes. Drag out a circle for a big, warm sun.',
  hills: 'Two big ovals make green hills. Every shape stays sharp, at any size.',
  flowers: 'Stars make perfect little flowers. Pick one, hold Alt, or Option on a Mac, and drag to copy it!',
  title: 'Time for words. Click with the Text tool and type a big, bold title.',
  details: 'Then smaller words for the details: the day, the time and the place.',
  shadow: 'Want the title to pop? Open Effects and add a soft shadow.',
  arrange: 'Use Arrange to move things around until it feels just right. Everything lines up by itself.',
  download: "Done? Press Download. Pick PNG for sharing, or PDF for printing. That's your poster!",
  end: "[excited] You made a whole poster! Now try your own idea. You've got this.",
}
