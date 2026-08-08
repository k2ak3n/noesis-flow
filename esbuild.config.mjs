import esbuild from "esbuild";
import fs from "fs/promises";
import path from "path";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";
const outFile = "main.js";
const distDir = "dist";
const installFiles = ["manifest.json", outFile, "styles.css", "versions.json"];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyInstallablePlugin() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const file of installFiles) {
    if (await pathExists(file)) {
      await fs.copyFile(file, path.join(distDir, file));
    }
  }

}

const context = await esbuild.context({
  banner: {
    js: "/* Noesis Flow Plugin Build */",
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  minify: prod,
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  loader: {
    ".mp3": "dataurl",
  },
  outfile: outFile,
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  await copyInstallablePlugin();
  console.log(`Packaged installable plugin files in ${distDir}/`);
  process.exit(0);
} else {
  await context.watch();
}
