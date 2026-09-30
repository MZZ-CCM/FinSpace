// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { open as openVault } from './lib/vault'

// ── fake Supabase: a signed-in user and an in-memory encrypted vault row ──
const cloud = vi.hoisted(() => ({ user: { id: 'user-1', email: 'ada@example.com' } as { id: string; email: string } | null, row: null as null | Record<string, string> }))
vi.mock('./lib/cloud', () => ({
  cloudConfigured: () => true,
  currentUser: async () => cloud.user,
  onAuthChange: async () => () => undefined,
  fetchVault: async () => (cloud.row ? { v: 1, format: 'finspace-encrypted', ...cloud.row } : null),
  pushVault: async (snap: Record<string, string>) => { cloud.row = { salt: snap.salt, iv: snap.iv, data: snap.data, device: snap.device, savedAt: snap.savedAt }; return 'ok' },
  deleteVault: async () => { cloud.row = null },
  signIn: async () => cloud.user, signUp: async () => ({ session: null }), signOut: async () => undefined,
  sendReset: async () => undefined, updatePassword: async () => undefined, deleteAccount: async () => undefined,
  friendly: (e: unknown) => String(e),
}))

const PASS = 'correct horse battery 9'
import { StoreProvider } from './lib/store'
import { UIProvider } from './lib/ui'
import { App } from './App'

function mount() {
  return render(<StoreProvider><UIProvider><App /></UIProvider></StoreProvider>)
}
const wait = (ms = 350) => act(() => new Promise((r) => setTimeout(r, ms)))
/** Reads what's persisted on the device — by decrypting it, because it's never stored in plain text. */
async function saved() {
  await wait(400)
  const v = JSON.parse(localStorage.getItem('finspace:vault') ?? 'null')
  if (!v) return {}
  return (await openVault(v, PASS)).payload as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  localStorage.clear()
  location.hash = '#/'
  cloud.user = { id: 'user-1', email: 'ada@example.com' }
  cloud.row = null
})

