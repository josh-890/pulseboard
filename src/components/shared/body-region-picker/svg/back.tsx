"use client";

import { RegionPath } from "../region-highlight";

type BackProps = {
  selected: string[];
  hovered: string | null;
  onRegionClick: (id: string, e: React.MouseEvent) => void;
  onRegionHover: (id: string | null) => void;
};

export function Back({ selected, hovered, onRegionClick, onRegionHover }: BackProps) {
  const p = { selected, hovered, onClick: onRegionClick, onHover: onRegionHover };
  return (
    <g id="back">
      {/* Head (scalp / back of head) */}
      <RegionPath id="face.scalp" d="M134,25 C154,25 162,40 162,61 C162,78 154,90 146,95 C142,97 138,98 134,97 C130,98 126,97 122,95 C114,90 106,78 106,61 C106,40 114,25 134,25 Z" {...p} />

      {/* Neck back */}
      <RegionPath id="neck_back" d="M116,97 L152,97 L152,122 L172,128 L172,138 L94,138 L94,128 L116,122 Z" {...p} />

      {/* Shoulders */}
      <RegionPath id="shoulder_l" d="M94,128 L59,141 L52,149 L60,158 L94,138 Z" {...p} />
      <RegionPath id="shoulder_r" d="M172,128 L210,141 L216,149 L208,158 L172,138 Z" {...p} />

      {/* Upper Back */}
      <RegionPath id="back_upper" d="M96,138 L172,138 L208,158 L205,165 L190,160 C 175,153 159,171 150,190 L150,196 L118,196 C113,179 104,168 90,160 L78,160 L63, 165L60,158 Z" {...p} />

      {/* Shoulder Blades */}
      <RegionPath id="shoulder_blade_l" d="M63,165 L78,160 C90,160 100,160 112,178 L118,196 Q116,218 98,228 L88,230 Z" {...p} />
      <RegionPath id="shoulder_blade_r" d="M190,160 L205,165 L177,230 Q160,220 152,206 L150,196 C150,178 168,160 178,160 Z" {...p} />

      {/* Ribcage & Side */}
      <RegionPath id="ribcage_l" d="M78,206 L82,205 L94,250 L86,250 Z" {...p} />
      <RegionPath id="ribcage_r" d="M186,205 L190,206 L185,250 L173,250 Z" {...p} />

     {/* Mid Back */}
      <RegionPath id="back_mid" d="M118,196 L150,196 Q153,220 175,230 L177,230 L174,258 L92,258 L88,230 Q115,225 118,200 Z" {...p} />

      {/* Lower Back */}
      <RegionPath id="back_lower" d="M92,258 L174,258 L195,298 L154, 297 L74,298 Z" {...p} />

      {/* Sacral Region */}
      <RegionPath id="sacral" d="M114,297 L154,297 L138,315 L130,315 Z" {...p} />

      {/* Buttocks */}
      <RegionPath id="buttock_l" d="M130,320 C126, 290 93, 294 74, 299 C58,322 68, 380, 113, 370 C135, 365 132, 343 130, 325 Z" {...p} />
      <RegionPath id="buttock_r" d="M138,320 C142, 290 175, 294 194, 299 C210,322 200, 380, 155, 370 C133, 365 138, 343 138, 325 Z" {...p} />

      {/* Gluteal Cleft */}
      <RegionPath id="gluteal_cleft" d="M130,315 L138,315 L138,352 L130,352 Z" {...p} />
      <RegionPath id="pubic" d="M130, 354 L138,354 L142,370 L126, 370 Z" {...p} />

      {/* Left Arm (inner view from back) */}
      <RegionPath id="upper_arm_l" d="M51,151 L60,160 L78,207 L75,256 L49,243 Z" {...p} />
      <RegionPath id="elbow_l" d="M48,243 L75,256 L69,275 L40,263 Z" {...p} />
      <RegionPath id="forearm_l" d="M39,264 L68,276 L51,332 L32,332 Z" {...p} />
      <RegionPath id="wrist_l" d="M34,332 L51,333 L48,346 L30,346 Z" {...p} />
      <RegionPath id="hand_l" d="M30,346 L48,346 L50,366 L43,415 L37,417 L31,415 L23,381 Z" {...p} />

      {/* Right Arm (inner view from back) */}
      <RegionPath id="upper_arm_r" d="M190,206 L208,160 L215,152 L220,168 L219,242 L222,248 L193,258 Z" {...p} />
      <RegionPath id="elbow_r" d="M192,257 L221,247 L228,267 L196,275 Z" {...p} />
      <RegionPath id="forearm_r" d="M198,275 L229,268 L236,335 L218,335 Z" {...p} />
      <RegionPath id="wrist_r" d="M217,335 L235,335 L238,350 L219,346 Z" {...p} />
      <RegionPath id="hand_r" d="M219,346 L238,352 C237,359 252,380 233,415 L232,416 L222,413 Z" {...p} />

      {/* Flanks (visible from back too) */}
      <RegionPath id="flank_l" d="M86,250 L94,250 Q94,258 80,286 L74,298 L68,295 Q73,285 83,265 Z" {...p} />
      <RegionPath id="flank_r" d="M173,250 L185,250 Q 186,264 195,283L201,295 L195,298 Q188,285 175,258 Z" {...p} />

      {/* Hips */}
      <RegionPath id="hip_l" d="M68,295 L74,298 Q67, 317 66,335 L71,348 L58,344 Q58,333 64, 304 Z" {...p} />
      <RegionPath id="hip_r" d="M195,298 L201,295 Q 207,313 210,336 L210,344 L199,348 Q200, 335 200, 313 Z" {...p} />

      {/* Left Leg (back view) */}
      <RegionPath id="thigh_l" d="M61,346 L70,350 L87,367 L107,372 L130,365 L129,491 L87,491 L Z" {...p} />
      <RegionPath id="thigh_r" d="M137,368 L164,370 L180,368 L191,359 L199,347 L208,346 L199,398 L188,445 L182,480 L180,493 L138,493 Z" {...p} />
      <RegionPath id="knee_l" d="M90,491 L129,491 L129,520 L126,531 L86,523 Z" {...p} />
      <RegionPath id="knee_r" d="M140,493 L180, 493 L181,525 L142,532 L137,512 Z" {...p} />
      <RegionPath id="lower_leg_l" d="M85,524 L127,532 L126,540 L130,566 L129,587 L124,626 L123,644 L125,663 L104,663 L97,622 L86,585 Z" {...p} />
      <RegionPath id="lower_leg_r" d="M142,532 L182,525 L181,568 L181,592 L162,667 L141,667 L145,632 L137,580 Z" {...p} />
      <RegionPath id="ankle_l" d="M106,665 L124,664 L127,674 L126,680 L112,682 L104,674 Z" {...p} />
      <RegionPath id="ankle_r" d="M142,667 L162,667 L164,677 L156,686 L140,684 Z" {...p} />
      <RegionPath id="foot_l" d="M94,683 L104,676 L111,683 L127,682 L127,696 L117,701 L99,692 Z" {...p} />
      <RegionPath id="foot_r" d="M140,684 L156,685 L163,677 L173,682 L168,690 L150,701 L140,697 Z" {...p} />
    </g>
  );
}
