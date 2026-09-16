import { describe, expect, it } from 'vitest'
import { Users } from '@/collections/Users'
import { CNJP_SEQUENCE, ROW_SEQUENCE, RULE_OPS } from '@/globals/FunnelConfig'

const fieldByName = (name: string) =>
  Users.fields.find((field: any) => field?.name === name) as any

const canUpdateField = (name: string, user: any) => {
  const field = fieldByName(name)
  return field?.access?.update?.({ req: { user } })
}

describe('RegFunnel production invariants', () => {
  it('keeps the canonical ROW sequence at exactly 15 steps', () => {
    expect([...ROW_SEQUENCE]).toEqual([
      '01_tv_account_types',
      '02_start_trading_easy',
      '03_know_trading_costs',
      '04_welcome_bonus',
      '05_trading_became_easier',
      '06_platform_choice',
      '07_mt5',
      '08_account_types_reminder',
      '09_gold',
      '10_vanilla_options',
      '11_tv_integration',
      '12_easytrade',
      '13_trade_on_mt5',
      '14_demo_trading',
      '15_account_types_final',
    ])
    expect(new Set(ROW_SEQUENCE).size).toBe(15)
  })

  it('keeps the canonical CN/JP sequence at exactly 10 steps', () => {
    expect([...CNJP_SEQUENCE]).toEqual([
      '02_start_trading_easy',
      '03_know_trading_costs',
      '04_welcome_bonus',
      '05_trading_became_easier',
      '06_platform_choice',
      '09_gold',
      '10_vanilla_options',
      '11_tv_integration',
      '12_easytrade',
      '14_demo_trading',
    ])
    expect(new Set(CNJP_SEQUENCE).size).toBe(10)
  })

  it('does not reintroduce obsolete funnel steps', () => {
    const all = [...ROW_SEQUENCE, ...CNJP_SEQUENCE]
    expect(all).not.toContain('08_bonus_100')
    expect(all).not.toContain('16_mt5_gold_hook')
    expect(all).not.toContain('17_first_deposit')
    expect(all).not.toContain('18_trade_on_mt5')
    expect(all).not.toContain('19_account_types_final')
  })

  it('supports both existence rule operators', () => {
    const operators = RULE_OPS.map((item) => item.value)
    expect(operators).toContain('exists')
    expect(operators).toContain('not_exists')
  })

  it('prevents ordinary users from changing authorization-bearing fields', () => {
    const member = { id: 10, department: 'sales', level: 'member', superAdmin: false }

    expect(canUpdateField('department', member)).toBe(false)
    expect(canUpdateField('level', member)).toBe(false)
    expect(canUpdateField('regions', member)).toBe(false)
    expect(canUpdateField('superAdmin', member)).toBe(false)
  })

  it('allows a Super Admin to manage authorization-bearing fields', () => {
    const admin = { id: 1, department: 'marketing', level: 'manager', superAdmin: true }

    expect(canUpdateField('department', admin)).toBe(true)
    expect(canUpdateField('level', admin)).toBe(true)
    expect(canUpdateField('regions', admin)).toBe(true)
    expect(canUpdateField('superAdmin', admin)).toBe(true)
  })
})