/** Signed in, first time: create the encryption passphrase. */
async function createPassphrase() {
  mount()
  await screen.findByText(/Protect your data with an/, undefined, { timeout: 3000 })
  const [p1, p2] = screen.getAllByLabelText(/Encryption passphrase|Repeat it/)
  fireEvent.change(p1, { target: { value: PASS } })
  fireEvent.change(p2, { target: { value: PASS } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Encrypt and continue' }))
  await screen.findByText('Set up with my own numbers', undefined, { timeout: 5000 })
}
afterEach(() => cleanup())

async function startDemo() {
  await createPassphrase()
  fireEvent.click(screen.getByText('Explore the demo first'))
  await wait()
}

async function startFresh() {
  await createPassphrase()
  fireEvent.click(screen.getByText('Set up with my own numbers'))
  fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText(/What currency/), { target: { value: 'GBP' } })
  fireEvent.click(screen.getByRole('button', { name: /Next: accounts/ }))
  const balances = screen.getAllByLabelText(/Balance|Amount owed/)
  fireEvent.change(balances[0], { target: { value: '1500' } })
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
  fireEvent.click(screen.getByRole('button', { name: /Open my dashboard/ }))
  await wait()
}

describe('onboarding', () => {
  it('opens the fictional demo, clearly labelled', async () => {
    await startDemo()
    expect(screen.getByText(/You’re exploring a/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Net worth' })).toBeTruthy()
    expect((await saved()).settings.sampleData).toBe(true)
  })

  it('sets up with your own numbers', async () => {
    await startFresh()
    expect(document.querySelector('.topbar .crumb')?.textContent).toMatch(/Ada/)
    const d = await saved()
    expect(d.accounts.map((a: { name: string }) => a.name)).toEqual(['Current account', 'Savings'])
    expect(d.accounts[0].openingBalance).toBe(1500)
  })
})

describe('adding a transaction', () => {
  it('validates, saves, and can be undone', async () => {
    await startFresh()
    fireEvent.click(screen.getAllByRole('button', { name: /Add transaction/ })[0])
    const sheet = screen.getByRole('dialog', { name: 'Add a transaction' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add money out' }))
    expect(within(sheet).getByText('Enter an amount above zero')).toBeTruthy()
    expect(within(sheet).getByText('Pick a category')).toBeTruthy()

    fireEvent.change(within(sheet).getByPlaceholderText('0.00'), { target: { value: '12.34' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /Dining/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add money out' }))
    expect(await screen.findByText(/Money out of £12.34 added/)).toBeTruthy()
    await wait()
    const tx = (await saved()).transactions
    expect(tx).toHaveLength(1)
    expect(tx[0]).toMatchObject({ type: 'expense', amount: 12.34, category: 'Dining' })

    // delete from the Money page, then undo
    act(() => { location.hash = '#/money' })
    await wait()
    fireEvent.click(screen.getByRole('button', { name: /Edit Dining/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit transaction' })).getByRole('button', { name: /Delete/ }))
    await wait()
    expect((await saved()).transactions).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await wait()
    expect((await saved()).transactions).toHaveLength(1)
  })
})

describe('budgets', () => {
  it('sets an overall monthly budget', async () => {
    await startFresh()
    act(() => { location.hash = '#/budgets' })
    await wait()
    fireEvent.click(screen.getByRole('button', { name: /Set an overall budget/ }))
    const sheet = screen.getByRole('dialog', { name: 'Set an overall budget' })
    fireEvent.change(within(sheet).getByPlaceholderText('0.00'), { target: { value: '2000' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Set overall budget' }))
    await wait()
    expect((await saved()).settings.overallBudget).toBe(2000)
    expect(screen.getByLabelText('Overall budget').textContent).toMatch(/of £2,000\.00/)
  })
})

describe('privacy', () => {
  it('hides every amount in privacy mode', async () => {
    await startDemo()
    const hero = () => screen.getByRole('region', { name: 'Net worth' }).textContent ?? ''
    expect(hero()).toMatch(/[£$€]\d/)
    fireEvent.click(screen.getByRole('button', { name: 'Hide amounts' }))
    await wait()
    expect(hero()).toMatch(/••••/)
    expect(hero()).not.toMatch(/[£$€]\d/)
  })

  it('shows the privacy notice before sign-up', async () => {
    cloud.user = null
    location.hash = '#/privacy'
    mount()
    expect(screen.getByText('The short version')).toBeTruthy()
    expect(screen.getByText(/Not financial advice/)).toBeTruthy()
  })
})

describe('account security', () => {
  it('shows only the sign-in screen to signed-out visitors', async () => {
    cloud.user = null
    mount()
    expect(await screen.findByText(/Welcome to/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Net worth' })).toBeNull()
    expect(screen.getByRole('button', { name: /Create an account/ })).toBeTruthy()
  })

  it('never stores financial data in plain text, locally or in the cloud', async () => {
    await startDemo()
    await wait(3200) // let the encrypted cloud upload run
    const everything = JSON.stringify(localStorage) + JSON.stringify(cloud.row)
    expect(localStorage.getItem('finspace:v1')).toBeNull()
    expect(everything).not.toMatch(/Northwind|Everyday|Rainy Day|Travel Rewards/)
    expect(cloud.row?.data.length).toBeGreaterThan(1000)
    expect(JSON.parse(localStorage.getItem('finspace:vault')!).owner).toBe('user-1')
  })

  it('locks, refuses a wrong passphrase, and unlocks with the right one', async () => {
    await startFresh()
    fireEvent.click(screen.getByRole('button', { name: 'Lock Finspace' }))
    await screen.findByText('Unlock Finspace')
    fireEvent.change(screen.getByLabelText('Encryption passphrase'), { target: { value: 'wrong wrong wrong 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText(/didn’t work/, undefined, { timeout: 4000 })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Encryption passphrase'), { target: { value: PASS } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(document.querySelector('.topbar .crumb')?.textContent).toMatch(/Ada/), { timeout: 4000 })
  })

  it('won’t open another account’s data on a shared device', async () => {
    await startFresh()
    cleanup()
    cloud.user = { id: 'user-2', email: 'eve@example.com' }
    mount()
    expect(await screen.findByText(/another account’s data/)).toBeTruthy()
    expect(screen.queryByLabelText('Encryption passphrase')).toBeNull()
  })

  it('restores your data on a new device from the encrypted cloud copy', async () => {
    await startFresh()
    await wait(3200)
    cleanup()
    localStorage.clear() // a brand-new device
    mount()
    fireEvent.change(await screen.findByLabelText('Encryption passphrase', undefined, { timeout: 3000 }), { target: { value: PASS } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock my data' }))
    await waitFor(() => expect(document.querySelector('.topbar .crumb')?.textContent).toMatch(/Ada/), { timeout: 5000 })
  })
})
