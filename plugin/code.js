figma.showUI(__html__, {
  width: 560,
  height: 800,
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

function detectImageType(bytes) {
  if (!bytes || bytes.length < 12) return { ext: "bin", mime: "application/octet-stream" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { ext: "gif", mime: "image/gif" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return { ext: "bin", mime: "application/octet-stream" };
}

function registerAsset(ctx, ref, manifest, file) {
  if (!ctx.assetManifestByRef.has(ref)) ctx.assetManifestByRef.set(ref, manifest);
  if (file && !ctx.assetFilesByRef.has(ref)) {
    ctx.assetFilesByRef.set(ref, file);
    ctx.assetBytes += file.bytes.length;
  }
}

function registerAssetFile(ctx, key, file) {
  if (!file || !file.bytes || ctx.assetFilesByRef.has(key)) return false;
  ctx.assetFilesByRef.set(key, file);
  ctx.assetBytes += file.bytes.length;
  return true;
}

async function exportNodePngAsset(node, options, ctx, key, fileName) {
  if (!options.collectAssetPng || !node || typeof node.exportAsync !== "function") return null;

  try {
    const bytes = await node.exportAsync({
      format: "PNG",
      constraint: {
        type: "SCALE",
        value: options.assetPngScale === 1 ? 1 : 2
      }
    });

    if (ctx.assetBytes + bytes.length > options.maxAssetBytes) {
      return {
        fileName,
        byteLength: bytes.length,
        skipped: true,
        reason: "Configured asset byte budget exceeded"
      };
    }

    registerAssetFile(ctx, key, {
      fileName,
      mime: "image/png",
      bytes
    });

    return {
      fileName,
      byteLength: bytes.length,
      scale: options.assetPngScale === 1 ? 1 : 2
    };
  } catch (e) {
    return {
      fileName,
      exportError: String(e && e.message ? e.message : e)
    };
  }
}

function classifyAssetRole(name, width, height, kind, composed = false) {
  const n = String(name || "").toLowerCase();
  const maxDim = Math.max(Number(width) || 0, Number(height) || 0);
  if (/logo|brand mark|wordmark/.test(n)) return "logo";
  if (/illustration|hero|artwork/.test(n)) return "illustration";
  if (/connector|hairline|decoration|decorative|ornament|pattern|mesh|background/.test(n)) return "decoration";
  if (/icon|glyph|chevron|arrow/.test(n) || (!composed && maxDim > 0 && maxDim <= 48)) return "icon";
  if (kind === "raster") return "image";
  return composed ? "graphic" : "vector";
}

async function extractSvgAsset(node, options, ctx) {
  if (!options.collectSvg || !VECTOR_TYPES.has(node.type) || typeof node.exportAsync !== "function") return undefined;

  const ref = `svg-${idSafe(node.id)}`;
  const base = `${safeFileName(node.name || node.type)}-${idSafe(node.id)}`;
  const fileName = `assets/svg/${base}.svg`;
  const pngFileName = `assets/png/${base}@${options.assetPngScale === 1 ? 1 : 2}x.png`;

  try {
    const bytes = await node.exportAsync({
      format: "SVG",
      svgOutlineText: false,
      svgIdAttribute: true,
      svgSimplifyStroke: true
    });

    const semanticRole = classifyAssetRole(node.name, node.width, node.height, "svg", false);
    const manifest = {
      ref,
      kind: "svg",
      semanticRole,
      fileName,
      pngFileName,
      formats: {
        svg: fileName,
        png: pngFileName
      },
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      width: node.width,
      height: node.height,
      byteLength: bytes.length
    };

    registerAsset(ctx, ref, manifest, {
      ref,
      fileName,
      mime: "image/svg+xml",
      bytes
    });

    const png = await exportNodePngAsset(
      node,
      options,
      ctx,
      `${ref}:png`,
      pngFileName
    );

    if (png) {
      manifest.pngByteLength = png.byteLength;
      manifest.pngScale = png.scale;
      if (png.skipped) {
        manifest.pngSkippedFromAssetZip = true;
        manifest.pngSkipReason = png.reason;
      }
      if (png.exportError) manifest.pngExportError = png.exportError;
    }

    return {
      ref,
      kind: "svg",
      semanticRole,
      fileName,
      pngFileName,
      formats: manifest.formats,
      byteLength: bytes.length,
      pngByteLength: manifest.pngByteLength,
      svg: options.embedSvgInJson ? utf8Decode(bytes) : undefined
    };
  } catch (e) {
    return {
      kind: "svg",
      exportError: String(e && e.message ? e.message : e)
    };
  }
}

async function extractImageFillAssets(node, paints, options, ctx) {
  if (!options.collectImages || !Array.isArray(paints)) return undefined;

  const result = [];

  for (let i = 0; i < paints.length; i++) {
    const paint = paints[i];
    if (!paint || paint.type !== "IMAGE" || !paint.imageHash) continue;

    let ref = ctx.rasterRefByHash.get(paint.imageHash);

    if (!ref) {
      ref = `raster-${ctx.rasterSequence++}-${String(paint.imageHash).slice(0, 10)}`;
      ctx.rasterRefByHash.set(paint.imageHash, ref);

      try {
        const image = figma.getImageByHash(paint.imageHash);
        if (!image) throw new Error("Figma image handle unavailable");

        const bytes = await image.getBytesAsync();
        const type = detectImageType(bytes);

        const originalFileName =
          `assets/images/original/image-${ctx.rasterSequence - 1}-${String(paint.imageHash).slice(0, 10)}.${type.ext}`;

        const renderedPngFileName =
          `assets/images/rendered_png/${safeFileName(node.name || "image-node")}-${idSafe(node.id)}@${options.assetPngScale === 1 ? 1 : 2}x.png`;

        const manifest = {
          ref,
          kind: "raster",
          semanticRole: "image",
          fileName: originalFileName,
          originalFileName,
          pngFileName: renderedPngFileName,
          formats: {
            original: originalFileName,
            png: renderedPngFileName
          },
          nodeId: node.id,
          nodeName: node.name,
          imageHash: paint.imageHash,
          mime: type.mime,
          byteLength: bytes.length
        };

        try {
          if (typeof image.getSizeAsync === "function") {
            manifest.pixelSize = cleanValue(await image.getSizeAsync());
          }
        } catch (_) {}

        if (ctx.assetBytes + bytes.length <= options.maxAssetBytes) {
          registerAsset(ctx, ref, manifest, {
            fileName: originalFileName,
            mime: type.mime,
            bytes
          });
        } else {
          manifest.skippedFromAssetZip = true;
          manifest.skipReason = "Configured asset byte budget exceeded";
          registerAsset(ctx, ref, manifest);
        }

        const png = await exportNodePngAsset(
          node,
          options,
          ctx,
          `${ref}:png:${idSafe(node.id)}`,
          renderedPngFileName
        );

        if (png) {
          manifest.pngByteLength = png.byteLength;
          manifest.pngScale = png.scale;
          if (png.skipped) {
            manifest.pngSkippedFromAssetZip = true;
            manifest.pngSkipReason = png.reason;
          }
          if (png.exportError) manifest.pngExportError = png.exportError;
        }
      } catch (e) {
        registerAsset(ctx, ref, {
          ref,
          kind: "raster",
          semanticRole: "image",
          nodeId: node.id,
          nodeName: node.name,
          imageHash: paint.imageHash,
          exportError: String(e && e.message ? e.message : e)
        });
      }
    }

    const m = ctx.assetManifestByRef.get(ref) || {};

    result.push({
      fillIndex: i,
      ref,
      kind: "raster",
      fileName: m.fileName,
      pngFileName: m.pngFileName,
      formats: m.formats,
      imageHash: paint.imageHash,
      scaleMode: paint.scaleMode,
      imageTransform: cleanValue(paint.imageTransform),
      filters: cleanValue(paint.filters),
      rotation: cleanValue(paint.rotation)
    });
  }

  return result.length ? result : undefined;
}

function increment(map, key) {
  if (key === undefined || key === null || key === "") return;
  key = String(key);
  map.set(key, (map.get(key) || 0) + 1);
}

function topValues(map, limit) {
  return Array.from(map.entries())
    .sort((a,b) => b[1] - a[1] || Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value,count]) => ({ value, count }));
}

function walkNodes(nodes, fn) {
  for (const n of nodes || []) {
    fn(n);
    if (n.children) walkNodes(n.children, fn);
  }
}

function normalizedMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function isLikelySpacingToken(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 96;
}

function collectCompositionStats(node) {
  const stats = { total: 0, vectors: 0, shapes: 0, text: 0, images: 0, otherLeaves: 0 };

  function visit(n) {
    if (!n || n === node) {
      if (n && "children" in n) for (const c of n.children) visit(c);
      return;
    }

    stats.total += 1;

    if (n.type === "TEXT") stats.text += 1;
    if (VECTOR_TYPES.has(n.type)) stats.vectors += 1;
    if (VECTORISH_LEAF_TYPES.has(n.type)) stats.shapes += 1;

    try {
      if ("fills" in n && Array.isArray(n.fills) && n.fills.some(p => p && p.type === "IMAGE")) stats.images += 1;
    } catch (_) {}

    if ("children" in n && n.children.length) {
      for (const c of n.children) visit(c);
    } else if (!VECTORISH_LEAF_TYPES.has(n.type) && n.type !== "TEXT") {
      stats.otherLeaves += 1;
    }
  }

  visit(node);
  return stats;
}

function shouldComposeSvg(node, options) {
  if (!options.collectComposedSvg) return false;
  if (!COMPOSABLE_CONTAINER_TYPES.has(node.type)) return false;
  if (!("children" in node) || !node.children.length) return false;
  if (typeof node.exportAsync !== "function") return false;

  const stats = collectCompositionStats(node);
  const nameHint = COMPOSE_NAME_HINT.test(String(node.name || ""));
  const cleanVectorGraphic = stats.vectors >= 2 && stats.text === 0 && stats.images === 0 && stats.otherLeaves === 0 && stats.total <= 120;

  // A semantic name hint may include rectangle/shape helpers, but still must not contain text/images.
  const hintedGraphic = nameHint && stats.vectors >= 2 && stats.text === 0 && stats.images === 0 && stats.total <= 160;
  return cleanVectorGraphic || hintedGraphic;
}

function collectVectorRefsFromSerialized(children, refs = []) {
  for (const child of children || []) {
    if (child.vectorAsset && child.vectorAsset.ref) refs.push(child.vectorAsset.ref);
    if (child.children) collectVectorRefsFromSerialized(child.children, refs);
  }
  return refs;
}

async function extractComposedSvgAsset(node, options, ctx, serializedChildren) {
  if (!shouldComposeSvg(node, options)) return undefined;

  const ref = `composed-${idSafe(node.id)}`;
  const base = `${safeFileName(node.name || "vector-group")}-${idSafe(node.id)}`;
  const fileName = `assets/composed/svg/${base}.svg`;
  const pngFileName = `assets/composed/png/${base}@${options.assetPngScale === 1 ? 1 : 2}x.png`;

  try {
    const bytes = await node.exportAsync({
      format: "SVG",
      svgOutlineText: false,
      svgIdAttribute: true,
      svgSimplifyStroke: true
    });

    const childVectorRefs = Array.from(
      new Set(collectVectorRefsFromSerialized(serializedChildren || []))
    );
    const stats = collectCompositionStats(node);
    const semanticRole = classifyAssetRole(
      node.name,
      node.width,
      node.height,
      "composed-svg",
      true
    );

    const manifest = {
      ref,
      kind: "composed-svg",
      semanticRole,
      fileName,
      pngFileName,
      formats: {
        svg: fileName,
        png: pngFileName
      },
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      width: "width" in node ? node.width : undefined,
      height: "height" in node ? node.height : undefined,
      byteLength: bytes.length,
      childVectorRefs,
      compositionStats: stats
    };

    registerAsset(ctx, ref, manifest, {
      ref,
      fileName,
      mime: "image/svg+xml",
      bytes
    });

    const png = await exportNodePngAsset(
      node,
      options,
      ctx,
      `${ref}:png`,
      pngFileName
    );

    if (png) {
      manifest.pngByteLength = png.byteLength;
      manifest.pngScale = png.scale;
      if (png.skipped) {
        manifest.pngSkippedFromAssetZip = true;
        manifest.pngSkipReason = png.reason;
      }
      if (png.exportError) manifest.pngExportError = png.exportError;
    }

    return {
      ref,
      kind: "composed-svg",
      semanticRole,
      fileName,
      pngFileName,
      formats: manifest.formats,
      byteLength: bytes.length,
      pngByteLength: manifest.pngByteLength,
      childVectorRefs,
      svg: options.embedSvgInJson ? utf8Decode(bytes) : undefined
    };
  } catch (e) {
    return {
      kind: "composed-svg",
      exportError: String(e && e.message ? e.message : e)
    };
  }
}

function buildAssetIndex(assetManifest) {
  const byNodeId = {};
  const byRole = {};
  const composed = {};

  for (const asset of assetManifest) {
    if (asset.nodeId) {
      if (!byNodeId[asset.nodeId]) byNodeId[asset.nodeId] = [];
      byNodeId[asset.nodeId].push(asset.ref);
    }

    const role = asset.semanticRole || "unclassified";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(asset.ref);

    if (asset.kind === "composed-svg") {
      composed[asset.ref] = {
        nodeId: asset.nodeId,
        fileName: asset.fileName,
        pngFileName: asset.pngFileName,
        formats: asset.formats,
        childVectorRefs: asset.childVectorRefs || []
      };
    }
  }

  return { byNodeId, byRole, composed };
}

function buildDeveloperSummary(nodes, assetManifest, source, options) {
  const types = new Map();
  const colors = new Map();
  const fonts = new Map();
  const sizes = new Map();
  const radii = new Map();
  const spacingTokens = new Map();
  const computedSpacing = new Map();
  const layouts = new Map();
  const text = [];
  const seen = new Set();

  walkNodes(nodes, n => {
    increment(types, n.type);
    increment(layouts, n.layoutMode);

    for (const p of [...(n.fills || []), ...(n.strokes || [])]) {
      if (p && p.hex) increment(colors, p.hex);
    }

    if (n.text) {
      const f = n.text.fontName || {};
      increment(fonts, [f.family, f.style, n.text.fontWeight].filter(x => x !== undefined).join(" · "));
      increment(sizes, n.text.fontSize);
      const t = String(n.text.characters || "").trim();
      if (t && !seen.has(t) && text.length < 30) {
        seen.add(t);
        text.push(t.length > 140 ? t.slice(0, 137) + "..." : t);
      }
    }

    // Count one uniform radius per node instead of counting the same radius five times.
    if (typeof n.cornerRadius === "number" && n.cornerRadius > 0) {
      increment(radii, normalizedMetric(n.cornerRadius));
    } else {
      const cornerValues = new Set();
      for (const r of [n.topLeftRadius, n.topRightRadius, n.bottomLeftRadius, n.bottomRightRadius]) {
        if (typeof r === "number" && r > 0) cornerValues.add(normalizedMetric(r));
      }
      for (const r of cornerValues) increment(radii, r);
    }

    // Paddings/grids are intentional author values; large values are kept separately.
    for (const v of [n.paddingLeft, n.paddingRight, n.paddingTop, n.paddingBottom, n.gridRowGap, n.gridColumnGap]) {
      if (typeof v !== "number" || v <= 0) continue;
      const key = normalizedMetric(v);
      if (isLikelySpacingToken(v)) increment(spacingTokens, key);
      else increment(computedSpacing, key);
    }

    // SPACE_BETWEEN itemSpacing is frequently a computed Figma result, not a design token.
    if (typeof n.itemSpacing === "number" && n.itemSpacing > 0) {
      const key = normalizedMetric(n.itemSpacing);
      if (n.primaryAxisAlignItems !== "SPACE_BETWEEN" && isLikelySpacingToken(n.itemSpacing)) increment(spacingTokens, key);
      else increment(computedSpacing, key);
    }

    if (typeof n.counterAxisSpacing === "number" && n.counterAxisSpacing > 0) {
      const key = normalizedMetric(n.counterAxisSpacing);
      if (isLikelySpacingToken(n.counterAxisSpacing)) increment(spacingTokens, key);
      else increment(computedSpacing, key);
    }
  });

  const root = nodes && nodes[0];
  const roleCounts = {};
  for (const asset of assetManifest) roleCounts[asset.semanticRole || "unclassified"] = (roleCounts[asset.semanticRole || "unclassified"] || 0) + 1;

  const warnings = [];
  if (options && options.includeCSS) warnings.push("Figma-generated CSS is enabled. It may be useful for web targets, but it duplicates structural layout data and can make the JSON much larger.");
  if (!assetManifest.some(a => a.kind === "composed-svg")) warnings.push("No composed SVG groups were detected in this screen. Individual SVG vectors are still preserved.");

  return {
    screen: root ? {
      id: root.id,
      name: root.name,
      type: root.type,
      width: root.width,
      height: root.height,
      layoutMode: root.layoutMode,
      backgrounds: (root.fills || []).filter(x => x && x.hex).map(x => x.hex)
    } : null,
    source,
    rootChildren: root && root.children ? root.children.map(c => ({ id:c.id, name:c.name, type:c.type, x:c.x, y:c.y, width:c.width, height:c.height, layoutMode:c.layoutMode })) : [],
    nodeTypes: Object.fromEntries(Array.from(types.entries()).sort((a,b)=>b[1]-a[1])),
    layoutModes: Object.fromEntries(Array.from(layouts.entries()).sort((a,b)=>b[1]-a[1])),
    designSystemObserved: {
      colors: topValues(colors, 24),
      fonts: topValues(fonts, 16),
      fontSizes: topValues(sizes, 16),
      cornerRadiusCandidates: topValues(radii, 16),
      spacingTokenCandidates: topValues(spacingTokens, 24),
      computedOrLargeLayoutSpacing: topValues(computedSpacing, 12)
    },
    assets: {
      total: assetManifest.length,
      svg: assetManifest.filter(x => x.kind === "svg").length,
      composedSvg: assetManifest.filter(x => x.kind === "composed-svg").length,
      raster: assetManifest.filter(x => x.kind === "raster").length,
      semanticRoleCounts: roleCounts,
      items: assetManifest.map(x => ({
        ref:x.ref,
        kind:x.kind,
        semanticRole:x.semanticRole,
        fileName:x.fileName,
        pngFileName:x.pngFileName,
        formats:x.formats,
        nodeName:x.nodeName,
        width:x.width,
        height:x.height,
        pixelSize:x.pixelSize,
        byteLength:x.byteLength,
        childVectorRefs:x.childVectorRefs,
        skippedFromAssetZip:!!x.skippedFromAssetZip,
        exportError:x.exportError
      }))
    },
    developerExport: {
      target: "Responsive frontend implementation",
      readOrder: ["developerSummary", "assetIndex", "nodes"],
      visualReference: "Use the exported 2× PNG as the final visual reference.",
      layoutRule: "Translate Auto Layout, FILL/HUG sizing, constraints and wrapping into the responsive layout primitives of the target framework instead of defaulting to absolute positioning.",
      assetRule: "Prefer SVG for implementation fidelity; use the matching PNG copy for quick visual inspection and QA. Prefer composed SVGs for decorative multi-vector groups.",
      designSystemRule: "Promote recurring colors, typography, radii, spacing and reusable UI patterns into the target project’s centralized design system/tokens."
    },
    representativeText: text,
    warnings,
    implementationGuidance: [
      "Use this summary first, then inspect nodes for exact measurements and styling.",
      "Do not reproduce Figma frame nesting one-to-one in code; build semantic, reusable frontend components.",
      "Prefer Auto Layout/FILL/HUG/constraints over absolute positioning for responsive code.",
      "Use composed SVGs for vector-only decorative groups and individual SVGs for reusable icons.",
      "Centralize recurring colors, typography, radii and spacing candidates in the target project design system."
    ]
  };
}

async function getMainComponentInfo(node) {
  if (node.type !== "INSTANCE" || typeof node.getMainComponentAsync !== "function") return undefined;
  try {
    const comp = await node.getMainComponentAsync();
    if (!comp) return null;
    return {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      key: "key" in comp ? comp.key : undefined,
      parentName: comp.parent ? comp.parent.name : undefined
    };
  } catch (_) {
    return null;
  }
}

async function serializeNode(node, options, ctx, depth = 0) {
  if (!options.includeHidden && "visible" in node && node.visible === false) return null;

  ctx.count += 1;
  if (ctx.count > options.maxNodes) {
    throw new Error("NODE_LIMIT");
  }

  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
    depth
  };

  addProps(out, node, [
    "visible",
    "locked",
    "opacity",
    "blendMode",
    "rotation",
    "isMask",
    "maskType",
    "isAsset"
  ]);

  if ("x" in node) out.x = node.x;
  if ("y" in node) out.y = node.y;
  if ("width" in node) out.width = node.width;
  if ("height" in node) out.height = node.height;

  try {
    out.absoluteBoundingBox = rectOrNull(node.absoluteBoundingBox);
  } catch (_) {}
  try {
    out.absoluteRenderBounds = rectOrNull(node.absoluteRenderBounds);
  } catch (_) {}

  addProps(out, node, [
    "minWidth", "maxWidth", "minHeight", "maxHeight",
    "layoutAlign", "layoutGrow", "layoutPositioning",
    "layoutSizingHorizontal", "layoutSizingVertical",
    "constraints"
  ]);

  addProps(out, node, [
    "layoutMode",
    "layoutWrap",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "counterAxisAlignContent",
    "itemSpacing",
    "counterAxisSpacing",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemReverseZIndex",
    "strokesIncludedInLayout",
    "clipsContent",
    "gridRowCount",
    "gridColumnCount",
    "gridRowGap",
    "gridColumnGap"
  ]);

  addProps(out, node, [
    "cornerRadius",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
    "strokeWeight",
    "strokeTopWeight",
    "strokeRightWeight",
    "strokeBottomWeight",
    "strokeLeftWeight",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "dashPattern"
  ]);

  let rawFills;
  try {
    if ("fills" in node) { rawFills = node.fills; out.fills = simplifyPaints(rawFills); }
  } catch (_) {}
  try {
    if ("strokes" in node) out.strokes = simplifyPaints(node.strokes);
  } catch (_) {}

  const imageAssets = await extractImageFillAssets(node, rawFills, options, ctx);
  if (imageAssets) out.imageAssets = imageAssets;
  const vectorAsset = await extractSvgAsset(node, options, ctx);
  if (vectorAsset) out.vectorAsset = vectorAsset;

  addProps(out, node, [
    "effects",
    "effectStyleId",
    "fillStyleId",
    "strokeStyleId",
    "gridStyleId",
    "layoutGrids",
    "exportSettings"
  ]);

  // Text properties.
  if (node.type === "TEXT") {
    out.text = {
      characters: node.characters
    };
    addProps(out.text, node, [
      "fontName",
      "fontSize",
      "fontWeight",
      "textStyleId",
      "textAlignHorizontal",
      "textAlignVertical",
      "textAutoResize",
      "textCase",
      "textDecoration",
      "letterSpacing",
      "lineHeight",
      "paragraphIndent",
      "paragraphSpacing",
      "listSpacing",
      "hangingPunctuation",
      "hangingList",
      "hyperlink"
    ]);

    // If a text layer mixes styles, preserve segment-level styling when possible.
    try {
      if (typeof node.getStyledTextSegments === "function") {
        out.text.styledSegments = cleanValue(
          node.getStyledTextSegments([
            "fontName",
            "fontSize",
            "fontWeight",
            "fills",
            "textStyleId",
            "letterSpacing",
            "lineHeight",
            "textCase",
            "textDecoration"
          ])
        );
      }
    } catch (_) {}
  }

  // Component / instance metadata.
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    addProps(out, node, [
      "key",
      "description",
      "documentationLinks",
      "componentPropertyDefinitions",
      "variantProperties"
    ]);
  }

  if (node.type === "INSTANCE") {
    addProps(out, node, [
      "componentProperties",
      "variantProperties",
      "overrides"
    ]);
    out.mainComponent = await getMainComponentInfo(node);
  }

  // Prototype / interaction data, when available.
  addProps(out, node, [
    "reactions",
    "overlayPositionType",
    "overlayBackground",
    "overlayBackgroundInteraction",
    "expanded",
    "numberOfFixedChildren"
  ]);

  // Variables.
  try {
    if ("boundVariables" in node && node.boundVariables) {
      out.boundVariables = cleanValue(node.boundVariables);
      collectVariableIds(node.boundVariables, ctx.variableIds);
    }
  } catch (_) {}

  addProps(out, node, [
    "resolvedVariableModes",
    "explicitVariableModes"
  ]);

  // Figma-generated CSS snapshot. Helpful for frontend/code reconstruction,
  // but optional because it adds time on large frames.
  if (options.includeCSS && typeof node.getCSSAsync === "function") {
    try {
      out.figmaCSS = cleanValue(await node.getCSSAsync());
    } catch (e) {
      out.figmaCSSError = String(e && e.message ? e.message : e);
    }
  }

  // Recursively preserve layer hierarchy.
  if ("children" in node) {
    const children = [];
    for (const child of node.children) {
      const serialized = await serializeNode(child, options, ctx, depth + 1);
      if (serialized) children.push(serialized);
    }
    out.children = children;

    const composedVectorAsset = await extractComposedSvgAsset(node, options, ctx, children);
    if (composedVectorAsset) out.composedVectorAsset = composedVectorAsset;
  }

  return out;
}

