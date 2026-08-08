import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("mobile compatibility contract", () => {
  it("keeps the plugin mobile-capable without desktop-only runtime imports", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    const source = sourceFiles(resolve(root, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(manifest.isDesktopOnly).toBe(false);
    expect(source).not.toMatch(/from\s+["'](?:fs|path|electron)["']/);
    expect(source).not.toMatch(/require\(\s*["'](?:fs|path|electron)["']\s*\)/);
    expect(source).not.toContain("(?<=");
  });
});
