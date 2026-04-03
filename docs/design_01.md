# Design System Document: High-Energy Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Kinetic Pulse"**
This design system moves away from the static, rigid constraints of traditional utility apps and embraces the fluid energy of a premium editorial experience. By combining high-octane color saturation with expansive whitespace and sophisticated "glass" layering, we create a UI that feels alive.

The system rejects the "boxed-in" template look. Instead, it utilizes **intentional asymmetry** and **tonal depth** to guide the eye. We break the grid by overlapping vibrant elements over muted neutral surfaces, creating a sense of three-dimensional space that feels both professional and uninhibited.

---

## 2. Colors
Our palette is a high-contrast dialogue between clinical cleanliness and neon vitality.

### The Palette
* **Primary (Electric Blue):** `#0846ed` — The primary engine of the UI. Use for major actions and brand moments.
* **Secondary (Neon Purple):** `#7a23dc` — Used for supplemental energy, progress indicators, and interactive depth.
* **Tertiary (Coral Accent):** `#aa2c32` — Use sparingly for high-attention callouts and critical feedback.
* **Neutral Foundation:** `surface` (`#f5f6f7`) and `surface_container_lowest` (`#ffffff`).

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface_container_low` section sitting on a `surface` background creates a clear, sophisticated boundary without the visual "noise" of a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface-container tiers to create nested depth:
1. **Base:** `surface` (`#f5f6f7`)
2. **Sectioning:** `surface_container_low` (`#eff1f2`)
3. **Elevated Cards:** `surface_container_lowest` (`#ffffff`)
4. **Overlays:** Glassmorphism layers (see Section 4).

### The "Glass & Gradient" Rule
Standard flat buttons are insufficient for this identity.
* **Signature Textures:** Main CTAs must use a linear gradient from `primary` (`#0846ed`) to `primary_container` (`#859aff`) at a 135-degree angle.
* **Glassmorphism:** For floating panels or navigation bars, use `surface` at 70% opacity with a `20px` to `40px` backdrop-blur. This allows the high-energy background accents to bleed through, softening the interface.

---

## 3. Typography
We use a dual-font strategy to balance geometric precision with editorial authority.

* **Display & Headlines (Plus Jakarta Sans):** Chosen for its modern, geometric structure.
* **Display-LG (3.5rem):** Reserved for hero moments. Use bold weights to anchor the page.
* **Headline-MD (1.75rem):** Use for section headers. The tight letter-spacing at this scale creates a "premium-tech" feel.
* **Body & Labels (Be Vietnam Pro):** A highly legible sans-serif that maintains the energy without sacrificing readability.
* **Body-LG (1rem):** Default for long-form text.
* **Label-MD (0.75rem):** Used for micro-copy and metadata; always in Medium or Semi-Bold weight to ensure it doesn't "disappear" against vibrant backgrounds.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** and **Atmospheric Physics**, not structural lines.

* **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` background. This creates a soft, natural "lift" that feels integrated into the environment.
* **Ambient Shadows:** When an element must float (e.g., a FAB or a modal), use an extra-diffused shadow:
* **Blur:** 24px - 40px.
* **Opacity:** 4% - 8%.
* **Color:** Use a tinted version of `on_surface` (deep charcoal) rather than pure black to mimic natural light.
* **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` token at **15% opacity**. Never use 100% opaque borders.

---

## 5. Components

### Buttons
* **Primary:** Gradient (`primary` to `primary_container`), `xl` roundedness (`3rem`), and a soft ambient shadow.
* **Secondary:** Ghost style. No fill, `outline_variant` at 20% opacity, with `primary` colored text.
* **Tertiary:** No background. Bold `primary` or `secondary` text with `3.5` (1.2rem) horizontal padding.

### Cards & Lists
* **Rule:** Forbid divider lines.
* **Execution:** Separate list items using the Spacing Scale (e.g., `spacing.3` or `1rem` gaps) or by alternating subtle background shifts between `surface_container_low` and `surface_container_lowest`.
* **Corners:** Always use `lg` (`2rem`) for cards to maintain the "playful yet professional" aesthetic.

### Input Fields
* **Base:** `surface_container_high` background.
* **Radius:** `md` (`1.5rem`).
* **Active State:** Transition background to `surface_container_lowest` and add a `2px` "Ghost Border" using the `primary` color at 40% opacity.

### Additional Signature Component: The "Pulse" Chip
A high-energy selection chip using a `secondary_container` background with `on_secondary_container` text. When selected, it triggers a subtle 2px glow using the `secondary` color.

---

## 6. Do’s and Don’ts

### Do
* **Do** use extreme whitespace (`spacing.16` or `5.5rem`) to separate major thematic sections.
* **Do** overlap typography onto image assets or glass panels to create an editorial, layered look.
* **Do** use `tertiary` (Coral) exclusively for "Look at Me" moments—notifications, badges, or critical CTAs.

### Don’t
* **Don't** use pure black `#000000` for text; use `on_surface` (`#2c2f30`) for a softer, premium contrast.
* **Don't** use the `none` or `sm` roundedness tokens unless for tiny utility icons. This system lives in the `lg` to `xl` range.
* **Don't** stack more than three layers of glass; it destroys the performance "feel" and muddies the visual hierarchy.