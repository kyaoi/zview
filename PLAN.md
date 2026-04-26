# PLAN.md

This plan breaks development of **zview** into small, reviewable tasks.

* All feature work happens on the **`develop`** branch.
* Each task is **one focused commit on `develop`** (small, revertible, reviewable).
* Use Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
* Mark tasks complete by checking the box.

---

## Definition of Done (applies to every task)

A task is "done" when:

* Builds locally (dev and prod path for the touched side)
* Formatting/lint pass for touched code (`mise run verify`)
* Any new behavior has **automated tests** (manual test recipe is only a fallback for UI-heavy logic)
* Docs updated if user-facing behavior/CLI/keybindings changed

---

## Workflow

* **Branch model:** all tasks commit to `develop`. `main` stays as the release line.
* **Commit granularity:** one task = one commit. If a task needs WIP, squash before landing on `develop`.
* **Release:** merge `develop` → `main` with a version bump when the initiative milestone is ready.
* **Green bar:** `mise run verify` must pass before each commit on `develop`.

---

## Repository layout (target)

* `backend/` — Go CLI + local HTTP server
* `frontend/` — Vite + TS web app
* `docs/` — extra documentation (optional)

---

## Active Initiatives

### Initiative A — Chrome-like Text Selection & Search

**Why:** Make zview a drop-in replacement for Chrome's built-in PDF viewer for reading/quoting workflows. PDF.js already ships `TextLayer`; zview currently opts out for perf reasons. We'll re-enable it with a scoped, virtualized-aware integration.

### Initiative B — Beamer `animate` Playback

**Why:** Make zview the first lightweight Linux viewer that actually plays `animate` PDFs (TDGL simulation decks, etc.). No mainstream open-source engine executes PDF JS — we work around that by **parsing the `animate` structure and driving frames ourselves**.

**Confirmed structure (from a local `animate v.2024/10/14` sample; reproduction recipe in `docs/ANIMATE_RESEARCH.md`):**
* Each frame is a form **Widget annotation** `/Subtype /Widget /FT /Btn` with `/T (N.M)` naming (N=animation index, M=frame index). **No OCGs involved.**
* Frames of one clip share the same `/Rect`. Frame 0 has `/F 4` (visible); others `/F 2` (hidden).
* `/AP /N` of each widget is a Form XObject holding that frame's drawing.
* Controller widget `/T (anmN)` exposes `/AA /PO` JavaScript defining `a1_fps`, `a1_seekFrame`, `a1_playFwd`, etc.
* FPS (`a1_fps=8`), frame count (`for(var i=0;i<=40;...)`) and autoplay (trailing `a1_playFwd()`) are **regex-extractable literal strings** — we do not need to execute the JS.

**Sequencing:** Initiative A lands first because it forces the "page overlay slot" refactor that B also needs. B0 has effectively been completed during planning; its first commit is to land the research doc.

---

## Planned Tasks

### Initiative A

* [x] **Task A1:** Refactor PdfViewer to a page-overlay architecture
* [x] **Task A2:** Integrate PDF.js TextLayer for selectable text
* [x] **Task A3:** Selection polish (cross-page, copy fidelity, pointer-events hygiene)
* [x] **Task A4:** Config + CLI toggle (`text_select`)
* [x] **Task A5:** E2E tests: select and copy text from a sample PDF

### Maintenance

* [x] **Chore C1:** Trim toast notification noise (open/reload/upload)

### Initiative B

* [x] **Task B0:** Research spike — `animate` / OCG structure (produces `docs/ANIMATE_RESEARCH.md`)
* [x] **Task B1:** Animate detector module (`lib/animate/detect.ts`)
* [x] **Task B2:** Offscreen frame-cache renderer
* [x] **Task B3:** Player driver hook (`IntersectionObserver` + rAF loop)
* [ ] **Task B4:** Zoom / reload / scroll integrity
* [ ] **Task B5:** Performance validation & budget tuning
* [ ] **Task B6:** Config + CLI (`--no-animate`, `[animate]` TOML section)
* [ ] **Task B7:** Docs + E2E (sample animate PDF fixture)
* [ ] **Task B8 (stretch):** `media9` embedded video overlay

