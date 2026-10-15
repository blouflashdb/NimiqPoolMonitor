import { expect, it } from 'vitest'
import { isAdminToken } from '../utils/admin'

it('accepts only the admin token', () => {
  expect(isAdminToken('s3cret', 's3cret')).toBe(true)
  expect(isAdminToken('s3cre', 's3cret')).toBe(false)
  expect(isAdminToken('', 's3cret')).toBe(false)
  expect(isAdminToken(undefined, 's3cret')).toBe(false)
  expect(isAdminToken(['s3cret'], 's3cret')).toBe(false)
})

it('rejects everything until the worker generated a token', () => {
  expect(isAdminToken('', undefined)).toBe(false)
  expect(isAdminToken('', '')).toBe(false)
})
