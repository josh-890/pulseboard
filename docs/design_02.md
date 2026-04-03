web application/stitch/projects/8425967628231711578/screens/cd4d3fe5c9da49719a8ec730dd65790d
# Combined Design System Specification: The Three Realms

This document provides the design tokens, visual principles, and component guidelines for three distinct modern themes: **Cyber Emerald**, **Sunset Pulse**, and **Electric Amethyst**. Use these to guide Claude Code in implementing consistent, vibrant interfaces across light and dark modes.

---

## 1. Variant 1: Cyber Emerald (The Neon Architect)
**Creative North Star:** High-Tech Precision. This system emphasizes structural integrity, neural mapping aesthetics, and digital fluidity.

### Color Palette (Dark Mode Primary)
- **Primary:** `#10B981` (Cyber Emerald)
- **Background:** `#060e20` (Deep Space Blue)
- **Surface:** `#091328` (Navy Slate)
- **Border:** `#141f38` (Architecture Blue)
- **Text Primary:** `#FFFFFF`
- **Text Secondary:** `#a3aac4` (Steel Grey)

### Color Palette (Light Mode Adaptation)
- **Primary:** `#059669`
- **Background:** `#F8FAFC`
- **Surface:** `#FFFFFF`
- **Text Primary:** `#0F172A`

---

## 2. Variant 2: Sunset Pulse (The Radiant Pulse)
**Creative North Star:** Editorial Vitality. A warm, energetic system designed for creative expression and high-impact visual storytelling.

### Color Palette (Light Mode Primary)
- **Primary:** `#F59E0B` (Amber Sunset)
- **Accent:** `#DB2777` (Pulse Pink)
- **Background:** `#FFFAF0` (Warm Cream)
- **Surface:** `#FFFFFF`
- **Text Primary:** `#451A03` (Deep Cocoa)
- **Text Secondary:** `#78350F` (Amber Brown)

### Color Palette (Dark Mode Adaptation)
- **Primary:** `#FBBF24`
- **Background:** `#1C1917` (Stone Black)
- **Surface:** `#292524` (Deep Stone)
- **Text Primary:** `#FAFAF9`

---

## 3. Variant 3: Electric Amethyst (The Digital Curator)
**Creative North Star:** The Ethereal Edge. A sleek, premium system focusing on glassmorphism, depth, and curated luxury.

### Color Palette (Dark Mode Primary)
- **Primary:** `#7C3AED` (Electric Amethyst)
- **Secondary:** `#3626CE` (Indigo Depth)
- **Background:** `#0F0A1E` (Midnight Violet)
- **Surface:** `#1B1431` (Deep Amethyst)
- **Accent:** `#D2BBFF` (Soft Lavender)
- **Text Primary:** `#FFFFFF`
- **Text Secondary:** `#E8DFEE` (Mist)

### Color Palette (Light Mode Adaptation)
- **Primary:** `#6D28D9`
- **Background:** `#F5F3FF`
- **Surface:** `#FFFFFF`
- **Text Primary:** `#1E1B4B`

---

## 4. Shared Foundation (Typography & Geometry)

### Typography
- **Primary Font:** `Plus Jakarta Sans` (for Headlines and Branding)
- **Secondary Font:** `Be Vietnam Pro` (for high-density data and body text)
- **Heading Style:** Bold, tracking-tight, with high contrast.

### Geometry
- **Cyber Emerald:** `ROUND_FOUR` (4px - Sharp, technical)
- **Sunset Pulse:** `ROUND_FULL` (Pill-shaped - Energetic, friendly)
- **Electric Amethyst:** `ROUND_EIGHT` (8px - Balanced, premium)

### UI Patterns
- **Glassmorphism:** Use `backdrop-blur-xl` and `bg-white/70` or `bg-slate-900/70` for overlays.
- **Elevation:** Use soft, colored shadows (e.g., `shadow-[0_20px_40px_rgba(124,58,237,0.3)]`) instead of standard black shadows.
- **Desktop Navigation:** Persistent left-hand sidebar with clean icon-label pairs and active state indicators using primary colors.