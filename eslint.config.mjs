import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import convexPlugin from "@convex-dev/eslint-plugin";

export default tseslint.config(
  // 1. Global ignores
  { ignores: ["convex/_generated/**", "dist/**", "seed/**"] },

  // 2. Linter options
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
  },

  // 3. Base JS config (applies to all files)
  eslint.configs.recommended,

  // 3. TypeScript strict + stylistic (scoped to convex/)
  {
    files: ["convex/**/*.ts"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // === ERROR: реальные баги ===
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "eqeqeq": ["error", "always"],

      // === WARN: стиль и оформление ===
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "@typescript-eslint/consistent-type-definitions": "warn",
      "@typescript-eslint/array-type": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/restrict-template-expressions": ["warn", { allowNumber: true }],
      "@typescript-eslint/no-empty-function": "warn",
      "no-implicit-coercion": "warn",
      "max-params": ["warn", { max: 2 }], // 2: допускает Convex (ctx, args) и .map(item, i); наши функции используют 1 объект

      // === OFF: Convex-специфика ===
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",

      // === Unchanged ===
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
      }],
    },
  },

  // 4. Convex plugin
  ...convexPlugin.configs.recommended,
);
