import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-var-requires": "off",
      "no-control-regex": "off",
      "no-useless-assignment": "off"
    },
    ignores: [
      "dist/",
      "node_modules/",
      "main.js",
      "esbuild.config.mjs",
      "*.json"
    ]
  }
);
