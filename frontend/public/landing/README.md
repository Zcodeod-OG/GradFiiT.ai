# Landing page asset slots

Drop the files below into this folder (`frontend/public/landing/`) to upgrade
the landing experience from the built-in SVG fallbacks to real imagery/video.
All slots are **optional** — the page still renders correctly without them.

## `rampwalk.mp4`

Used by `components/landing/ScrollStory.tsx`. When present, the file is
scroll-scrubbed on top of the SVG runway model: `video.currentTime` is driven
by scroll progress through the pinned section.

Recommended specs:

- **Format:** silent MP4 (H.264) or WebM (VP9). Browsers without the codec
  fall back to the SVG automatically.
- **Duration:** 3 – 6 s. Scroll maps directly to the clip timeline, so shorter
  = crisper scrub feel.
- **Resolution:** 720×1280 portrait is plenty; 1080×1920 if you want it sharp
  on retina. Anything taller than wide works — the stage is vertical.
- **Framerate:** 30 fps (higher buys nothing for scrubbing).
- **Bitrate:** aim for 1.5 – 3 Mbps (file under ~3 MB). Re-encode with
  `ffmpeg -i in.mp4 -c:v libx264 -crf 24 -preset slow -an -movflags +faststart out.mp4`.
- **Content:** a single fashion model walking from back-to-front on a clean
  studio floor. Neutral background (dark or white). No cuts, no text, no
  audio. Outfit can change mid-clip — it will line up with the scene
  transitions.

Where to get one:

- **AI generation:** Runway Gen-3, Kling, Sora, Luma Dream Machine. Prompt
  example: _"fashion runway walk, full-body female model walking toward
  camera on a dark studio floor, soft spotlight from above, cinematic 35mm,
  centered, smooth slow motion, 5 seconds"_.
- **Shoot it:** record a real walk on a plain background, then run the clip
  through GradFiT's own VTON pipeline to swap outfits mid-walk. Meta-demo.

## `compare-before.jpg` / `compare-after.jpg` (optional)

Currently `components/landing/CompareScrubSection.tsx` renders stylized SVG
mannequins. If you want to swap in real photography, wire these image paths
into `BeforeLayer` / `AfterLayer` (add an `<Image>` element behind the
silhouette and keep the SVG as a graceful fallback).

Recommended specs:

- **Aspect:** 16:10 (matches the scrubber card).
- **Size:** 1600×1000 JPG, ~300 KB each.
- **Pairing:** same pose, same framing. Only the outfit (and lighting)
  should change.

## `scene-01..04.png` (optional)

Per-scene hero shots that could replace each `ArtifactCard` inner graphic in
`ScrollStory.tsx`. Order matches the `SCENES` array (upload, generate,
verify, polish). If you add these, wire them through a new `image` field
on the `Scene` type and render `<Image src={scene.image}>` before the SVG
fallback.

---

Any asset dropped here is served from `/landing/<filename>` at runtime — no
bundler changes required.
