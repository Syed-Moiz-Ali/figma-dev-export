const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "src");
const outFile = path.join(__dirname, "code.js");
const order = ["20-assets.js", "30-serialize.js", "40-central.js", "50-guides.js", "55-phase2-tokens.js", "57-logical-screens.js", "65-phase3-verify.js", "68-flutter-template.js", "70-phase4-codegen.js", "90-core-main.js"];

let output = "// AUTO-GENERATED FILE - edit files in plugin/src and run: node plugin/build.js\n";
output += "// Figma plugins load a single script, so sources are concatenated here.\n\n";

for (const file of order) {
  output += "// ===== src/" + file + " =====\n\n";
  output += fs.readFileSync(path.join(srcDir, file), "utf8");
  output += "\n\n";
}

fs.writeFileSync(outFile, output, "utf8");
console.log("Built " + outFile + " from " + order.length + " source files.");
