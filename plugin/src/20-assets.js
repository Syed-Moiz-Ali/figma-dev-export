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

