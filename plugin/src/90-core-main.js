figma.showUI(__html__, {
  width: 1080,
  height: 600,
  title: "Dev Export for Figma",
  themeColors: true
});

const MAX_DEFAULT_NODES = 4000;
const VECTOR_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "LINE"]);
const COMPOSABLE_CONTAINER_TYPES = new Set(["FRAME", "GROUP"]);
const VECTORISH_LEAF_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "LINE", "RECTANGLE"]);
const COMPOSE_NAME_HINT = /(svg|vector|connector|hairline|illustration|artwork|graphic|decoration|decorative|ornament|pattern|mesh|logo|brand mark)/i;
let latestPackageFiles = [];
let latestPackageName = "figma-dev-export.zip";
let latestPackageSummary = null;
let styleInfoCache = new Map();

// Let Figma process canvas events and keep the UI responsive during long exports.
const YIELD_EVERY_NODES = 35;
function yieldToFigma() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function hashString(value) {
  const text = String(value || "");
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1) + hex(h2);
}

function styleIdOf(node, key) {
  try {
    const value = node[key];
    if (typeof value === "string" && value && value !== "MIXED") return value;
  } catch (_) {}
  return null;
}

async function getStyleInfo(styleId) {
  if (!styleId) return null;
  if (styleInfoCache.has(styleId)) return styleInfoCache.get(styleId);

  let info = null;
  try {
    if (typeof figma.getStyleByIdAsync === "function") {
      const style = await figma.getStyleByIdAsync(styleId);
      if (style) {
        info = {
          id: style.id,
          name: style.name,
          type: style.type,
          description: style.description || undefined
        };
        if (style.type === "PAINT" && "paints" in style) {
          info.paints = simplifyPaints(style.paints);
        }
        if (style.type === "TEXT") {
          info.textStyle = {
            fontName: cleanValue(style.fontName),
            fontSize: cleanValue(style.fontSize),
            fontWeight: cleanValue(style.fontWeight),
            lineHeight: cleanValue(style.lineHeight),
            letterSpacing: cleanValue(style.letterSpacing),
            textCase: cleanValue(style.textCase),
            textDecoration: cleanValue(style.textDecoration)
          };
        }
        if (style.type === "EFFECT" && "effects" in style) {
          info.effects = cleanValue(style.effects);
        }
        if (style.type === "GRID" && "layoutGrids" in style) {
          info.layoutGrids = cleanValue(style.layoutGrids);
        }
      }
    }
  } catch (_) {}

  styleInfoCache.set(styleId, info);
  return info;
}

async function resolveNodeStyleRefs(node) {
  const keys = [
    ["fillStyleId", "fill"],
    ["strokeStyleId", "stroke"],
    ["effectStyleId", "effect"],
    ["textStyleId", "text"],
    ["gridStyleId", "grid"]
  ];
  const refs = {};
  let found = false;

  for (const [key, name] of keys) {
    const id = styleIdOf(node, key);
    if (!id) continue;
    const info = await getStyleInfo(id);
    refs[name] = info || { id };
    found = true;
  }

  return found ? refs : undefined;
}

function cleanValue(value, depth = 0) {
  if (depth > 12) return "[MAX_DEPTH]";
  if (value === undefined) return undefined;
  if (value === null) return null;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "symbol") return value === figma.mixed ? "__MIXED__" : String(value);
  if (t === "function") return undefined;
  if (t === "bigint") return String(value);

  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) {
    return value.map(v => cleanValue(v, depth + 1)).filter(v => v !== undefined);
  }

  if (t === "object") {
    const out = {};
    let keys = [];
    try {
      keys = Object.keys(value);
    } catch (_) {
      return String(value);
    }
    for (const key of keys) {
      try {
        const v = cleanValue(value[key], depth + 1);
        if (v !== undefined) out[key] = v;
      } catch (_) {}
    }
    return out;
  }

  return String(value);
}

function readProp(node, key) {
  try {
    if (key in node) return cleanValue(node[key]);
  } catch (_) {}
  return undefined;
}

