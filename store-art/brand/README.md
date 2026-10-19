# Mega Droid brand

The logo (v2, #185): `node store-art/brand/render-emblem.mjs` renders Flux's
head from the game model (the emblem), then `node store-art/brand/logo.mjs
--raster` builds the lettering (chrome MEGA, amber DROID, bold ink outlines, an
amber charge glow) around it and writes every export.

- `public/images/logo/`: the shipped and store-art masters.
  `mega-droid-logo` (helmet over MEGA / DROID, the main lockup),
  `mega-droid-wordmark` (one line), `mega-droid-compact` (two lines, no
  head), `mega-droid-emblem` (the rendered head, PNG + WebP, and a face crop). Each as a vector SVG,
  a transparent PNG at least 2000 px wide and WebPs for the game.
- `logo-lockup.svg` (here): the compact wordmark drawn flat (the splash shows the
  emblem WebP above it) (no ids, no gradients,
  under 5 kB). The game inlines these bytes in `index.html`,
  `src/components/atoms/FLogoProgress.vue` and
  `src/components/story/logoLockup.ts` (pinned by `tests/ui/splashLogo.test.ts`);
  after a design change, paste the new SVG into all three.
- `public/icons/icon.svg`: the app icon, also written by `logo.mjs`; then run
  `node scripts/render-icons.mjs` for the PNGs and favicon.ico.
- Covers with the logo: `tools/art-promotion.mjs` (`*-logo` cuts) and
  `scripts/render-thumbnail.mjs --set playgama` (`--logo` redoes only the logo
  images) and `tools/promotion/cover-logo.mjs` lay the logo in the calmest corner (never the top-left) through
  `tools/promotion/logoOverlay.mjs`.

`archive-v1-hex-badge/` keeps the first logo (Flux's head in a hex badge over a
MEGA / DROID plate), its generator, icons and the covers that carried it.
