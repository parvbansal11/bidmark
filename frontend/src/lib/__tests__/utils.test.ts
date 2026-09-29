import { describe, expect, it } from 'vitest'
import { cn, formatCurrencyINR, formatDateOnly, titleCase } from '@/lib/utils'

describe('cn', () => {
  it('merges class names and resolves Tailwind conflicts (later wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })
})

describe('titleCase', () => {
  it('converts an UPPER_SNAKE_CASE enum value into a readable title', () => {
    expect(titleCase('PROCUREMENT_OFFICER')).toBe('Procurement Officer')
  })

  it('handles a single word', () => {
    expect(titleCase('ADMIN')).toBe('Admin')
  })
})

describe('formatDateOnly', () => {
  it('renders an em-dash for a missing value', () => {
    expect(formatDateOnly(null)).toBe('—')
    expect(formatDateOnly(undefined)).toBe('—')
  })

  it('formats a valid ISO date string', () => {
    const result = formatDateOnly('2026-01-15T00:00:00Z')
    expect(result).not.toBe('—')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('formatCurrencyINR', () => {
  it('renders an em-dash for null/undefined', () => {
    expect(formatCurrencyINR(null)).toBe('—')
    expect(formatCurrencyINR(undefined)).toBe('—')
  })

  it('formats a number as an INR currency string', () => {
    const result = formatCurrencyINR(150000)
    expect(result).toContain('1,50,000')
  })
})
