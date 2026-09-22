# Suggested Figma Data Security Disclosure Answers

Use these answers only while the plugin behavior matches the current publication build.

## Network access
**No external network access.** The manifest declares `networkAccess.allowedDomains: ["none"]`.

## User accounts / authentication
**No.** The plugin does not require a separate account, sign-in, API key, or paid third-party service.

## Data processed
The plugin processes only Figma design data needed to export the user's explicitly selected frames, including layer structure, visible text, style/layout metadata, vectors, variables referenced by selected layers, and image bytes needed for the requested export.

## Data transmitted externally
**None by the plugin.** Export processing occurs inside Figma's plugin runtime and downloaded files are created only after explicit user action.

## Analytics / telemetry / advertising
**None.** No analytics SDK, telemetry endpoint, tracking pixel, or advertisement is present.

## Data retention
The plugin does not persist design content to developer-controlled storage. In-memory export data exists during the plugin session and is released when the session ends. Downloaded files remain under the user's control.

## Third parties
No third-party API or SDK receives design content from the plugin.

## Security controls
- official Figma Plugin API only
- no external network access
- no credentials collected
- no remote storage
- explicit user selection and export action required

Before submitting the disclosure, verify the current source still matches these answers.
