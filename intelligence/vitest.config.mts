import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "gateway/**/*.test.ts",
      "detectors/**/*.test.ts",
      // Harness end-to-end da Fase 2.6. Fakes em memória, sem serviço externo.
      "integration/**/*.test.ts",
    ],
  },
})
