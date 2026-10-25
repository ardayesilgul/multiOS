# multiOS Mobile UI & Fluid Kinematics

Design patterns and motion parameters implemented in the mobile web companion (served at `http://<IP>:<PORT>`).

## Liquid Motion Principles

1. **Spring Kinematics:**
   - Bottom sheet drawers and modal sheets use Apple-standard fluid spring physics (`dampingRatio: 0.82`, `frequencyResponse: 0.38s`).
   - Velocity handoff preserves touch momentum when dismissing files or preview cards.

2. **Haptic Feedback:**
   - Subtle vibrations via the Web Vibration API (`navigator.vibrate(12)`) on pairing success and file drop confirmations.

3. **Safe Area & Viewport:**
   - Respects dynamic island and notch cutouts via `env(safe-area-inset-top)` and `viewport-fit=cover`.
