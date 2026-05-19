import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export const workspaceIgnores = [
  "**/.next/**",
  "**/coverage/**",
  "**/dist/**",
  "**/build/**",
  "**/node_modules/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "**/drizzle/meta/**",
  "**/*.d.ts",
  "pnpm-lock.yaml",
];

export function base({ ignores = [] } = {}) {
  return [
    { ignores: [...workspaceIgnores, ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.es2024,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: "warn",
      },
    },
  ];
}

export default base;
