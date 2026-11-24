# Design Step 2 reference (Facilitator Console + Public View)

Put these files in `design-reference/` in the repo (next to the existing mockups).

- FacilitatorV2.dc.html : Facilitator Console, wide layout (1920 design width, fluid)
- PublicViewV2.dc.html : Public View, projector layout (1920x1080 design size)
- lb.css, lb-desktop.css : shared mockup styles (tokens and components)

Notes
- Images appear as `/_blob/<id>` URLs. The blob id to file mapping is in the existing `design-reference/README.md` (logo, role icons, challenge card icons). Use the real files in `public/assets/`.
- The page-specific CSS for each screen is in the `<style>` block inside each .dc.html file.
- Sample content (names, scores, QR code) is placeholder. Use real data.
- Static mockups: no behavior. Existing app behavior must not change.
