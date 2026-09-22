# Plugin source

This folder contains the publish-ready source for **Dev Export for Figma**.

## Files

- `manifest.json` — Figma plugin manifest
- `code.js` — Figma plugin sandbox logic
- `ui.html` — plugin UI and local ZIP generation

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
