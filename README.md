# Dev Export for Figma

Dev Export for Figma is a privacy-first Figma plugin for exporting selected design screens into structured, developer-ready packages.

## What it exports

- Structured screen JSON with layout, typography, colors, spacing, constraints, variables, and metadata
- 2× screen previews
- Exact SVG vector assets with matching PNG inspection copies
- Composed SVG + PNG decorative graphics
- Original raster assets and rendered PNG representations
- Per-screen asset manifests and a visual asset catalog
- One organized ZIP for multi-screen exports

## Why use it

Instead of manually collecting screenshots, icons, image assets, and design measurements, select your complete Figma frames and create one portable export package for frontend implementation.

The output is framework-neutral and can be used with React, Next.js, Vue, Nuxt, Angular, Svelte, HTML/CSS, Flutter, React Native, SwiftUI, Jetpack Compose, and other frontend stacks.

## Privacy-first by design

The plugin performs processing locally inside Figma's plugin runtime. It declares **no external network access**, uses **no analytics**, requires **no account**, and does not upload design content to the developer or third parties.

See [Privacy Policy](PRIVACY.md) and [Security](SECURITY.md).

## Support

For bugs, questions, or feature requests, use [GitHub Issues](https://github.com/Syed-Moiz-Ali/frontend-handoff-studio/issues) after checking [SUPPORT.md](SUPPORT.md).

## Figma Community

**Name:** Dev Export for Figma

**Tagline:** Export Figma screens as JSON, SVG, PNG, and developer-ready assets.

**Category:** Software development

## Documentation

- [Getting started](docs/index.md)
- [Support](SUPPORT.md)
- [Privacy Policy](PRIVACY.md)
- [Security](SECURITY.md)
- [Figma listing copy](FIGMA_LISTING.md)
- [Review checklist](REVIEW_CHECKLIST.md)

## Repository structure

```text
.
├── plugin/
│   ├── manifest.json
│   ├── code.js
│   ├── ui.html
│   └── README.md
├── community-assets/
├── docs/
├── .github/
│   └── ISSUE_TEMPLATE/
├── PRIVACY.md
├── SECURITY.md
├── SUPPORT.md
├── FIGMA_LISTING.md
└── REVIEW_CHECKLIST.md
```

## Run locally

Open Figma Desktop:

**Plugins → Development → Import plugin from manifest...**

Select `plugin/manifest.json`.
