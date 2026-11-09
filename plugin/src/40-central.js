function hashAssetBytes(bytes) {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1) + hex(h2);
}

function assetContentHash(mime, bytes) {
  if (mime !== "image/svg+xml") return hashAssetBytes(bytes);
  try {
    // Figma SVG exports can include volatile element ids from each node.
    // Normalize them so the same icon reused on another screen still dedupes.
    const normalized = utf8Decode(bytes)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+id="[^"]*"/g, "")
      .replace(/\s+data-[a-zA-Z0-9-]+="[^"]*"/g, "")
      .replace(/>\s+</g, "><")
      .trim();
    return hashAssetBytes(utf8Encode(normalized));
  } catch (_) {
    return hashAssetBytes(bytes);
  }
}

function assetFileExtension(fileName, mime) {
  const match = String(fileName || "").match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toLowerCase();
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

function sharedAssetFolder(kind, mime) {
  if (mime === "image/svg+xml") {
    return kind === "composed-svg" ? "composed" : "svg";
  }
  if (mime === "image/png") return "png";
  return "images";
}

function findAssetEntriesForFile(assetManifest, fileName) {
  const entries = [];
  for (const asset of assetManifest || []) {
    let matches = asset.fileName === fileName || asset.pngFileName === fileName;
    if (!matches && asset.formats) {
      matches = Object.values(asset.formats).some((p) => p === fileName);
    }
    if (matches) entries.push(asset);
  }
  return entries;
}

function collectAssetUsages(design) {
  const byRef = new Map();

  function addUsage(ref, node, path, usage, extra) {
    if (!ref) return;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      layerPath: path,
      usage,
      x: typeof node.x === "number" ? node.x : undefined,
      y: typeof node.y === "number" ? node.y : undefined,
      width: typeof node.width === "number" ? node.width : undefined,
      height: typeof node.height === "number" ? node.height : undefined,
      ...extra
    });
  }

  function visit(node, parentPath) {
    if (!node) return;
    const path = parentPath
      ? `${parentPath} / ${node.name || node.type}`
      : String(node.name || node.type || "Screen");

    if (node.vectorAsset && node.vectorAsset.ref) {
      addUsage(node.vectorAsset.ref, node, path, "vector");
    }
    if (node.composedVectorAsset && node.composedVectorAsset.ref) {
      addUsage(node.composedVectorAsset.ref, node, path, "composed-graphic");
    }
    if (Array.isArray(node.imageAssets)) {
      for (const image of node.imageAssets) {
        addUsage(image.ref, node, path, "image-fill", {
          fillIndex: image.fillIndex,
          imageHash: image.imageHash
        });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child, path);
    }
  }

  for (const root of design.nodes || []) visit(root, "");
  return byRef;
}

function sharedRelativeFromScreen(sharedPath) {
  return `../../${sharedPath}`;
}

function createSharedAssetsManifest(generatedAt, folder, assets) {
  return {
    schema: "dev-export-shared-assets",
    schemaVersion: "1.0.0",
    generatedAt,
    folder,
    note: "Identical asset files used by two or more screens. Per-screen copies remain inside each screen assets folder so a screen stays portable on its own.",
    pathConventions: {
      packageRoot: "The `file` field is relative to the package root.",
      fromScreenJson: "The `relativeFromScreen` field works from inside screens/<screen>/<screen>.json."
    },
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, a) => sum + (a.byteLength || 0), 0),
    assets
  };
}

function createSharedAssetsGuide(manifest) {
  const lines = [
    "# Shared Asset Library",
    "",
    `Generated: ${manifest.generatedAt}`,
    "",
    "These files are identical copies of assets used by more than one screen.",
    "They live in `shared/assets/` so you do not have to hunt down duplicates.",
    "",
    "Per-screen copies are still present in each screen's `assets/` folder so a",
    "single screen folder can be opened in isolation. Use the shared copies when",
    "building shared components or a global asset pipeline.",
    "",
    "## How to use",
    "",
    "1. Open `shared/assets/manifest.json` for machine-readable references.",
    "2. From a screen JSON, use `sharedAssets[].relativeFromScreen`.",
    "3. From package root, use `sharedAssets[].file`.",
    "4. Each asset entry lists the screens and layer paths where it is used.",
    "",
    `Total shared assets: ${manifest.assetCount}`,
    ""
  ];

  manifest.assets.forEach((asset, index) => {
    lines.push(`## ${index + 1}. ${asset.file}`);
    lines.push("");
    lines.push(`- Kind: ${asset.kind || "asset"}`);
    lines.push(`- Role: ${asset.semanticRole || "unclassified"}`);
    lines.push(`- MIME: ${asset.mime}`);
    lines.push(`- Size: ${asset.byteLength} bytes`);
    lines.push(`- Used by ${asset.screenCount} screens (${asset.usageCount} placements)`);
    lines.push("");
    for (const screen of asset.screens) {
      lines.push(`- Screen ${pad2(screen.index)}: ${screen.name}`);
      lines.push(`  - JSON: ${screen.json}`);
      if (!screen.uses.length) {
        lines.push("  - Usage location: not available");
      } else {
        for (const use of screen.uses.slice(0, 12)) {
          lines.push(`  - ${use.layerPath || use.nodeName || "Layer"} (${use.usage || "asset"})`);
        }
        if (screen.uses.length > 12) {
          lines.push(`  - +${screen.uses.length - 12} more placement(s) — see manifest.json`);
        }
      }
    }
    lines.push("");
  });

  return lines.join("\n");
}

