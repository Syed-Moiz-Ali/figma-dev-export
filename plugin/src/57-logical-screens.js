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
