import { describe, expect, it } from 'vitest'

import { makeMe } from '@/test/fakeServer'

import {
  ADMIN_CAPS,
  Cap,
  findOrganization,
  hasAnyCapability,
  hasCapability,
  MODERATION_CAPS,
} from './capabilities'

describe('capabilities', () => {
  it('visitante no tiene ninguna', () => {
    expect(hasCapability(null, Cap.CATALOG_VIEW)).toBe(false)
    expect(hasAnyCapability(undefined, MODERATION_CAPS)).toBe(false)
  })

  it('staff no tiene capacidades comerciales', () => {
    for (const kind of ['moderator', 'admin'] as const) {
      const me = makeMe(kind)
      expect(hasCapability(me, Cap.BID_PLACE)).toBe(false)
      expect(hasCapability(me, Cap.LISTING_MANAGE_OWN)).toBe(false)
      expect(hasAnyCapability(me, MODERATION_CAPS)).toBe(true)
    }
    expect(hasAnyCapability(makeMe('moderator'), ADMIN_CAPS)).toBe(false)
  })

  it('findOrganization solo encuentra organizaciones propias', () => {
    const me = makeMe('user', {
      organizations: [
        {
          id: 'o1',
          legal_name: 'A',
          role: 'member',
          verification_status: 'pending',
          is_buyer: true,
          is_supplier: false,
          capabilities: [],
        },
      ],
    })
    expect(findOrganization(me, 'o1')?.legal_name).toBe('A')
    expect(findOrganization(me, 'o2')).toBeUndefined()
  })
})
