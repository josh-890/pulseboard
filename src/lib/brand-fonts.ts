import {
  Abril_Fatface,
  Bebas_Neue,
  Cormorant_Garamond,
  Dancing_Script,
  Montserrat,
  Playfair_Display,
  Righteous,
  Space_Grotesk,
} from "next/font/google";

// Display fonts for generated brand marks (src/lib/brand-mark.ts). Self-hosted
// by next/font; not preloaded — a font file loads only where a mark uses it.

const serif = Playfair_Display({ subsets: ["latin"], weight: ["700"], variable: "--font-brand-serif", preload: false });
const didone = Abril_Fatface({ subsets: ["latin"], weight: ["400"], variable: "--font-brand-didone", preload: false });
const condensed = Bebas_Neue({ subsets: ["latin"], weight: ["400"], variable: "--font-brand-condensed", preload: false });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["700"], variable: "--font-brand-grotesk", preload: false });
const geometric = Montserrat({ subsets: ["latin"], weight: ["800"], variable: "--font-brand-geometric", preload: false });
const rounded = Righteous({ subsets: ["latin"], weight: ["400"], variable: "--font-brand-rounded", preload: false });
const script = Dancing_Script({ subsets: ["latin"], weight: ["700"], variable: "--font-brand-script", preload: false });
const elegant = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], variable: "--font-brand-elegant", preload: false });

/** CSS variables of every brand font — put on <body> once */
export const brandFontVariables = [serif, didone, condensed, grotesk, geometric, rounded, script, elegant]
  .map((f) => f.variable)
  .join(" ");
