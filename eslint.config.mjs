import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // POC do Centro de Inteligência — subprojeto isolado, toolchain própria.
    // Ver intelligence/docs/ADR-001-boundary-with-existing-app.md
    "intelligence/**",
  ]),
]);

export default eslintConfig;
