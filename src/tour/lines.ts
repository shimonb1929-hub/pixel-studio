// What the tour guide says, word for word. Each line was recorded once with the tour voice and is
// kept in src/tour/voice (the quick tour's in tools-<id>.mp3), so tours speak offline and behind
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

// The poster tour: a whole design from an empty page to a download, in src/tour/voice/poster-<id>.mp3.
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

// The deep dive: every tool up close, how to use it and what it can do, in src/tour/voice/detail-<id>.mp3.
export const DETAIL: Record<string, string> = {
  intro: "[excited] Welcome to the deep dive! We'll look at every tool up close: how to use it, and the cool things it can do. Let's build as we go!",
  settings: 'First, a tip. Whenever you pick a tool, its settings show up right here, in this bar. Size, color, softness and more. Always look here first!',
  move: 'Arrange is your main tool. Click something to pick it. Drag to move it, pull a corner to make it bigger, and spin the round handle to turn it. Hold Alt and drag to pull out a copy.',
  select: 'Select picks just one part of a picture. Drag a box or an oval, or let it find the main thing for you. Hold Shift to add more. Then painting and moving only change that part.',
  crop: 'Crop trims your design. Drag the edges to choose what to keep, then press Enter. Nothing is thrown away, so you can crop again to bring parts back.',
  shape: 'Shapes has rectangles, ovals, polygons, stars, lines and arrows. Hold Shift for a perfect square or circle. In the settings, round the corners or add an outline, any time.',
  photo: "Here's a great trick. Add one of your own photos, then drop it right onto a shape, and the photo fills the shape perfectly.",
  pen: 'Curve draws a shape of your own. Click for sharp corners, or press and drag for smooth curves. Click the first point to close it. Later, drag any point to reshape it.',
  text: 'Text writes words. Click and type, or drag a box for a whole paragraph. Pick the font, size and color. Hebrew and Yiddish go right to left by themselves. And you can even bend words into an arch!',
  brush: 'Brush paints by hand. Pick a ready brush, like Pencil, Marker or Oil paint, or set the size and softness yourself. Shift and click draws a straight line.',
  eraser: 'Eraser rubs paint away, so whatever is underneath shows through again.',
  fade: 'Fade gently melts part of a photo, a shape or some words into the background. Nothing is lost. Switch to Bring back, and brush to show it again.',
  fill: 'Fill bucket colors a whole area with one click, like a coloring book. Shapes are even easier: pick one, and choose a new color.',
  color: "The Color panel keeps your colors. Press Keep to save one for this design. And Change it everywhere swaps a color in every place it's used, all at once.",
  adjust: 'Adjust changes light and color. Try a ready look, like Black and white, or fine tune it with the sliders. Press and hold on your design to compare before and after.',
  heal: "Fix spots makes dust and scratches vanish from a photo. Just brush over the spot, and it's filled in from what's around it.",
  clone: 'Copy paint copies one part of a photo onto another. Click the part to copy, then paint where it should go. Like a second cloud in the sky!',
  push: 'Push and pull smudges a photo like wet paint, or makes one part bigger or smaller. A taller tree, or a rounder cloud.',
  effects: 'Effects add a finishing touch: a soft shadow, a glow, or an outline, on any shape, word or photo. Watch this star glow!',
  layers: 'Everything you add gets its own layer, right here. Drag a layer up or down to change what sits in front. Click the light bulb to hide one for a moment.',
  end: "[excited] Now you know every tool, up close! Hover over any button for a quick reminder. Go create something amazing!",
}

