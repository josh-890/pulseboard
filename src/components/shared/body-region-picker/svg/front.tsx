"use client";

import { RegionPath } from "../region-highlight";

type FrontProps = {
  selected: string[];
  hovered: string | null;
  onRegionClick: (id: string, e: React.MouseEvent) => void;
  onRegionHover: (id: string | null) => void;
};

export function Front({ selected, hovered, onRegionClick, onRegionHover }: FrontProps) {
  const p = { selected, hovered, onClick: onRegionClick, onHover: onRegionHover, side: "front" as const };
  return (
    <g id="front">
      {/* Head / Neck */}
      <RegionPath id="face" d="M130,25 C150,25 158,40 158,61 C158,78 150,90 142,102 C140,103 134,106 130,106 C126,106 122,105 116,100 C110,90 102,78 102,61 C102,40 110,25 130,25 Z" {...p} />
      <RegionPath id="neck_front" d="M113,100 L126,107 L142,100 L139,128 L117,128 Z" {...p} />
      <RegionPath id="neck_side_r" d="M105,90 L113,100 L117,128 L90,128 L106,118 Z" {...p} />
      <RegionPath id="neck_side_l" d="M142,100 L150,92 L147,115 L165,128 L139,128 Z" {...p} />

      {/* Shoulders */}
      <RegionPath id="shoulder_r" d="M90,128 L50,142 L46,148 L66,160 L90,142 Z" {...p} />
      <RegionPath id="shoulder_l" d="M168,128 L201,140 L210,149 L190,160 L168,142 Z" {...p} />

      {/* Clavicle */}
      <RegionPath id="clavicle_r" d="M90,128 L130,128 L130,142 L90,142 Z" {...p} />
      <RegionPath id="clavicle_l" d="M130,128 L168,128 L168,142 L130,142 Z" {...p} />

      {/* Chest */}
      <RegionPath id="upper_chest_r" d="M90,142 L120,142 L120,172 L75,172 L66,160 Z" {...p} />
      <RegionPath id="upper_chest_l" d="M138,142 L168,142 L190,160 L181,172 L138,172 Z" {...p} />
      <RegionPath id="sternum" d="M120,142 L138,142 L138, 200 L144, 211 L164,218 L90,218 L110,212 L119,201 Z" {...p} />
      <RegionPath id="breast_r" d="M75,172 L120,172 L119,200 C95, 230 70,214 69,193 Z" {...p} />
      <RegionPath id="breast_l" d="M138, 172 L181, 172 C190,194 182,210 173,214 C171,218 140,220 138,200 L138, 200 Z" {...p} />
      <RegionPath id="nipple_r" d="M81,194 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0" {...p} />
      <RegionPath id="nipple_l" d="M166,194 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0" {...p} />

      {/* Ribcage & Side */}
      <RegionPath id="ribcage_r" d="M70,198 L78,214 L90,216 L90,250 L81,250 Z" {...p} />
      <RegionPath id="ribcage_l" d="M164,218 L177, 212 L186,198 L173,250 L164,250 Z" {...p} />

      {/* Abdomen */}
      <RegionPath id="abdomen_upper" d="M90,218 L164,218 L164,258 L90,258 Z" {...p} />
      <RegionPath id="abdomen_r" d="M89,258 L127,258 L127,295 L80,295 Z" {...p} />
      <RegionPath id="abdomen_l" d="M127,258 L164,258 L176,295 L127,295 Z" {...p} />
      <RegionPath id="navel" d="M117,277 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0" {...p} />
      <RegionPath id="abdomen_lower_r" d="M80,295 L127,295 L127,328 L85,328 Z" {...p} />
      <RegionPath id="abdomen_lower_l" d="M127,295 L176,295 L171,328 L127,328 Z" {...p} />

      {/* Flank */}
      <RegionPath id="flank_r" d="M81,250 L90,250 L80,295 L65,295 Z" {...p} />
      <RegionPath id="flank_l" d="M164,250 L175,250 L180, 270 L192,295 L176,295 L164, 258 Z" {...p} />

      {/* Hip */}
      <RegionPath id="hip_r" d="M65,295 L80,295 L85,328 L55,344 L58, 316  Z" {...p} />
      <RegionPath id="hip_l" d="M176, 295 L192, 295 L196, 316 L200,344 L171,328 Z" {...p} />

      {/* Groin & Pubic */}
      <RegionPath id="groin_r" d="M85,328 L127,328 L127, 345 L119,355  Z" {...p} />
      <RegionPath id="groin_l" d="M127,328 L171, 328 L138,357 L127, 345 Z" {...p} />
      <RegionPath id="pubic" d="M127, 345 L138,357 L133,364 L123, 364 L119,355 Z" {...p} />

      {/* Right Arm (person's right, screen left) */}
      <RegionPath id="upper_arm_r" d="M46,148 L46,156 C38,190 49,218 44,230 L70,242 C73,203 64,200 75,172 L66,160 Z" {...p} />
      <RegionPath id="elbow_r" d="M44,230 L70,242 L68,260 L40,252 Z" {...p} />
      <RegionPath id="forearm_r" d="M40,252 L68,260 L42,340 L26,340 C25, 320 31, 271 35, 257 Z" {...p} />
      <RegionPath id="wrist_r" d="M26,340 L42,340 L42,360 L27,360 Z" {...p} />
      <RegionPath id="hand_r" d="M27,360 L42,360 L47, 379 L49, 405 L42,416 C21,405 20,385 24,369 Z" {...p} />

      {/* Left Arm (person's left, screen right) */}
      <RegionPath id="upper_arm_l" d="M190,160 L181,172 C194, 185 180,206 183,242 L212,232 L214,160 L210,149 Z" {...p} />
      <RegionPath id="elbow_l" d="M183,242 L212,232 L216,252 L186,260 Z" {...p} />
      <RegionPath id="forearm_l" d="M186,260 L216,252 C222, 266 226,300 228,322 L230,340 L212,340 Z" {...p} />
      <RegionPath id="wrist_l" d="M212,340 L230,340 L230,360 L214,360 Z" {...p} />
      <RegionPath id="hand_l" d="M214,360 L230,360 C233, 375 235, 389 232, 405L212, 417 L208,406 L207, 378  Z" {...p} />

      {/* Right Leg (person's right, screen left) */}
      <RegionPath id="thigh_r" d="M55,344 L85, 328  L123, 364 C 123, 364 129, 400, 123, 500 L80, 500 C 72, 383, 60, 423, 56, 350 Z" {...p} />
      <RegionPath id="thigh_l" d="M200, 344 L171, 328 L133, 364  L132, 500 L173, 500 C176, 470, 190, 413, 198, 365 Z" {...p} />
      <RegionPath id="knee_r" d="M80,500 L123,500 L122,535 L80,535 Z" {...p} />
      <RegionPath id="knee_l" d="M132,500 L173,500 L172,535 L135,535 Z" {...p} />
      <RegionPath id="lower_leg_r" d="M80,535 L122,535 C120, 542, 128, 581, 117, 643 L119,660 L96,660 C99, 643, 75, 579, 81, 549 Z" {...p} />
      <RegionPath id="lower_leg_l" d="M135,535 L172,535 C179, 565, 170, 600, 160, 640 L160, 660 L135,660 C139, 637, 127, 577, 134, 544 Z" {...p} />
      <RegionPath id="ankle_r" d="M96,660 L119,660 L122,680 L96,680 Z" {...p} />
      <RegionPath id="ankle_l" d="M135,660 L160,660 L160,680 L133,680 Z" {...p} />
      <RegionPath id="foot_r" d="M96,680 L122,680 C122,680 123,692 117,700 L83,697 C83,697 89,687 96,680 Z" {...p} />
      <RegionPath id="foot_l" d="M133,680 L160,680 C161,686 174,696 168,700 L136,700 C131,694 132,694 135,685 Z" {...p} />
    </g>
  );
}
