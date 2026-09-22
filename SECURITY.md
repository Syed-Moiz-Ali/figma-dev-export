# Security Policy

## Security posture

Frontend Handoff Studio is intentionally local-first:

- Uses the official Figma Plugin API
- Declares `networkAccess.allowedDomains: ["none"]`
- Makes no external HTTP, WebSocket, analytics, or telemetry requests
- Does not require third-party accounts or API keys
- Does not persist design data using client storage, browser storage, or a remote database
- Exports files only after an explicit user action

## Supported versions

Security fixes are applied to the latest published Figma Community version.

## Reporting a vulnerability

Please avoid publishing sensitive exploit details in a public issue. Use GitHub's private vulnerability reporting feature for this repository if enabled. If private vulnerability reporting is unavailable, open a minimal issue asking for a private contact channel without including exploit details.

Include:

- affected plugin version
- impact
- reproduction steps
- whether design data or file integrity may be affected

Reports will be reviewed as time permits.