function createFrontendGuide(packageManifest, sharedManifest) {
  const screens = packageManifest.screens || [];
  const shared = sharedManifest && sharedManifest.assets ? sharedManifest.assets : [];

  const lines = [
    "# Frontend Implementation Guide",
    "",
    `Generated: ${packageManifest.generatedAt}`,
    `Screens: ${packageManifest.screenCount}`,
    "",
    "This guide explains how to turn the exported JSON and assets into a working",
    "frontend implementation. It is intentionally framework-neutral; the same",
    "data works for React, Next.js, Vue, Nuxt, Angular, Svelte, Flutter, SwiftUI,",
    "Jetpack Compose, React Native or plain HTML/CSS.",
    "",
    "## 1. Package map",
    "",
    "- `package-manifest.json` — every screen, totals and recommended read order.",
    "- `central-ui/central-ui.json` — shared tokens, components and screen compositions.",
    "- `fonts.json` — families, styles, fallbacks and missing-font warnings.",
    "- `coverage.json` — items that may need manual verification.",
    "- `node-index.json` — node id to screen/path map.",
    "- `screen-variants.json` — logical screens with state/tab variants grouped together.",
    "- `tokens/` — design tokens as JSON, CSS variables and Tailwind theme.",
    "- `component-index.json` — component usage grouped by screen and source.",
    "- `screen-groups.json` — inferred breakpoints and screen groups.",
    "- `verify/` — Playwright visual verification harness and expected previews.",
    "- `code/` — optional starter code for React, Flutter or HTML/CSS.",
    "- `AI_AGENT_PROMPT.md` + `ai/` — agent handoff instructions per screen.",
    "- `screens/<screen>/<screen>.json` — layout tree, styles, assets and variables.",
    "- `screens/<screen>/<screen>@2x.png` — visual reference for that screen.",
    "- `screens/<screen>/assets/` — screen-local assets + asset catalog.",
    "- `shared/assets/` — identical assets reused by 2+ screens.",
    "- `shared/assets/manifest.json` — shared asset usage references.",
    "- `FRONTEND_IMPLEMENTATION_GUIDE.md` — this document.",
    "",
    "## 2. Recommended build order",
    "",
    "1. Read `package-manifest.json` and note screen order and totals.",
    "2. Open one screen JSON and read `developerSummary` first.",
    "3. Read `assetIndex` and `sharedAssets` before touching `nodes`.",
    "4. Study the screen preview PNG to understand visual intent.",
    "5. Map `nodes` into components, starting from the outermost frame.",
    "6. Build shared primitives (buttons, inputs, cards) after two screens.",
    "7. Repeat per screen, promoting repeated patterns into shared components.",
    "8. Compare the finished page against the preview at 100% zoom.",
    "",
    "## 3. Screen JSON anatomy",
    "",
    "- `source` — file, page, screen node id and node counts.",
    "- `guidance` — coordinate system, layer order and asset strategy.",
    "- `developerSummary` — colors, typography, spacing and warnings.",
    "- `assetIndex` — assets grouped by node, role and composed graphics.",
    "- `assetManifest` — asset files, dimensions, roles and format paths.",
    "- `sharedAssets` — shared files plus exact screens/layers where used.",
    "- `variableCollections` / `variables` — tokens and modes.",
    "- `nodes` — serialized layer tree (root is the selected screen).",
    "",
    "## 4. Node mapping",
    "",
    "- `FRAME` / `GROUP` → layout containers or semantic sections.",
    "- `TEXT` → text element with typography from `text`.",
    "- `RECTANGLE` / `ELLIPSE` → boxes, avatars, dividers or backgrounds.",
    "- `VECTOR` / `BOOLEAN_OPERATION` → inline SVG or exported asset.",
    "- `INSTANCE` → reusable component; check `mainComponent` and overrides.",
    "- `COMPONENT` / `COMPONENT_SET` → component or variant set.",
    "- Do not mirror every Figma wrapper one-to-one. Remove purely structural",
    "  groups when native layout primitives can express the same result.",
    "",
    "## 5. Layout and responsiveness",
    "",
    "- `x` / `y` are relative to the immediate parent; `absoluteBoundingBox` is page space.",
    "- `layoutMode` (`VERTICAL` / `HORIZONTAL`) maps to flex or stack layouts.",
    "- `primaryAxisAlignItems` → justify-content; `counterAxisAlignItems` → align-items.",
    "- `itemSpacing`, `padding*` and `counterAxisSpacing` map to gap and padding.",
    "- `layoutSizingHorizontal` / `layoutSizingVertical`:",
    "  - `FIXED` → fixed width/height.",
    "  - `HUG` → width/height fit content.",
    "  - `FILL` → flex: 1 / expand.",
    "- `constraints` explain how children pin when a parent resizes.",
    "- `minWidth`, `maxWidth`, `minHeight`, `maxHeight` should not be dropped.",
    "- `clipsContent` maps to overflow hidden.",
    "",
    "## 6. Visual styles",
    "",
    "- `fills` / `strokes` include Figma paint data and a `hex` helper for SOLID paints.",
    "- `opacity` and `blendMode` apply to the whole layer.",
    "- `effects` contain shadows, blurs and inner shadows.",
    "- `cornerRadius` or per-corner radii map to border-radius.",
    "- `strokeWeight`, `strokeAlign`, `strokeCap`, `strokeJoin` and `dashPattern`",
    "  describe borders. `strokeAlign: INSIDE` is the default web border box.",
    "- `layoutGrids` and `gridStyleId` are optional hints; check `includeCSS` output",
    "  only when it is enabled.",
    "",
    "## 7. Typography",
    "",
    "- `text.characters` is the exact copy.",
    "- `fontName`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` drive styles.",
    "- `textAlignHorizontal` / `textAlignVertical` map to text-align and alignment.",
    "- `textAutoResize` tells you whether the text box grows or stays fixed.",
    "- If `styledSegments` exists, apply per-range styles instead of one style.",
    "",
    "## 8. Assets",
    "",
    "- `vectorAsset` → exact SVG for a vector layer.",
    "- `composedVectorAsset` → merged decorative vector group.",
    "- `imageAssets` → one entry per image fill; check `fillIndex`, `scaleMode`,",
    "  `imageTransform`, `filters` and `rotation`.",
    "- Asset paths inside screen JSON are relative to that screen folder.",
    "- Shared entries also include `relativeFromScreen` (`../../shared/...`).",
    "- Prefer composed SVGs for illustrations and individual SVGs for reusable icons.",
    "",
    "## 9. Shared asset library",
    "",
    shared.length
      ? `${shared.length} asset files are reused across screens and live in shared/assets/.`
      : "No identical assets were found across multiple screens in this export.",
    "",
  ];

  if (shared.length) {
    lines.push("| File | Kind | Screens | Placements |");
    lines.push("| --- | --- | --- | --- |");
    for (const asset of shared.slice(0, 40)) {
      lines.push(`| ${asset.file} | ${asset.kind} | ${asset.screenCount} | ${asset.usageCount} |`);
    }
    if (shared.length > 40) lines.push(`| ... | ... | ... | ${shared.length - 40} more |`);
    lines.push("");
    lines.push("Use `shared/assets/manifest.json` for the exact layer path of every placement.");
    lines.push("");
  }

  lines.push(
    "## 10. Variables and tokens",
    "",
    "- `variableCollections` and `variables` contain resolved Figma variables and modes.",
    "- `boundVariables` on a node tells you which token drives a property.",
    "- Create a token layer in the target project (CSS variables, Tailwind theme,",
    "  SwiftUI Environment, Compose MaterialTheme, etc.) and map tokens once.",
    "",
    "## 11. Components and variants",
    "",
    "- `INSTANCE.mainComponent` points back to the component name and key.",
    "- `componentProperties` and `variantProperties` describe configurable props.",
    "- `overrides` shows instance-level changes that must become props or slots.",
    "",
    "## 12. Interactions",
    "",
    "- `reactions` and overlay properties describe prototype links.",
    "- Convert them into routing, navigation or modal state in the target app.",
    "",
    "## 13. Framework notes",
    "",
    "- React / Next.js: one component per repeated frame pattern, CSS modules or",
    "  Tailwind, an `assets/` folder for shared files.",
    "- Vue / Nuxt: define props from component properties and slots for children.",
    "- Flutter: Widget tree from frames, `Row`/`Column` from auto layout, `Image.asset`.",
    "- SwiftUI: VStack/HStack/ZStack, `Image(uiImage:)` or symbols for icons.",
    "- HTML/CSS: flexbox or grid for layout; SVG inline for icons when possible.",
    "",
    "## 14. Quality checklist",
    "",
    "- [ ] Every screen matches its preview at 1× and 2× zoom.",
    "- [ ] Text styles use the project's typography scale.",
    "- [ ] Colors come from tokens, not ad-hoc hex values.",
    "- [ ] Shared assets are imported once, not duplicated per screen.",
    "- [ ] Auto layout behavior survives content changes.",
    "- [ ] Fixed/hug/fill sizing matches the JSON.",
    "- [ ] Interactive elements have hover, focus and disabled states added.",
    "- [ ] Hidden-layer decisions match the export option.",
    "- [ ] No raw Figma node names leak into user-facing copy.",
    "",
    "## 15. Exported screens",
    "",
  );

  screens.forEach((screen) => {
    lines.push(`${pad2(screen.index)}. ${screen.name}`);
    lines.push(`   - JSON: ${screen.json}`);
    lines.push(`   - Preview: ${screen.preview || "not included"}`);
    lines.push(`   - Assets: ${screen.assetCount}`);
    lines.push("");
  });

  return lines.join("\n");
}


