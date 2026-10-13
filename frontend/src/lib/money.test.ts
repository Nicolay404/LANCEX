import { describe, expect, it } from 'vitest'

import { formatMoney, isMoneyString, isValidAmountInput, normalizeAmount, toCents } from './money'

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

  it('valida importes escritos por el usuario', () => {
    expect(isValidAmountInput('150')).toBe(true)
    expect(isValidAmountInput('150.5')).toBe(true)
    expect(isValidAmountInput('150.55')).toBe(true)
    expect(isValidAmountInput('150.555')).toBe(false)
    expect(isValidAmountInput('-1')).toBe(false)
    expect(isValidAmountInput('1e3')).toBe(false)
    expect(isValidAmountInput('')).toBe(false)
  })

  it('compara en centavos sin flotantes y normaliza a 2 decimales', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(toCents('0.3'))
    expect(toCents('140.05')).toBe(14005n)
    expect(normalizeAmount('140')).toBe('140.00')
    expect(normalizeAmount('140.5')).toBe('140.50')
  })
})
