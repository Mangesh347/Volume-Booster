# SoundBlast Architecture

## Audio pipeline (page context — `injected.js`)
MediaElement → Gain → SoftClip → BassShelf → ClarityPeak → Presence → HiShelf → SoftCompressor → Dry/Wet Reverb → Destination

## Extension bridge
popup.js ↔ background.js ↔ content.js (CustomEvent) ↔ injected.js

## UI philosophy (v2.2)
- Volume boost is the hero control (FX Sound “power + primary enhancement” pattern, original expression)
- Secondary: Clarity / Soft Bass / Space / Widen (effect-slider pattern, original names)
- Material Design dark: near-black surfaces + white ink only
- Signature: continuously rotating wavy rings + wavy soft surfaces

## Clean-room note
FxSound informed functional regions only (power, presets, effects, EQ-like shaping). No assets, copy, red accents, or layout cloning.