function countSerializedNodes(node) {
  if (!node) return 0;
  let count = 1;
  for (const child of node.children || []) count += countSerializedNodes(child);
  return count;
}

function isGenericNodeName(name) {
  const value = String(name || "").trim();
  if (!value) return true;
  return /^(frame|group|component|component set|instance|rectangle|ellipse|container|auto ?layout|layer)\s*\d*$/i.test(value) ||
    /^\d+$/.test(value);
}

function isComponentCandidate(node, nodeCount) {
  if (!node || !["FRAME", "GROUP", "COMPONENT", "COMPONENT_SET"].includes(node.type)) return false;
  if (!Array.isArray(node.children) || !node.children.length) return false;
  const total = typeof nodeCount === "number" ? nodeCount : countSerializedNodes(node);
  if (total < 3) return false;
  return true;
}

function subtreeLocalSignature(node, childCount) {
  const fills = Array.isArray(node.fills)
    ? node.fills.filter((paint) => paint && paint.visible !== false).map((paint) => {
        if (paint.type === "SOLID") return `solid:${paint.hex || ""}`;
        return String(paint.type || "");
      }).join(",")
    : "";
  const text = node.text
    ? `text:${(node.text.fontName || {}).family || ""}:${node.text.fontSize || ""}:${node.text.fontWeight || ""}:${node.text.textAlignHorizontal || ""}`
    : "";
  return [
    node.type,
    node.layoutMode || "",
    node.layoutSizingHorizontal || "",
    node.layoutSizingVertical || "",
    node.layoutWrap || "",
    node.paddingTop || 0,
    node.paddingRight || 0,
    node.paddingBottom || 0,
    node.paddingLeft || 0,
    node.itemSpacing || 0,
    node.counterAxisSpacing || 0,
    node.cornerRadius || "",
    fills,
    node.vectorAsset ? "vector" : "",
    node.imageAssets ? "image" : "",
    text,
    childCount
  ].join("|");
}

function computeSubtreeInfo(root) {
  const info = new Map();

  function visit(node) {
    let count = 1;
    const childHashes = [];
    for (const child of node.children || []) {
      const childInfo = visit(child);
      count += childInfo.count;
      childHashes.push(childInfo.hash);
    }
    const hash = hashString(`${subtreeLocalSignature(node, childHashes.length)}[${childHashes.join(",")}]`);
    info.set(node, { hash, count });
    return { hash, count };
  }

  if (root) visit(root);
  return info;
}

