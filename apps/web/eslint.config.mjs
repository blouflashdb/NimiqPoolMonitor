// @ts-check
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  antfu({
    rules: {
      // vitest.config.ts relies on top-level await
      'antfu/no-top-level-await': 'off',
    },
  }),
)
