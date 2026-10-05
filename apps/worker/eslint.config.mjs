// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    // the main loop in src/index.ts relies on top-level await
    'antfu/no-top-level-await': 'off',
    // the worker is a CLI process: stdout is its Docker log
    'no-console': 'off',
  },
})