function componentNameForUsages(usages, index) {
  const names = new Map();
  for (const usage of usages) {
    const name = String((usage.node || {}).name || "").trim();
    if (name && !isGenericNodeName(name)) names.set(name, (names.get(name) || 0) + 1);
  }
  if (names.size) {
    return Array.from(names.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  const sample = usages[0] ? usages[0].node : null;
  const hasText = ((sample && sample.children) || []).some((child) => child.type === "TEXT");
  const base = sample && sample.type === "COMPONENT_SET" ? "Component set" : hasText ? "Card" : "Repeated section";
  return `${base} ${index}`;
}

function diffSubtreeVariations(usages) {
  if (!usages || usages.length < 2) return [];
  const first = usages[0].node;
  const differences = [];
  const seen = new Set();

  function record(path, type, values) {
    const key = `${type}|${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    differences.push({
      path,
      type,
      values: Array.isArray(values)
        ? values.map((value) => String(value == null ? "" : value).slice(0, 80))
        : undefined
    });
  }

  function compare(a, b, path) {
    if (!a || !b || differences.length > 30) return;
    if (a.type !== b.type) {
      record(path, "structure");
      return;
    }
    if (a.text && b.text && a.text.characters !== b.text.characters) {
      record(path, "text", [a.text.characters, b.text.characters]);
    }
    if (!!a.vectorAsset !== !!b.vectorAsset) record(path, "asset");
    if ((a.imageAssets || []).length !== (b.imageAssets || []).length) record(path, "image");
    if ((a.visible !== b.visible)) record(path, "visibility", [a.visible, b.visible]);
    if (JSON.stringify(a.fills || []) !== JSON.stringify(b.fills || [])) record(path, "style");
    const aChildren = a.children || [];
    const bChildren = b.children || [];
    const length = Math.min(aChildren.length, bChildren.length);
    for (let i = 0; i < length; i++) {
      compare(aChildren[i], bChildren[i], `${path} / ${aChildren[i].name || aChildren[i].type}`);
    }
  }

  for (let i = 1; i < usages.length; i++) {
    compare(first, usages[i].node, String(first.name || first.type));
  }

  return differences;
}

function buildNodeIndex(screenRecords, generatedAt) {
  const nodes = [];
  const byId = {};
  for (const record of screenRecords) {
    walkNodes(record.design.nodes, (node) => {
      const entry = {
        id: node.id,
        screenIndex: record.index,
        screenName: record.name,
        screenFolder: record.screenFolder,
        path: node.path,
        name: node.name,
        type: node.type
      };
      nodes.push(entry);
      byId[node.id] = entry;
    });
  }
  return {
    schema: "dev-export-node-index",
    schemaVersion: "1.0.0",
    generatedAt,
    nodeCount: nodes.length,
    nodes,
    byId
  };
}

function fontFallbackStack(family) {
  const value = String(family || "");
  const generic = /mono|code|consolas|courier|menlo/i.test(value)
    ? "monospace"
    : /serif|playfair|merriweather|georgia|times|garamond/i.test(value)
      ? "serif"
      : "sans-serif";
  return [value, "ui-sans-serif", "system-ui", generic].filter((item, i, list) => item && list.indexOf(item) === i);
}

const GOOGLE_FONT_SPECS = {
  "Inter": "Inter:wght@100..900",
  "Roboto": "Roboto:wght@100..900",
  "Open Sans": "Open+Sans:wght@300..800",
  "Lato": "Lato:wght@100;300;400;700;900",
  "Montserrat": "Montserrat:wght@100..900",
  "Poppins": "Poppins:wght@100;200;300;400;500;600;700;800;900",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@200..800",
  "DM Sans": "DM+Sans:wght@100..1000",
  "Manrope": "Manrope:wght@200..800",
  "Nunito": "Nunito:wght@200..1000",
  "Work Sans": "Work+Sans:wght@100..900",
  "Raleway": "Raleway:wght@100..900",
  "Source Sans 3": "Source+Sans+3:wght@200..900",
  "Playfair Display": "Playfair+Display:wght@400..900",
  "Merriweather": "Merriweather:wght@300;400;700;900",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@100;200;300;400;500;600;700",
  "Space Grotesk": "Space+Grotesk:wght@300..700"
};

async function getAvailableFontSet() {
  const available = new Set();
  try {
    if (typeof figma.listAvailableFontsAsync === "function") {
      const fonts = await figma.listAvailableFontsAsync();
      for (const font of fonts) {
        if (font && font.fontName) available.add(`${font.fontName.family}|${font.fontName.style}`);
      }
    }
  } catch (_) {}
  return available;
}

function buildFontsManifest(screenRecords, availableFonts, generatedAt) {
  const families = new Map();

  for (const record of screenRecords) {
    walkNodes(record.design.nodes, (node) => {
      if (!node.text || !node.text.fontName) return;
      const font = node.text.fontName;
      const family = font.family || "Unknown";
      if (!families.has(family)) {
        families.set(family, {
          family,
          styles: new Map(),
          sizes: new Map(),
          usageCount: 0,
          screens: new Map(),
          samples: []
        });
      }
      const entry = families.get(family);
      entry.usageCount += 1;
      const style = font.style || "Regular";
      if (!entry.styles.has(style)) entry.styles.set(style, { style, count: 0, weights: new Set() });
      const styleEntry = entry.styles.get(style);
      styleEntry.count += 1;
      if (typeof node.text.fontWeight === "number") styleEntry.weights.add(node.text.fontWeight);
      if (typeof node.text.fontSize === "number") {
        entry.sizes.set(node.text.fontSize, (entry.sizes.get(node.text.fontSize) || 0) + 1);
      }
      entry.screens.set(record.index, record.name);
      if (entry.samples.length < 5) {
        entry.samples.push({
          screenIndex: record.index,
          screenName: record.name,
          nodeId: node.id,
          path: node.path,
          characters: String(node.text.characters || "").slice(0, 60),
          fontSize: node.text.fontSize,
          fontWeight: node.text.fontWeight
        });
      }
    });
  }

  const warnings = [];
  const fonts = Array.from(families.values())
    .sort((a, b) => b.usageCount - a.usageCount)
    .map((entry) => {
      const styles = Array.from(entry.styles.values()).map((styleEntry) => {
        const available = !availableFonts.size || availableFonts.has(`${entry.family}|${styleEntry.style}`);
        if (!available) {
          warnings.push({
            code: "MISSING_FONT",
            family: entry.family,
            style: styleEntry.style,
            message: `Font ${entry.family} ${styleEntry.style} is not available on this machine. Provide a fallback or load the font.`
          });
        }
        return {
          style: styleEntry.style,
          count: styleEntry.count,
          weights: Array.from(styleEntry.weights).sort((a, b) => a - b),
          availableOnClient: available
        };
      });
      return {
        family: entry.family,
        usageCount: entry.usageCount,
        styles,
        sizes: Array.from(entry.sizes.entries()).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })),
        screens: Array.from(entry.screens.entries()).map(([index, name]) => ({ index, name })),
        samples: entry.samples,
        fallbackStack: fontFallbackStack(entry.family),
        googleFontsUrl: GOOGLE_FONT_SPECS[entry.family]
          ? `https://fonts.google.com/specimen/${encodeURIComponent(entry.family)}`
          : undefined
      };
    });

  return {
    schema: "dev-export-fonts",
    schemaVersion: "1.0.0",
    generatedAt,
    familyCount: fonts.length,
    fonts,
    warnings
  };
}