async function resolveVariables(variableIds) {
  const variables = {};
  const collections = {};

  for (const id of variableIds) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (!variable) continue;

      let collectionInfo = null;
      try {
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        if (collection) {
          collections[collection.id] = {
            id: collection.id,
            name: collection.name,
            key: collection.key,
            modes: cleanValue(collection.modes),
            defaultModeId: collection.defaultModeId,
            remote: collection.remote,
            hiddenFromPublishing: collection.hiddenFromPublishing
          };
          collectionInfo = {
            id: collection.id,
            name: collection.name
          };
        }
      } catch (_) {}

      variables[id] = {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        variableCollectionId: variable.variableCollectionId,
        collection: collectionInfo,
        resolvedType: variable.resolvedType,
        description: variable.description,
        hiddenFromPublishing: variable.hiddenFromPublishing,
        remote: variable.remote,
        scopes: cleanValue(variable.scopes),
        valuesByMode: cleanValue(variable.valuesByMode)
      };
    } catch (_) {}
  }

  return { variables, collections };
}

function safeFileName(name) {
  return (name || "screen")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "")
    .slice(0, 100) || "screen";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function visualPosition(node) {
  try {
    if (node.absoluteBoundingBox) {
      return {
        x: node.absoluteBoundingBox.x,
        y: node.absoluteBoundingBox.y
      };
    }
  } catch (_) {}

  return {
    x: "x" in node ? Number(node.x) || 0 : 0,
    y: "y" in node ? Number(node.y) || 0 : 0
  };
}

