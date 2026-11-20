# ADR-0041: Color or black & white — measured per photo, filterable per set

**Status:** Accepted (2026-11-20)

## Context

Some photos are in color, some are black & white (greyscale, or toned prints such as sepia). Sometimes a
whole set is one kind, sometimes a set mixes them. The user wanted to filter on this the way `/sets` filters
on cast size (Solo/Duo), with strong visuals. The app knew nothing about it: `MediaItem` held no color data.

**How others handle it:**
- **Lightroom** keeps *Treatment: Color / Black & White* as an edit setting, not something it measures. The
  Library filter bar offers it as metadata with counts.
- **Stock libraries** (Getty, iStock, Shutterstock, Adobe Stock) and **Unsplash** measure the pixels and
  offer a *Color · B&W* switch, often next to a color picker.
- **Flickr and Eagle** filter by color with visual swatch tiles, greyscale being one of them.
- **Apple and Google Photos** only find it through search ("black and white").
- **Nobody** offers it per album or set.

## Decision

**Measure, per photo.** `src/lib/image-tone.ts` `measureTone(buffer)`:
1. Shrink the image to 64 px and convert each pixel to CIE Lab.
2. Remove the tint per lightness band (10 bands, mean a/b), so a sepia, selenium or split-toned print comes
   out like neutral grey.
3. `chroma` = the 95th percentile of the color that is left.

`toneOf(chroma)` gives MONO below `TONE_THRESHOLD` = 5, otherwise COLOR (`src/lib/tone.ts`, client-safe).

**Calibration:** 1500 random xpulse photos, 2026-11-20:
- neutral B&W ≈ 0.1;
- sepia prints 3.8–4.3;
- the palest skin-only color photos 5.6 and up.

`TONE_BORDER` = [3, 7] is the band worth a human look, about 1% of the photos.

**Stored:**
- `MediaItem.tone` (`MediaTone` COLOR | MONO). Null means not measured yet.
- `chroma`, so the threshold can move without measuring again.
- `toneIsManual`: a decision made by hand, which wins.

**When it is set:**
- **Upload:** `uploadPhotoToStorage` measures the normalized buffer, and every path that creates a file passes
  the result on. These are the upload route, archive upload, the cover transfer and the adopted portrait.
- **Replacement:** a new file is measured again and clears a hand decision.
- **Copy:** a copy keeps the tone and the hand flag.
- **Existing photos:** `scripts/backfill-media-tone.ts` fills them in.

**Two classes for a photo:** Color and B&W. Toned prints count as B&W.

**Three buckets for a set or session:**
- **Color only;**
- **B&W only;**
- **Mixed:** a single photo of the other kind makes the set mixed.

Only the set's photos count (`photoSql`). Cover art, videos and unmeasured photos never count. The buckets are
computed live (`tone-service.ts`), like cast counts. Nothing is stored on `Set`.

**Where it shows:**
- **`/sets`:** a *Tone* filter (`tone=color,mono,mixed`) drawn as swatch tiles with counts. It is a new
  `swatches` group in `BrowserToolbar`, using `ToneSwatch`.
- **Set cards:** `ToneBadge`. B&W only shows a grey disc. Mixed shows a pie whose grey slice is the B&W share.
  Color only shows nothing.
- **Set and session galleries:** `ToneFilterPill` (All · Color · B&W), shown only when both kinds are present.
  It narrows the base list like the tag filter, and its counts follow the people filter. A photo corrected
  while a tone is chosen stays in view until the choice changes.
- **Query language:** `tone:bw` / `tone:color` for images, `tone:bw|color|mixed` for sets and sessions, with
  `b&w` and `mono` accepted for B&W. Smart collections get it for free.

**Correction:**
- In the viewer: *Tone* → Color | B&W, with "by hand · reset".
- In the selection bar: *Mark Color · B&W*.
- In bulk: *Settings → System → Tone check* lists borderline photos nobody has decided yet, nearest the line
  first. A tap flips a photo, and *Save* stores each one as decided.

## Consequences

- A toned print is B&W, and a heavily graded, nearly grey color photo can land on either side. The tone check
  and the viewer correction exist for exactly that.
- Selective color (B&W with one colored element) measures as color, because the colored pixels survive the
  95th percentile. This is accepted.
- The facet counts run one grouped query over the set's photos. At tens of thousands of photos this takes
  milliseconds. If it ever becomes slow, a per-set cache is the next step.