function buildCentralTokens(screenRecords, generatedAt) {
  const colors = new Map();
  const typography = new Map();
  const spacing = new Map();
  const radii = new Map();
  const shadows = new Map();
  const gradients = new Map();
  const variables = {};

  for (const record of screenRecords) {
    const designVariables = record.design.variables || {};
    for (const [id, variable] of Object.entries(designVariables)) {
      if (!variables[id]) variables[id] = variable;
    }

    walkNodes(record.design.nodes, (node) => {
      const nodeFills = Array.isArray(node.fills) ? node.fills : [];
      const nodeStrokes = Array.isArray(node.strokes) ? node.strokes : [];
      for (const paint of [...nodeFills, ...nodeStrokes]) {
        if (paint && paint.hex) colors.set(paint.hex, (colors.get(paint.hex) || 0) + 1);
        if (paint && paint.type && paint.type.indexOf("GRADIENT_") === 0) {
          const key = `${paint.type}|${JSON.stringify(paint.gradientStops || [])}`;
          if (!gradients.has(key)) {
            gradients.set(key, { type: paint.type, stops: paint.gradientStops || [], count: 0 });
          }
          gradients.get(key).count += 1;
        }
      }

      if (node.text) {
        const text = node.text;
        const key = [
          (text.fontName || {}).family || "",
          text.fontSize || "",
          text.fontWeight || "",
          JSON.stringify(text.lineHeight || ""),
          JSON.stringify(text.letterSpacing || ""),
          text.textAlignHorizontal || ""
        ].join("|");
        if (!typography.has(key)) {
          typography.set(key, {
            fontFamily: (text.fontName || {}).family,
            fontStyle: (text.fontName || {}).style,
            fontSize: text.fontSize,
            fontWeight: text.fontWeight,
            lineHeight: text.lineHeight,
            letterSpacing: text.letterSpacing,
            textAlign: text.textAlignHorizontal,
            count: 0
          });
        }
        typography.get(key).count += 1;
      }

      for (const value of [node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom, node.itemSpacing, node.counterAxisSpacing]) {
        if (typeof value === "number" && value > 0) spacing.set(value, (spacing.get(value) || 0) + 1);
      }

      if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
        radii.set(node.cornerRadius, (radii.get(node.cornerRadius) || 0) + 1);
      } else {
        for (const value of [node.topLeftRadius, node.topRightRadius, node.bottomLeftRadius, node.bottomRightRadius]) {
          if (typeof value === "number" && value > 0) radii.set(value, (radii.get(value) || 0) + 1);
        }
      }

      const nodeEffects = Array.isArray(node.effects) ? node.effects : [];
      for (const effect of nodeEffects) {
        if (!effect || (effect.type !== "DROP_SHADOW" && effect.type !== "INNER_SHADOW")) continue;
        const color = effect.color || {};
        const key = [
          effect.type,
          (effect.offset || {}).x || 0,
          (effect.offset || {}).y || 0,
          effect.radius || 0,
          effect.spread || 0,
          cssRgba(color, typeof color.a === "number" ? color.a : 1) || ""
        ].join("|");
        shadows.set(key, (shadows.get(key) || 0) + 1);
      }
    });
  }

  const colorTokens = Array.from(colors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 80)
    .map(([hex, count], index) => ({ id: `color-${String(index + 1).padStart(2, "0")}`, value: hex, count }));
  const typographyTokens = Array.from(typography.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 80)
    .map(([, value], index) => ({ id: `type-${String(index + 1).padStart(2, "0")}`, ...value }));
  const spacingTokens = Array.from(spacing.entries()).sort((a, b) => b[1] - a[1]).slice(0, 60)
    .map(([value, count], index) => ({ id: `space-${String(index + 1).padStart(2, "0")}`, value, count }));
  const radiusTokens = Array.from(radii.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([value, count], index) => ({ id: `radius-${String(index + 1).padStart(2, "0")}`, value, count }));
  const shadowTokens = Array.from(shadows.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([value, count], index) => {
      const [type, x, y, radius, spread, color] = value.split("|");
      return { id: `shadow-${String(index + 1).padStart(2, "0")}`, type, x: Number(x), y: Number(y), radius: Number(radius), spread: Number(spread), color, count };
    });
  const gradientTokens = Array.from(gradients.values()).sort((a, b) => b.count - a.count).slice(0, 40)
    .map((value, index) => ({ id: `gradient-${String(index + 1).padStart(2, "0")}`, ...value }));
  const namedStyles = Array.from(styleInfoCache.values()).filter(Boolean)
    .sort((a, b) => String(a.type).localeCompare(String(b.type)) || String(a.name).localeCompare(String(b.name)));

  return {
    colors: colorTokens,
    typography: typographyTokens,
    spacing: spacingTokens,
    radii: radiusTokens,
    shadows: shadowTokens,
    gradients: gradientTokens,
    namedStyles,
    variables,
    counts: {
      colors: colorTokens.length,
      typography: typographyTokens.length,
      spacing: spacingTokens.length,
      radii: radiusTokens.length,
      shadows: shadowTokens.length,
      gradients: gradientTokens.length,
      namedStyles: namedStyles.length,
      variables: Object.keys(variables).length
    }
  };
}

