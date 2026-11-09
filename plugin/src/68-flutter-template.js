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
