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
