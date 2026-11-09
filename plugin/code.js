// AUTO-GENERATED FILE - edit files in plugin/src and run: node plugin/build.js
// Figma plugins load a single script, so sources are concatenated here.

// ===== src/20-assets.js =====

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



// ===== src/30-serialize.js =====

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

    const summaryFills = Array.isArray(n.fills) ? n.fills : [];
    const summaryStrokes = Array.isArray(n.strokes) ? n.strokes : [];
    for (const p of [...summaryFills, ...summaryStrokes]) {
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
      backgrounds: (Array.isArray(root.fills) ? root.fills : []).filter(x => x && x.hex).map(x => x.hex)
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

function cssPx(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${Math.round(value * 100) / 100}px`;
}

function cssRgba(color, opacity) {
  if (!color || typeof color.r !== "number") return undefined;
  const r = Math.round(Math.max(0, Math.min(1, color.r)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, color.g)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, color.b)) * 255);
  const a = Math.max(0, Math.min(1, typeof color.a === "number" ? color.a : 1) * (typeof opacity === "number" ? opacity : 1));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function paintToCss(paint) {
  if (!paint) return undefined;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  if (paint.type === "SOLID") {
    return cssRgba(paint.color, paintOpacity);
  }
  if (paint.type && paint.type.indexOf("GRADIENT_") === 0 && Array.isArray(paint.gradientStops)) {
    const stops = paint.gradientStops.map((stop) => {
      const color = cssRgba(stop.color, paintOpacity) || "transparent";
      const position = Math.round((typeof stop.position === "number" ? stop.position : 0) * 1000) / 10;
      return `${color} ${position}%`;
    }).join(", ");

    if (paint.type === "GRADIENT_LINEAR") return `linear-gradient(180deg, ${stops})`;
    if (paint.type === "GRADIENT_RADIAL") return `radial-gradient(circle at center, ${stops})`;
    if (paint.type === "GRADIENT_ANGULAR") return `conic-gradient(${stops})`;
    if (paint.type === "GRADIENT_DIAMOND") return `linear-gradient(180deg, ${stops})`;
  }
  return undefined;
}

function mostVisiblePaintColor(paint) {
  if (!paint) return undefined;
  const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
  if (paint.type && paint.type.indexOf("GRADIENT_") === 0 && Array.isArray(paint.gradientStops)) {
    let best = null;
    let bestAlpha = -1;
    for (const stop of paint.gradientStops) {
      const alpha = (typeof stop.color?.a === "number" ? stop.color.a : 1) * paintOpacity;
      if (alpha > bestAlpha) {
        bestAlpha = alpha;
        best = stop;
      }
    }
    if (best) return cssRgba(best.color, paintOpacity);
  }
  return paintToCss(paint);
}

function fillsToCss(fills) {
  if (!Array.isArray(fills)) return undefined;
  const layers = fills
    .filter((paint) => paint && paint.visible !== false)
    .map(paintToCss)
    .filter(Boolean);
  return layers.length ? layers[layers.length - 1] : undefined;
}

function borderCss(node) {
  const strokes = Array.isArray(node.strokes) ? node.strokes.filter((p) => p && p.visible !== false) : [];
  if (!strokes.length) return undefined;
  const weight = typeof node.strokeWeight === "number" ? node.strokeWeight : 1;
  const color = mostVisiblePaintColor(strokes[0]) || "currentColor";
  return `${Math.round(weight * 100) / 100}px solid ${color}`;
}

function borderRadiusCss(node) {
  if (typeof node.cornerRadius === "number") return cssPx(node.cornerRadius);
  const corners = [
    node.topLeftRadius,
    node.topRightRadius,
    node.bottomRightRadius,
    node.bottomLeftRadius
  ];
  if (!corners.some((value) => typeof value === "number" && value > 0)) return undefined;
  return corners.map((value) => cssPx(value) || "0px").join(" ");
}

function paddingCss(node) {
  const values = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
  if (!values.some((value) => typeof value === "number" && value > 0)) return undefined;
  const [top, right, bottom, left] = values.map((value) => cssPx(value) || "0px");
  return `${top} ${right} ${bottom} ${left}`;
}

function lineHeightCss(lineHeight) {
  if (!lineHeight || typeof lineHeight !== "object") return undefined;
  if (lineHeight.unit === "PIXELS") return cssPx(lineHeight.value);
  if (lineHeight.unit === "PERCENT") return `${lineHeight.value}%`;
  if (lineHeight.unit === "AUTO") return "normal";
  return undefined;
}

function letterSpacingCss(letterSpacing) {
  if (!letterSpacing || typeof letterSpacing !== "object") return undefined;
  if (letterSpacing.unit === "PIXELS") return cssPx(letterSpacing.value);
  if (letterSpacing.unit === "PERCENT") return `${Math.round((letterSpacing.value / 100) * 1000) / 1000}em`;
  return undefined;
}

function effectsToCss(effects) {
  const result = {};
  if (!Array.isArray(effects)) return result;

  const shadows = [];
  for (const effect of effects) {
    if (!effect || effect.visible === false) continue;
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      const color = effect.color || {};
      const shadowColor = cssRgba(color, typeof (effect.color || {}).a === "number" ? effect.color.a : 1);
      const x = typeof (effect.offset || {}).x === "number" ? effect.offset.x : 0;
      const y = typeof (effect.offset || {}).y === "number" ? effect.offset.y : 0;
      const blur = typeof effect.radius === "number" ? effect.radius : 0;
      const spread = typeof effect.spread === "number" ? effect.spread : 0;
      shadows.push(`${effect.type === "INNER_SHADOW" ? "inset " : ""}${cssPx(x)} ${cssPx(y)} ${cssPx(blur)} ${cssPx(spread)} ${shadowColor || "rgba(0,0,0,0.15)"}`);
    } else if (effect.type === "LAYER_BLUR") {
      result.filter = `blur(${cssPx(effect.radius) || "0px"})`;
    } else if (effect.type === "BACKGROUND_BLUR") {
      result.backdropFilter = `blur(${cssPx(effect.radius) || "0px"})`;
      result.webkitBackdropFilter = result.backdropFilter;
    } else {
      result.unsupported = result.unsupported || [];
      result.unsupported.push(effect.type);
    }
  }

  if (shadows.length) result.boxShadow = shadows.join(", ");
  return result;
}

function blendModeCss(blendMode) {
  if (!blendMode || blendMode === "NORMAL" || blendMode === "PASS_THROUGH") return undefined;
  return String(blendMode).toLowerCase().replace(/_/g, "-");
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (typeof item === "object" && !Array.isArray(item)) {
      const compacted = compactObject(item);
      if (compacted && Object.keys(compacted).length) result[key] = compacted;
    } else {
      result[key] = item;
    }
  }
  return result;
}

function classifyLayoutStrategy(node) {
  if (node.type === "TEXT") return "text";
  if (VECTOR_TYPES.has(node.type)) return "asset";
  if (node.layoutMode === "HORIZONTAL") return "flex-row";
  if (node.layoutMode === "VERTICAL") return "flex-column";
  try {
    if (
      !("children" in node) &&
      Array.isArray(node.fills) &&
      node.fills.some((paint) => paint && paint.type === "IMAGE")
    ) {
      return "asset";
    }
  } catch (_) {}
  return "absolute";
}

function buildNodeCss(node, out, parent) {
  const layout = {};
  const box = {};
  const visual = {};
  const typography = {};
  const strategy = out.layoutStrategy;

  if (strategy === "flex-row" || strategy === "flex-column") {
    layout.display = "flex";
    layout.flexDirection = strategy === "flex-row" ? "row" : "column";
    if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) {
      layout.gap = cssPx(node.itemSpacing);
    }
    if (node.layoutWrap === "WRAP") {
      layout.flexWrap = "wrap";
      if (typeof node.counterAxisSpacing === "number" && node.counterAxisSpacing > 0) {
        layout.rowGap = cssPx(node.counterAxisSpacing);
        layout.columnGap = cssPx(node.itemSpacing || node.counterAxisSpacing);
      }
    }
    const padding = paddingCss(node);
    if (padding) layout.padding = padding;

    const alignMap = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", BASELINE: "baseline", SPACE_BETWEEN: "space-between" };
    const justifyMap = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", SPACE_BETWEEN: "space-between" };
    if (alignMap[node.counterAxisAlignItems]) layout.alignItems = alignMap[node.counterAxisAlignItems];
    if (justifyMap[node.primaryAxisAlignItems]) layout.justifyContent = justifyMap[node.primaryAxisAlignItems];
  }

  if (strategy === "text") {
    layout.display = "inline-block";
  }

  if (node.layoutSizingHorizontal === "FILL") {
    layout.width = "100%";
  } else if (node.layoutSizingHorizontal === "HUG") {
    layout.width = strategy === "text" ? "auto" : "fit-content";
  } else if (typeof node.width === "number") {
    layout.width = cssPx(node.width);
  }

  if (node.layoutSizingVertical === "FILL") {
    layout.height = "100%";
  } else if (node.layoutSizingVertical === "HUG") {
    layout.height = "auto";
  } else if (typeof node.height === "number" && strategy !== "text") {
    layout.height = cssPx(node.height);
  }

  if (typeof node.minWidth === "number") layout.minWidth = cssPx(node.minWidth);
  if (typeof node.maxWidth === "number") layout.maxWidth = cssPx(node.maxWidth);
  if (typeof node.minHeight === "number") layout.minHeight = cssPx(node.minHeight);
  if (typeof node.maxHeight === "number") layout.maxHeight = cssPx(node.maxHeight);
  if (node.layoutGrow === 1) layout.flexGrow = 1;
  if (node.layoutAlign === "STRETCH") layout.alignSelf = "stretch";

  if (strategy !== "text" && strategy !== "asset" && node.layoutPositioning === "ABSOLUTE") {
    box.position = "absolute";
    if (typeof node.x === "number") box.left = cssPx(node.x);
    if (typeof node.y === "number") box.top = cssPx(node.y);
  } else if (parent && parent.layoutMode !== "HORIZONTAL" && parent.layoutMode !== "VERTICAL") {
    box.position = "absolute";
    if (typeof node.x === "number") box.left = cssPx(node.x);
    if (typeof node.y === "number") box.top = cssPx(node.y);
  } else if (!parent) {
    box.position = "relative";
  }

  if (node.clipsContent) box.overflow = "hidden";

  const fills = Array.isArray(node.fills) ? node.fills.filter((paint) => paint && paint.visible !== false) : [];
  const solidOrGradient = fillsToCss(fills);
  if (solidOrGradient && node.type !== "TEXT") visual.background = solidOrGradient;

  const border = borderCss(node);
  if (border) visual.border = border;
  const strokePaint = Array.isArray(node.strokes)
    ? node.strokes.find((paint) => paint && paint.visible !== false)
    : null;
  if (strokePaint && strokePaint.type && strokePaint.type.indexOf("GRADIENT_") === 0) {
    const gradientBorder = paintToCss(strokePaint);
    if (gradientBorder) visual.borderImage = `${gradientBorder} 1`;
  }

  const radius = borderRadiusCss(node);
  if (radius) visual.borderRadius = radius;

  const effects = effectsToCss(node.effects);
  if (effects.boxShadow) visual.boxShadow = effects.boxShadow;
  if (effects.filter) visual.filter = effects.filter;
  if (effects.backdropFilter) visual.backdropFilter = effects.backdropFilter;
  if (effects.webkitBackdropFilter) visual.webkitBackdropFilter = effects.webkitBackdropFilter;

  if (typeof node.opacity === "number" && node.opacity < 1) visual.opacity = node.opacity;
  if (typeof node.rotation === "number" && node.rotation !== 0) {
    visual.transform = `rotate(${Math.round(node.rotation * 100) / 100}deg)`;
  }
  const blend = blendModeCss(node.blendMode);
  if (blend) visual.mixBlendMode = blend;

  if (node.type === "TEXT" && out.text) {
    const text = out.text;
    const font = text.fontName || {};
    if (font.family) typography.fontFamily = font.family;
    if (font.style) {
      typography.fontStyle = /italic|oblique/i.test(font.style) ? "italic" : "normal";
      if (!text.fontWeight) {
        if (/semibold/i.test(font.style)) typography.fontWeight = 600;
        else if (/bold/i.test(font.style)) typography.fontWeight = 700;
        else if (/medium/i.test(font.style)) typography.fontWeight = 500;
        else if (/light/i.test(font.style)) typography.fontWeight = 300;
      }
    }
    if (typeof text.fontSize === "number") typography.fontSize = cssPx(text.fontSize);
    if (typeof text.fontWeight === "number") typography.fontWeight = text.fontWeight;
    const lh = lineHeightCss(text.lineHeight);
    if (lh) typography.lineHeight = lh;
    const ls = letterSpacingCss(text.letterSpacing);
    if (ls) typography.letterSpacing = ls;
    if (text.textAlignHorizontal) {
      typography.textAlign = {
        LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFIED: "justify"
      }[text.textAlignHorizontal] || String(text.textAlignHorizontal).toLowerCase();
    }
    if (text.textAlignVertical) {
      typography.verticalAlign = {
        TOP: "top", CENTER: "center", BOTTOM: "bottom"
      }[text.textAlignVertical] || String(text.textAlignVertical).toLowerCase();
    }
    if (text.textCase) {
      typography.textTransform = {
        UPPER: "uppercase", LOWER: "lowercase", TITLE: "capitalize", ORIGINAL: "none"
      }[text.textCase];
    }
    if (text.textDecoration && text.textDecoration !== "NONE") {
      typography.textDecoration = String(text.textDecoration).toLowerCase();
    }
    let textColor;
    if (fills.length) textColor = mostVisiblePaintColor(fills[0]);
    if (!textColor && Array.isArray(text.styledSegments)) {
      for (const segment of text.styledSegments) {
        if (!segment || !Array.isArray(segment.fills)) continue;
        const segmentFill = segment.fills.find((paint) => paint && paint.visible !== false);
        if (segmentFill) {
          textColor = mostVisiblePaintColor(segmentFill);
          if (textColor) break;
        }
      }
    }
    if (textColor) typography.color = textColor;
  }

  const assetHints = {};
  if (out.vectorAsset && out.vectorAsset.fileName) {
    assetHints.svg = out.vectorAsset.fileName;
    assetHints.png = out.vectorAsset.pngFileName;
    assetHints.preferred = "inline SVG or <img> using the exported SVG";
  }
  if (out.composedVectorAsset && out.composedVectorAsset.fileName) {
    assetHints.composedSvg = out.composedVectorAsset.fileName;
    assetHints.composedPng = out.composedVectorAsset.pngFileName;
    assetHints.preferred = "inline SVG or <img>; keep as one decorative graphic";
  }
  if (Array.isArray(out.imageAssets) && out.imageAssets.length) {
    assetHints.images = out.imageAssets.map((image) => {
      const scaleMode = image.scaleMode || "FILL";
      const objectFit = scaleMode === "FIT" ? "contain" : scaleMode === "TILE" ? "none" : "cover";
      return {
        ref: image.ref,
        file: image.fileName,
        png: image.pngFileName,
        fillIndex: image.fillIndex,
        imageHash: image.imageHash,
        scaleMode,
        imageTransform: image.imageTransform,
        suggestedObjectFit: objectFit,
        suggestedObjectPosition: image.imageTransform ? "center" : undefined,
        suggestedCss: scaleMode === "TILE"
          ? "background-repeat: repeat; background-size: auto;"
          : `object-fit: ${objectFit}; object-position: center;`,
        transformNote: image.imageTransform
          ? "Apply imageTransform for an exact crop; object-position center is only an approximation."
          : undefined
      };
    });
    assetHints.imageFillCount = out.imageAssets.length;
  }

  return compactObject({ layout, box, visual, typography, assetHints });
}

async function serializeNode(node, options, ctx, depth = 0, parent = null, siblingIndex = 0) {
  if (!options.includeHidden && "visible" in node && node.visible === false) return null;

  ctx.count += 1;
  if (ctx.count > options.maxNodes) {
    throw new Error("NODE_LIMIT");
  }

  // Periodically give Figma a chance to handle canvas input so the export
  // keeps running in the background instead of locking the editor.
  if (ctx.count % YIELD_EVERY_NODES === 0) {
    await yieldToFigma();
    if (ctx.onProgress) {
      try { ctx.onProgress(ctx.count); } catch (_) {}
    }
  }

  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
    depth,
    parentId: parent ? parent.id : null,
    path: parent ? `${parent.path} / ${node.name || node.type}` : String(node.name || node.type),
    siblingIndex,
    layoutStrategy: classifyLayoutStrategy(node)
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
    let childIndex = 0;
    for (const child of node.children) {
      const serialized = await serializeNode(child, options, ctx, depth + 1, out, childIndex++);
      if (serialized) children.push(serialized);
    }
    out.children = children;

    const composedVectorAsset = await extractComposedSvgAsset(node, options, ctx, children);
    if (composedVectorAsset) out.composedVectorAsset = composedVectorAsset;
  }

  if (options.resolveStyles) {
    const styleRefs = await resolveNodeStyleRefs(node);
    if (styleRefs) out.styleRefs = styleRefs;
  }

  out.css = buildNodeCss(node, out, parent);

  return out;
}

async function resolveVariables(variableIds) {
  const variables = {};
  const collections = {};
  let resolved = 0;

  for (const id of variableIds) {
    resolved += 1;
    if (resolved % 50 === 0) await yieldToFigma();
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

function topLevelScreens() {
  return Array.from(figma.currentPage.children || []).filter((node) =>
    node.type === "FRAME" ||
    node.type === "SECTION" ||
    node.type === "COMPONENT" ||
    node.type === "COMPONENT_SET"
  );
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
    pageFrameCount: topLevelScreens().length,
    items: nodes.map((n, i) => ({
      index: i + 1,
      id: n.id,
      name: n.name,
      type: n.type,
      width: "width" in n ? n.width : undefined,
      height: "height" in n ? n.height : undefined
    }))
  };
}

function createScreenContext(onProgress) {
  return {
    count: 0,
    variableIds: new Set(),
    assetManifestByRef: new Map(),
    assetFilesByRef: new Map(),
    rasterRefByHash: new Map(),
    rasterSequence: 1,
    assetBytes: 0,
    onProgress: typeof onProgress === "function" ? onProgress : null
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
  let lastProgressAt = 0;
  const ctx = createScreenContext((count) => {
    const now = Date.now();
    if (now - lastProgressAt < 700) return;
    lastProgressAt = now;
    figma.ui.postMessage({
      type: "status",
      message: `Screen ${packageContext.screenIndex} of ${packageContext.totalScreens} · reading ${count.toLocaleString()} layers — you can keep working in Figma`
    });
  });
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
    page: packageContext.page
      ? { id: packageContext.page.id, name: packageContext.page.name }
      : { id: figma.currentPage.id, name: figma.currentPage.name },
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



// ===== src/40-central.js =====

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


// ===== src/50-guides.js =====

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

  if (packageManifest.centralUi) {
    lines.push(
      "CENTRALIZED UI",
      "--------------",
      `Manifest: ${packageManifest.centralUi.manifest}`,
      `Components: ${packageManifest.centralUi.componentCount} (${packageManifest.centralUi.figmaComponents} Figma, ${packageManifest.centralUi.repeatedComponents} repeated)`,
      `Node index: ${packageManifest.nodeIndex}`,
      `Fonts: ${packageManifest.fonts.manifest}`,
      `Coverage: ${packageManifest.coverage.manifest}`,
      `Tokens: ${packageManifest.designTokens ? packageManifest.designTokens.css : "not included"}`,
      `Component index: ${packageManifest.componentIndex || "not included"}`,
      `Screen groups: ${packageManifest.screenGroups || "not included"}`,
      `Verification: ${packageManifest.verification && packageManifest.verification.enabled ? packageManifest.verification.folder : "disabled"}`,
      `Code generation: ${packageManifest.codeGeneration && packageManifest.codeGeneration.enabled ? packageManifest.codeGeneration.folder : "not generated"}`,
      `AI prompt: ${packageManifest.aiPrompt}`,
      `Per-screen AI docs: ${packageManifest.aiScreensFolder}`,
      "",
      "Build shared tokens/components once, then compose every screen from them.",
      ""
    );
  }

  if (packageManifest.sharedAssets && packageManifest.sharedAssets.assetCount) {
    lines.push(
      "SHARED ASSETS",
      "-------------",
      `Folder: ${packageManifest.sharedAssets.folder}`,
      `Manifest: ${packageManifest.sharedAssets.manifest}`,
      `Guide: ${packageManifest.sharedAssets.guide}`,
      `Identical files: ${packageManifest.sharedAssets.assetCount}`,
      "",
      "See FRONTEND_IMPLEMENTATION_GUIDE.md for the full build workflow.",
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



// ===== src/55-phase2-tokens.js =====

function tokenCssNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${Math.round(value * 100) / 100}px`;
}

function tokenFamilySlug(family) {
  return String(family || "font")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "font";
}

function shadowTokenValue(token) {
  const x = tokenCssNumber(token.x) || "0px";
  const y = tokenCssNumber(token.y) || "0px";
  const radius = tokenCssNumber(token.radius) || "0px";
  const spread = tokenCssNumber(token.spread) || "0px";
  const color = token.color || "rgba(0,0,0,0.15)";
  return `${token.type === "INNER_SHADOW" ? "inset " : ""}${x} ${y} ${radius} ${spread} ${color}`;
}

function createDesignTokenArtifacts(centralUi, generatedAt) {
  const tokens = centralUi.tokens;
  const lines = [":root{"];
  const colors = {};
  const spacing = {};
  const borderRadius = {};
  const boxShadow = {};
  const typography = {};
  const fontFamilies = {};

  for (const token of tokens.colors) {
    lines.push(`  --${token.id}: ${token.value};`);
    colors[token.id] = token.value;
  }

  for (const token of tokens.spacing) {
    const value = tokenCssNumber(token.value);
    if (!value) continue;
    lines.push(`  --${token.id}: ${value};`);
    spacing[token.id] = value;
  }

  for (const token of tokens.radii) {
    const value = tokenCssNumber(token.value);
    if (!value) continue;
    lines.push(`  --${token.id}: ${value};`);
    borderRadius[token.id] = value;
  }

  for (const token of tokens.shadows) {
    const value = shadowTokenValue(token);
    lines.push(`  --${token.id}: ${value};`);
    boxShadow[token.id] = value;
  }

  for (const token of tokens.gradients) {
    const value = paintToCss({ type: token.type, gradientStops: token.stops });
    if (!value) continue;
    lines.push(`  --${token.id}: ${value};`);
  }

  for (const token of tokens.typography) {
    const fontFamily = token.fontFamily || "Inter";
    const fontSize = token.fontSize;
    const lineHeight = lineHeightCss(token.lineHeight);
    const letterSpacing = letterSpacingCss(token.letterSpacing);
    lines.push(`  --${token.id}-font-family: "${fontFamily}";`);
    if (typeof fontSize === "number") lines.push(`  --${token.id}-font-size: ${fontSize}px;`);
    if (typeof token.fontWeight === "number") lines.push(`  --${token.id}-font-weight: ${token.fontWeight};`);
    if (lineHeight) lines.push(`  --${token.id}-line-height: ${lineHeight};`);
    if (letterSpacing) lines.push(`  --${token.id}-letter-spacing: ${letterSpacing};`);
    fontFamilies[tokenFamilySlug(fontFamily)] = [fontFamily, "ui-sans-serif", "system-ui", "sans-serif"];
    typography[token.id] = [
      typeof fontSize === "number" ? `${fontSize}px` : "inherit",
      {
        lineHeight: lineHeight || "normal",
        letterSpacing: letterSpacing || "normal",
        fontWeight: typeof token.fontWeight === "number" ? String(token.fontWeight) : "400"
      }
    ];
  }

  for (const style of tokens.namedStyles) {
    if (style.type !== "PAINT" || !Array.isArray(style.paints)) continue;
    const solid = style.paints.find((paint) => paint && paint.type === "SOLID" && paint.hex);
    if (!solid) continue;
    const key = `semantic-${String(style.name || "color").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    colors[key] = solid.hex;
    lines.push(`  --${key}: ${solid.hex};`);
  }

  lines.push("}");

  const tokenJson = {
    schema: "dev-export-design-tokens",
    schemaVersion: "1.0.0",
    generatedAt,
    counts: tokens.counts,
    tokens
  };

  const tailwindConfig = {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue,svelte}"],
    theme: {
      extend: {
        colors,
        spacing,
        borderRadius,
        boxShadow,
        fontFamily: fontFamilies,
        fontSize: typography
      }
    },
    plugins: []
  };

  return {
    json: tokenJson,
    css: lines.join("\n") + "\n",
    tailwind: "// Generated by Dev Export for Figma\nmodule.exports = " + JSON.stringify(tailwindConfig, null, 2) + ";\n"
  };
}

function collectVariantAxes(usages) {
  const axes = {};
  for (const usage of usages || []) {
    const variants = usage.variantProperties;
    if (!variants || typeof variants !== "object") continue;
    for (const [key, value] of Object.entries(variants)) {
      if (!axes[key]) axes[key] = [];
      if (axes[key].indexOf(value) < 0) axes[key].push(value);
    }
  }
  return axes;
}

function createComponentIndex(centralUi, generatedAt) {
  const bySource = { "figma-component": [], "repeated-structure": [] };
  const byScreen = {};

  for (const component of centralUi.components) {
    if (!bySource[component.source]) bySource[component.source] = [];
    bySource[component.source].push(component.id);
    for (const screen of component.screens || []) {
      if (!byScreen[screen.index]) byScreen[screen.index] = { screen, components: [] };
      byScreen[screen.index].components.push(component.id);
    }
  }

  return {
    schema: "dev-export-component-index",
    schemaVersion: "1.0.0",
    generatedAt,
    stats: centralUi.stats,
    bySource,
    byScreen,
    components: centralUi.components.map((component) => ({
      ...component,
      variantAxes: collectVariantAxes(component.usages)
    }))
  };
}

function screenDeviceLabel(width) {
  if (typeof width !== "number") return "unknown";
  if (width <= 480) return "mobile";
  if (width <= 834) return "tablet";
  if (width <= 1280) return "desktop";
  return "wide";
}

function normalizeScreenGroupName(name) {
  const value = String(name || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(mobile|tablet|desktop|laptop|phone|wide|dark|light|copy|final|variant|version|v\d+)\b/gi, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return value || "screens";
}

function createScreenGroups(screenRecords, generatedAt) {
  const dimensions = new Map();
  const byName = new Map();
  const widths = new Set();

  for (const record of screenRecords) {
    const root = record.design.nodes && record.design.nodes[0];
    const width = root && typeof root.width === "number" ? root.width : null;
    const height = root && typeof root.height === "number" ? root.height : null;
    const key = `${width === null ? "?" : width}x${height === null ? "?" : height}`;
    if (!dimensions.has(key)) {
      dimensions.set(key, {
        key,
        width,
        height,
        device: screenDeviceLabel(width),
        screens: []
      });
    }
    dimensions.get(key).screens.push({
      index: record.index,
      name: record.name,
      folder: record.screenFolder,
      json: record.designPath
    });
    if (typeof width === "number") widths.add(width);

    const nameKey = normalizeScreenGroupName(record.name).toLowerCase();
    if (!byName.has(nameKey)) byName.set(nameKey, { key: nameKey, screens: [] });
    byName.get(nameKey).screens.push({
      index: record.index,
      name: record.name,
      width,
      height
    });
  }

  return {
    schema: "dev-export-screen-groups",
    schemaVersion: "1.0.0",
    generatedAt,
    note: "Groups are inferred from frame dimensions and screen names. Use them to plan breakpoints and variants.",
    suggestedBreakpoints: Array.from(widths).sort((a, b) => a - b),
    dimensions: Array.from(dimensions.values()).sort((a, b) => (a.width || 0) - (b.width || 0)),
    byName: Array.from(byName.values()).filter((group) => group.screens.length > 1)
  };
}


// ===== src/57-logical-screens.js =====

const SCREEN_STATE_WORDS = new Set([
  "loading", "skeleton", "empty", "error", "success", "data", "loaded",
  "default", "offline", "retry", "idle", "active", "hover", "pressed",
  "disabled", "selected", "unselected", "expanded", "collapsed", "no data",
  "no results", "not found", "404", "500"
]);

function variantTokenInfo(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return null;
  for (const word of SCREEN_STATE_WORDS) {
    if (token === word || token.indexOf(word + " ") === 0 || token.lastIndexOf(" " + word) === token.length - word.length - 1) {
      return { type: "state", name: word.replace(/\b\w/g, (c) => c.toUpperCase()) };
    }
  }
  const tab = token.match(/^tab(?:\s*[-_ ]?\s*(.+))?$/i);
  if (tab) {
    return {
      type: "tab",
      name: tab[1] ? `Tab ${tab[1]}` : "Tab"
    };
  }
  return null;
}

function parseScreenVariantName(name) {
  const original = String(name || "").trim();
  if (!original) return { baseName: "Screen", variantType: "default", variantName: "Default" };

  const parenthetical = original.match(/^(.*?)[\s]*[\(\[\{]([^)\]\}]+)[\)\]\}]\s*$/);
  if (parenthetical) {
    const info = variantTokenInfo(parenthetical[2]);
    if (info && parenthetical[1].trim()) {
      return { baseName: parenthetical[1].trim(), variantType: info.type, variantName: info.name };
    }
  }

  const separated = original.match(/^(.*?)\s*[\/\-_|:]\s*([^\/\-_|:]+?)\s*$/);
  if (separated) {
    const info = variantTokenInfo(separated[2]);
    if (info && separated[1].trim()) {
      return { baseName: separated[1].trim(), variantType: info.type, variantName: info.name };
    }
    if (/\btab\s*$/i.test(separated[1]) && separated[1].replace(/\s*tab\s*$/i, "").trim()) {
      return {
        baseName: separated[1].replace(/\s*tab\s*$/i, "").trim(),
        variantType: "tab",
        variantName: `Tab ${separated[2].trim()}`
      };
    }
  }

  const lastWord = original.match(/^(.*?)\s+([^\s]+)\s*$/);
  if (lastWord) {
    const info = variantTokenInfo(lastWord[2]);
    if (info && lastWord[1].trim()) {
      return { baseName: lastWord[1].trim(), variantType: info.type, variantName: info.name };
    }
  }

  return { baseName: original, variantType: "default", variantName: "Default" };
}

function logicalScreenKey(baseName, width, height) {
  return [
    String(baseName || "screen").toLowerCase().replace(/\s+/g, " ").trim(),
    Math.round(Number(width) || 0),
    Math.round(Number(height) || 0)
  ].join("|");
}

function buildLogicalScreens(screenRecords) {
  const groups = new Map();

  for (const record of screenRecords) {
    const root = record.design.nodes && record.design.nodes[0];
    const width = root && typeof root.width === "number" ? root.width : 0;
    const height = root && typeof root.height === "number" ? root.height : 0;
    const parsed = parseScreenVariantName(record.name);
    const key = logicalScreenKey(parsed.baseName, width, height);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: parsed.baseName,
        width,
        height,
        variants: []
      });
    }
    groups.get(key).variants.push({
      record,
      variantType: parsed.variantType,
      variantName: parsed.variantName,
      width,
      height
    });
  }

  const logicalScreens = [];
  for (const group of groups.values()) {
    const order = { state: 0, tab: 1, default: 2 };
    group.variants.sort((a, b) => {
      if (a.variantType === "default" && b.variantType !== "default") return -1;
      if (b.variantType === "default" && a.variantType !== "default") return 1;
      const typeDiff = (order[a.variantType] || 9) - (order[b.variantType] || 9);
      if (typeDiff !== 0) return typeDiff;
      return a.record.index - b.record.index;
    });

    const id = `logical-${hashString(`${group.name}|${group.width}x${group.height}`).slice(0, 10)}`;
    const variants = group.variants.map((variant, index) => ({
      ...variant,
      isDefault: index === 0
    }));

    for (const variant of variants) {
      variant.record.design.logicalScreen = {
        id,
        name: group.name,
        width: group.width,
        height: group.height,
        variantType: variant.variantType,
        variantName: variant.variantName,
        isDefault: variant.isDefault,
        variantCount: variants.length
      };
    }

    logicalScreens.push({
      id,
      name: group.name,
      width: group.width,
      height: group.height,
      variants,
      hasMultipleVariants: variants.length > 1,
      variantTypes: Array.from(new Set(variants.map((variant) => variant.variantType)))
    });
  }

  logicalScreens.sort((a, b) => (a.variants[0]?.record.index || 0) - (b.variants[0]?.record.index || 0));
  return logicalScreens;
}

function createScreenVariantsManifest(logicalScreens, generatedAt) {
  return {
    schema: "dev-export-screen-variants",
    schemaVersion: "1.0.0",
    generatedAt,
    note: "Screens that are states or tabs of the same logical screen are grouped here. Code generation creates one screen with variant handling instead of duplicate screens.",
    logicalScreenCount: logicalScreens.length,
    variantScreenCount: logicalScreens.reduce((sum, screen) => sum + screen.variants.length, 0),
    screens: logicalScreens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      width: screen.width,
      height: screen.height,
      variantTypes: screen.variantTypes,
      variants: screen.variants.map((variant) => ({
        screenIndex: variant.record.index,
        screenName: variant.record.name,
        variantType: variant.variantType,
        variantName: variant.variantName,
        isDefault: variant.isDefault,
        folder: variant.record.screenFolder,
        json: variant.record.designPath,
        preview: variant.record.preview || null
      }))
    }))
  };
}


// ===== src/65-phase3-verify.js =====

function verificationSlug(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function createVerificationHarness(screenRecords, files, generatedAt) {
  const screens = [];
  const outputFiles = [];

  for (const record of screenRecords) {
    const root = record.design.nodes && record.design.nodes[0];
    const slug = verificationSlug(record.name, `screen-${record.index}`);
    const expectedName = `${String(record.index).padStart(2, "0")}_${slug}.png`;
    const expectedPath = `verify/expected/${expectedName}`;
    const previewFile = record.preview
      ? files.find((file) => file.fileName === record.preview)
      : null;
    const expected1xName = `${String(record.index).padStart(2, "0")}_${slug}.png`;
    const expected1xPath = `verify/expected1x/${expected1xName}`;
    const preview1xFile = record.preview1x
      ? files.find((file) => file.fileName === record.preview1x)
      : null;

    if (previewFile) {
      outputFiles.push({
        fileName: expectedPath,
        mime: "image/png",
        bytes: previewFile.bytes
      });
    }
    if (preview1xFile) {
      outputFiles.push({
        fileName: expected1xPath,
        mime: "image/png",
        bytes: preview1xFile.bytes
      });
    }

    screens.push({
      index: record.index,
      name: record.name,
      slug,
      route: `/${slug}`,
      width: root && typeof root.width === "number" ? root.width : 0,
      height: root && typeof root.height === "number" ? root.height : 0,
      json: record.designPath,
      expected: previewFile ? expectedPath : null,
      expected1x: preview1xFile ? expected1xPath : null,
      actual: `verify/actual/${expectedName}`,
      diff: `verify/diff/${expectedName}`
    });
  }

  const manifest = {
    schema: "dev-export-verification",
    schemaVersion: "1.0.0",
    generatedAt,
    note: "Render each route at the screen size @2x, then run npm run verify. Set BASE_URL for your dev server.",
    threshold: 0.02,
    screens
  };

  outputFiles.push({
    fileName: "verify/expected/manifest.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(manifest, null, 2))
  });

  outputFiles.push({
    fileName: "verify/package.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify({
      name: "dev-export-verify",
      private: true,
      type: "module",
      scripts: {
        verify: "node compare.mjs"
      },
      devDependencies: {
        playwright: "^1.49.0",
        pixelmatch: "^5.3.0",
        pngjs: "^7.0.0"
      }
    }, null, 2))
  });

  outputFiles.push({
    fileName: "verify/playwright.config.js",
    mime: "text/javascript",
    bytes: utf8Encode([
      "/** Playwright config used by compare.mjs if you extend it. */",
      "export default {",
      "  timeout: 60000,",
      "  use: {",
      "    deviceScaleFactor: 2,",
      "    headless: true",
      "  }",
      "};",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "verify/compare.mjs",
    mime: "text/javascript",
    bytes: utf8Encode([
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import { chromium } from 'playwright';",
      "import pixelmatch from 'pixelmatch';",
      "import { PNG } from 'pngjs';",
      "",
      "const root = path.dirname(fileURLToPath(import.meta.url));",
      "const manifest = JSON.parse(fs.readFileSync(path.join(root, 'expected', 'manifest.json'), 'utf8'));",
      "const baseUrl = process.env.BASE_URL || 'http://localhost:5173';",
      "const routePrefix = process.env.ROUTE_PREFIX || '';",
      "const only = process.env.SCREEN || '';",
      "const threshold = Number(process.env.THRESHOLD || manifest.threshold || 0.02);",
      "",
      "fs.mkdirSync(path.join(root, 'actual'), { recursive: true });",
      "fs.mkdirSync(path.join(root, 'diff'), { recursive: true });",
      "",
      "function readPng(file) {",
      "  return PNG.sync.read(fs.readFileSync(file));",
      "}",
      "",
      "function comparePng(expectedFile, actualFile, diffFile) {",
      "  const expected = readPng(expectedFile);",
      "  const actual = readPng(actualFile);",
      "  if (expected.width !== actual.width || expected.height !== actual.height) {",
      "    return { ok: false, reason: 'size-mismatch', expected: [expected.width, expected.height], actual: [actual.width, actual.height] };",
      "  }",
      "  const diff = new PNG({ width: expected.width, height: expected.height });",
      "  const mismatched = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0.1 });",
      "  fs.writeFileSync(diffFile, PNG.sync.write(diff));",
      "  const ratio = mismatched / (expected.width * expected.height);",
      "  return { ok: ratio <= threshold, mismatched, ratio: Number(ratio.toFixed(5)), expected: [expected.width, expected.height] };",
      "}",
      "",
      "const browser = await chromium.launch({ headless: true });",
      "const report = { generatedAt: new Date().toISOString(), baseUrl, threshold, screens: [] };",
      "let failures = 0;",
      "",
      "for (const screen of manifest.screens) {",
      "  if (only && screen.slug !== only) continue;",
      "  if (!screen.expected) {",
      "    report.screens.push({ index: screen.index, name: screen.name, status: 'skipped', reason: 'no expected preview' });",
      "    continue;",
      "  }",
      "  const url = baseUrl + routePrefix + screen.route;",
      "  const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 2 });",
      "  try {",
      "    await page.goto(url, { waitUntil: 'networkidle' });",
      "    const actualFile = path.join(root, 'actual', path.basename(screen.expected));",
      "    await page.screenshot({ path: actualFile, fullPage: false });",
      "    const diffFile = path.join(root, 'diff', path.basename(screen.expected));",
      "    const result = comparePng(path.join(root, 'expected', path.basename(screen.expected)), actualFile, diffFile);",
      "    if (!result.ok) failures += 1;",
      "    report.screens.push({ index: screen.index, name: screen.name, url, status: result.ok ? 'pass' : 'fail', ...result });",
      "    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${screen.index}. ${screen.name} (${(result.ratio * 100 || 0).toFixed(2)}% pixels, ${result.reason || 'pixel-diff'})`);",
      "  } catch (error) {",
      "    failures += 1;",
      "    report.screens.push({ index: screen.index, name: screen.name, url, status: 'error', error: String(error && error.message ? error.message : error) });",
      "    console.error(`ERROR ${screen.index}. ${screen.name}:`, error && error.message ? error.message : error);",
      "  } finally {",
      "    await page.close();",
      "  }",
      "}",
      "",
      "await browser.close();",
      "fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));",
      "console.log(`Report: ${path.join(root, 'report.json')}`);",
      "if (failures > 0) process.exit(1);",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "verify/README.md",
    mime: "text/markdown",
    bytes: utf8Encode([
      "# Visual Verification",
      "",
      "This folder contains the expected @2x screen previews and a Playwright comparator.",
      "",
      "## Run",
      "",
      "```bash",
      "cd verify",
      "npm install",
      "BASE_URL=http://localhost:5173 npm run verify",
      "```",
      "",
      "- `BASE_URL` points at your running app.",
      "- Each screen is loaded from `route` in `expected/manifest.json` (`/{slug}` by default).",
      "- `ROUTE_PREFIX` is optional if your app is mounted under a subpath.",
      "- `SCREEN=home npm run verify` checks one screen.",
      "- `THRESHOLD=0.01 npm run verify` tightens the diff threshold.",
      "",
      "Outputs:",
      "",
      "- `actual/` — new screenshots",
      "- `diff/` — pixel diff images",
      "- `report.json` — pass/fail and pixel ratios",
      "",
      "For HTML/CSS, you can use `BASE_URL=file:///absolute/path/to/html-css` and a route like `/{file}` after editing the manifest.",
      "",
      "For Flutter, use the expected previews as golden reference images in a Flutter golden test; the Playwright script targets web builds.",
      ""
    ].join("\n"))
  });

  return { manifest, files: outputFiles };
}


