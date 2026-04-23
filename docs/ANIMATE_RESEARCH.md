# ANIMATE_RESEARCH.md

Structural research for Initiative B (Beamer `animate` playback).
Reference implementation: `animate` package, version `2024/10/14`.

This document captures:

1. What an `animate`-generated PDF actually looks like on-disk.
2. Why PDF.js does not play it out of the box.
3. The rendering strategy we will implement, and its rationale.

---

## 1. Reference sample

Place a reproduction of the reference PDF at `sample/sample_animation.pdf` (directory is **gitignored** to keep clone size small). Any Beamer deck using `\animategraphics` produces the same structure.

Minimal reproduction (`sample/sample_animation.tex`):

```tex
\documentclass[aspectratio=169]{beamer}
\usepackage{animate}

\begin{document}
  \begin{frame}{sample}
    \centering
    \animategraphics[autoplay,loop,height=0.6\textheight]{8}%
      {frames/frame_}{0}{40}
  \end{frame}
\end{document}
```

Build via `lualatex` (or `pdflatex`) with `animate`'s runtime on your `TEXINPUTS`. The `frames/` directory must contain 41 sequentially-numbered PDF/PNG frames.

---

## 2. On-disk structure (confirmed)

Inspection tools: `qpdf --qdf --object-streams=disable`, `pdfinfo`.

### 2.1 Catalog

* `/AcroForm` is present. `/Fields` lists every per-frame widget plus each controller.
* `/Names /JavaScript` is **not** present. `pdfinfo` reports `JavaScript: no` — misleading, because all relevant JS lives on annotation `/AA` dictionaries (see §2.3).
* `/OCProperties` / any `/OCG` object: **none**. The `animate` package in this version does **not** use Optional Content Groups.

### 2.2 Per-frame widgets

Each frame is an annotation like:

```pdf
8 0 obj
<<
  /Type /Annot
  /Subtype /Widget
  /FT /Btn
  /T (1.40)
  /F 2
  /Rect [231.087 52.806 442.634 179.734]
  /AP << /N 101 0 R >>
  /MK << /I 101 0 R /IF << /FB true /S /A >> /TP 1 >>
  /A  << /S /ResetForm >>
>>
endobj
```

Key fields:

| Field | Meaning |
|---|---|
| `/T (N.M)` | Name: N = clip index, M = frame index (0-based) |
| `/Rect` | Bounding box on the page (all frames of one clip share this) |
| `/F` | Annotation flags. Frame 0 = `4` (Print, visible). Frames 1..N = `2` (Hidden). |
| `/AP /N` | Reference to a Form XObject that holds the actual drawing for this frame. |

The `/AP /N` target is a standard `/Subtype /Form /Type /XObject` with its own `/BBox`, `/Resources`, and content stream — typically it just places an image XObject (`Im88 Do`) and transforms it.

### 2.3 Controller widgets

Each clip has a controller widget named `/T (anmN)`:

```pdf
7 0 obj
<<
  /Subtype /Widget
  /FT /Btn
  /T (anm1)
  /Rect [231.087 52.806 442.634 179.734]   % same as frames
  /AA <<
    /PO << /JS 97 0 R  /S /JavaScript >>   % page-open:    installs `a1_*` functions
    /PV << /JS 97 0 R  /S /JavaScript >>   % page-visible: same
    /PI << /JS 95 0 R  /S /JavaScript >>   % page-invisible
    /PC << /JS 95 0 R  /S /JavaScript >>   % page-close
    /D  << /S /JavaScript /JS (try{if(a1_playing){a1_pause();}}catch(e){}) >>
    /U  << /S /JavaScript /JS (... step/reverse logic ...) >>
  >>
  ...
>>
```

### 2.4 The JS installer (crucial literals)

The `/PO` script (run by Acrobat on page-open) defines `a1_fps`, `a1_idx`, `a1_seekFrame`, `a1_playRight`, etc., then starts playback. It is one contiguous JS string; we never execute it — we regex-extract:

| Literal pattern | What we read |
|---|---|
| `a1_fps=<N>` (or `a2_fps=<N>`, etc.) | Playback FPS |
| `for(var i=0;i<=<N>;i++)` | Last frame index (frame count = N+1) |
| Presence of `a1_playFwd()` / `a1_playBwd()` at script tail | Autoplay direction |
| `a1_playsRight=true` | Initial direction |
| `app.setInterval('a1_gotoNext()', 1000/a1_fps/a1_spd)` | Confirms fixed-FPS loop (not variable-rate) |

