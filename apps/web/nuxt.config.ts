export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  // antfu's config provides the base rules; Nuxt only adds its project-aware ones
  eslint: { config: { standalone: false } },
  css: ['~/assets/css/main.css'],
  ssr: false,
  devtools: { enabled: false },
  app: { head: { title: 'Nimiq Pool Fee Monitor' } },
  // Override with NUXT_FEE_TOLERANCE
  runtimeConfig: { feeTolerance: 0.01 },
  typescript: {
    // relative to .nuxt/
    nodeTsConfig: { include: ['../vitest.config.ts'] },
  },
})
