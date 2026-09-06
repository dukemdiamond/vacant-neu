# Demo recorder

Records a walkthrough of the running app.

```bash
pnpm dev                                  # in another shell
pnpm demo                                 # records to demo/
node tools/demo/record.mjs https://vacantneu.vercel.app demo/
```

Output is `demo/vacantneu-demo.webm`. To get an MP4:

```bash
npx -y ffmpeg-static-cli -i demo/vacantneu-demo.webm ...   # or any ffmpeg
ffmpeg -i demo/vacantneu-demo.webm -c:v libx264 -crf 24 -pix_fmt yuv420p \
  -movflags +faststart -an demo/vacantneu-demo.mp4
```

## Why a browser recording rather than a rendered animation

The obvious alternative is Remotion, which renders video from React components. It is the better
tool for motion graphics and data-driven animation, but for a product demo it would mean
rebuilding vacantNEU's interface inside a composition, and that copy would drift from the real
app the first time the app changed. Recording the real thing cannot drift, and a bug on screen is
a bug that exists.

The usual pairing is to use both, Playwright for the footage and Remotion for titles around it.
Here the titles are simple enough that injecting them into the page was cheaper than adding a
render pipeline, and it keeps the whole demo one continuous take with no stitching.

## How it works

`record.mjs` drives the real app with Playwright and records the browser. `overlay.js` is injected
into the page and adds three things the recording needs and the app should not have:

- a drawn cursor, because a screen recording of an invisible pointer is hard to follow
- captions naming what is being shown
- title and end cards

The overlay lives in the browser's top layer via the popover API. A native `<dialog>` opened with
`showModal` also renders there, above every z-index, so captions stacked by z-index alone get
dimmed behind the dialog backdrop exactly when they are explaining the dialog.

The clock is pinned to a Wednesday mid-morning during term. Recorded against a live "now" out of
term, every room reads as free and the demo shows an empty timetable.
