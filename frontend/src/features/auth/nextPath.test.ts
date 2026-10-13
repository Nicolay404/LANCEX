import { describe, expect, it } from 'vitest'

import { loginPathFor, safeNextPath } from './nextPath'

describe('safeNextPath', () => {
  it.each([
    ['/cuenta', '/cuenta'],
    ['/subastas/1?tab=pujas', '/subastas/1?tab=pujas'],
    [null, '/'],
    ['', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/a://b', '/'],
    ['/ok\nSet-Cookie', '/'],
    ['/ingresar?next=/x', '/'],
  ])('%s → %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it('loginPathFor codifica la ruta actual', () => {
    expect(loginPathFor('/cuenta?x=1')).toBe('/ingresar?next=%2Fcuenta%3Fx%3D1')
    expect(loginPathFor('//evil')).toBe('/ingresar')
  })
})