// ===== src/68-flutter-template.js =====

const FLUTTER_TEMPLATE = {
  root: "code/flutter",
  projectName: "dev_export_flutter",
  layoutMode: "absolute",
  assetDir: "assets/package-assets",
  goldenDir: "test/goldens",
  filePaths: {
    main: "lib/main.dart",
    appShell: "lib/ui/app_shell.dart",
    routes: "lib/ui/routes.dart",
    tokens: "lib/ui/tokens.dart",
    colors: "lib/ui/colors.dart",
    core: "lib/ui/core.dart",
    gallery: "lib/dev/variant_gallery.dart",
    pubspec: "pubspec.yaml",
    readme: "README.md",
    conventions: "CONVENTIONS.md",
    goldenTest: "test/golden_test.dart"
  },
  dirs: {
    screens: "lib/screens",
    components: "lib/ui/components",
    dev: "lib/dev",
    test: "test/goldens"
  },
  structure: {
    centralized: {
      dirs: ["lib/screens", "lib/ui/components", "lib/ui", "lib/dev", "test/goldens"],
      files: ["pubspec.yaml", "README.md", "CONVENTIONS.md", "lib/main.dart", "lib/ui/app_shell.dart", "lib/ui/routes.dart", "lib/ui/colors.dart", "lib/ui/core.dart", "lib/ui/tokens.dart", "lib/dev/variant_gallery.dart", "test/golden_test.dart"]
    },
    standalone: {
      dirs: ["lib/screens", "lib/dev", "test/goldens"],
      files: ["pubspec.yaml", "README.md", "CONVENTIONS.md", "lib/main.dart", "lib/ui/app_shell.dart", "lib/ui/routes.dart", "lib/dev/variant_gallery.dart", "test/golden_test.dart"]
    }
  },
  rules: [
    "Screens use exact frame width/height and keep their layout strategy (flex or absolute).",
    "Colors, gradients, borders, radii, shadows, opacity and rotation come from node.css.",
    "Text keeps family, size, weight, line height, letter spacing, alignment, decoration and case.",
    "SVG assets use SvgPicture.asset; raster assets use Image.asset.",
    "Logical screens keep states/tabs as variants; never duplicate the screen widget.",
    "Routing is generated as named routes plus a variant gallery.",
    "Centralized mode generates shared widgets and theme files.",
    "Standalone mode writes everything inline in the screen file."
  ]
};