function addProp(target, node, key, outKey = key) {
  const v = readProp(node, key);
  if (v !== undefined) target[outKey] = v;
}

function addProps(target, node, keys) {
  for (const key of keys) addProp(target, node, key);
}

function collectVariableIds(value, set, depth = 0) {
  if (!value || depth > 10) return;
  if (Array.isArray(value)) {
    for (const item of value) collectVariableIds(item, set, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  try {
    if (value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
      set.add(value.id);
    }
  } catch (_) {}

  let keys = [];
  try { keys = Object.keys(value); } catch (_) { return; }
  for (const k of keys) {
    try { collectVariableIds(value[k], set, depth + 1); } catch (_) {}
  }
}

function rectOrNull(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function rgbaToHex(color, opacity = 1) {
  if (!color || typeof color.r !== "number") return null;
  const c = (n) => Math.max(0, Math.min(255, Math.round(n * 255)))
    .toString(16).padStart(2, "0").toUpperCase();
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  return "#" + c(color.r) + c(color.g) + c(color.b) + (alpha < 255 ? alpha.toString(16).padStart(2, "0").toUpperCase() : "");
}

function simplifyPaints(paints) {
  if (!Array.isArray(paints)) return cleanValue(paints);
  return paints.map((paint) => {
    const p = cleanValue(paint);
    if (paint && paint.type === "SOLID" && paint.color) {
      p.hex = rgbaToHex(paint.color, typeof paint.opacity === "number" ? paint.opacity : 1);
    }
    return p;
  });
}

function idSafe(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
        i++;
      }
    }
    if (cp <= 0x7F) {
      out.push(cp);
    } else if (cp <= 0x7FF) {
      out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
    } else if (cp <= 0xFFFF) {
      out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    } else {
      out.push(
        0xF0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3F),
        0x80 | ((cp >> 6) & 0x3F),
        0x80 | (cp & 0x3F)
      );
    }
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  try { return new TextDecoder("utf-8").decode(bytes); } catch (_) {}
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 8192, bytes.length))));
  }
  try { return decodeURIComponent(escape(s)); } catch (_) { return s; }
}


