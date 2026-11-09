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