function flutterTemplatePubspec() {
  return [
    `name: ${FLUTTER_TEMPLATE.projectName}`,
    "description: Starter generated from a Dev Export package",
    "publish_to: 'none'",
    "version: 0.1.0",
    "environment:",
    "  sdk: '>=3.4.0 <4.0.0'",
    "dependencies:",
    "  flutter:",
    "    sdk: flutter",
    "  flutter_svg: ^2.0.10",
    "dev_dependencies:",
    "  flutter_test:",
    "    sdk: flutter",
    "flutter:",
    "  uses-material-design: true",
    "  assets:",
    `    - ${FLUTTER_TEMPLATE.assetDir}/`,
    "  # For pixel-perfect text add your font files and declare them here:",
    "  # fonts:",
    "  #   - family: Inter",
    "  #     fonts:",
    "  #       - asset: assets/fonts/Inter-Regular.ttf",
    ""
  ].join("\n");
}

function flutterTemplateReadme(centralized, fontFamilies, screenCount) {
  return [
    "# Flutter Starter",
    "",
    "```bash",
    "cd code/flutter",
    "flutter pub get",
    "flutter run",
    "```",
    "",
    `Generated screens: ${screenCount}`,
    `Architecture: ${centralized ? "centralized UI" : "standalone screens"}`,
    "",
    "## Structure",
    "",
    centralized
      ? "- `lib/ui/components` — shared widgets generated from the centralized UI model."
      : "- Screens are self-contained. Colors, shadows and styles are inline in each screen.",
    centralized
      ? "- `lib/ui/tokens.dart` — generated color, spacing and radius constants."
      : "- No shared token or widget files are generated in standalone mode.",
    "- `lib/screens` — one screen per logical screen, with state/tab variants.",
    "- `lib/dev/variant_gallery.dart` — browse every screen and variant.",
    "- `lib/ui/app_shell.dart` — routing drawer; ignored by the rendered frame.",
    "- `test/goldens` — expected Figma previews for golden comparison.",
    "",
    "## Fonts",
    "",
    `Families used: ${fontFamilies.length ? fontFamilies.join(", ") : "system fonts"}.`,
    "Add TTF/OTF files under `assets/fonts/` and declare them in `pubspec.yaml` for pixel-perfect text.",
    "See `fonts.json` in the package root for styles, weights and samples.",
    "",
    "## Rules",
    "",
    ...FLUTTER_TEMPLATE.rules.map((rule) => `- ${rule}`),
    ""
  ].join("\n");
}