function buildCentralUi(screenRecords, tokens, fontsManifest, generatedAt) {
  const components = new Map();
  let figmaComponentCount = 0;
  let repeatedComponentCount = 0;

  // High-confidence components already authored in Figma.
  for (const record of screenRecords) {
    walkNodes(record.design.nodes, (node) => {
      if (node.type !== "INSTANCE" || !node.mainComponent) return;
      const key = node.mainComponent.key || node.mainComponent.name || node.name;
      const id = `cmp-figma-${hashString(key).slice(0, 10)}`;
      let component = components.get(id);
      if (!component) {
        component = {
          id,
          name: node.mainComponent.name || node.name || "Component",
          source: "figma-component",
          confidence: "high",
          figmaKey: node.mainComponent.key,
          usageCount: 0,
          usages: []
        };
        components.set(id, component);
        figmaComponentCount += 1;
      }
      component.usages.push({
        screenIndex: record.index,
        screenName: record.name,
        nodeId: node.id,
        path: node.path,
        nodeName: node.name,
        props: node.componentProperties,
        variantProperties: node.variantProperties,
        overrides: Array.isArray(node.overrides) ? node.overrides.slice(0, 20) : undefined
      });
      component.usageCount += 1;
      node.componentRef = { id, name: component.name, source: component.source, confidence: component.confidence };
    });
  }

  // Medium-confidence components from repeated raw structures across screens.
  const candidates = new Map();
  for (const record of screenRecords) {
    const subtreeInfo = computeSubtreeInfo(record.design.nodes[0]);
    walkNodes(record.design.nodes, (node) => {
      if (node.componentRef) return;
      const info = subtreeInfo.get(node);
      if (!info || !isComponentCandidate(node, info.count)) return;
      if (record.design.nodes[0] === node) return;
      const hash = info.hash;
      if (!candidates.has(hash)) candidates.set(hash, []);
      candidates.get(hash).push({ record, node, count: info.count });
    });
  }

  for (const [hash, usages] of candidates.entries()) {
    if (repeatedComponentCount >= 150) break;
    if (usages.length < 2) continue;
    const screenSet = new Set(usages.map((usage) => usage.record.index));
    if (screenSet.size < 2) continue;
    if (usages[0].count > 120) continue;

    const id = `cmp-repeat-${hash.slice(0, 10)}`;
    if (components.has(id)) continue;
    repeatedComponentCount += 1;
    const name = componentNameForUsages(usages, repeatedComponentCount);
    const variations = diffSubtreeVariations(usages);
    const component = {
      id,
      name,
      source: "repeated-structure",
      confidence: "medium",
      hash,
      usageCount: usages.length,
      usages: usages.map(({ record, node }) => ({
        screenIndex: record.index,
        screenName: record.name,
        nodeId: node.id,
        path: node.path,
        nodeName: node.name
      })),
      variations
    };
    components.set(id, component);

    for (const { node } of usages) {
      node.componentRef = { id, name, source: component.source, confidence: component.confidence };
    }
  }

  const componentList = Array.from(components.values()).map((component) => {
    const screenMap = new Map();
    for (const usage of component.usages) {
      if (!screenMap.has(usage.screenIndex)) {
        screenMap.set(usage.screenIndex, { index: usage.screenIndex, name: usage.screenName });
      }
    }
    const screens = Array.from(screenMap.values()).sort((a, b) => a.index - b.index);
    return {
      ...component,
      screenCount: screens.length,
      screens,
      sample: component.usages[0]
        ? {
            screenIndex: component.usages[0].screenIndex,
            screenName: component.usages[0].screenName,
            nodeId: component.usages[0].nodeId,
            path: component.usages[0].path
          }
        : null
    };
  }).sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

  const screens = [];
  for (const record of screenRecords) {
    const usages = [];
    walkNodes(record.design.nodes, (node) => {
      if (!node.componentRef) return;
      usages.push({
        componentId: node.componentRef.id,
        componentName: node.componentRef.name,
        source: node.componentRef.source,
        confidence: node.componentRef.confidence,
        nodeId: node.id,
        path: node.path,
        props: node.componentProperties,
        variantProperties: node.variantProperties
      });
    });
    const root = record.design.nodes[0];
    const fallbackTopLevelNodeIds = root && root.children
      ? root.children.filter((child) => !child.componentRef).map((child) => child.id)
      : [];
    record.design.centralUi = {
      note: "Screens are composed from centralized components where possible. Unmatched nodes remain available in nodes[].",
      components: usages,
      fallbackTopLevelNodeIds
    };
    screens.push({
      index: record.index,
      name: record.name,
      folder: record.screenFolder,
      json: record.designPath,
      componentCount: usages.length,
      fallbackTopLevelNodeIds,
      components: usages
    });
  }

  return {
    schema: "dev-export-central-ui",
    schemaVersion: "1.0.0",
    generatedAt,
    architecture: "centralized-ui",
    note: "One token set and one component library are shared by all screens. Screens reference components and keep fallback nodes when a match is uncertain.",
    tokens,
    fonts: {
      manifest: "fonts.json",
      familyCount: fontsManifest.familyCount,
      missingWarnings: fontsManifest.warnings.length
    },
    components: componentList,
    screens,
    stats: {
      screens: screens.length,
      components: componentList.length,
      figmaComponents: figmaComponentCount,
      repeatedComponents: repeatedComponentCount,
      tokens: tokens.counts
    }
  };
}