async function buildMultiScreenPackage(options) {
  const screens = effectiveScreenSelection();

  if (!screens.length) {
    throw new Error("NO_SELECTION");
  }

  const generatedAt = new Date().toISOString();
  const sourcePage = figma.currentPage;
  const packageBase = safeFileName(figma.root.name || "Figma");
  const packageRoot = `${packageBase}_Dev_Export`;

  const files = [];
  const entries = [];
  const screenRecords = [];
  const sharedCandidates = new Map();
  const totals = {
    serializedNodes: 0,
    assets: 0,
    individualSvg: 0,
    composedSvg: 0,
    raster: 0,
    pngAssetPreviews: 0,
    assetBytes: 0,
    previewBytes: 0,
    sharedAssets: 0,
    sharedAssetBytes: 0
  };

  for (let i = 0; i < screens.length; i++) {
    const node = screens[i];
    const index = i + 1;
    const screenBase = safeFileName(node.name || `Screen_${index}`);
    const screenFolderName = `${pad2(index)}_${screenBase}`;
    const screenFolder = `screens/${screenFolderName}`;

    figma.ui.postMessage({
      type: "progress",
      value: Math.max(2, Math.round((i / screens.length) * 88)),
      label: `Screen ${index} of ${screens.length}`,
      message: `${node.name} — reading layout and exporting assets`
    });

    // Let the progress paint before this screen starts working.
    await yieldToFigma();

    const result = await buildScreenExport(node, options, {
      screenIndex: index,
      totalScreens: screens.length,
      screenFolder,
      page: sourcePage
    });

    await yieldToFigma();

    const designJsonName = `${screenBase}.json`;
    const designPath = `${screenFolder}/${designJsonName}`;
    const designText = JSON.stringify(result.design, null, 2);

    const designFileIndex = files.length;
    files.push({
      fileName: designPath,
      mime: "application/json",
      bytes: utf8Encode(designText)
    });

    const usageByRef = options.sharedAssets ? collectAssetUsages(result.design) : null;

    // Exact assets, folder-local so each screen remains portable on its own.
    for (const assetFile of result.assetFiles) {
      files.push({
        fileName: `${screenFolder}/${assetFile.fileName}`,
        mime: assetFile.mime,
        bytes: assetFile.bytes
      });

      if (usageByRef) {
        const hash = assetContentHash(assetFile.mime, assetFile.bytes);
        const key = assetFile.mime === "image/svg+xml"
          ? `${assetFile.mime}|${hash}`
          : `${assetFile.mime}|${hash}|${assetFile.bytes.length}`;
        const manifestEntries = findAssetEntriesForFile(result.assetManifest, assetFile.fileName);
        let candidate = sharedCandidates.get(key);
        if (!candidate) {
          candidate = {
            key,
            hash,
            mime: assetFile.mime,
            bytes: assetFile.bytes,
            sourceFileName: assetFile.fileName,
            occurrences: []
          };
          sharedCandidates.set(key, candidate);
        }
        const refs = manifestEntries.length ? manifestEntries.map((m) => m.ref) : [null];
        for (const ref of refs) {
          const meta = manifestEntries.find((m) => m.ref === ref) || null;
          candidate.occurrences.push({
            screenIndex: index,
            screenName: node.name,
            screenFolder,
            designPath,
            ref,
            kind: meta ? meta.kind : null,
            semanticRole: meta ? meta.semanticRole : null,
            nodeId: meta ? meta.nodeId : null,
            nodeName: meta ? meta.nodeName : null,
            usages: ref ? (usageByRef.get(ref) || []) : []
          });
        }
      }
    }

    const assetsManifest = createAssetsManifest(node, result);
    const assetsManifestFileIndex = files.length;
    files.push({
      fileName: `${screenFolder}/assets/manifest.json`,
      mime: "application/json",
      bytes: utf8Encode(JSON.stringify(assetsManifest, null, 2))
    });

    const assetCatalogHtml = createAssetCatalogHtml(node.name, result.assetManifest);
    files.push({
      fileName: `${screenFolder}/assets/ASSET_CATALOG.html`,
      mime: "text/html",
      bytes: utf8Encode(assetCatalogHtml)
    });

    let previewPath = null;
    let preview1xPath = null;
    let previewBytes = 0;

    if (options.includePreview) {
      figma.ui.postMessage({
        type: "progress",
        value: Math.max(4, Math.round(((i + 0.72) / screens.length) * 88)),
        label: `Screen ${index} of ${screens.length}`,
        message: `${node.name} — rendering ${options.previewScale}× screen preview`
      });

      try {
        const pngBytes = await exportNodePng(node, options.previewScale);
        previewPath = `${screenFolder}/${screenBase}@${options.previewScale}x.png`;
        previewBytes = pngBytes.length;

        files.push({
          fileName: previewPath,
          mime: "image/png",
          bytes: pngBytes
        });
      } catch (error) {
        result.design.warnings = result.design.warnings || [];
        result.design.warnings.push("The screen preview could not be rendered. Layout JSON and other assets were still exported.");

        // Replace JSON with warning-inclusive version.
        const jsonFileIndex = files.findIndex(f => f.fileName === designPath);
        if (jsonFileIndex >= 0) {
          files[jsonFileIndex] = {
            fileName: designPath,
            mime: "application/json",
            bytes: utf8Encode(JSON.stringify(result.design, null, 2))
          };
        }
      }

      try {
        const png1xBytes = await exportNodePng(node, 1);
        preview1xPath = `${screenFolder}/${screenBase}@1x.png`;
        files.push({
          fileName: preview1xPath,
          mime: "image/png",
          bytes: png1xBytes
        });
      } catch (_) {}
    }

    const svgCount = result.assetManifest.filter(x => x.kind === "svg").length;
    const composedSvgCount = result.assetManifest.filter(x => x.kind === "composed-svg").length;
    const rasterCount = result.assetManifest.filter(x => x.kind === "raster").length;
    const pngAssetPreviewCount = result.assetManifest.filter(x => x.pngFileName && !x.pngSkippedFromAssetZip && !x.pngExportError).length;

    totals.serializedNodes += result.serializedNodeCount;
    totals.assets += result.assetManifest.length;
    totals.individualSvg += svgCount;
    totals.composedSvg += composedSvgCount;
    totals.raster += rasterCount;
    totals.pngAssetPreviews += pngAssetPreviewCount;
    totals.assetBytes += result.assetBytes;
    totals.previewBytes += previewBytes;

    entries.push({
      index,
      nodeId: node.id,
      name: node.name,
      nodeType: node.type,
      width: "width" in node ? node.width : null,
      height: "height" in node ? node.height : null,
      folder: screenFolder,
      json: designPath,
      preview: previewPath,
      preview1x: preview1xPath,
      assetsFolder: `${screenFolder}/assets`,
      assetsManifest: `${screenFolder}/assets/manifest.json`,
      serializedNodeCount: result.serializedNodeCount,
      assetCount: result.assetManifest.length,
      individualSvgCount: svgCount,
      composedSvgCount,
      rasterCount,
      pngAssetPreviewCount,
      assetCatalog: `${screenFolder}/assets/ASSET_CATALOG.html`,
      assetBytes: result.assetBytes,
      previewBytes
    });

    screenRecords.push({
      index,
      name: node.name,
      screenFolder,
      designPath,
      designFileIndex,
      assetsManifestFileIndex,
      preview: previewPath,
      preview1x: preview1xPath,
      design: result.design,
      assetsManifest
    });

    await yieldToFigma();
  }

  // Build a shared library for files that appear verbatim in two or more screens.
  let sharedManifest = null;
  const sharedAssetsFolder = "shared/assets";
  if (options.sharedAssets) {
    const usedPaths = new Set(files.map((f) => f.fileName));
    const perScreenShared = new Map();

    for (const candidate of sharedCandidates.values()) {
      const screenIndexes = new Set(candidate.occurrences.map((o) => o.screenIndex));
      if (screenIndexes.size < 2) continue;

      const first = candidate.occurrences[0];
      const ext = assetFileExtension(candidate.sourceFileName, candidate.mime);
      const folder = sharedAssetFolder(first.kind, candidate.mime);
      const base = safeFileName(first.nodeName || first.semanticRole || first.kind || "asset");
      let sharedFile = `${sharedAssetsFolder}/${folder}/${base}-${candidate.hash.slice(0, 8)}.${ext}`;
      let suffix = 2;
      while (usedPaths.has(sharedFile)) {
        sharedFile = `${sharedAssetsFolder}/${folder}/${base}-${candidate.hash.slice(0, 8)}-${suffix++}.${ext}`;
      }
      usedPaths.add(sharedFile);

      files.push({
        fileName: sharedFile,
        mime: candidate.mime,
        bytes: candidate.bytes
      });

      const byScreen = new Map();
      for (const occurrence of candidate.occurrences) {
        if (!byScreen.has(occurrence.screenIndex)) {
          byScreen.set(occurrence.screenIndex, {
            index: occurrence.screenIndex,
            name: occurrence.screenName,
            folder: occurrence.screenFolder,
            json: occurrence.designPath,
            uses: []
          });
        }
        const record = byScreen.get(occurrence.screenIndex);
        if (occurrence.usages.length) {
          for (const use of occurrence.usages) record.uses.push(use);
        } else if (occurrence.nodeId || occurrence.nodeName) {
          record.uses.push({
            nodeId: occurrence.nodeId,
            nodeName: occurrence.nodeName,
            usage: occurrence.kind || "asset"
          });
        }
      }

      const screensUsingAsset = Array.from(byScreen.values());
      const sharedEntry = {
        id: `shared-${candidate.hash.slice(0, 12)}`,
        hash: candidate.hash,
        kind: first.kind || (candidate.mime === "image/svg+xml" ? "svg" : "raster"),
        semanticRole: first.semanticRole || null,
        mime: candidate.mime,
        file: sharedFile,
        byteLength: candidate.bytes.length,
        screenCount: screensUsingAsset.length,
        usageCount: screensUsingAsset.reduce((sum, screen) => sum + screen.uses.length, 0),
        screens: screensUsingAsset
      };

      if (!sharedManifest) {
        sharedManifest = createSharedAssetsManifest(generatedAt, sharedAssetsFolder, []);
      }
      sharedManifest.assets.push(sharedEntry);

      for (const screen of screensUsingAsset) {
        if (!perScreenShared.has(screen.index)) perScreenShared.set(screen.index, []);
        perScreenShared.get(screen.index).push({
          id: sharedEntry.id,
          file: sharedFile,
          relativeFromScreen: sharedRelativeFromScreen(sharedFile),
          kind: sharedEntry.kind,
          semanticRole: sharedEntry.semanticRole,
          mime: sharedEntry.mime,
          byteLength: sharedEntry.byteLength,
          usedAt: screen.uses
        });
      }
    }

    if (sharedManifest) {
      sharedManifest.assetCount = sharedManifest.assets.length;
      sharedManifest.totalBytes = sharedManifest.assets.reduce(
        (sum, asset) => sum + (asset.byteLength || 0),
        0
      );
      totals.sharedAssets = sharedManifest.assetCount;
      totals.sharedAssetBytes = sharedManifest.totalBytes;

      for (const record of screenRecords) {
        const shared = perScreenShared.get(record.index);
        if (!shared || !shared.length) continue;

        record.design.sharedAssets = shared;
        record.design.guidance = record.design.guidance || {};
        record.design.guidance.sharedAssets =
          "Identical files also used by other screens. Use relativeFromScreen from this JSON, or file from the package root. Screen-local assets remain available for standalone portability.";

        files[record.designFileIndex].bytes = utf8Encode(JSON.stringify(record.design, null, 2));

        record.assetsManifest.sharedAssets = shared;
        files[record.assetsManifestFileIndex].bytes = utf8Encode(
          JSON.stringify(record.assetsManifest, null, 2)
        );
      }

      files.push({
        fileName: `${sharedAssetsFolder}/manifest.json`,
        mime: "application/json",
        bytes: utf8Encode(JSON.stringify(sharedManifest, null, 2))
      });

      files.push({
        fileName: "shared/SHARED_ASSETS.md",
        mime: "text/markdown",
        bytes: utf8Encode(createSharedAssetsGuide(sharedManifest))
      });
    }
  }

  // Centralized UI model + AI handoff artifacts.
  const logicalScreens = buildLogicalScreens(screenRecords);
  const screenVariants = createScreenVariantsManifest(logicalScreens, generatedAt);
  const availableFonts = await getAvailableFontSet();
  const fontsManifest = buildFontsManifest(screenRecords, availableFonts, generatedAt);
  const centralTokens = buildCentralTokens(screenRecords, generatedAt);
  const centralUi = buildCentralUi(screenRecords, centralTokens, fontsManifest, generatedAt);
  centralUi.logicalScreens = screenVariants.screens;
  const coverage = buildCoverage(screenRecords, fontsManifest, centralUi, generatedAt);
  const nodeIndex = buildNodeIndex(screenRecords, generatedAt);
  const tokenArtifacts = createDesignTokenArtifacts(centralUi, generatedAt);
  const componentIndex = createComponentIndex(centralUi, generatedAt);
  const screenGroups = createScreenGroups(screenRecords, generatedAt);
  const verification = options.verifyHarness === false
    ? null
    : createVerificationHarness(screenRecords, files, generatedAt);
  const codeArtifacts = (options.outputMode === "code" || options.outputMode === "both")
    ? createCodeArtifacts({
        target: options.target,
        screenRecords,
        logicalScreens,
        centralUi,
        tokenArtifacts,
        verification,
        generatedAt,
        files,
        centralizedUi: options.centralizedUi
      })
    : null;

  for (const record of screenRecords) {
    files[record.designFileIndex].bytes = utf8Encode(JSON.stringify(record.design, null, 2));
  }

  files.push({
    fileName: "central-ui/central-ui.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(centralUi, null, 2))
  });

  files.push({
    fileName: "central-ui/README.md",
    mime: "text/markdown",
    bytes: utf8Encode([
      "# Centralized UI",
      "",
      "This folder is the shared source of truth for every screen.",
      "",
      "- `central-ui.json` — tokens, component library and screen compositions.",
      "- Components come from Figma components (high confidence) and repeated structures (medium confidence).",
      "- Screens reference components by id and path; unmatched nodes stay in each screen JSON.",
      "- Review `coverage.json` before treating the output as pixel-perfect.",
      ""
    ].join("\n"))
  });

  files.push({
    fileName: "node-index.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(nodeIndex, null, 2))
  });

  files.push({
    fileName: "fonts.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(fontsManifest, null, 2))
  });

  files.push({
    fileName: "coverage.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(coverage, null, 2))
  });

  files.push({
    fileName: "tokens/tokens.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(tokenArtifacts.json, null, 2))
  });

  files.push({
    fileName: "tokens/tokens.css",
    mime: "text/css",
    bytes: utf8Encode(tokenArtifacts.css)
  });

  files.push({
    fileName: "tokens/tailwind.config.js",
    mime: "text/javascript",
    bytes: utf8Encode(tokenArtifacts.tailwind)
  });

  files.push({
    fileName: "component-index.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(componentIndex, null, 2))
  });

  files.push({
    fileName: "screen-groups.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(screenGroups, null, 2))
  });

  files.push({
    fileName: "screen-variants.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(screenVariants, null, 2))
  });

  if (verification) {
    for (const file of verification.files) files.push(file);
  }

  if (codeArtifacts) {
    for (const file of codeArtifacts.files) files.push(file);
  }

  for (const record of screenRecords) {
    files.push({
      fileName: `ai/${pad2(record.index)}_${safeFileName(record.name)}.md`,
      mime: "text/markdown",
      bytes: utf8Encode(createScreenAiDoc(record, centralUi, coverage, fontsManifest))
    });
  }

  totals.centralComponents = centralUi.stats.components;
  totals.centralTokens = centralUi.stats.tokens;

  const packageManifest = {
    schema: "dev-export-multiscreen-package",
    schemaVersion: "1.0.0",
    generatedAt,
    source: {
      editorType: figma.editorType,
      fileName: figma.root.name,
      page: {
        id: sourcePage.id,
        name: sourcePage.name
      }
    },
    ordering: "Screens are ordered top-to-bottom, then left-to-right by their position on the Figma page.",
    nestedSelectionBehavior: "If both a selected screen and one of its descendants are selected, only the outermost selected node is packaged.",
    screenCount: entries.length,
    totals,
    sharedAssets: sharedManifest
      ? {
          folder: sharedAssetsFolder,
          manifest: `${sharedAssetsFolder}/manifest.json`,
          guide: "shared/SHARED_ASSETS.md",
          assetCount: sharedManifest.assetCount,
          totalBytes: sharedManifest.totalBytes
        }
      : {
          assetCount: 0,
          note: "No identical asset files were found across two or more screens."
        },
    centralUi: {
      manifest: "central-ui/central-ui.json",
      readme: "central-ui/README.md",
      architecture: "centralized-ui",
      componentCount: centralUi.stats.components,
      figmaComponents: centralUi.stats.figmaComponents,
      repeatedComponents: centralUi.stats.repeatedComponents,
      tokenCounts: centralUi.stats.tokens
    },
    nodeIndex: "node-index.json",
    designTokens: {
      json: "tokens/tokens.json",
      css: "tokens/tokens.css",
      tailwind: "tokens/tailwind.config.js",
      counts: centralUi.stats.tokens
    },
    componentIndex: "component-index.json",
    screenGroups: "screen-groups.json",
    screenVariants: {
      manifest: "screen-variants.json",
      logicalScreenCount: logicalScreens.length,
      variantScreenCount: screenVariants.variantScreenCount
    },
    verification: verification
      ? {
          enabled: true,
          folder: "verify",
          manifest: "verify/expected/manifest.json",
          report: "verify/report.json",
          screenCount: verification.manifest.screens.length
        }
      : { enabled: false },
    output: {
      mode: options.outputMode,
      target: options.outputMode === "design" ? null : options.target,
      codeFolder: codeArtifacts ? codeArtifacts.summary.folder : null
    },
    codeGeneration: codeArtifacts
      ? {
          enabled: true,
          target: codeArtifacts.summary.target,
          folder: codeArtifacts.summary.folder,
          screenCount: codeArtifacts.summary.screens,
          componentCount: codeArtifacts.summary.components || 0,
          centralized: codeArtifacts.summary.centralized !== false
        }
      : { enabled: false },
    fonts: {
      manifest: "fonts.json",
      familyCount: fontsManifest.familyCount,
      warningCount: fontsManifest.warnings.length
    },
    coverage: {
      manifest: "coverage.json",
      warningCount: Object.values(coverage.summary).reduce((sum, value) => sum + value, 0),
      summary: coverage.summary
    },
    aiPrompt: "AI_AGENT_PROMPT.md",
    aiScreensFolder: "ai/",
    recommendedReadOrder: [
      "package-manifest.json",
      "central-ui/central-ui.json",
      "FRONTEND_IMPLEMENTATION_GUIDE.md",
      "AI_AGENT_PROMPT.md",
      "fonts.json",
      "coverage.json",
      "node-index.json",
      "tokens/tokens.json",
      "tokens/tokens.css",
      "tokens/tailwind.config.js",
      "component-index.json",
      "screen-groups.json",
      "screen-variants.json",
      "verify/README.md",
      "verify/expected/manifest.json",
      "code/<target>/README.md",
      "screens/<screen>/<screen>.json -> developerSummary",
      "screens/<screen>/<screen>.json -> assetIndex",
      "screens/<screen>/<screen>.json -> centralUi",
      "screens/<screen>/<screen>.json -> nodes",
      "screens/<screen>/<screen>@2x.png",
      "screens/<screen>/assets/ASSET_CATALOG.html",
      "shared/assets/manifest.json",
      "shared/SHARED_ASSETS.md",
      "ai/<screen>.md"
    ],
    screens: entries
  };

  // Package-level files.
  files.unshift({
    fileName: "package-manifest.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(packageManifest, null, 2))
  });

  files.splice(1, 0, {
    fileName: "IMPLEMENTATION_GUIDE.txt",
    mime: "text/plain",
    bytes: utf8Encode(packageExportGuide(packageManifest))
  });

  files.splice(2, 0, {
    fileName: "FRONTEND_IMPLEMENTATION_GUIDE.md",
    mime: "text/markdown",
    bytes: utf8Encode(createFrontendGuide(packageManifest, sharedManifest))
  });

  files.splice(3, 0, {
    fileName: "AI_AGENT_PROMPT.md",
    mime: "text/markdown",
    bytes: utf8Encode(createAiPrompt(centralUi, fontsManifest, coverage, sharedManifest, packageManifest, codeArtifacts))
  });

  figma.ui.postMessage({
    type: "progress",
    value: 96,
    label: "Finalizing",
    message: "Building package manifest and implementation guide"
  });

  const packageBytes = files.reduce((sum, file) => sum + (file.bytes ? file.bytes.length : 0), 0);
  if (packageBytes > 800 * 1024 * 1024) {
    throw new Error("PACKAGE_TOO_LARGE");
  }

  latestPackageFiles = files;
  latestPackageName = `${packageRoot}.zip`;
  latestPackageSummary = packageManifest;

  return {
    zipName: latestPackageName,
    summary: packageManifest,
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.bytes.length, 0)
  };
}

