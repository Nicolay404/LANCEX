import { describe, expect, it } from 'vitest'

import { formatMoney, isMoneyString } from './money'

describe('money', () => {
  it('formatea strings decimales en es-EC / USD', () => {
    expect(formatMoney('1234.5')).toMatch(/1\.234,50/)
    expect(formatMoney('1234.5')).toContain('$')
  })

  it('no acepta números ni texto arbitrario', () => {
    expect(isMoneyString(125)).toBe(false)
    expect(isMoneyString('12a')).toBe(false)
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney('abc')).toBe('—')
  })
})