function buildCoverage(screenRecords, fontsManifest, centralUi, generatedAt) {
  const screens = [];
  const summary = {};
  const bump = (code) => { summary[code] = (summary[code] || 0) + 1; };

  const supportedEffects = new Set(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]);

  for (const record of screenRecords) {
    const warnings = [];
    walkNodes(record.design.nodes, (node) => {
      if (node.visible === false) {
        warnings.push({ code: "HIDDEN_LAYER_INCLUDED", nodeId: node.id, path: node.path, message: "Hidden layer is included. Keep it hidden in the frontend unless it is needed." });
      }
      if (node.isMask) {
        warnings.push({ code: "MASK", nodeId: node.id, path: node.path, message: "Layer is used as a mask. Recreate with CSS clip-path or a mask image." });
      }
      if (node.constraints && (
        node.constraints.horizontal === "STRETCH" ||
        node.constraints.vertical === "STRETCH" ||
        node.constraints.horizontal === "SCALE" ||
        node.constraints.vertical === "SCALE"
      )) {
        warnings.push({ code: "CONSTRAINT_LAYOUT", nodeId: node.id, path: node.path, message: "Stretch/scale constraints need responsive checks." });
      }
      if (node.blendMode && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
        warnings.push({ code: "BLEND_MODE", nodeId: node.id, path: node.path, message: `Blend mode ${node.blendMode} may need manual CSS adjustment.` });
      }
      const nodeEffects = Array.isArray(node.effects) ? node.effects : [];
      for (const effect of nodeEffects) {
        if (effect && effect.type && !supportedEffects.has(effect.type)) {
          warnings.push({ code: "UNSUPPORTED_EFFECT", nodeId: node.id, path: node.path, message: `Effect ${effect.type} is not automatically translated.` });
        }
      }
      const visibleFills = Array.isArray(node.fills) ? node.fills.filter((paint) => paint && paint.visible !== false) : [];
      if (visibleFills.length > 1) {
        warnings.push({ code: "MULTIPLE_FILLS", nodeId: node.id, path: node.path, message: "Multiple fills are stacked; verify background layering." });
      }
      for (const paint of visibleFills) {
        if (paint.type && paint.type.indexOf("GRADIENT_") === 0) {
          warnings.push({ code: "GRADIENT_APPROXIMATION", nodeId: node.id, path: node.path, message: "Gradient CSS is approximated; use the raw gradient transform for pixel-perfect direction." });
        }
      }
      const nodeImages = Array.isArray(node.imageAssets) ? node.imageAssets : [];
      for (const image of nodeImages) {
        if (image.scaleMode && image.scaleMode !== "FILL" && image.scaleMode !== "FIT") {
          warnings.push({ code: "IMAGE_CROP", nodeId: node.id, path: node.path, message: `Image fill uses ${image.scaleMode}. Verify object-fit/object-position or transform.` });
        } else if (image.imageTransform) {
          warnings.push({ code: "IMAGE_TRANSFORM", nodeId: node.id, path: node.path, message: "Image fill has a crop transform. Verify the rendered crop." });
        }
      }
      if (node.text && node.text.textAutoResize === "NONE") {
        warnings.push({ code: "FIXED_TEXT_BOX", nodeId: node.id, path: node.path, message: "Text box is fixed. Verify overflow and wrapping behavior." });
      }
    });

    for (const warning of warnings) bump(warning.code);
    const limitedWarnings = warnings.slice(0, 300);

    record.design.coverage = {
      warningCount: warnings.length,
      truncated: warnings.length > limitedWarnings.length,
      warnings: limitedWarnings,
      note: "Items here may require manual verification for pixel-perfect output."
    };

    screens.push({
      index: record.index,
      name: record.name,
      folder: record.screenFolder,
      json: record.designPath,
      warningCount: warnings.length,
      truncated: warnings.length > limitedWarnings.length,
      warnings: limitedWarnings
    });
  }

  const globalWarnings = [];
  for (const warning of fontsManifest.warnings) {
    globalWarnings.push(warning);
    bump("MISSING_FONT");
  }
  if (centralUi.stats.repeatedComponents) {
    globalWarnings.push({
      code: "HEURISTIC_COMPONENTS",
      message: `${centralUi.stats.repeatedComponents} repeated structures were detected heuristically. Review their props and variants in central-ui.json.`
    });
    bump("HEURISTIC_COMPONENTS");
  }

  return {
    schema: "dev-export-coverage",
    schemaVersion: "1.0.0",
    generatedAt,
    summary,
    globalWarnings,
    screens
  };
}