function effectiveScreenSelection() {
  const raw = Array.from(figma.currentPage.selection || []);
  if (!raw.length) return [];

  // If both a screen and one of its descendants are selected, keep only
  // the outermost selected node so the child is not exported as a second screen.
  const selectedIds = new Set(raw.map(n => n.id));

  const roots = raw.filter(node => {
    let p = node.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (selectedIds.has(p.id)) return false;
      p = p.parent;
    }
    return true;
  });

  // Stable, predictable package ordering: visually top-to-bottom, then left-to-right.
  roots.sort((a, b) => {
    const pa = visualPosition(a);
    const pb = visualPosition(b);
    if (Math.abs(pa.y - pb.y) > 2) return pa.y - pb.y;
    if (Math.abs(pa.x - pb.x) > 2) return pa.x - pb.x;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return roots;
}

function selectionSummary() {
  const raw = Array.from(figma.currentPage.selection || []);
  const nodes = effectiveScreenSelection();

  return {
    rawCount: raw.length,
    count: nodes.length,
    nestedSelectionsIgnored: Math.max(0, raw.length - nodes.length),
    items: nodes.slice(0, 30).map((n, i) => ({
      index: i + 1,
      id: n.id,
      name: n.name,
      type: n.type,
      width: "width" in n ? n.width : undefined,
      height: "height" in n ? n.height : undefined
    }))
  };
}

function createScreenContext() {
  return {
    count: 0,
    variableIds: new Set(),
    assetManifestByRef: new Map(),
    assetFilesByRef: new Map(),
    rasterRefByHash: new Map(),
    rasterSequence: 1,
    assetBytes: 0
  };
}

async function exportNodePng(node, scale) {
  if (!node || typeof node.exportAsync !== "function") {
    throw new Error("PREVIEW_UNAVAILABLE");
  }

  return await node.exportAsync({
    format: "PNG",
    constraint: {
      type: "SCALE",
      value: scale
    }
  });
}

async function buildScreenExport(node, options, packageContext) {
  const ctx = createScreenContext();
  const serialized = await serializeNode(node, options, ctx, 0);

  if (!serialized) {
    throw new Error("HIDDEN_SCREEN");
  }

  let variableData = {
    variables: {},
    collections: {}
  };

  if (options.resolveVariables && ctx.variableIds.size) {
    variableData = await resolveVariables(ctx.variableIds);
  }

  const source = {
    editorType: figma.editorType,
    fileName: figma.root.name,
    page: {
      id: figma.currentPage.id,
      name: figma.currentPage.name
    },
    selectedNodeCount: 1,
    serializedNodeCount: ctx.count,
    screenNodeId: node.id,
    screenNodeName: node.name
  };

  const nodes = [serialized];
  const assetManifest = Array.from(ctx.assetManifestByRef.values());
  const assetFiles = Array.from(ctx.assetFilesByRef.values());
  const developerSummary = buildDeveloperSummary(nodes, assetManifest, source, options);
  const assetIndex = buildAssetIndex(assetManifest);

  const design = {
    schema: "dev-export-screen",
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    packageContext: {
      packageSchema: "dev-export-multiscreen-package",
      packageSchemaVersion: "1.0.0",
      screenIndex: packageContext.screenIndex,
      totalScreens: packageContext.totalScreens,
      screenFolder: packageContext.screenFolder,
      assetPathsAreRelativeToScreenFolder: true
    },
    source,
    guidance: {
      purpose: "High-fidelity Figma design export for frontend implementation across web, mobile and desktop UI frameworks.",
      coordinateSystem: "x/y are relative to the immediate parent; absoluteBoundingBox is page-space when available.",
      layerOrder: "children are preserved in Figma layer order (back-to-front).",
      mixedValueMarker: "__MIXED__",
      assetStrategy: "Asset paths in this JSON are relative to this screen folder. Prefer composed SVGs for decorative groups and individual SVGs for reusable icons.",
      implementationNote: "Read developerSummary first, then assetIndex, then nodes. Use the exported PNG as the final visual reference."
    },
    developerSummary,
    assetIndex,
    warnings: developerSummary.warnings,
    assetManifest,
    variableCollections: variableData.collections,
    variables: variableData.variables,
    nodes
  };

  return {
    design,
    assetManifest,
    assetFiles,
    serializedNodeCount: ctx.count,
    assetBytes: assetFiles.reduce((sum, f) => sum + f.bytes.length, 0)
  };
}

function createAssetsManifest(screen, result) {
  return {
    schema: "dev-export-assets",
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    screen: {
      id: screen.id,
      name: screen.name
    },
    assets: result.assetManifest
  };
}

function packageExportGuide(packageManifest) {
  const lines = [
    "DEV EXPORT FOR FIGMA — MULTI-SCREEN PACKAGE",
    "===============================================",
    "",
    "This package was generated by Dev Export for Figma.",
    "",
    "IMPLEMENTATION READ ORDER",
    "-------------------------",
    "1. Read package-manifest.json to understand all exported screens.",
    "2. Work one screen folder at a time under screens/.",
    "3. For each screen JSON, read:",
    "   developerSummary -> assetIndex -> nodes.",
    "4. Use the screen @2x PNG as the visual reference.",
    "5. Use exact assets from that screen's assets/ folder.",
    "6. Prefer composed SVG assets for multi-vector decorative graphics.",
    "7. Prefer individual SVG assets for reusable icons.",
    "8. Translate Figma Auto Layout, FILL/HUG sizing, constraints and wrapping",
    "   into the responsive primitives of the target framework.",
    "9. Avoid mirroring raw Figma FRAME nesting one-to-one in implementation code.",
    "10. Promote recurring colors, typography, radii, spacing and shared UI",
    "    patterns into the target project's centralized design system.",
    "",
    "SUPPORTED TARGETS",
    "-----------------",
    "React / Next.js / Vue / Nuxt / Angular / Svelte / HTML-CSS / Flutter /",
    "SwiftUI / Jetpack Compose / React Native and other frontend frameworks.",
    "",
    `SCREEN COUNT: ${packageManifest.screenCount}`,
    "",
    "SCREENS",
    "-------"
  ];

  for (const screen of packageManifest.screens) {
    lines.push(
      `${pad2(screen.index)}. ${screen.name}`,
      `    Folder: ${screen.folder}`,
      `    JSON: ${screen.json}`,
      `    Preview: ${screen.preview || "not included"}`,
      `    Assets: ${screen.assetCount}`,
      ""
    );
  }

  return lines.join("\n");
}


function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativeAssetPathFromCatalog(path) {
  return String(path || "").replace(/^assets\//, "");
}

function createAssetCatalogHtml(screenName, manifest) {
  const cards = (manifest || []).map((asset, index) => {
    const previewPath = asset.pngFileName
      ? relativeAssetPathFromCatalog(asset.pngFileName)
      : (
          asset.kind === "raster" && asset.fileName
            ? relativeAssetPathFromCatalog(asset.fileName)
            : ""
        );

    const primaryPath = asset.fileName
      ? relativeAssetPathFromCatalog(asset.fileName)
      : "";

    const secondaryPath = asset.pngFileName
      ? relativeAssetPathFromCatalog(asset.pngFileName)
      : "";

    const preview = previewPath
      ? `<div class="thumb"><img src="${htmlEscape(previewPath)}" alt="${htmlEscape(asset.nodeName || asset.ref)}"></div>`
      : `<div class="thumb empty"><span>No preview</span></div>`;

    const links = [
      primaryPath
        ? `<a href="${htmlEscape(primaryPath)}" target="_blank">Open ${asset.kind === "raster" ? "original" : "SVG"}</a>`
        : "",
      secondaryPath
        ? `<a href="${htmlEscape(secondaryPath)}" target="_blank">Open PNG</a>`
        : ""
    ].filter(Boolean).join("");

    return `
      <article class="asset-card">
        ${preview}
        <div class="asset-body">
          <div class="asset-top">
            <span class="index">${String(index + 1).padStart(2, "0")}</span>
            <span class="role">${htmlEscape(asset.semanticRole || asset.kind || "asset")}</span>
          </div>
          <h3>${htmlEscape(asset.nodeName || asset.ref)}</h3>
          <p>${htmlEscape(asset.kind || "")} · ${htmlEscape(asset.width || "")}${asset.width != null ? "×" : ""}${htmlEscape(asset.height || "")}</p>
          <div class="links">${links}</div>
        </div>
      </article>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(screenName)} — Asset Catalog</title>
<style>
:root{
font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
color-scheme:light dark;
--bg:#f8fafc;--surface:#ffffff;--surface-2:#f1f5f9;--text:#111827;--muted:#64748b;
--border:#e2e8f0;--accent:#6366f1;--accent-soft:#eef2ff;--accent-text:#4338ca;
background:var(--bg);color:var(--text)
}
@media (prefers-color-scheme:dark){
:root{--bg:#0b1020;--surface:#111827;--surface-2:#172033;--text:#f8fafc;--muted:#a8b1c2;--border:#263248;--accent:#818cf8;--accent-soft:#20264a;--accent-text:#c7d2fe}
}
*{box-sizing:border-box}
body{margin:0}
header{position:sticky;top:0;z-index:5;padding:26px 32px 20px;background:var(--bg);backdrop-filter:blur(18px);border-bottom:1px solid var(--border)}
.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700}
h1{font-size:24px;letter-spacing:-.03em;margin:5px 0 6px}
header p{margin:0;color:var(--muted);font-size:13px}
main{padding:24px 32px 48px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.asset-card{overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 10px 30px rgba(16,24,40,.05)}
.thumb{height:170px;display:flex;align-items:center;justify-content:center;background:var(--surface-2);border-bottom:1px solid var(--border);padding:26px}
.thumb img{max-width:100%;max-height:100%;object-fit:contain}
.thumb.empty{color:var(--muted);font-size:12px}
.asset-body{padding:15px 16px 17px}
.asset-top{display:flex;align-items:center;gap:7px}
.index,.role{font-size:10px;font-weight:700;border-radius:999px;padding:4px 7px}
.index{background:var(--surface-2);color:var(--muted)}
.role{background:var(--accent-soft);color:var(--accent-text);text-transform:uppercase;letter-spacing:.05em}
h3{font-size:13px;margin:10px 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asset-body p{font-size:11px;color:var(--muted);margin:0 0 13px}
.links{display:flex;gap:7px;flex-wrap:wrap}
.links a{text-decoration:none;font-size:11px;font-weight:650;padding:7px 9px;border:1px solid var(--border);border-radius:9px;color:var(--text);background:var(--surface)}
.links a:hover{border-color:var(--accent);color:var(--accent-text);background:var(--accent-soft)}
</style>
</head>
<body>
<header>
  <div class="eyebrow">Dev Export · Asset Catalog</div>
  <h1>${htmlEscape(screenName)}</h1>
  <p>${manifest.length} exported asset${manifest.length === 1 ? "" : "s"} · SVG + PNG inspection views where available</p>
</header>
<main>${cards || '<p>No assets were detected for this screen.</p>'}</main>
</body>
</html>`;
}

async function buildMultiScreenPackage(options) {
  const screens = effectiveScreenSelection();

  if (!screens.length) {
    throw new Error("NO_SELECTION");
  }

  if (screens.length > 20) {
    throw new Error("SCREEN_LIMIT");
  }

  const generatedAt = new Date().toISOString();
  const packageBase = safeFileName(figma.root.name || "Figma");
  const packageRoot = `${packageBase}_Dev_Export`;

  const files = [];
  const entries = [];
  const totals = {
    serializedNodes: 0,
    assets: 0,
    individualSvg: 0,
    composedSvg: 0,
    raster: 0,
    pngAssetPreviews: 0,
    assetBytes: 0,
    previewBytes: 0
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

    const result = await buildScreenExport(node, options, {
      screenIndex: index,
      totalScreens: screens.length,
      screenFolder
    });

    const designJsonName = `${screenBase}.json`;
    const designPath = `${screenFolder}/${designJsonName}`;
    const designText = JSON.stringify(result.design, null, 2);

    files.push({
      fileName: designPath,
      mime: "application/json",
      bytes: utf8Encode(designText)
    });

    // Exact assets, folder-local so each screen remains portable on its own.
    for (const assetFile of result.assetFiles) {
      files.push({
        fileName: `${screenFolder}/${assetFile.fileName}`,
        mime: assetFile.mime,
        bytes: assetFile.bytes
      });
    }

    const assetsManifest = createAssetsManifest(node, result);
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
  }

  const packageManifest = {
    schema: "dev-export-multiscreen-package",
    schemaVersion: "1.0.0",
    generatedAt,
    source: {
      editorType: figma.editorType,
      fileName: figma.root.name,
      page: {
        id: figma.currentPage.id,
        name: figma.currentPage.name
      }
    },
    ordering: "Screens are ordered top-to-bottom, then left-to-right by their position on the Figma page.",
    nestedSelectionBehavior: "If both a selected screen and one of its descendants are selected, only the outermost selected node is packaged.",
    screenCount: entries.length,
    totals,
    recommendedReadOrder: [
      "package-manifest.json",
      "screens/<screen>/<screen>.json -> developerSummary",
      "screens/<screen>/<screen>.json -> assetIndex",
      "screens/<screen>/<screen>.json -> nodes",
      "screens/<screen>/<screen>@2x.png",
      "screens/<screen>/assets/ASSET_CATALOG.html",
      "screens/<screen>/assets/"
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

  figma.ui.postMessage({
    type: "progress",
    value: 96,
    label: "Finalizing",
    message: "Building package manifest and implementation guide"
  });

  const packageBytes = files.reduce((sum, file) => sum + (file.bytes ? file.bytes.length : 0), 0);
  if (packageBytes > 350 * 1024 * 1024) {
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
  latestPackageFiles = [];
  latestPackageSummary = null;

  figma.ui.postMessage({
    type: "package-invalidated"
  });

  postSelection();
});

postSelection();

function friendlyUserError(error) {
  const code = String(error && error.message ? error.message : error || "");
  if (code === "NO_SELECTION") return "Select one or more complete top-level frames, then try again.";
  if (code === "NODE_LIMIT") return "A selected screen has more layers than the current limit. Increase Layer limit in Advanced options or export fewer screens.";
  if (code === "SCREEN_LIMIT") return "Export up to 20 screens at a time to keep Figma responsive. Split larger selections into smaller batches.";
  if (code === "PREVIEW_UNAVAILABLE") return "A selected screen could not be rendered as a PNG preview. Turn off Screen previews and try again.";
  if (code === "HIDDEN_SCREEN") return "One selected screen is hidden. Make it visible or enable hidden layers, then try again.";
  if (code === "PACKAGE_NOT_READY") return "Generate the export package before downloading it.";
  if (code === "PACKAGE_TOO_LARGE") return "This export is too large to package safely in one run. Export fewer screens or reduce the asset budget.";
  return "The export could not be completed. Try again with fewer screens, a smaller asset budget, or adjusted Advanced options.";
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "generate-multi") {
      const options = {
        includeHidden: !!msg.options.includeHidden,
        includeCSS: !!msg.options.includeCSS,
        resolveVariables: msg.options.resolveVariables !== false,
        collectSvg: msg.options.collectSvg !== false,
        collectComposedSvg: msg.options.collectComposedSvg !== false,
        embedSvgInJson: !!msg.options.embedSvgInJson,
        collectImages: msg.options.collectImages !== false,
        collectAssetPng: msg.options.collectAssetPng !== false,
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
