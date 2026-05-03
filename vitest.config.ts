import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: [
        "convex/**/*.ts",
        "seed/generation/schemas.ts",
      ],
      exclude: [
        "convex/_generated/**",
      ],
    },
  },
});