function createAiPrompt(centralUi, fontsManifest, coverage, sharedManifest, packageManifest, codeArtifacts) {
  const missingFonts = fontsManifest.warnings.length;
  const sharedCount = sharedManifest ? sharedManifest.assetCount : 0;
  const output = packageManifest.output || {};
  return [
    "# AI Agent Prompt — Dev Export Package",
    "",
    `Generated: ${packageManifest.generatedAt}`,
    `Screens: ${packageManifest.screenCount}`,
    `Architecture: centralized UI`,
    "",
    "You are rebuilding the exported Figma UI in a frontend project.",
    "",
    "## Non-negotiables",
    "",
    "- Read `central-ui/central-ui.json` first. It is the shared token and component source of truth.",
    "- Build shared tokens and shared components once, then compose every screen from them.",
    "- Do not duplicate component styles inside screens.",
    "- Use `screens/<screen>/<screen>.json` for exact node data and `central-ui` for shared structure.",
    "- Use the screen @2x PNG as the visual source of truth.",
    "- Use the assets from `screens/<screen>/assets` and `shared/assets`; do not redraw icons.",
    "- Resolve every asset path with `node-index.json` when a node is ambiguous.",
    "- Treat `coverage.json` warnings as known risks, not as ignored items.",
    "- Treat `screen-variants.json` groups as one logical screen with state/tab handling, not duplicate screens.",
    "",
    "## Recommended workflow",
    "",
    "1. Read `package-manifest.json`.",
    "2. Read `central-ui/central-ui.json` and create the token layer.",
    "3. Create the shared components listed in `central-ui.components`.",
    "4. For each screen, read its JSON, then compose it from the shared components.",
    "5. Use fallback nodes for anything without a confident component match.",
    "6. Check `fonts.json` and load or fall back for every missing font.",
    "7. Compare against `screens/<screen>/<screen>@2x.png`.",
    "8. If a verification harness exists under `verify/`, run it, fix the worst diff regions, and repeat.",
    "",
    "## Package map",
    "",
    "- `central-ui/central-ui.json` — tokens, components, screen compositions.",
    "- `fonts.json` — font families, styles, weights, fallbacks, missing-font warnings.",
    "- `coverage.json` — masks, blend modes, image crops, gradients, fixed text boxes and font issues.",
    "- `node-index.json` — node id to screen/path map.",
    "- `screen-variants.json` — logical screens with state/tab variants grouped together.",
    "- `AI_AGENT_PROMPT.md` — this file.",
    "- `ai/<screen>.md` — condensed per-screen handoff.",
    "- `screens/<screen>/<screen>.json` — full screen data and `centralUi` references.",
    "- `shared/assets/` — canonical duplicate assets used by multiple screens.",
    "",
    "## Output options",
    "",
    "- Design JSON / Figma spec: use `central-ui` + screen JSON.",
    "- Code: use the generated starter folder and refine it.",
    "- Both: emit the spec and the starter code from the same central model.",
    "",
    `Current output mode: ${output.mode || "both"}.`,
    `Code target: ${output.target || "not generated"}.`,
    `Code folder: ${output.codeFolder || "none"}.`,
    "",
    "Targets supported by this build: React, Flutter, HTML + CSS.",
    "",
    "## Design token files",
    "",
    "- `tokens/tokens.json` — token source of truth.",
    "- `tokens/tokens.css` — CSS variables.",
    "- `tokens/tailwind.config.js` — Tailwind theme extension.",
    "- `component-index.json` — component usage grouped by screen and source.",
    "- `screen-groups.json` — inferred breakpoints and screen name groups.",
    "",
    "## Current export facts",
    "",
    `- Components: ${centralUi.stats.components} (${centralUi.stats.figmaComponents} Figma, ${centralUi.stats.repeatedComponents} repeated)`,
    `- Tokens: ${centralUi.tokens.counts.colors} colors, ${centralUi.tokens.counts.typography} typography, ${centralUi.tokens.counts.spacing} spacing, ${centralUi.tokens.counts.radii} radii`,
    `- Shared assets: ${sharedCount}`,
    `- Font families: ${fontsManifest.familyCount} (${missingFonts} missing-font warnings)`,
    `- Coverage warnings: ${Object.values(coverage.summary).reduce((sum, value) => sum + value, 0)}`,
    "",
    "## Do not",
    "",
    "- Do not invent copy, images or icons.",
    "- Do not flatten everything into absolute positioning.",
    "- Do not ignore Auto Layout sizing (FIXED / HUG / FILL).",
    "- Do not create per-screen copies of shared components.",
    "- Do not silently drop `coverage.json` warnings.",
    ""
  ].join("\n");
}

function createScreenAiDoc(record, centralUi, coverage, fontsManifest) {
  const design = record.design;
  const screenCoverage = (coverage.screens || []).find((screen) => screen.index === record.index);
  const screenComposition = centralUi.screens.find((screen) => screen.index === record.index);
  const componentUsages = (screenComposition && screenComposition.components) || [];
  const assets = (design.assetManifest || []).slice(0, 40);
  const shared = design.sharedAssets || [];
  const logical = design.logicalScreen;
  const outline = [];
  const root = design.nodes && design.nodes[0];

  function outlineNode(node, depth) {
    if (!node || depth > 2 || outline.length >= 80) return;
    outline.push({
      depth,
      path: node.path,
      type: node.type,
      layoutStrategy: node.layoutStrategy,
      width: node.width,
      height: node.height,
      component: node.componentRef ? `${node.componentRef.name} (${node.componentRef.confidence})` : undefined
    });
    for (const child of node.children || []) outlineNode(child, depth + 1);
  }
  outlineNode(root, 0);

  const lines = [
    `# ${record.name}`,
    "",
    `- Screen: ${String(record.index).padStart(2, "0")}`,
    `- Folder: ${record.screenFolder}`,
    `- JSON: ${record.designPath}`,
    `- Preview: ${record.preview || "not included"}`,
    `- Size: ${root ? root.width : "?"} × ${root ? root.height : "?"}`,
    `- Layout root: ${root ? root.layoutMode : "freeform"}`,
    `- Logical screen: ${logical ? `${logical.name} - ${logical.variantName} (${logical.variantType})` : "single screen"}`,
    "",
    "## Central components used",
    "",
    componentUsages.length
      ? componentUsages.map((usage) => `- ${usage.componentName} — ${usage.confidence} · ${usage.path}`).join("\n")
      : "- No centralized components matched this screen; use the full node tree.",
    "",
    "## Assets",
    "",
    assets.length
      ? assets.map((asset) => `- ${asset.kind}/${asset.semanticRole || "asset"}: ${asset.fileName || asset.ref}${asset.pngFileName ? ` (PNG: ${asset.pngFileName})` : ""}`).join("\n")
      : "- No exported assets.",
    "",
    "## Shared assets",
    "",
    shared.length
      ? shared.map((asset) => `- ${asset.file}: ${asset.relativeFromScreen} (${(asset.usedAt || []).length || 0} placements)`).join("\n")
      : "- None.",
    "",
    "## Node outline",
    "",
    "```",
    ...outline.map((item) => `${"  ".repeat(item.depth)}${item.path} [${item.type} · ${item.layoutStrategy}]${item.component ? ` → ${item.component}` : ""}`),
    "```",
    "",
    "## Coverage warnings",
    "",
    screenCoverage && screenCoverage.warnings.length
      ? screenCoverage.warnings.map((warning) => `- ${warning.code}: ${warning.message}${warning.path ? ` (${warning.path})` : ""}`).join("\n")
      : "- None.",
    "",
    "## Build notes",
    "",
    "- Prefer the centralized components above over rebuilding the same subtree.",
    "- Use `css` on each node for layout, box, visual, typography and asset hints.",
    "- Use `assets` and `sharedAssets` paths exactly; do not redraw icons.",
    "- Check `fonts.json` for missing fonts and fallbacks.",
    ""
  ];

  if (fontsManifest.warnings.length) {
    lines.push("## Font warnings", "");
    for (const warning of fontsManifest.warnings.slice(0, 12)) {
      lines.push(`- ${warning.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
