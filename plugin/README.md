# Plugin source

This folder contains the publish-ready source for **Dev Export for Figma**.

## Files

- `manifest.json` — Figma plugin manifest
- `code.js` — generated plugin bundle loaded by Figma (do not edit directly)
- `ui.html` — plugin UI and local ZIP generation
- `src/` — readable source modules
- `build.js` — concatenates `src/*.js` into `code.js`

## Build

Figma loads a single plugin script, so the source is concatenated:

```bash
cd plugin
node build.js
```

Source order is defined in `build.js`:

- `20-assets.js`
- `30-serialize.js`
- `40-central.js`
- `50-guides.js`
- `55-phase2-tokens.js`
- `65-phase3-verify.js`
- `68-flutter-template.js`\n- `70-phase4-codegen.js`
- `90-core-main.js`

## Local development install

1. Open the Figma desktop app.
2. Open a Figma Design file.
3. Go to **Plugins → Development → Import plugin from manifest...**
4. Select `plugin/manifest.json`.
5. Run **Dev Export for Figma** from Development plugins.

## Privacy / network

The publication build declares:

```json
"networkAccess": {
  "allowedDomains": ["none"]
}
```

The plugin does not require an account, analytics service, telemetry endpoint, or external API.