function flutterTemplateConventions(centralized) {
  return [
    "# Flutter Conventions",
    "",
    `Mode: ${centralized ? "centralized UI" : "standalone screens"}`,
    "",
    "## Layout",
    "",
    "- Auto layout becomes Row/Column with gap, padding, main and cross alignment.",
    "- Freeform children become Stack + Positioned with exact left/top.",
    "- FILL becomes double.infinity or flex; HUG becomes intrinsic sizing.",
    "- The screen frame keeps its exact width and height.",
    "",
    "## Styling",
    "",
    "- Backgrounds support solid colors and linear/radial/sweep gradients.",
    "- Borders, per-corner radii, box shadows, opacity and rotation are translated.",
    "- Clip behavior follows `overflow: hidden`.",
    "",
    "## Text",
    "",
    "- Width/height are preserved so wrapping stays faithful.",
    "- Font family, size, weight, line height, letter spacing, alignment, decoration and case are kept.",
    "- Add the TTF/OTF files to make text truly pixel-perfect.",
    "",
    "## Assets",
    "",
    "- SVG uses flutter_svg; raster uses Image.asset.",
    "- Assets are copied under assets/package-assets.",
    "",
    "## Variants",
    "",
    "- One screen widget per logical screen.",
    "- States and tabs are a variant list, selected by initialVariant.",
    "- The variant gallery exposes every variant without changing the rendered frame.",
    "",
    "## Verification",
    "",
    "- Goldens are copied from Figma previews.",
    "- Use flutter test to compare every variant.",
    ""
  ].join("\n");
}

function flutterTemplateAppShell(routeLabels, galleryRoute) {
  return [
    "import 'package:flutter/material.dart';",
    "import 'routes.dart';",
    "",
    "class AppShell extends StatelessWidget {",
    "  final String title;",
    "  final double width;",
    "  final double height;",
    "  final Widget child;",
    "  final Widget? floatingActionButton;",
    "",
    "  const AppShell({super.key, required this.title, required this.width, required this.height, required this.child, this.floatingActionButton});",
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    "    return Scaffold(",
    "      backgroundColor: Colors.white,",
  "      floatingActionButton: floatingActionButton,",
    "      drawer: Drawer(",
    "        child: SafeArea(",
    "          child: ListView(",
    "            children: [",
    "              DrawerHeader(child: Align(alignment: Alignment.centerLeft, child: Text(title))),",
    "              for (final entry in appRouteLabels.entries)",
    "                ListTile(",
    "                  title: Text(entry.value),",
    "                  onTap: () {",
    "                    Navigator.pop(context);",
    "                    final current = ModalRoute.of(context)?.settings.name;",
    "                    if (current != entry.key) {",
    "                      Navigator.pushReplacementNamed(context, entry.key);",
    "                    }",
    "                  },",
    "                ),",
    "              ListTile(",
    "                leading: const Icon(Icons.view_carousel_outlined),",
    "                title: const Text('Screens & variants'),",
    "                onTap: () {",
    "                  Navigator.pop(context);",
    `                  Navigator.pushReplacementNamed(context, '${galleryRoute}');`,
    "                },",
    "              ),",
    "            ],",
    "          ),",
    "        ),",
    "      ),",
      "      body: SingleChildScrollView(",
      "        child: Center(",
      "          child: SizedBox(",
      "            width: width,",
      "            height: height,",
      "            child: child,",
      "          ),",
      "        ),",
      "      ),",
    "    );",
    "  }",
    "}",
    ""
  ].join("\n");
}

function flutterTemplateRoutes(routeLabels) {
  return [
    "const Map<String, String> appRouteLabels = {",
    routeLabels.join("\n"),
    "};",
    ""
  ].join("\n");
}

function flutterTemplateMain(imports, routeEntries, initialRoute) {
  return [
    "import 'package:flutter/material.dart';",
    ...imports,
    "",
    "void main() => runApp(const DevExportApp());",
    "",
    "class DevExportApp extends StatelessWidget {",
    "  const DevExportApp({super.key});",
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    "    return MaterialApp(",
    "      debugShowCheckedModeBanner: false,",
    "      title: 'Dev Export',",
    `      initialRoute: '${initialRoute}',`,
    "      routes: {",
    ...routeEntries,
    "      },",
    "    );",
    "  }",
    "}",
    ""
  ].join("\n");
}

function flutterTemplateGallery(imports, items) {
  return [
    "import 'package:flutter/material.dart';",
    ...imports,
    "",
    "class VariantGallery extends StatelessWidget {",
    "  const VariantGallery({super.key});",
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    "    return Scaffold(",
    "      appBar: AppBar(title: const Text('Screens & variants')),",
    "      body: ListView(",
    "        children: [",
    ...items,
    "        ],",
    "      ),",
    "    );",
    "  }",
    "}",
    ""
  ].join("\n");
}

function flutterTemplateGoldenTest(imports, tests) {
  return [
    "import 'package:flutter/material.dart';",
    "import 'package:flutter_test/flutter_test.dart';",
    ...imports,
    "",
    "void main() {",
    ...tests,
    "}",
    ""
  ].join("\n");
}


// ===== src/70-phase4-codegen.js =====

