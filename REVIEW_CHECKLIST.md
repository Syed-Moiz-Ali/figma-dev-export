# Figma Community Review Checklist

Source: Figma Plugin and Widget Review Guidelines and classic plugin publishing instructions.

## Before submission
- [ ] Plugin tested across multiple files and realistic selections
- [ ] No known crashes or obvious bugs
- [ ] No raw developer errors shown in user-facing UI
- [ ] Listing accurately describes all functionality
- [ ] README explains setup and use
- [ ] Support contact works
- [ ] Privacy policy is published
- [ ] Security disclosure completed if desired
- [ ] Developer/Creator/Community terms reviewed by the publisher
- [ ] Two-factor authentication is enabled on the Figma account

## Quality and usability
- [ ] Light mode checked
- [ ] Dark mode checked
- [ ] Empty selection state checked
- [ ] One-screen export checked
- [ ] Multi-screen export checked
- [ ] Large-layer-count handling checked
- [ ] Asset-budget handling checked
- [ ] Raster-heavy screen checked
- [ ] Vector-heavy screen checked
- [ ] Duplicate frame names checked
- [ ] Hidden frames checked
- [ ] Export with no assets checked
- [ ] User can understand progress and errors without developer terminology

## Trust and safety
- [ ] User explicitly chooses selected frames
- [ ] Plugin only reads selected content and related variable/image data required for export
- [ ] `networkAccess.allowedDomains` is `["none"]`
- [ ] No external account required
- [ ] No advertising
- [ ] No analytics/telemetry
- [ ] No external AI chat, MCP server, or programmatic AI access to Figma files

## Performance
- [ ] Maximum 20 screens per export
- [ ] Default layer cap is 4,000 per screen
- [ ] Default asset budget is 40 MB per screen
- [ ] Package hard cap is 350 MB
- [ ] No background process remains after plugin closes

## Community listing
- [ ] Name: Dev Export for Figma
- [ ] Tagline added
- [ ] Category: Software development
- [ ] 128×128 icon uploaded
- [ ] 1920×1080 thumbnail uploaded
- [ ] Optional carousel images uploaded
- [ ] Support contact set to GitHub Issues
- [ ] Network label shows **No access to network**
- [ ] Privacy/security links included in description
