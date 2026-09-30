import { describe, expect, it } from 'vitest'
import { EMPTY } from './migrate'
import type { AppData } from './types'
import { parseCommand } from './command'
import { createVaultKey, open, seal } from './vault'
import { buildSample } from './sample'
import { positionAt, flowBetween } from './calc'

const data: AppData = {
  ...EMPTY,
  accounts: [
    { id: 'cur', name: 'Everyday', kind: 'checking', currency: 'GBP', skin: 'obsidian', openingBalance: 0, openingDate: '2026-01-01' },
    { id: 'sav', name: 'Rainy Day', kind: 'savings', currency: 'GBP', skin: 'obsidian', openingBalance: 0, openingDate: '2026-01-01' },
  ],
}

describe('plain-English commands', () => {
  it('turns “add £45 groceries” into a pre-filled expense', () => {
    const i = parseCommand('add £45 groceries', data)
    expect(i).toMatchObject({ kind: 'tx', defaults: { type: 'expense', amount: 45, category: 'Groceries' } })
  })
  it('understands synonyms and payees', () => {
    expect(parseCommand('spent 12.50 on lunch at luna cafe', data)).toMatchObject({ defaults: { amount: 12.5, category: 'Dining', payee: 'Luna Cafe' } })
    expect(parseCommand('income 2k salary', data)).toMatchObject({ defaults: { type: 'income', amount: 2000, category: 'Salary' } })
  })
  it('recognises transfers to savings', () => {
    expect(parseCommand('add 500 to savings', data)).toMatchObject({ defaults: { type: 'transfer', amount: 500, toAccountId: 'sav', accountId: 'cur' } })
  })
  it('navigates', () => {
    expect(parseCommand('open investments', data)).toMatchObject({ kind: 'nav', route: { page: 'investments' } })
    expect(parseCommand('show spending this month', data)).toMatchObject({ kind: 'nav', route: { page: 'money', type: 'expense' } })
    expect(parseCommand('hello', data)).toBeNull()
  })
})

describe('encrypted vault', () => {
  it('round-trips and rejects a wrong passcode', async () => {
    const { key, salt } = await createVaultKey('correct horse')
    const payload = { big: 'x'.repeat(200_000), n: 42 }
    const v = await seal(key, salt, payload)
    expect(v.data).not.toContain('xxxx')
    expect((await open(v, 'correct horse')).payload).toEqual(payload)
    await expect(open(v, 'wrong')).rejects.toBeTruthy()
  })
})

describe('demo data', () => {
  it('is internally consistent', () => {
    const d = buildSample({ ...EMPTY, settings: { ...EMPTY.settings, currency: 'GBP' } })
    const p = positionAt(d)
    expect(p.assets).toBeGreaterThan(0)
    expect(p.liabilities).toBeGreaterThan(0)
    expect(Number.isFinite(p.net)).toBe(true)
    // every transaction points at a real account
    const ids = new Set(d.accounts.map((a) => a.id))
    expect(d.transactions.every((t) => ids.has(t.accountId) && (!t.toAccountId || ids.has(t.toAccountId)))).toBe(true)
    // recurring rules have moved past today
    expect(d.recurring.every((r) => r.nextDate > new Date().toISOString().slice(0, 10) || !r.active)).toBe(true)
    expect(flowBetween(d, '2000-01-01', '2100-01-01').income).toBeGreaterThan(0)
  })
})

import { migrateWithReport } from './migrate'
import { esc } from './csv'

describe('restoring untrusted backups', () => {
  it('drops malformed or dangling records and clamps settings', () => {
    const { data, dropped } = migrateWithReport({
      accounts: [{ id: 'a', name: 'A', kind: 'checking', openingBalance: 10 }, { id: 'b', name: 'B', kind: 'hacker', openingBalance: 1 }, { id: 'c', name: 'C', kind: 'savings', openingBalance: 'NaN' }],
      transactions: [
        { id: '1', type: 'expense', amount: 5, date: '2026-01-02', accountId: 'a', payee: 'ok', category: 'Dining' },
        { id: '2', type: 'expense', amount: -5, date: '2026-01-02', accountId: 'a', payee: 'negative', category: 'Dining' },
        { id: '3', type: 'expense', amount: 5, date: 'yesterday', accountId: 'a', payee: 'bad date', category: 'Dining' },
        { id: '4', type: 'transfer', amount: 5, date: '2026-01-02', accountId: 'a', toAccountId: 'ghost', payee: 'dangling', category: 'Transfer' },
        { id: '5', type: 'expense', amount: Infinity, date: '2026-01-02', accountId: 'a', payee: 'inf', category: 'Dining' },
      ],
      settings: { currency: 'not-a-currency', theme: 'purple', fx: { usd: { rate: 1 }, EUR: { rate: -1, date: '2026-01-01' }, USD: { rate: 0.8, date: '2026-01-01' } }, name: 'x'.repeat(500) },
    })
    expect(data.accounts.map((a) => a.id)).toEqual(['a'])
    expect(data.transactions.map((t) => t.id)).toEqual(['1'])
    expect(dropped).toBe(6)
    expect(data.settings.currency).toBe('GBP')
    expect(data.settings.theme).toBe('system')
    expect(Object.keys(data.settings.fx)).toEqual(['USD'])
    expect(data.settings.name.length).toBe(60)
  })

  it('ignores prototype-pollution keys', () => {
    const payload = JSON.parse('{"accounts":[],"transactions":[],"settings":{"__proto__":{"polluted":true},"fx":{"__proto__":{"rate":2,"date":"2026-01-01"}}}}')
    migrateWithReport(payload)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('CSV export safety', () => {
  it('neutralises spreadsheet formulas but keeps numbers numeric', () => {
    expect(esc('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(esc('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(esc('@cmd')).toBe("'@cmd")
    expect(esc(-12.5)).toBe('-12.5')
    expect(esc('-12.50')).toBe('-12.50')
    expect(esc('Tesco, Main St')).toBe('"Tesco, Main St"')
  })
})
