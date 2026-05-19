import { createRequire } from "node:module";
import path from "node:path";
import globals from "globals";
import { workspaceIgnores } from "./base.mjs";

function requireFrom(rootDir, packageName) {
  const require = createRequire(path.join(rootDir, "package.json"));
  return require(packageName);
}

export function next({ rootDir = process.cwd(), ignores = [] } = {}) {
  const nextPlugin = requireFrom(rootDir, "@next/eslint-plugin-next");
  const reactPlugin = requireFrom(rootDir, "eslint-plugin-react");
  const reactHooksPlugin = requireFrom(rootDir, "eslint-plugin-react-hooks");
  const jsxA11yPlugin = requireFrom(rootDir, "eslint-plugin-jsx-a11y");
  const tsParser = requireFrom(rootDir, "@typescript-eslint/parser");

  return [
    { ignores: [...workspaceIgnores, ...ignores] },
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          sourceType: "module",
        },
      },
    },
    reactPlugin.configs.flat.recommended,
    reactPlugin.configs.flat["jsx-runtime"],
    {
      plugins: {
        "react-hooks": reactHooksPlugin,
      },
      rules: reactHooksPlugin.configs.recommended.rules,
    },
    nextPlugin.flatConfig.recommended,
    nextPlugin.flatConfig.coreWebVitals,
    {
      plugins: {
        "jsx-a11y": jsxA11yPlugin,
      },
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.es2024,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: "warn",
      },
      settings: {
        next: {
          rootDir,
        },
        react: {
          version: "detect",
        },
      },
      rules: {
        "jsx-a11y/alt-text": [
          "warn",
          {
            elements: ["img"],
            img: ["Image"],
          },
        ],
        "jsx-a11y/aria-props": "warn",
        "jsx-a11y/aria-proptypes": "warn",
        "jsx-a11y/aria-unsupported-elements": "warn",
        "jsx-a11y/role-has-required-aria-props": "warn",
        "jsx-a11y/role-supports-aria-props": "warn",
        "react/prop-types": "off",
        "react/react-in-jsx-scope": "off",
      },
    },
  ];
}

export default next;
