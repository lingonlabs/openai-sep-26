# Lingon Labs brand assets

Copied from the user-specified https://lingonlabs.com on 2026-09-10 for this local design review:

- `lingon-logo.png`: https://lingonlabs.com/logo.png
- `highlight-line.svg`: https://lingonlabs.com/highlight_line.svg
- `lingon-pattern.svg`: the homepage hero's inline SVG.
- `inter-latin.woff2`: the homepage's Inter font, from `/_next/static/media/83afe278b6a6bb3c-s.p.3a6ba036.woff2`.

Brand colors match the site: hero `linear-gradient(211deg, #1f3445 1.23%, #3bdecc 239.98%)`, navigation `#0f172a`, turquoise action `#2cdfcc`, dark teal `#269b96`, white content and the `#e0f2f1` pale teal surface. The UI adapts the website's type sizes and spacing to the extension width.

`../brand.ts` embeds the logo and font so the floating assistant works inside a shadow root without remote requests or expanded site access. Regenerate those two data URLs from these source files if the assets change.
