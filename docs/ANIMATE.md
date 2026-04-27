# Beamer `animate` Playback

zview plays inline animations produced by the LaTeX [`animate`](https://ctan.org/pkg/animate)
package — including `\animategraphics` decks from Beamer presentations — directly
in the browser, without relying on Adobe Acrobat-only PDF JavaScript.

## How it works

The `animate` package emits each frame as a hidden form Widget annotation, with
a single controller widget driving playback through Acrobat-only APIs
(`app.setInterval`, `field.display`). PDF.js does not execute that JavaScript.

zview re-implements playback in TypeScript:

1. Walk every page's annotations once. Frame widgets named `N.M` and a
   controller widget named `anmN` (sharing the same `/Rect`) are grouped into
   one `AnimateClip`.
2. Read the controller's `/AA /PageOpen` JS as a literal string and
   regex-extract `aN_fps`, the frame count (`for(var i=0;i<=K;...)`), the
   autoplay flag (presence of `aN_playFwd`/`aN_playBwd` at the script tail),
   and the wrap-around branch that signals `loop`.
3. Pre-render each frame into an `OffscreenCanvas`-style cache by toggling the
   widget's `noView` flag through `pdf.annotationStorage` and calling
   `page.render({ annotationMode: ENABLE_STORAGE })`.
4. Drive the player with `requestAnimationFrame`, blitting the cached frame
   matching the elapsed-time playhead.

The detector and cache are pure TypeScript modules
(`frontend/src/lib/animate/`). The renderer is a small React overlay
(`frontend/src/components/PdfViewer/AnimatePlayer.tsx`) attached via the
`PageOverlay` slot introduced in Task A1.

A walkthrough of the on-disk structure that motivates this design is kept in
[`ANIMATE_RESEARCH.md`](./ANIMATE_RESEARCH.md).

## Supported

- `\animategraphics{<fps>}{<basename>}{<first>}{<last>}` decks (vector or
  raster frames).
- Inline `animateinline` environments with `\newframe` separators.
- The `autoplay`, `loop`, `step` options (autoplay/loop are honored from the
  PDF; `step` results in `autoplay=false` so the user-clicked play/pause
  toggle is the only driver).
- Multiple clips on a single page (each plays independently).
- Per-document FPS up to ≥ 30 fps. Higher rates work but cache build time
  scales linearly with frame count.

## Configuration

A few power-user knobs in `~/.config/zview/config.toml`:

```toml
[animate]
enabled = true            # set to false to skip detection + caching entirely
default_fps = 12          # fallback when the controller's JS literal is missing
max_active_clips = 4      # frame-cache LRU bound, tuned for 1–2 clips per page
```

CLI shortcut: `zview --no-animate <file.pdf>` disables the layer for one
session without touching the config file.

## Interaction

- **Click** an animated region to toggle play/pause.
- **Shift+click** advances one frame and pauses (good for inspection).
- Animations **pause automatically** when scrolled off-screen and **resume**
  when they return.
- A 200 px `IntersectionObserver` margin pre-warms the cache just before a
  clip enters the viewport, so scrolling toward an animation rarely shows a
  blank box.

## Performance

On the reference `sample/sample_animation.pdf` fixture (2 clips × 41 frames @
8 fps, fit-width display at scale ≈ 2):

- **Time-to-first-motion:** ~300–500 ms per clip (both clips visible at the
  same time use interleaved per-frame builds).
- **Total cache build (cold):** ~11 s wallclock, after which playback is a
  cheap `drawImage` per RAF tick.
- **Steady-state cost:** indistinguishable from `--no-animate` once the cache
  is warm.

See [`ANIMATE_RESEARCH.md`](./ANIMATE_RESEARCH.md#7-measured-performance-baseline-task-b5)
for the full perf numbers and the levers we have *not* pulled yet
(multi-document parallelism, dynamic FPS during build).

## Known non-supported variants

zview's detector is permissive — patterns it does not recognize are silently
ignored, so the rest of the document still renders correctly. The following
are *not* currently played:

- **`media9` embedded video** (MP4/Flash) — flagged as a stretch task (B8).
- **Single-frame "animations"** (frame count = 1) — skipped, as they would
  add no motion over the static page render.
- **Older `animate` versions** that emit through OCG (Optional Content
  Groups) instead of widget annotations. We have not encountered such a PDF
  in the wild; if you do, please file an issue with `qpdf --qdf` output and
  we'll extend the detector.

## Troubleshooting

- **The animation plays, but only the first frame is visible for a long
  time.** Cache warm-up is in progress. Check the page-2 `[aria-label^=
  "Animation"]` button in DevTools; while `cursor: wait` it is still
  building. Roughly 270 ms per frame at fit-width — for a 41-frame clip
  expect ~11 s on a midrange laptop.
- **Animation plays, but is washed-out or blurry.** That should not happen
  in the current build (frames are rendered at native display scale). If you
  see it, please file an issue and include your screen scale and
  `window.devicePixelRatio`.
- **`--no-animate` produces a blank rectangle where the animation should
  appear.** Frame 0 is still drawn statically by PDF.js when `--no-animate`
  is set, so this is expected to look like the first frame in print form
  (no playback). Scroll/zoom should be unaffected.