---

## Task Format Example

When adding new tasks, please follow this format to maintain consistency with the project history:

### List Entry
`* [ ] **Task N:** Task Name`

### Detailed Description (Optional, for active tasks)
#### `task/branch-slug`
* [ ] Not Started

**Goal:**
Brief description of the goal.

**Details:**
* Bullet points of specific requirements.

**Acceptance Criteria:**
* [ ] Criteria 1
* [ ] Criteria 2

---

## Task Details

### Initiative A — Text Selection

#### `task/overlay-architecture`
* [x] **Task A1:** Refactor PdfViewer to a page-overlay architecture

**Goal:**
Introduce a pluggable "page overlay" slot above each page canvas so multiple features (text layer, animate layer, future annotations) can co-exist without tangling `PdfViewer/index.tsx`.

**Details:**
* Extract page-slot rendering from `PdfViewer/index.tsx` into a small sub-component (`PageSlot`).
* Add an `overlays?: OverlayRenderer[]` prop where each renderer receives `{ page, viewport, scale, visible }`.
* No behavior change in this task — it is a pure refactor that enables A2 and B2.

**Acceptance Criteria:**
* [ ] PdfViewer renders identically before/after (visual + E2E regression).
* [ ] `PageSlot` owns canvas mount, overlay mount points, and teardown.
* [ ] No new rendering costs when overlays list is empty.

---

#### `task/text-layer`
* [x] **Task A2:** Integrate PDF.js TextLayer for selectable text

**Goal:**
Make text selectable on visible pages via PDF.js `TextLayerBuilder` / `renderTextLayer`.

**Details:**
* Add `TextLayerOverlay` implementing the `OverlayRenderer` interface from A1.
* Render only for pages in `visibleRange` (reuse the existing virtualization window).
* Cancel/destroy on scroll-out, re-render on zoom change.
* Respect DPR and PAGE_GAP_PX so the transparent layer aligns exactly with the canvas.

**Acceptance Criteria:**
* [ ] Selecting text on a visible page yields the real text on copy.
* [ ] No selection bleed across pages via broken layout.
* [ ] Scroll / zoom / reload do not leak TextLayer DOM nodes.

---

#### `task/selection-polish`
* [ ] **Task A3:** Selection polish (cross-page, copy fidelity, pointer-events)

**Goal:**
Make the selection experience match Chrome's PDF viewer expectations.

**Details:**
* Cross-page selection (click page 1, drag to page 3) keeps order on copy.
* `user-select: none` on chrome UI, `user-select: text` on text layer only.
* Canvas click still focuses the pane; text drag does not trigger pane focus toggles.
* CJK / ligature sanity check with a multilingual sample PDF.

**Acceptance Criteria:**
* [ ] Copied text from a multi-page selection preserves reading order.
* [ ] Selection does not interfere with existing Vim-like keybindings.
* [ ] No regression on the Tab-focus logic.

---

#### `task/text-select-config`
* [x] **Task A4:** Config + CLI toggle for text selection

**Goal:**
Let users opt out for performance or paranoia.

**Details:**
* `config.toml`: `text_select = true` (default on).
* CLI: `--no-text-select`.
* Surface the value via `/api/bootstrap`.
* README + `docs/TECH_STACK.md` updated with the new switch.

**Acceptance Criteria:**
* [ ] Toggle respected at runtime without restart for new sessions.
* [ ] README documents default and override path.

---

#### `task/text-select-e2e`
* [x] **Task A5:** E2E: select and copy text

**Goal:**
Regression guard for A2–A4.

**Details:**
* Playwright spec: open `01_minimal.pdf`, select a known phrase, read clipboard via Playwright API, assert equality.
* Smoke spec: verify TextLayer nodes do not exist when `text_select = false`.

**Acceptance Criteria:**
* [ ] Spec passes locally and in CI.