function codeSlug(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function codePascal(value, fallback) {
  const text = String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  const pascal = text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return pascal || fallback;
}

function collectNodeMap(screenRecords) {
  const map = new Map();
  for (const record of screenRecords) {
    walkNodes(record.design.nodes, (node) => map.set(node.id, { node, record }));
  }
  return map;
}

function collectTextNodes(node, list) {
  if (!node) return list;
  if (node.text) list.push(node);
  for (const child of node.children || []) collectTextNodes(child, list);
  return list;
}

function packageAssetPath(screenFolder, assetPath) {
  const value = String(assetPath || "");
  if (!value) return "";
  if (value.indexOf("../../shared/") === 0) return value.slice(6);
  if (value.indexOf("shared/") === 0) return value;
  const prefix = screenFolder.indexOf("screens/") === 0 ? screenFolder : `screens/${screenFolder}`;
  return `${prefix}/${value}`;
}

function targetAssetBase(target) {
  if (target === "react") return "code/react/public/package-assets/";
  if (target === "flutter") return "code/flutter/assets/package-assets/";
  return "code/html-css/package-assets/";
}

function targetAssetUrl(target, packagePath) {
  if (target === "react") return `/package-assets/${packagePath}`;
  if (target === "flutter") return `assets/package-assets/${packagePath}`;
  return `../package-assets/${packagePath}`;
}

function collectCodeAssets(target, files) {
  const base = targetAssetBase(target);
  const copied = [];
  for (const file of files) {
    const name = file.fileName;
    const isScreenAsset = name.indexOf("screens/") === 0 && name.indexOf("/assets/") >= 0;
    const isSharedAsset = name.indexOf("shared/assets/") === 0;
    if (!isScreenAsset && !isSharedAsset) continue;
    copied.push({
      fileName: base + name,
      mime: file.mime,
      bytes: file.bytes
    });
  }
  return copied;
}

function pickAssetForNode(node, target) {
  const hints = node.css && node.css.assetHints ? node.css.assetHints : (node.assetHints || {});
  if (Array.isArray(hints.images) && hints.images.length) {
    const image = hints.images[0];
    const file = image.file || image.png || "";
    return {
      path: packageAssetPath(node.__screenFolder || "", file),
      fit: image.suggestedObjectFit || "cover",
      alt: node.name || "image"
    };
  }
  if (hints.svg) {
    return {
      path: packageAssetPath(node.__screenFolder || "", hints.svg),
      fit: "contain",
      alt: node.name || "graphic"
    };
  }
  if (hints.composedSvg) {
    return {
      path: packageAssetPath(node.__screenFolder || "", hints.composedSvg),
      fit: "contain",
      alt: node.name || "graphic"
    };
  }
  return null;
}

function buildComponentDefinitions(centralUi, screenRecords, nodeMap, target) {
  const definitions = new Map();

  for (const component of centralUi.components) {
    const sample = component.sample;
    if (!sample) continue;
    const found = nodeMap.get(sample.nodeId);
    if (!found) continue;

    const textNodes = collectTextNodes(found.node, []);
    const textProps = new Map();
    textNodes.forEach((node, index) => textProps.set(node.id, `text${index + 1}`));

    const context = {
      target,
      screenFolder: found.record.screenFolder,
      componentsById: definitions,
      isComponentDefinition: true,
      textProps
    };

    const plan = buildCodePlan(found.node, context);
    const safeName = codePascal(component.name, `Component${definitions.size + 1}`) + "View";
    definitions.set(component.id, {
      id: component.id,
      name: component.name,
      safeName,
      plan,
      textProps,
      sampleNodeId: sample.nodeId,
      source: component.source,
      confidence: component.confidence
    });
  }

  return definitions;
}

function collectTextValues(node, list) {
  if (!node) return list;
  if (node.text) list.push(node.text.characters || "");
  for (const child of node.children || []) collectTextValues(child, list);
  return list;
}

function componentPropsForNode(definition, node) {
  if (!definition) return {};
  const values = collectTextValues(node, []);
  const props = {};
  let index = 0;
  for (const propName of definition.textProps.values()) {
    props[propName] = values[index++] || "";
  }
  return props;
}

function buildCodePlan(node, context, parentNode) {
  const annotated = Object.assign({}, node, { __screenFolder: context.screenFolder });

  if (!context.isComponentDefinition && node.componentRef) {
    const definition = context.componentsById.get(node.componentRef.id);
    if (definition && definition.plan) {
      return {
        kind: "component",
        definition,
        props: componentPropsForNode(definition, node),
        css: node.css,
        path: node.path,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      };
    }
  }

  if (node.text) {
    return {
      kind: "text",
      text: node.text.characters || "",
      textProp: context.textProps ? context.textProps.get(node.id) : undefined,
      css: node.css,
      path: node.path,
      width: node.width,
      height: node.height
    };
  }

  const asset = pickAssetForNode(annotated, context.target);
  if (asset && (!node.children || !node.children.length)) {
    return {
      kind: "asset",
      asset,
      css: node.css,
      path: node.path,
      width: node.width,
      height: node.height
    };
  }

  const parentWidth = parentNode && typeof parentNode.width === "number" ? parentNode.width : null;
  const nodeWidth = typeof node.width === "number" ? node.width : null;
  const looksScrollable = /(tab|carousel|slider|chip|filter|scroll)/i.test(String(node.name || ""));
  const scrollX = node.layoutMode === "HORIZONTAL" && (
    (parentWidth !== null && nodeWidth !== null && nodeWidth > parentWidth + 4) ||
    (looksScrollable && Array.isArray(node.children) && node.children.length > 3)
  );

  return {
    kind: "box",
    css: node.css,
    children: (node.children || []).map((child) => buildCodePlan(child, context, node)),
    path: node.path,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    scrollX
  };
}

function flattenCss(css, prefix, output) {
  if (!css || typeof css !== "object") return output;
  for (const [key, value] of Object.entries(css)) {
    if (key === "assetHints") continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      flattenCss(value, prefix, output);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function cssToDeclarations(css) {
  const flat = flattenCss(css, "", {});
  return Object.entries(flat)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${value}`)
    .join(";");
}

function cssToStyleObject(css) {
  const flat = flattenCss(css, "", {});
  delete flat.webkitBackdropFilter;
  return flat;
}

function escapeHtmlText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsxText(value) {
  return JSON.stringify(String(value == null ? "" : value));
}

function renderHtmlPlan(plan, context, textOverrides) {
  if (!plan) return "";
  const style = cssToDeclarations(plan.css);
  const styleAttr = style ? ` style="${style}"` : "";

  if (plan.kind === "component") {
    return renderHtmlPlan(plan.definition.plan, context, plan.props);
  }
  if (plan.kind === "text") {
    const value = textOverrides && plan.textProp && textOverrides[plan.textProp] !== undefined
      ? textOverrides[plan.textProp]
      : plan.text;
    return `<span${styleAttr}>${escapeHtmlText(value)}</span>`;
  }
  if (plan.kind === "asset") {
    const src = targetAssetUrl("html-css", plan.asset.path);
    const fit = plan.asset.fit || "contain";
    const objectFit = `object-fit:${fit}`;
    const merged = (style ? style + ";" : "") + objectFit;
    return `<img src="${src}" alt="${escapeHtmlText(plan.asset.alt)}" style="${merged}">`;
  }
  const children = (plan.children || []).map((child) => renderHtmlPlan(child, context, textOverrides)).join("");
  return `<div${styleAttr}>${children}</div>`;
}

function createHtmlCssCode(target, screenPlans, assetFiles, tokenArtifacts, generatedAt, centralizedUi) {
  const outputFiles = assetFiles.slice();
  const nav = [];

  for (const screen of screenPlans) {
    const body = renderHtmlPlan(screen.plan, { target }, null);
    nav.push(`<li><a href="screens/${screen.fileBase}.html">${escapeHtmlText(screen.name)}</a></li>`);
    outputFiles.push({
      fileName: `code/html-css/screens/${screen.fileBase}.html`,
      mime: "text/html",
      bytes: utf8Encode([
        "<!doctype html>",
        "<html><head><meta charset=\"utf-8\">",
        `<meta name="viewport" content="width=device-width, initial-scale=1">`,
        `<title>${escapeHtmlText(screen.name)}</title>`,
        centralizedUi === false ? "" : `<link rel="stylesheet" href="../../../tokens/tokens.css">`,
        `<link rel="stylesheet" href="../styles.css">`,
        "</head><body>",
        `<main class="screen" style="width:${screen.width}px;height:${screen.height}px">`,
        body,
        "</main>",
        "</body></html>"
      ].join("\n"))
    });
  }

  outputFiles.push({
    fileName: "code/html-css/index.html",
    mime: "text/html",
    bytes: utf8Encode([
      "<!doctype html>",
      "<html><head><meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      "<title>Dev Export Screens</title>",
      "<link rel=\"stylesheet\" href=\"../../tokens/tokens.css\">",
      "<link rel=\"stylesheet\" href=\"./styles.css\">",
      "</head><body>",
      "<h1>Exported screens</h1>",
      "<ul class=\"index\">",
      nav.join("\n"),
      "</ul>",
      "</body></html>"
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/html-css/styles.css",
    mime: "text/css",
    bytes: utf8Encode([
      "*{box-sizing:border-box}",
      "body{margin:0;font-family:system-ui,sans-serif;background:#f4f5f7}",
      ".screen{position:relative;overflow:hidden;margin:24px auto;background:#fff}",
      ".index{padding:24px;line-height:2}",
      "img{display:block}",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/html-css/README.md",
    mime: "text/markdown",
    bytes: utf8Encode([
      "# HTML + CSS Starter",
      "",
      "Each screen is in `screens/`. Open `index.html` to browse them.",
      "",
      "Assets are copied to `package-assets/` and referenced relatively.",
      "The shared tokens are in `../../tokens/tokens.css`, so keep the package folder structure or move the tokens with the code.",
      "",
      "This is a structural starter generated from the centralized UI model.",
      "Use `FRONTEND_IMPLEMENTATION_GUIDE.md` and `AI_AGENT_PROMPT.md` to refine it.",
      ""
    ].join("\n"))
  });

  return { files: outputFiles, summary: { target: "html-css", folder: "code/html-css", screens: screenPlans.length } };
}

function renderReactPlan(plan, context, indent, textOverrides) {
  const pad = "  ".repeat(indent);
  if (!plan) return `${pad}{null}`;
  const style = JSON.stringify(cssToStyleObject(plan.css || {}));

  if (plan.kind === "component") {
    const props = Object.entries(plan.props || {})
      .map(([key, value]) => `${key}={${jsxText(value)}}`)
      .join(" ");
    return `${pad}<${plan.definition.safeName}${props ? " " + props : ""} />`;
  }

  if (plan.kind === "text") {
    const value = plan.textProp
      ? `{${plan.textProp}}`
      : `{${jsxText(plan.text)}}`;
    return `${pad}<span style={${style}}>${value}</span>`;
  }

  if (plan.kind === "asset") {
    const assetStyle = Object.assign({}, cssToStyleObject(plan.css || {}), {
      objectFit: plan.asset.fit || "contain"
    });
    return `${pad}<img src="${targetAssetUrl("react", plan.asset.path)}" alt={${jsxText(plan.asset.alt)}} style={${JSON.stringify(assetStyle)}} />`;
  }

  const children = (plan.children || []).map((child) => renderReactPlan(child, context, indent + 1, textOverrides)).join("\n");
  return `${pad}<div style={${style}}>\n${children}\n${pad}</div>`;
}

function createReactCode(target, screenPlans, assetFiles, tokenArtifacts, generatedAt, centralizedUi) {
  const outputFiles = assetFiles.slice();
  const componentFiles = [];
  const seen = new Set();

  if (centralizedUi !== false) {
  for (const screen of screenPlans) {
    for (const definition of screen.components) {
      if (!definition || seen.has(definition.safeName)) continue;
      seen.add(definition.safeName);
      const textProps = Array.from(definition.textProps.values());
      const propsType = textProps.map((name) => `${name}?: string`).join("; ");
      const signature = textProps.length
        ? `{ ${textProps.join(", ")} }: { ${propsType} }`
        : "";
      const body = renderReactPlan(definition.plan, { target }, 3, null);
      componentFiles.push({
        fileName: `code/react/src/ui/components/${definition.safeName}.tsx`,
        mime: "text/typescript",
        bytes: utf8Encode([
          `export function ${definition.safeName}(${signature}) {`,
          "  return (",
          body,
          "  );",
          "}",
          ""
        ].join("\n"))
      });
    }
  }

  outputFiles.push(...componentFiles);
  }

  const imports = [];
  const routes = [];
  for (const screen of screenPlans) {
    const usedComponents = Array.from(new Set(screen.planComponents.map((component) => component.safeName)));
    const importLines = usedComponents.map((name) => `import { ${name} } from '../ui/components/${name}';`).join("\n");
    const body = renderReactPlan(screen.plan, { target }, 3, null);
    outputFiles.push({
      fileName: `code/react/src/screens/${screen.safeName}.tsx`,
      mime: "text/typescript",
      bytes: utf8Encode([
        importLines,
        "",
        `export default function ${screen.safeName}() {`,
        "  return (",
        body,
        "  );",
        "}",
        ""
      ].join("\n"))
    });
    imports.push(`import ${screen.safeName} from './screens/${screen.safeName}';`);
    routes.push(`  { path: '${screen.route}', title: '${screen.name.replace(/'/g, "\\'")}', element: <${screen.safeName} /> }`);
  }

  outputFiles.push({
    fileName: "code/react/src/App.tsx",
    mime: "text/typescript",
    bytes: utf8Encode([
      "import { useState } from 'react';",
      imports.join("\n"),
      "",
      "const routes = [",
      routes.join(",\n"),
      "];",
      "",
      "function currentRoute() {",
      "  return window.location.pathname.replace(/\\/$/, '') || '/';",
      "}",
      "",
      "export default function App() {",
      "  const [route, setRoute] = useState(currentRoute());",
      "  const active = routes.find((item) => item.path === route) || routes[0];",
      "  function go(next: string) {",
      "    window.history.pushState({}, '', next);",
      "    setRoute(next);",
      "  }",
      "  return (",
      "    <div className=\"app-shell\">",
      "      <nav className=\"app-nav\">",
      "        {routes.map((item) => (",
      "          <button key={item.path} onClick={() => go(item.path)} className={item.path === (active && active.path) ? 'active' : ''}>{item.title}</button>",
      "        ))}",
      "      </nav>",
      "      <main className=\"app-stage\">{active ? active.element : null}</main>",
      "    </div>",
      "  );",
      "}",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/react/src/main.tsx",
    mime: "text/typescript",
    bytes: utf8Encode([
      "import { StrictMode } from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import App from './App';",
      "import './styles.css';",
      centralizedUi === false ? "" : "import './ui/tokens.css';",
      "",
      "const root = document.getElementById('root');",
      "if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/react/src/styles.css",
    mime: "text/css",
    bytes: utf8Encode([
      "*{box-sizing:border-box}",
      "body{margin:0;background:#f4f5f7;font-family:'Plus Jakarta Sans',system-ui,sans-serif}",
      ".app-shell{min-height:100vh}",
      ".app-nav{display:flex;gap:8px;padding:12px 20px;background:#fff;border-bottom:1px solid #e6e8ee;flex-wrap:wrap}",
      ".app-nav button{border:1px solid #e6e8ee;background:#fff;border-radius:999px;padding:7px 12px;cursor:pointer}",
      ".app-nav button.active{background:#3358f4;border-color:#3358f4;color:#fff}",
      ".app-stage{padding:24px;overflow:auto}",
      ".app-stage>div{margin:0 auto;position:relative}",
      ""
    ].join("\n"))
  });

  if (centralizedUi !== false) {
    outputFiles.push({
      fileName: "code/react/src/ui/tokens.css",
      mime: "text/css",
      bytes: utf8Encode(tokenArtifacts.css)
    });
  }

  outputFiles.push({
    fileName: "code/react/package.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify({
      name: "dev-export-react",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: { "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1", "@vitejs/plugin-react": "^4.3.4", typescript: "^5.6.3", vite: "^6.0.1" }
    }, null, 2))
  });

  outputFiles.push({
    fileName: "code/react/vite.config.ts",
    mime: "text/typescript",
    bytes: utf8Encode([
      "import { defineConfig } from 'vite';",
      "import react from '@vitejs/plugin-react';",
      "",
      "export default defineConfig({ plugins: [react()] });",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/react/tsconfig.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true
      },
      include: ["src"]
    }, null, 2))
  });

  outputFiles.push({
    fileName: "code/react/index.html",
    mime: "text/html",
    bytes: utf8Encode([
      "<!doctype html>",
      "<html><head><meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      "<title>Dev Export React</title></head>",
      "<body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>"
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "code/react/README.md",
    mime: "text/markdown",
    bytes: utf8Encode([
      "# React Starter",
      "",
      "```bash",
      "cd code/react",
      "npm install",
      "npm run dev",
      "```",
      "",
      "Screens live in `src/screens`, shared components in `src/ui/components`, and tokens in `src/ui/tokens.css`.",
      "Assets are copied to `public/package-assets`.",
      "",
      "This is a structural starter generated from the centralized UI model. Refine it with the AI handoff and verification harness.",
      ""
    ].join("\n"))
  });

  return { files: outputFiles, summary: { target: "react", folder: "code/react", screens: screenPlans.length, components: seen.size } };
}

function createScreenPlans(screenRecords, centralUi, target, logicalScreens, centralizedUi) {
  const nodeMap = collectNodeMap(screenRecords);
  const components = centralizedUi === false
    ? new Map()
    : buildComponentDefinitions(centralUi, screenRecords, nodeMap, target);
  const groups = logicalScreens && logicalScreens.length
    ? logicalScreens
    : buildLogicalScreens(screenRecords);
  const plans = [];
  const usedSlugs = new Set();
  const usedNames = new Set();

  for (const group of groups) {
    const variants = [];
    const unionComponents = [];
    const seenComponents = new Set();
    let defaultVariant = null;

    for (const variant of group.variants) {
      const record = variant.record;
      const root = record.design.nodes && record.design.nodes[0];
      if (!root) continue;
      const context = {
        target,
        screenFolder: record.screenFolder,
        componentsById: components,
        isComponentDefinition: false,
        textProps: null
      };
      const plan = buildCodePlan(root, context);
      const usedComponents = [];
      const seen = new Set();
      function collect(planNode) {
        if (!planNode) return;
        if (planNode.kind === "component" && planNode.definition && !seen.has(planNode.definition.safeName)) {
          seen.add(planNode.definition.safeName);
          usedComponents.push(planNode.definition);
        }
        for (const child of planNode.children || []) collect(child);
      }
      collect(plan);

      let fabPlan = null;
      if (plan.kind === "box" && Array.isArray(plan.children)) {
        const screenHeight = typeof root.height === "number" ? root.height : (group.height || 0);
        const fabIndex = plan.children.findIndex((child) => {
          if (!child || child.kind !== "box") return false;
          if (!child.css || !child.css.box || child.css.box.position !== "absolute") return false;
          const y = Number(child.y);
          const h = Number(child.height);
          const w = Number(child.width);
          return Number.isFinite(y) && Number.isFinite(h) && Number.isFinite(w) &&
            y + h > screenHeight * 0.85 && w <= 220 && h <= 72;
        });
        if (fabIndex >= 0) fabPlan = plan.children.splice(fabIndex, 1)[0];
      }

      const variantPlan = {
        name: variant.variantName || "Default",
        variantType: variant.variantType || "default",
        isDefault: !!variant.isDefault,
        plan,
        fabPlan,
        components: usedComponents,
        record
      };
      variants.push(variantPlan);
      if (!defaultVariant || variantPlan.isDefault) defaultVariant = variantPlan;
      for (const component of usedComponents) {
        if (seenComponents.has(component.safeName)) continue;
        seenComponents.add(component.safeName);
        unionComponents.push(component);
      }
    }

    if (!variants.length) continue;
    const firstRecord = variants[0].record;
    const root = firstRecord.design.nodes && firstRecord.design.nodes[0];
    const name = group.name || firstRecord.name;
    let slug = codeSlug(name, `screen-${firstRecord.index}`);
    if (usedSlugs.has(slug)) slug = `${slug}-${firstRecord.index}`;
    usedSlugs.add(slug);
    let safeName = codePascal(name, `Screen${firstRecord.index}`) + "Screen";
    if (usedNames.has(safeName)) safeName = `${safeName}${firstRecord.index}`;
    usedNames.add(safeName);

    plans.push({
      index: firstRecord.index,
      name,
      slug,
      safeName,
      fileBase: `${String(firstRecord.index).padStart(2, "0")}_${slug}`,
      route: `/${slug}`,
      width: group.width || root.width || 390,
      height: group.height || root.height || 844,
      logicalScreenId: group.id,
      plan: defaultVariant ? defaultVariant.plan : variants[0].plan,
      defaultVariant: defaultVariant || variants[0],
      variants,
      components: unionComponents,
      planComponents: unionComponents
    });
  }

  return plans;
}

function dartString(value) {
  return '"' + String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n") + '"';
}

function parseCssLength(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function cssColorToDart(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const rgba = text.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => Number(part.trim()));
    const r = Math.max(0, Math.min(255, Math.round(parts[0] || 0)));
    const g = Math.max(0, Math.min(255, Math.round(parts[1] || 0)));
    const b = Math.max(0, Math.min(255, Math.round(parts[2] || 0)));
    const a = Math.max(0, Math.min(255, Math.round((parts.length > 3 ? parts[3] : 1) * 255)));
    const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
    return `Color(0x${hex(a)}${hex(r)}${hex(g)}${hex(b)})`;
  }
  const hex = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    const rgb = hex[1].toUpperCase();
    const alpha = hex[2] ? hex[2].toUpperCase() : "FF";
    return `Color(0x${alpha}${rgb})`;
  }
  return null;
}

function firstCssColor(value) {
  const match = String(value || "").match(/(rgba?\([^)]+\)|#[0-9a-f]{6,8})/i);
  return match ? cssColorToDart(match[1]) : null;
}

function cssPaddingToDart(value) {
  const parts = String(value || "")
    .split(/\s+/)
    .map(parseCssLength)
    .filter((item) => item !== null);
  if (!parts.length) return null;
  let top = 0, right = 0, bottom = 0, left = 0;
  if (parts.length === 1) { top = right = bottom = left = parts[0]; }
  else if (parts.length === 2) { top = bottom = parts[0]; right = left = parts[1]; }
  else if (parts.length === 3) { top = parts[0]; right = left = parts[1]; bottom = parts[2]; }
  else { top = parts[0]; right = parts[1]; bottom = parts[2]; left = parts[3]; }
  return `EdgeInsets.fromLTRB(${left}, ${top}, ${right}, ${bottom})`;
}

function cssRadiusToDart(value) {
  const values = String(value || "")
    .split(/\s+/)
    .map(parseCssLength)
    .filter((item) => item !== null);
  if (!values.length) return null;
  if (values.length === 1) return `BorderRadius.circular(${values[0]})`;
  const topLeft = values[0] || 0;
  const topRight = values[1] || topLeft;
  const bottomRight = values[2] || topLeft;
  const bottomLeft = values[3] || topRight;
  return `BorderRadius.only(topLeft: Radius.circular(${topLeft}), topRight: Radius.circular(${topRight}), bottomRight: Radius.circular(${bottomRight}), bottomLeft: Radius.circular(${bottomLeft}))`;
}

function splitCssList(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of String(value || "")) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function cssBoxShadowToDart(value) {
  const shadows = [];
  for (const raw of splitCssList(value)) {
    if (!raw || raw.indexOf("inset") === 0) continue;
    const colorMatch = raw.match(/(rgba?\([^)]+\)|#[0-9a-f]{6,8})/i);
    const color = colorMatch ? cssColorToDart(colorMatch[1]) : "Color(0x33000000)";
    const rest = raw.replace(colorMatch ? colorMatch[0] : "", "").trim();
    const numbers = rest.match(/-?\d+(?:\.\d+)?/g) || [];
    const x = Number(numbers[0] || 0);
    const y = Number(numbers[1] || 0);
    const blur = Number(numbers[2] || 0);
    const spread = Number(numbers[3] || 0);
    shadows.push(`BoxShadow(color: ${color}, offset: Offset(${x}, ${y}), blurRadius: ${blur}, spreadRadius: ${spread})`);
  }
  return shadows.length ? `[${shadows.join(", ")}]` : null;
}

function cssGradientToDart(value) {
  const text = String(value || "");
  const linear = text.match(/linear-gradient\(\s*([-\d.]+)deg\s*,\s*([\s\S]+)\)/i);
  const radial = text.match(/radial-gradient\((?:[^,]+,\s*)?([\s\S]+)\)/i);
  const conic = text.match(/conic-gradient\(\s*([\s\S]+)\)/i);
  const source = linear ? linear[2] : radial ? radial[1] : conic ? conic[1] : null;
  if (!source) return null;

  const stops = splitCssList(source).map((stop) => {
    const colorMatch = stop.match(/(rgba?\([^)]+\)|#[0-9a-f]{6,8})/i);
    const percentMatch = stop.match(/([-\d.]+)%/);
    return {
      color: colorMatch ? cssColorToDart(colorMatch[1]) : "Color(0x00000000)",
      position: percentMatch ? Number(percentMatch[1]) / 100 : null
    };
  }).filter((stop) => stop.color);

  if (!stops.length) return null;
  const colors = `[${stops.map((stop) => stop.color).join(", ")}]`;
  const stopsList = stops.every((stop) => stop.position !== null)
    ? `, stops: [${stops.map((stop) => Math.max(0, Math.min(1, stop.position))).join(", ")}]`
    : "";

  if (linear) {
    const angle = Number(linear[1] || 180);
    let begin = "Alignment.topCenter";
    let end = "Alignment.bottomCenter";
    if (Math.abs(angle - 0) < 1) { begin = "Alignment.bottomCenter"; end = "Alignment.topCenter"; }
    else if (Math.abs(angle - 90) < 1) { begin = "Alignment.centerLeft"; end = "Alignment.centerRight"; }
    else if (Math.abs(angle - 270) < 1) { begin = "Alignment.centerRight"; end = "Alignment.centerLeft"; }
    return `LinearGradient(begin: ${begin}, end: ${end}, colors: ${colors}${stopsList})`;
  }
  if (radial) return `RadialGradient(colors: ${colors}${stopsList})`;
  return `SweepGradient(colors: ${colors}${stopsList})`;
}

function cssBorderToDart(value) {
  const text = String(value || "");
  const width = parseCssLength(text) || 1;
  const color = firstCssColor(text) || "Color(0xFFE0E0E0)";
  return `Border.all(width: ${width}, color: ${color})`;
}

function cssTextStyleToDart(css) {
  const typography = (css && css.typography) || {};
  const parts = [];
  if (typography.fontFamily) parts.push(`fontFamily: ${dartString(typography.fontFamily)}`);
  const fontSize = parseCssLength(typography.fontSize);
  if (fontSize !== null) parts.push(`fontSize: ${fontSize}`);
  const weight = Number(typography.fontWeight);
  if (Number.isFinite(weight)) {
    const flutterWeight = Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
    parts.push(`fontWeight: FontWeight.w${flutterWeight}`);
  }
  const letterSpacingRaw = typography.letterSpacing;
  let letterSpacing = parseCssLength(letterSpacingRaw);
  if (letterSpacing !== null && String(letterSpacingRaw || "").indexOf("em") >= 0 && fontSize) {
    letterSpacing = Math.round(letterSpacing * fontSize * 100) / 100;
  }
  if (letterSpacing !== null) parts.push(`letterSpacing: ${letterSpacing}`);
  const lineHeightRaw = typography.lineHeight;
  let lineHeightRatio = null;
  if (typeof lineHeightRaw === "string" && lineHeightRaw.indexOf("%") >= 0) {
    lineHeightRatio = Number(lineHeightRaw.replace("%", "")) / 100;
  } else {
    const lineHeight = parseCssLength(lineHeightRaw);
    if (lineHeight !== null && fontSize) lineHeightRatio = lineHeight / fontSize;
  }
  if (lineHeightRatio !== null && Number.isFinite(lineHeightRatio)) {
    parts.push(`height: ${Math.round(lineHeightRatio * 100) / 100}`);
  }
  if (typography.fontStyle === "italic") parts.push("fontStyle: FontStyle.italic");
  const decoration = String(typography.textDecoration || "").toLowerCase();
  if (decoration.indexOf("underline") >= 0) parts.push("decoration: TextDecoration.underline");
  else if (decoration.indexOf("line-through") >= 0) parts.push("decoration: TextDecoration.lineThrough");
  else if (decoration.indexOf("overline") >= 0) parts.push("decoration: TextDecoration.overline");
  const color = cssColorToDart(typography.color) || firstCssColor(typography.color);
  if (color) parts.push(`color: ${color}`);
  return `TextStyle(${parts.join(", ")})`;
}

function applyFlutterVisual(widget, css) {
  let output = widget;
  const visual = (css && css.visual) || {};
  const opacity = Number(visual.opacity);
  if (Number.isFinite(opacity) && opacity < 1) {
    output = `Opacity(opacity: ${opacity}, child: ${output})`;
  }
  const rotate = String(visual.transform || "").match(/rotate\(([-\d.]+)deg\)/);
  if (rotate) {
    const radians = Math.round((Number(rotate[1]) * Math.PI / 180) * 1000000) / 1000000;
    output = `Transform.rotate(angle: ${radians}, child: ${output})`;
  }
  return output;
}

function cssBoxDecorationToDart(css) {
  const visual = (css && css.visual) || {};
  const parts = [];
  const background = visual.background;
  const gradient = background && /gradient\(/i.test(background) ? cssGradientToDart(background) : null;
  if (gradient) parts.push(`gradient: ${gradient}`);
  else {
    const color = firstCssColor(background);
    if (color) parts.push(`color: ${color}`);
  }
  if (visual.border) parts.push(`border: ${cssBorderToDart(visual.border)}`);
  if (visual.borderRadius) parts.push(`borderRadius: ${cssRadiusToDart(visual.borderRadius)}`);
  if (visual.boxShadow) {
    const shadows = cssBoxShadowToDart(visual.boxShadow);
    if (shadows) parts.push(`boxShadow: ${shadows}`);
  }
  return parts.length ? `BoxDecoration(${parts.join(", ")})` : null;
}

function flutterSizeValue(value, fallback) {
  if (value === "100%") return typeof fallback === "number" ? String(fallback) : null;
  if (value === "fit-content" || value === "auto" || !value) return null;
  const number = parseCssLength(value);
  return number === null ? null : String(number);
}

function flutterAlignment(css, axis) {
  const layout = (css && css.layout) || {};
  if (axis === "main") {
    const map = {
      "flex-start": "MainAxisAlignment.start",
      "center": "MainAxisAlignment.center",
      "flex-end": "MainAxisAlignment.end",
      "space-between": "MainAxisAlignment.spaceBetween",
      "space-around": "MainAxisAlignment.spaceAround",
      "space-evenly": "MainAxisAlignment.spaceEvenly"
    };
    return map[layout.justifyContent];
  }
  const map = {
    "flex-start": "CrossAxisAlignment.start",
    "center": "CrossAxisAlignment.center",
    "flex-end": "CrossAxisAlignment.end",
    "stretch": "CrossAxisAlignment.stretch",
    "baseline": "CrossAxisAlignment.baseline"
  };
  return map[layout.alignItems];
}

function flutterWrapAlignment(css) {
  const layout = (css && css.layout) || {};
  const map = {
    "flex-start": "WrapAlignment.start",
    "center": "WrapAlignment.center",
    "flex-end": "WrapAlignment.end",
    "space-between": "WrapAlignment.spaceBetween",
    "space-around": "WrapAlignment.spaceAround",
    "space-evenly": "WrapAlignment.spaceEvenly"
  };
  return map[layout.justifyContent];
}

function renderFlutterPlan(plan, context, indent, textOverrides) {
  const pad = "  ".repeat(indent);
  if (!plan) return `${pad}const SizedBox.shrink()`;

  if (plan.kind === "component") {
    const args = Object.entries(plan.props || {})
      .map(([key, value]) => `${key}: ${dartString(value)}`)
      .join(", ");
    const widget = `${plan.definition.safeName}(${args})`;
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  if (plan.kind === "text") {
    let value = plan.textProp
      ? `(${plan.textProp} ?? ${dartString(plan.text)})`
      : dartString(plan.text);
    const typography = (plan.css && plan.css.typography) || {};
    if (typography.textTransform === "uppercase") value = `${value}.toUpperCase()`;
    else if (typography.textTransform === "lowercase") value = `${value}.toLowerCase()`;
    const alignMap = { left: "TextAlign.left", center: "TextAlign.center", right: "TextAlign.right", justify: "TextAlign.justify" };
    const textAlign = alignMap[typography.textAlign];
    let widget = `Text(${value}${textAlign ? `, textAlign: ${textAlign}` : ""}, style: ${cssTextStyleToDart(plan.css)})`;

    const layout = (plan.css && plan.css.layout) || {};
    const width = flutterSizeValue(layout.width, plan.width);
    const height = flutterSizeValue(layout.height, plan.height);
    if (width || height) {
      const vertical = typography.verticalAlign;
      const alignment = vertical === "center"
        ? "Alignment.centerLeft"
        : vertical === "bottom"
          ? "Alignment.bottomLeft"
          : "Alignment.topLeft";
      const sizedChild = height ? `Align(alignment: ${alignment}, child: ${widget})` : widget;
      widget = `SizedBox(${width ? `width: ${width}, ` : ""}${height ? `height: ${height}, ` : ""}child: ${sizedChild})`;
    }
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  if (plan.kind === "asset") {
    const url = targetAssetUrl("flutter", plan.asset.path);
    const fitMap = { cover: "BoxFit.cover", contain: "BoxFit.contain", none: "BoxFit.none" };
    const fit = fitMap[plan.asset.fit] || "BoxFit.contain";
    const width = flutterSizeValue(plan.css && plan.css.layout ? plan.css.layout.width : null, plan.width);
    const height = flutterSizeValue(plan.css && plan.css.layout ? plan.css.layout.height : null, plan.height);
    const args = [
      dartString(url),
      `fit: ${fit}`,
      width ? `width: ${width}` : "",
      height ? `height: ${height}` : ""
    ].filter(Boolean).join(", ");
    const widget = url.toLowerCase().endsWith(".svg")
      ? `SvgPicture.asset(${args})`
      : `Image.asset(${args})`;
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  const children = plan.children || [];
  let childCode = null;
  if (children.length) {
    const hasAbsolute = children.some((child) => child.css && child.css.box && child.css.box.position === "absolute");
    if (hasAbsolute) {
      const positioned = children.map((child) => {
        const left = parseCssLength(child.css && child.css.box ? child.css.box.left : null) || 0;
        const top = parseCssLength(child.css && child.css.box ? child.css.box.top : null) || 0;
        return `Positioned(left: ${left}, top: ${top}, child: ${renderFlutterPlan(child, context, indent + 2, textOverrides).trim()})`;
      }).join(",\n");
      childCode = `Stack(children: [\n${"  ".repeat(indent + 1)}${positioned}\n${pad}])`;
    } else {
      const layoutCss = (plan.css && plan.css.layout) || {};
      const isRow = layoutCss.flexDirection === "row";
      const isWrap = layoutCss.flexWrap === "wrap";
      const gap = parseCssLength(layoutCss.gap) || 0;
      const runGap = parseCssLength(layoutCss.rowGap || layoutCss.columnGap) || gap;
      const rendered = [];

      if (isWrap) {
        children.forEach((child) => {
          rendered.push(renderFlutterPlan(child, context, indent + 1, textOverrides));
        });
        const wrapAlignment = flutterWrapAlignment(plan.css);
        const wrapArgs = [
          gap > 0 ? `spacing: ${gap}` : "",
          runGap > 0 ? `runSpacing: ${runGap}` : "",
          wrapAlignment ? `alignment: ${wrapAlignment}` : "",
          `children: [\n${rendered.join(",\n")}\n${"  ".repeat(indent)}]`
        ].filter(Boolean).join(",\n");
        childCode = `Wrap(\n${"  ".repeat(indent)}${wrapArgs}\n${pad})`;
      } else {
        children.forEach((child, index) => {
          if (index > 0 && gap > 0) {
            rendered.push(`${"  ".repeat(indent + 1)}${isRow ? `SizedBox(width: ${gap})` : `SizedBox(height: ${gap})`}`);
          }
          rendered.push(renderFlutterPlan(child, context, indent + 1, textOverrides));
        });
        const mainAxis = flutterAlignment(plan.css, "main");
        const crossAxis = flutterAlignment(plan.css, "cross");
        const args = [
          mainAxis ? `mainAxisAlignment: ${mainAxis}` : "",
          crossAxis ? `crossAxisAlignment: ${crossAxis}` : "",
          `children: [\n${rendered.join(",\n")}\n${"  ".repeat(indent)}]`
        ].filter(Boolean).join(",\n");
        const rowWidget = `${isRow ? "Row" : "Column"}(\n${"  ".repeat(indent)}${args}\n${pad})`;
        childCode = plan.scrollX && isRow
          ? `SingleChildScrollView(scrollDirection: Axis.horizontal, child: ${rowWidget})`
          : rowWidget;
      }
    }
  }

  const layout = (plan.css && plan.css.layout) || {};
  const padding = cssPaddingToDart(layout.padding);
  const decoration = cssBoxDecorationToDart(plan.css);
  const width = flutterSizeValue(layout.width, plan.width);
  const height = flutterSizeValue(layout.height, plan.height);
  const clip = plan.css && plan.css.box && plan.css.box.overflow === "hidden" && decoration
    ? "clipBehavior: Clip.hardEdge"
    : "";
  const args = [
    padding ? `padding: ${padding}` : "",
    decoration ? `decoration: ${decoration}` : "",
    width ? `width: ${width}` : "",
    height ? `height: ${height}` : "",
    clip,
    childCode ? `child: ${childCode.trim()}` : ""
  ].filter(Boolean).join(",\n");

  const widget = `Container(\n${"  ".repeat(indent)}${args}\n${pad})`;
  return `${pad}${applyFlutterVisual(widget, plan.css)}`;
}

﻿function renderFlutterNode(plan, context, indent, textOverrides) {
  if (FLUTTER_TEMPLATE.layoutMode === "absolute") {
    return renderFlutterAbsolutePlan(plan, context, indent, textOverrides);
  }
  return renderFlutterPlan(plan, context, indent, textOverrides);
}

function renderFlutterAbsolutePlan(plan, context, indent, textOverrides) {
  const pad = "  ".repeat(indent);
  if (!plan) return `${pad}const SizedBox.shrink()`;

  const rawWidth = typeof plan.width === "number" ? plan.width : parseCssLength(plan.css && plan.css.layout ? plan.css.layout.width : null);
  const rawHeight = typeof plan.height === "number" ? plan.height : parseCssLength(plan.css && plan.css.layout ? plan.css.layout.height : null);
  const width = rawWidth !== null ? String(Math.round(rawWidth * 100) / 100) : null;
  const height = rawHeight !== null ? String(Math.round(rawHeight * 100) / 100) : null;

  if (plan.kind === "component") {
    const args = Object.entries(plan.props || {})
      .map(([key, value]) => `${key}: ${dartString(value)}`)
      .join(", ");
    let widget = `${plan.definition.safeName}(${args})`;
    if (width || height) {
      widget = `SizedBox(${width ? `width: ${width}, ` : ""}${height ? `height: ${height}, ` : ""}child: ${widget})`;
    }
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  if (plan.kind === "text") {
    let value = plan.textProp
      ? `(${plan.textProp} ?? ${dartString(plan.text)})`
      : dartString(plan.text);
    const typography = (plan.css && plan.css.typography) || {};
    if (typography.textTransform === "uppercase") value = `${value}.toUpperCase()`;
    else if (typography.textTransform === "lowercase") value = `${value}.toLowerCase()`;
    const alignMap = { left: "TextAlign.left", center: "TextAlign.center", right: "TextAlign.right", justify: "TextAlign.justify" };
    const textAlign = alignMap[typography.textAlign];
    const textWidget = `Text(${value}${textAlign ? `, textAlign: ${textAlign}` : ""}, style: ${cssTextStyleToDart(plan.css)})`;
    let widget = textWidget;
    if (width || height) {
      const vertical = typography.verticalAlign;
      const alignment = vertical === "center"
        ? "Alignment.centerLeft"
        : vertical === "bottom"
          ? "Alignment.bottomLeft"
          : "Alignment.topLeft";
      widget = `SizedBox(${width ? `width: ${width}, ` : ""}${height ? `height: ${height}, ` : ""}child: Align(alignment: ${alignment}, child: ${textWidget}))`;
    }
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  if (plan.kind === "asset") {
    const url = targetAssetUrl("flutter", plan.asset.path);
    const fitMap = { cover: "BoxFit.cover", contain: "BoxFit.contain", none: "BoxFit.none" };
    const fit = fitMap[plan.asset.fit] || "BoxFit.contain";
    const args = [
      dartString(url),
      `fit: ${fit}`,
      width ? `width: ${width}` : "",
      height ? `height: ${height}` : ""
    ].filter(Boolean).join(", ");
    const widget = url.toLowerCase().endsWith(".svg")
      ? `SvgPicture.asset(${args})`
      : `Image.asset(${args})`;
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  const children = plan.children || [];
  const decoration = cssBoxDecorationToDart(plan.css);
  const clip = plan.css && plan.css.box && plan.css.box.overflow === "hidden" && decoration
    ? "clipBehavior: Clip.hardEdge"
    : "";

  if (!children.length) {
    const args = [
      decoration ? `decoration: ${decoration}` : "",
      width ? `width: ${width}` : "",
      height ? `height: ${height}` : "",
      clip
    ].filter(Boolean).join(",\n");
    const widget = `Container(${args ? "\n" + "  ".repeat(indent) + args + "\n" + pad : ""})`;
    return `${pad}${applyFlutterVisual(widget, plan.css)}`;
  }

  const positioned = children.map((child) => {
    const left = Number(child.x);
    const top = Number(child.y);
    const l = Number.isFinite(left) ? left : 0;
    const t = Number.isFinite(top) ? top : 0;
    return `Positioned(left: ${l}, top: ${t}, child: ${renderFlutterAbsolutePlan(child, context, indent + 2, textOverrides).trim()})`;
  }).join(",\n");

  const stack = `Stack(children: [\n${"  ".repeat(indent + 1)}${positioned}\n${pad}])`;
  const containerArgs = [
    decoration ? `decoration: ${decoration}` : "",
    width ? `width: ${width}` : "",
    height ? `height: ${height}` : "",
    clip,
    `child: ${stack}`
  ].filter(Boolean).join(",\n");
  let widget = `Container(\n${"  ".repeat(indent)}${containerArgs}\n${pad})`;

  if (plan.scrollX) {
    widget = `SingleChildScrollView(scrollDirection: Axis.horizontal, child: ${widget})`;
  }
  return `${pad}${applyFlutterVisual(widget, plan.css)}`;
}

function createFlutterColors(centralUi) {
  const lines = [
    "import 'package:flutter/material.dart';",
    "",
    "class AppColors {"
  ];
  for (const token of centralUi.tokens.colors) {
    const color = cssColorToDart(token.value);
    if (!color) continue;
    lines.push(`  static const ${token.id.replace(/-/g, "")} = ${color};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function createFlutterCore(centralUi) {
  const lines = [
    "import 'package:flutter/material.dart';",
    "",
    "export 'colors.dart';",
    "",
    "class AppSpacing {"
  ];
  for (const token of centralUi.tokens.spacing) {
    lines.push(`  static const double ${token.id.replace(/-/g, "")} = ${token.value};`);
  }
  lines.push("}", "");
  lines.push("class AppRadii {");
  for (const token of centralUi.tokens.radii) {
    lines.push(`  static const double ${token.id.replace(/-/g, "")} = ${token.value};`);
  }
  lines.push("}", "");
  lines.push("class AppTextStyles {");
  for (const token of centralUi.tokens.typography) {
    const styleCss = {
      typography: {
        fontFamily: token.fontFamily,
        fontSize: typeof token.fontSize === "number" ? `${token.fontSize}px` : undefined,
        fontWeight: token.fontWeight,
        lineHeight: lineHeightCss(token.lineHeight),
        letterSpacing: letterSpacingCss(token.letterSpacing),
        textAlign: token.textAlign ? String(token.textAlign).toLowerCase() : undefined
      }
    };
    lines.push(`  static const ${token.id.replace(/-/g, "")} = ${cssTextStyleToDart(styleCss)};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function createFlutterCode(target, screenPlans, assetFiles, centralUi, generatedAt, verification, centralizedUi) {
  const root = FLUTTER_TEMPLATE.root;
  const paths = FLUTTER_TEMPLATE.filePaths;
  const outputFiles = assetFiles.slice();
  const seen = new Set();
  const fontFamilies = Array.from(new Set(
    centralUi.tokens.typography.map((token) => token.fontFamily).filter(Boolean)
  ));

  function push(filePath, mime, content) {
    outputFiles.push({
      fileName: `${root}/${filePath}`,
      mime,
      bytes: utf8Encode(content)
    });
  }

  if (centralizedUi !== false) {
    for (const screen of screenPlans) {
      for (const definition of screen.components) {
        if (!definition || seen.has(definition.safeName)) continue;
        seen.add(definition.safeName);
        const props = Array.from(definition.textProps.values());
        const fields = props.map((name) => `  final String? ${name};`).join("\n");
        const params = props.map((name) => `this.${name}`).join(", ");
        const body = renderFlutterNode(definition.plan, {}, 2, null);
        const flutterImports = ["import 'package:flutter/material.dart';"];
        if (body.indexOf("SvgPicture.asset") >= 0) {
          flutterImports.push("import 'package:flutter_svg/flutter_svg.dart';");
        }
        push(`${FLUTTER_TEMPLATE.dirs.components}/${definition.safeName}.dart`, "text/x-dart", [
          ...flutterImports,
          "",
          `class ${definition.safeName} extends StatelessWidget {`,
          fields,
          `  const ${definition.safeName}({super.key${params ? ", " + params : ""}});`,
          "",
          "  @override",
          "  Widget build(BuildContext context) {",
          `    return ${body.trim()};`,
          "  }",
          "}",
          ""
        ].join("\n"));
      }
    }

    push(paths.colors, "text/x-dart", createFlutterColors(centralUi));
    push(paths.core, "text/x-dart", createFlutterCore(centralUi));
    push(paths.tokens, "text/x-dart", [
      "export 'core.dart';",
      "export 'colors.dart';",
      ""
    ].join("\n"));
  }

  for (const screen of screenPlans) {
    const importLines = centralizedUi === false
      ? ""
      : Array.from(new Set(screen.components.map((component) => component.safeName)))
          .map((name) => `import '../ui/components/${name}.dart';`)
          .join("\n");
    const variantViews = screen.variants.map((variant) => renderFlutterNode(variant.plan, {}, 3, null));
    const variantFabs = screen.variants.map((variant) => variant.fabPlan ? renderFlutterNode(variant.fabPlan, {}, 3, null) : "null");
    const variantNames = screen.variants.map((variant) => variant.name);
    const flutterImports = [
      "import 'package:flutter/material.dart';",
      "import '../ui/app_shell.dart';"
    ];
    if (variantViews.some((view) => view.indexOf("SvgPicture.asset") >= 0)) {
      flutterImports.push("import 'package:flutter_svg/flutter_svg.dart';");
    }
    const stateName = `_${screen.safeName}State`;
    push(`${FLUTTER_TEMPLATE.dirs.screens}/${screen.safeName}.dart`, "text/x-dart", [
      ...flutterImports,
      importLines,
      "",
      `class ${screen.safeName} extends StatefulWidget {`,
      "  final int initialVariant;",
      `  const ${screen.safeName}({super.key, this.initialVariant = 0});`,
      `  static const List<String> variantNames = [${variantNames.map(dartString).join(", ")}];`,
      "",
      "  @override",
      `  State<${screen.safeName}> createState() => ${stateName}();`,
      "}",
      "",
      `class ${stateName} extends State<${screen.safeName}> {`,
      "  int _safeIndex(int value, int length) {",
      "    if (value < 0) return 0;",
      "    if (value >= length) return length - 1;",
      "    return value;",
      "  }",
      "",
      "  @override",
      "  Widget build(BuildContext context) {",
      "    final views = <Widget>[",
      variantViews.join(",\n"),
      "    ];",
      "    final fabs = <Widget?>[",
      variantFabs.join(",\n"),
      "    ];",
      "    final index = _safeIndex(widget.initialVariant, views.length);",
      "    return AppShell(",
      `      title: ${dartString(screen.name)},`,
      `      width: ${screen.width},`,
      `      height: ${screen.height},`,
      "      child: views[index],",
      "      floatingActionButton: fabs[index],",
      "    );",
      "  }",
      "}",
      ""
    ].join("\n"));
  }

  const routeLabels = screenPlans.map((screen) => `  '${screen.route}': ${dartString(screen.name)},`);
  push(paths.routes, "text/x-dart", flutterTemplateRoutes(routeLabels));
  push(paths.appShell, "text/x-dart", flutterTemplateAppShell(routeLabels, "/__variants"));

  const galleryItems = [];
  for (const screen of screenPlans) {
    screen.variants.forEach((variant, index) => {
      galleryItems.push(
        `        ListTile(title: Text(${dartString(`${screen.name} - ${variant.name}`)}), subtitle: Text(${dartString(`${variant.variantType} variant`)}), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ${screen.safeName}(initialVariant: ${index})))),`
      );
    });
  }
  const galleryImports = screenPlans.map((screen) => `import '../screens/${screen.safeName}.dart';`);
  push(paths.gallery, "text/x-dart", flutterTemplateGallery(galleryImports, galleryItems));

  const mainImports = [
    ...screenPlans.map((screen) => `import 'screens/${screen.safeName}.dart';`),
    "import 'dev/variant_gallery.dart';"
  ];
  const routeEntries = [
    ...screenPlans.map((screen) => `      '${screen.route}': (context) => const ${screen.safeName}(),`),
    "      '/__variants': (context) => const VariantGallery(),"
  ];
  const first = screenPlans[0];
  push(paths.main, "text/x-dart", flutterTemplateMain(mainImports, routeEntries, first ? first.route : "/"));

  const goldenEntries = [];
  if (verification && verification.manifest && Array.isArray(verification.manifest.screens)) {
    const byIndex = new Map(verification.manifest.screens.map((item) => [item.index, item]));
    for (const screen of screenPlans) {
      screen.variants.forEach((variant, variantIndex) => {
        const expected = byIndex.get(variant.record.index);
        if (!expected || !expected.expected1x) return;
        const expectedFile = verification.files.find((file) => file.fileName === expected.expected1x);
        if (!expectedFile) return;
        const goldenName = `${String(variant.record.index).padStart(2, "0")}_${codeSlug(variant.record.name, `screen-${variant.record.index}`)}.png`;
        outputFiles.push({
          fileName: `${root}/${FLUTTER_TEMPLATE.goldenDir}/${goldenName}`,
          mime: "image/png",
          bytes: expectedFile.bytes
        });
        goldenEntries.push({ screen, variant, variantIndex, goldenName });
      });
    }
  }

  if (goldenEntries.length) {
    const testImports = Array.from(new Set(goldenEntries.map(({ screen }) => screen.safeName)))
      .map((name) => `import 'package:${FLUTTER_TEMPLATE.projectName}/screens/${name}.dart';`);
    const tests = goldenEntries.map(({ screen, variant, variantIndex, goldenName }) => [
      `  testWidgets('${`${screen.name} - ${variant.name}`.replace(/'/g, "\\'")} golden', (tester) async {`,
      `    tester.view.physicalSize = const Size(${Math.round(screen.width)}, ${Math.round(screen.height)});`,
      "    tester.view.devicePixelRatio = 1.0;",
      "    addTearDown(tester.view.resetPhysicalSize);",
      "    addTearDown(tester.view.resetDevicePixelRatio);",
      `    await tester.pumpWidget(const MaterialApp(home: ${screen.safeName}(initialVariant: ${variantIndex})));`,
      `    await expectLater(find.byType(${screen.safeName}), matchesGoldenFile('goldens/${goldenName}'));`,
      "  });",
      ""
    ].join("\n"));
    push(paths.goldenTest, "text/x-dart", flutterTemplateGoldenTest(testImports, tests));
  }

  push(paths.pubspec, "text/yaml", flutterTemplatePubspec());
  push(paths.readme, "text/markdown", flutterTemplateReadme(centralizedUi !== false, fontFamilies, screenPlans.length));
  push(paths.conventions, "text/markdown", flutterTemplateConventions(centralizedUi !== false));

  return {
    files: outputFiles,
    summary: {
      target: "flutter",
      folder: root,
      screens: screenPlans.length,
      components: seen.size,
      centralized: centralizedUi !== false
    }
  };
}

function createCodeArtifacts(options) {
  const target = options.target;
  if (target !== "react" && target !== "flutter" && target !== "html-css") {
    return null;
  }
  const centralizedUi = options.centralizedUi !== false;
  const screenPlans = createScreenPlans(options.screenRecords, options.centralUi, target, options.logicalScreens, centralizedUi);
  const assetFiles = collectCodeAssets(target, options.files);

  if (target === "html-css") {
    return createHtmlCssCode(target, screenPlans, assetFiles, options.tokenArtifacts, options.generatedAt, centralizedUi);
  }
  if (target === "react") {
    return createReactCode(target, screenPlans, assetFiles, options.tokenArtifacts, options.generatedAt, centralizedUi);
  }
  return createFlutterCode(target, screenPlans, assetFiles, options.centralUi, options.generatedAt, options.verification, centralizedUi);
}


// ===== src/90-core-main.js =====

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


