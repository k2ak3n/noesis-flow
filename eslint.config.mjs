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
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      // This project intentionally permits implicit `any` while it is migrated to
      // stricter TypeScript.  The other unsafe rules still identify the source of
      // those values; reporting every downstream argument produces duplicate,
      // non-actionable warnings.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-floating-promises": "warn"
    }
  }
);