---

### Initiative B — Beamer `animate` Playback

#### `task/animate-research`
* [x] **Task B0:** Research spike — `animate` structure report

**Goal:**
Land `docs/ANIMATE_RESEARCH.md` documenting the confirmed widget-based structure of `animate` output (see Initiative header), and pick the rendering strategy for B2.

**Details:**
* Use the local `sample/sample_animation.pdf` (gitignored; see research doc for reproduction) as the reference.
* Document widget `/T` naming, frame `/AP /N` XObject layout, controller `/AA /PO` JS and the literals to regex-extract (`a1_fps`, loop bound, autoplay call).
* Benchmark two rendering strategies on one clip of the sample and pick one:
  * **Strategy 1 (client-side):** fetch each `/AP /N` Form XObject and render via PDF.js internals (or operator list replay) into `OffscreenCanvas`.
  * **Strategy 2 (server-side):** backend invokes `pdftoppm` / `mupdf` to pre-rasterize each frame to PNG served from a new `/api/animate/...` endpoint.
* Record decision + rationale + fallback in the doc.

**Acceptance Criteria:**
* [ ] `docs/ANIMATE_RESEARCH.md` committed with structural notes + chosen rendering strategy.
* [ ] Throwaway prototype (any branch) demonstrates at least one frame of the chosen strategy working.

---

#### `task/animate-detect`
* [x] **Task B1:** Animate detector module

**Goal:**
Produce a structured `AnimateClip[]` from a loaded PDF by walking annotation widgets.

**Details:**
* `lib/animate/detect.ts` exports `detectAnimateClips(pdf: PDFDocumentProxy): Promise<AnimateClip[]>`.
* `AnimateClip = { pageIndex; bbox: [x,y,w,h]; frameApRefs: Ref[]; fps: number; frameCount: number; autoplay: boolean; loop: boolean }`.
* Algorithm:
  1. For each page, call `page.getAnnotations({ intent: "display" })` and raw object access for fields PDF.js filters out.
  2. Group widgets by `/T` prefix: `N.M` → frames (sort by M ascending); `anmN` → controller.
  3. From the controller's `/AA /PO` JS stream, regex-extract `a1_fps=\d+`, `i<=\d+`, presence of `a1_playFwd()`.
  4. Record the frames' appearance-stream refs for B2.
* Ignore PDFs without any `/T ^anm\d+$` controller — return `[]`.
* Unit tests against a small synthetic `animate` fixture under `frontend/e2e/pdfs/` (built once for Initiative B, checked in); keep the large local sample out of the repo.

**Acceptance Criteria:**
* [ ] Detector returns the expected clip list for the synthetic fixture with matching FPS/frameCount/bbox.
* [ ] Non-animate PDFs (existing `01_minimal.pdf` etc.) return `[]` without errors.

---

#### `task/animate-frame-cache`
* [x] **Task B2:** Frame renderer + cache

**Goal:**
Turn each detected `AnimateClip` into a sequence of ready-to-blit frame canvases, using the rendering strategy chosen in B0.

**Details (strategy-agnostic interface):**
* `lib/animate/frames.ts` exports `getClipFrames(clip: AnimateClip, scale: number): Promise<CanvasImageSource[]>`.
* Cache keyed by `(clipId, scale, dpr)`. Invalidate on zoom/DPR change.
* Memory budget: cap concurrent cached clips (default 4); LRU eviction.
* Plug into the A1 overlay architecture so the overlay sits on top of the statically-rendered frame 0 and covers it cleanly.

**Strategy-specific notes (picked in B0):**
* Client-side: render each `/AP /N` Form XObject through PDF.js. Match `scale` to the overlay display size; apply `DPR_CAP`.
* Server-side: backend endpoint `GET /api/animate/:pdfToken/clip/:i/frame/:m.png?scale=...` streams a cached PNG (warm cache on detection).

**Acceptance Criteria:**
* [ ] Given a clip of N frames, the cache contains N ready frames after warm-up on the sample.
* [ ] Zoom change triggers re-render; old caches are released.