async function postSelection() {
  figma.ui.postMessage({
    type: "selection",
    payload: selectionSummary()
  });
}

figma.on("selectionchange", () => {
  // Keep the last generated package downloadable even if the selection changes.
  // A new export replaces it; until then the download stays available.
  postSelection();
});

postSelection();

function friendlyUserError(error) {
  const code = String(error && error.message ? error.message : error || "");
  if (code === "NO_SELECTION") return "Select one or more complete top-level frames, then try again.";
  if (code === "NODE_LIMIT") return "A selected screen has more layers than the current limit. Increase Layer limit in Advanced options.";
  if (code === "PREVIEW_UNAVAILABLE") return "A selected screen could not be rendered as a PNG preview. Turn off Screen previews and try again.";
  if (code === "HIDDEN_SCREEN") return "One selected screen is hidden. Make it visible or enable hidden layers, then try again.";
  if (code === "PACKAGE_NOT_READY") return "Generate the export package before downloading it.";
  if (code === "PACKAGE_TOO_LARGE") return "This export is extremely large. Reduce the asset budget or turn off PNG copies for a smaller package.";
  return code
    ? `The export could not be completed (${code}). Check the plugin console for details.`
    : "The export could not be completed. Check the plugin console for details.";
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "generate-multi") {
      const options = {
        includeHidden: !!msg.options.includeHidden,
        includeCSS: !!msg.options.includeCSS,
        resolveVariables: msg.options.resolveVariables !== false,
        resolveStyles: msg.options.resolveStyles !== false,
        collectSvg: msg.options.collectSvg !== false,
        collectComposedSvg: msg.options.collectComposedSvg !== false,
        embedSvgInJson: !!msg.options.embedSvgInJson,
        collectImages: msg.options.collectImages !== false,
        collectAssetPng: msg.options.collectAssetPng !== false,
        sharedAssets: msg.options.sharedAssets !== false,
        verifyHarness: msg.options.verifyHarness !== false,
        centralizedUi: msg.options.centralizedUi !== false,
        outputMode: msg.options.outputMode === "code" ? "code" : "design",
        target: ["react", "flutter", "html-css"].includes(msg.options.target) ? msg.options.target : "react",
        assetPngScale: msg.options.assetPngScale === 1 ? 1 : 2,
        includePreview: msg.options.includePreview !== false,
        previewScale: msg.options.previewScale === 1 ? 1 : 2,
        maxNodes: Math.max(
          100,
          Math.min(15000, Number(msg.options.maxNodes) || MAX_DEFAULT_NODES)
        ),
        // Budget is per screen, not shared across the package.
        maxAssetBytes: Math.max(
          5,
          Math.min(150, Number(msg.options.maxAssetMB) || 40)
        ) * 1024 * 1024
      };

      latestPackageFiles = [];
      latestPackageSummary = null;

      figma.ui.postMessage({
        type: "status",
        status: "working",
        message: "Preparing multi-screen package…"
      });

      const result = await buildMultiScreenPackage(options);

      figma.ui.postMessage({
        type: "progress",
        value: 100,
        label: "Ready",
        message: "Multi-screen export package is ready to download"
      });

      figma.ui.postMessage({
        type: "multi-generated",
        payload: result
      });
    }

    if (msg.type === "download-package") {
      if (!latestPackageFiles.length || !latestPackageSummary) {
        throw new Error("PACKAGE_NOT_READY");
      }

      figma.ui.postMessage({
        type: "package-ready",
        payload: {
          zipName: latestPackageName,
          files: latestPackageFiles,
          screenCount: latestPackageSummary.screenCount,
          fileCount: latestPackageFiles.length
        }
      });
    }

    if (msg.type === "select-all-frames") {
      const frames = topLevelScreens();
      if (frames.length) {
        figma.currentPage.selection = frames;
      }
      await postSelection();
    }

    if (msg.type === "clear-selection") {
      figma.currentPage.selection = [];
      await postSelection();
    }

    if (msg.type === "refresh-selection") {
      await postSelection();
    }

    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (error) {
    console.error("[Dev Export for Figma] Export error", error);
    figma.ui.postMessage({
      type: "error",
      message: friendlyUserError(error)
    });
  }
};