The final call in `/PO` determines autoplay: the sample ends with `if(a1_playsRight){a1_playFwd();}else{a1_playBwd();}` — autoplay is **on** whenever the script reaches this tail branch.

### 2.5 Frame 0 rendering — free lunch

Because frame 0 has `/F 4` (Print, not Hidden), **PDF.js already renders it** as part of the normal page. We do not need special handling to show a static first frame: the current zview already displays it correctly. An overlay canvas that covers the clip `/Rect` naturally hides the static frame 0 during playback.

---

## 3. Why PDF.js cannot play this

PDF.js intentionally does not execute PDF-embedded JavaScript beyond a small form-validation whitelist. The `animate` package's playback is driven by:

* Acrobat-only APIs: `app.setInterval`, `field.display = display.visible/hidden`.
* Page lifecycle triggers `/PO`, `/PV`, `/PI`, `/PC`.

None of these run under PDF.js. The frames are all present in the PDF (as Form XObjects) and the metadata is all present (in the JS literal) — we just have to drive playback ourselves.

This is the same reason Firefox's built-in viewer, Chromium's PDFium viewer, and `pdf.js`-based mobile viewers all show a static first frame.

---

## 4. Rendering strategy

Two viable strategies for turning `/AP /N` Form XObjects into on-screen pixels:

### Strategy 1 — Client-side (chosen)

PDF.js's low-level `PDFPageProxy` can render individual XRef objects if we assemble an operator list. More practically, we can **render the page with a custom annotation filter**: use PDF.js's `annotationStorage` (or a small patch layer) to flip `/F` flags so exactly one frame widget is visible, then call `page.render()` with a clip rect restricted to the `/Rect` of that widget and cache the resulting canvas.

**Pros:**

* No new backend dependency.
* Resolution adapts naturally to `scale` / `DPR_CAP`.
* Fits the existing `PdfViewer` canvas model.

**Cons:**

* Touches semi-internal PDF.js behavior; must be revalidated on `pdfjs-dist` upgrades (currently `^5.4.530`).
* Full-page `render()` per frame is expensive; we'll pre-warm into an `OffscreenCanvas` cache (see Task B2).

**Fallback:** If flag manipulation is not feasible with the public API, pull the `/AP /N` Form XObject via `PDFDocumentProxy.getObject(ref)` and replay its operator list into an offscreen canvas using a hand-rolled `CanvasGraphics`. More fragile but still public-ish.

### Strategy 2 — Server-side (not chosen, kept as escape hatch)

Have the Go backend invoke `pdftoppm` / `mutool draw` once per frame and serve PNGs from `/api/animate/...`. Stable and simple, but adds a runtime dependency, a cache-invalidation story, and moves cost off the fast path for static PDFs.

**Chosen:** Strategy 1. Revisit only if B2 benchmarks (Task B5) miss budget and client-side tuning cannot close the gap.

---

## 5. Implementation shape (summary)

1. **Detect** (Task B1): walk annotations, group `/T N.M`, pair with `/T anmN` controller, regex the controller's `/PO` JS.
2. **Render** (Task B2): for each clip at current scale, produce N canvases. Cache LRU.
3. **Play** (Task B3): `requestAnimationFrame` per visible clip at clip FPS, blitting from cache onto an overlay canvas positioned at the clip's `/Rect` on top of the PDF.js page canvas.
4. **Cover frame 0** (Task B3): overlay exactly matches the clip `/Rect`, so the statically-rendered frame 0 is hidden whenever the overlay is active.

Non-goals for v1:

* Executing the PDF's own control widgets (play/pause buttons embedded by `animate`).
* `media9` / embedded video (covered by stretch Task B8).

---

## 6. Known variations to watch for

Later `animate` versions or `\animategraphics` option combinations may change:

* Single-frame "animation" (frame count = 1): must be skipped or rendered as static.
* `step` option (non-autoplay, user-steps): autoplay literal absent in `/PO`. Handle gracefully.
* `controls` option: adds extra widgets inside the clip `/Rect` that aren't frames. Filter by `/T` matching `^\d+\.\d+$`.
* Non-integer FPS literals (`a1_fps=12.5`): regex should accept decimals.

Keep the detector permissive and log/skip unknown shapes instead of throwing.
