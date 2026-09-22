# Privacy Policy — Dev Export for Figma

**Last updated: September 22, 2026**

Dev Export for Figma is designed to export developer-ready files from Figma selections while minimizing data collection.

## Data processed

When you run the plugin, it may process information contained in the Figma layers you explicitly select, including layer names and hierarchy, text content, dimensions, Auto Layout information, typography, colors, fills, strokes, effects, constraints, referenced variables, vector geometry, and image asset bytes required for the requested export.

## How processing works

Processing happens locally within Figma's plugin environment for the purpose of creating files that you choose to download. The plugin's manifest declares `networkAccess.allowedDomains` as `none`.

## Data sent to the developer or third parties

The plugin does not transmit design content, exported assets, account information, or usage information to the developer or third-party servers. It contains no analytics, advertising, tracking pixels, telemetry, or external API calls.

## Accounts and authentication

The plugin does not require a separate account and does not request authentication credentials or API keys.

## Storage and retention

The plugin does not use Figma client storage, browser local storage, IndexedDB, or a remote database to retain design content. Export data is held in memory during the active plugin session and packaged into files only when you choose to download them.

## Sharing

The developer does not sell or share user data collected by the plugin because the plugin does not collect or transmit such data. Any sharing of downloaded export files is controlled by you and occurs outside this plugin.

## Security

The plugin uses the official Figma Plugin API and declares no external network access. See [SECURITY.md](SECURITY.md).

## Changes to this policy

If the plugin's data practices change materially, this policy will be updated before or alongside the related plugin update.

## Contact

For privacy questions, open a GitHub issue using the process in [SUPPORT.md](SUPPORT.md). For sensitive security matters, follow [SECURITY.md](SECURITY.md).
