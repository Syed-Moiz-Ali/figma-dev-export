# Privacy Policy — Frontend Handoff Studio

**Last updated: September 22, 2026**

Frontend Handoff Studio is designed to create developer handoff files from Figma selections while minimizing data collection.

## Data processed

When you run the plugin, it may process information contained in the Figma layers you explicitly select, including layer names and hierarchy, text content, dimensions, Auto Layout information, typography, colors, fills, strokes, effects, constraints, variables referenced by the selected content, vector geometry, and image asset bytes needed for export.

## How processing works

Processing happens locally within Figma's plugin environment for the purpose of creating files that you choose to download. The plugin's manifest declares `networkAccess.allowedDomains` as `none`.

## Data sent to the developer or third parties

The plugin does not transmit design content, exported assets, account information, or usage information to the developer or to third-party servers. It does not contain analytics, advertising, tracking pixels, telemetry, or external API calls.

## Accounts and authentication

The plugin does not require you to create an account and does not request authentication credentials.

## Storage and retention

The plugin does not use Figma client storage, browser local storage, IndexedDB, or a remote database to retain your design content. Export data is held in memory during the active plugin session and is packaged into files only when you choose to download them. Files you download remain on your device and are controlled by you.

## Sharing

The developer does not sell or share user data collected by the plugin because the plugin does not collect or transmit such data. If you choose to share an exported package with another person or service, that sharing is controlled by you and is outside this plugin's operation.

## Security

The plugin uses the official Figma Plugin API and declares no external network access. See [SECURITY.md](SECURITY.md) for more information.

## Changes to this policy

If the plugin's data practices change materially, this policy will be updated before or alongside the related plugin update.

## Contact

For privacy questions, open a GitHub issue in this repository using the support process in [SUPPORT.md](SUPPORT.md). For sensitive security matters, follow [SECURITY.md](SECURITY.md).

> This policy describes the plugin's current technical behavior. It is not a substitute for legal advice about obligations that may apply in a particular jurisdiction.