---

#### `task/animate-player`
* [x] **Task B3:** Player driver hook

**Goal:**
`useAnimatePlayer` that drives visible clips via `requestAnimationFrame`.

**Details:**
* `IntersectionObserver` gates playback — off-screen clips pause.
* Interaction: click = play/pause, Shift+click = step one frame.
* Respect the clip's `autoplay` / `loop` / `fps`.
* Multiple clips on one page run with independent timelines.

**Acceptance Criteria:**
* [ ] Scrolling a clip off-screen stops its RAF loop.
* [ ] Two clips on the same page animate independently at correct FPS.

---

#### `task/animate-integrity`
* [ ] **Task B4:** Zoom / reload / scroll integrity

**Goal:**
Ensure `animate` clips behave correctly under the full range of zview user actions.

**Details:**
* MAIN `--watch` reload: tear down all clips, rebuild after reload, reset to frame 0.
* Zoom in/out: invalidate frame cache, re-warm lazily.
* Scroll mid-animation: pause frame advancement when offscreen, resume from current frame on return.
* Sub-tab switches: dispose clips of the hidden tab.

**Acceptance Criteria:**
* [ ] No leaked canvases across 20 reload cycles (heap snapshot sanity check).
* [ ] Zoom change during playback does not freeze the player.

---

#### `task/animate-perf`
* [ ] **Task B5:** Performance validation & budget tuning

**Goal:**
Prove the committed sample workload (41 frames × 2 clips × fit-width, 8 fps) stays within a stable budget, and extrapolate to 81-frame / larger-canvas TDGL decks.

**Details:**
* Benchmark harness (ad-hoc script + Playwright trace): measure cold-to-first-frame, steady-state CPU, steady-state memory, scroll FPS.
* If over budget, tune: lower prerender resolution, downscale during scroll, reduce `max_active_clips`.
* Record numbers in `docs/ANIMATE_RESEARCH.md` so regressions are visible later.
* Stretch: load-test with a synthetic 81-frame clip to project TDGL-scale headroom.

**Acceptance Criteria:**
* [ ] Documented baseline numbers for the TDGL workload.
* [ ] Budget met or an explicit rationale for any exceedance.

---

#### `task/animate-config`
* [ ] **Task B6:** Config + CLI surface

**Goal:**
Expose the feature as a first-class config + flag.

**Details:**
* `config.toml` `[animate]` with `enabled`, `default_fps`, `max_active_clips`, `autoplay_on_visible`.
* CLI `--no-animate` for opt-out.
* Surface via `/api/bootstrap`.

**Acceptance Criteria:**
* [ ] `--no-animate` fully disables detection + rendering overhead.
* [ ] Config values propagate to the frontend player.

---

#### `task/animate-docs-e2e`
* [ ] **Task B7:** Docs + E2E

**Goal:**
Lock in the feature and give users guidance.

**Details:**
* `docs/ANIMATE.md`: supported patterns, known non-supported variants, recommended `animate` options.
* README Troubleshooting entry.
* `frontend/e2e/pdfs/` gains a small committed `animate` sample.
* Playwright spec: load the sample, assert frame changes over time (pixel-diff between t=0 and t=T).

**Acceptance Criteria:**
* [ ] E2E spec passes in CI.
* [ ] Docs merged alongside the feature.

---

#### `task/media9` (stretch)
* [ ] **Task B8:** `media9` embedded video overlay

**Goal:**
Handle `media9` / embedded MP4 annotations by overlaying an HTML `<video>` aligned to the annotation bbox.

**Details:**
* Extract embedded media stream, serve via a blob URL or dedicated backend endpoint.
* Mount `<video>` via the A1 overlay slot; sync position with page layout on zoom/scroll.
* Respect the same `[animate]`-family toggles (reuse `enabled`).

**Acceptance Criteria:**
* [ ] A Beamer deck using `\includemedia` / `media9` plays video inline.