// The night garden: a whole picture made step by step by the tour's pointer, using the real tools
// and settings, in src/tour/voice/showcase-<id>.mp3.
export const SHOWCASE: Record<string, string> = {
  intro: "[excited] Let's paint a night garden together, step by step. Watch which tool I pick, and which settings I choose. Then you can do it too!",
  sky: 'First, the sky. Pick Shapes, choose Rectangle, and drag from one corner of the page all the way to the other.',
  gradient: 'Now look at the Shape panel. Under Fill, choose Gradient. Then the colors: dark blue at the top, fading into purple.',
  moon: 'Next, the moon. Choose Oval, and hold Shift while you drag. Shift makes a perfect circle. Then pick a pale yellow.',
  glow: 'To make the moon shine, go to Effects and press Add glow. A soft light, all around it.',
  stars: 'Stars! Choose Star, drag out a small one, and make it white. Then pick Arrange, hold Alt, and drag the star to pull out a copy. Again, and again.',
  hills: 'For the hills, pick Curve. Click to start. Where you want a round hilltop, press and drag. Go down and around, click the first point to close it, and make it dark green.',
  brush: 'Now the grass, painted by hand. Pick Brush. Open the brushes and choose Ink pen. Set the size, not too thick, and pick a fresh green.',
  grass: 'Paint short strokes, from the bottom up, each one leaning a little. Every blade of grass is one quick stroke.',
  flowers: 'Flowers are just small stars. Pick Shapes, drag one out on the grass, and make it pink. Copy it with Alt and drag, and make one yellow.',
  title: 'Time for words. Pick Text, drag a box above the hills, and type Night Garden.',
  style: 'Make it stand out. Slide the size up, choose white, and slide Bend a little, for a gentle arch.',
  shadow: 'Last touch. With the title picked, go to Effects and press Add shadow. Now the words float above the sky.',
  end: "[excited] That's your night garden! Every part stays changeable. Click anything, and change it any time.",
}

// The sunset by the sea: a simple painting, then cleaned up with the fixing tools, in
// src/tour/voice/sunset-<id>.mp3.
export const SUNSET: Record<string, string> = {
  intro: "[excited] Now let's paint a sunset by the sea, and then clean it up. This time you'll meet the fixing tools. Each one does one simple job, and I'll show you when to use it.",
  select: "Start with Select. Choose Rectangle, and drag over the top of the page. Only the part you select can change, so nothing spills outside it by mistake.",
  fill: "Now take the Fill bucket, choose orange, and click inside. It fills just the selected part, like coloring inside the lines. Then click Let go, so the whole page can change again.",
  sea: "For the sea, choose blue and click the white part. No selecting needed this time: the bucket fills the area you click, up to where the color changes.",
  drops: "Oops! A few dark drops fell on the sky. Here's one way to fix them. Open More tools, take the Picker, and click the sky right next to a drop. Now the brush paints in exactly that orange.",
  fix: "For the other drops, use Fix spots. Brush over a drop, let go, and it's filled in from what's around it, as if it was never there. It works on dust and scratches in photos too.",
  cloud: "Paint one white cloud with the Brush. Want another one just like it? Take Copy paint, from More tools. Click the cloud, then paint somewhere else, and the copy appears as you paint.",
  push: "Push and pull reshapes paint without adding any. Choose Bigger and press on a cloud to make it puffier. Then choose Push, and drag along the sea line to make little waves.",
  adjust: "To change the colors of a whole picture, use Adjust. Pick the Warm look for a golden glow, and press Apply to keep it. Until you press Apply, nothing changes for good.",
  sun: "For the sun, add a new layer in the Layers panel, so it stays separate from the sky. Take the Brush, choose yellow, make it big, and paint a round sun on the sea line.",
  eraser: "The sun should sink into the sea. Take the Eraser and rub out its bottom half. The Eraser only rubs out the picked layer, so the sea shows through from underneath.",
  fade: "Fade is the soft way to hide. Paint a yellow stripe on the water under the sun, then take Fade and brush over its ends. They melt softly into the sea, and Bring back shows them again.",
  zoom: "To look closely, take Zoom from More tools, and click on the sun. Each click goes closer. Hold Alt and click to step back out.",
  hand: "When you're zoomed in, the Hand tool slides the page around. Just drag. Holding the Space bar does the same, with any tool. To see everything again, click Fit.",
  crop: "Last, Crop. Choose Square, drag the frame to the part you like, and click Crop. A square is just right for a post.",
  end: "[excited] Your sunset is done! Select keeps changes inside the lines, the bucket colors whole areas, the Picker, Fix spots and Copy paint clean up, and Crop finishes it off.",
}
