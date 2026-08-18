/**
 * Lint próprio da POC.
 *
 * O portal ignora `intelligence/**` (ADR-001), então sem esta configuração o
 * subprojeto simplesmente não teria lint — e uma pasta que carrega fronteira de
 * segurança não pode ser a única sem verificação estática.
 *
 * Usa `recommendedTypeChecked`: as regras que importam aqui — promessa não
 * aguardada, comparação insegura, `any` implícito atravessando fronteira —
 * dependem de informação de tipo. Lint sem tipo não veria nenhuma delas.
 */

import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**"] },

  // Scripts em JS puro: sem checagem de tipo, mas com as regras básicas.
  {
    files: ["scripts/**/*.mjs", "*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { console: "readonly", process: "readonly" },
    },
  },

  // Código e testes da POC.
  {
    files: ["gateway/**/*.ts", "detectors/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Uma fronteira de segurança não pode ter erro engolido em silêncio.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // `any` atravessando o gateway desliga exatamente a checagem que protege.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
)
