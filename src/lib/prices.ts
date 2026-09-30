/**
 * Optional live prices — every source here is free:
 *  • CoinGecko public API, then Coinbase spot prices — no key, no account (crypto)
 *  • Frankfurter (ECB rates) — no key (exchange rates)
 * Stocks, funds and bonds are priced by hand: no free source works without an API key.
 */
import type { Holding } from './types'

export interface QuoteResult {
  holdingId: string
  price?: number
  error?: string
  source?: 'coingecko' | 'coinbase'
}

/** Free exchange rate from the ECB via Frankfurter (no key). Returns base-currency units per 1 `from`. */
export async function fetchRate(from: string, base: string): Promise<number> {
  const j = await getJSON(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${base}`)
  const rate = j?.rates?.[base]
  if (!rate) throw new Error(`No free exchange rate for ${from} → ${base}. Enter it by hand instead.`)
  return rate
}

async function getJSON(url: string) {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('Couldn’t reach the price service — check your connection')
  }
  if (res.status === 429) throw new Error('Rate limited — wait a minute and try again')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

export async function fetchQuotes(holdings: Holding[], currency: string): Promise<QuoteResult[]> {
  const out: QuoteResult[] = []
  const crypto = holdings.filter((h) => h.assetType === 'crypto')
  const equities = holdings.filter((h) => h.assetType !== 'crypto')

  // Crypto: CoinGecko first (by coin ID), then Coinbase spot prices (by ticker) as a keyless fallback.
  const gotCrypto = new Map<string, QuoteResult>()
  const withId = crypto.filter((h) => h.coingeckoId)
  if (withId.length) {
    try {
      const vs = currency.toLowerCase()
      const ids = withId.map((h) => h.coingeckoId).join(',')
      const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`)
      for (const h of withId) {
        const p = j?.[h.coingeckoId!]?.[vs]
        if (p) gotCrypto.set(h.id, { holdingId: h.id, price: p, source: 'coingecko' })
      }
    } catch { /* fall through to Coinbase */ }
  }
  for (const h of crypto) {
    if (gotCrypto.has(h.id)) continue
    try {
      const pair = `${h.symbol.toUpperCase()}-${currency.toUpperCase()}`
      const j = await getJSON(`https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot`)
      const p = parseFloat(j?.data?.amount)
      gotCrypto.set(h.id, p > 0 ? { holdingId: h.id, price: p, source: 'coinbase' } : { holdingId: h.id, error: `No free ${currency} price found for ${h.symbol}` })
    } catch {
      gotCrypto.set(h.id, { holdingId: h.id, error: `No free ${currency} price found for ${h.symbol}${h.coingeckoId ? '' : ' — try adding its CoinGecko ID'}` })
    }
  }
  out.push(...gotCrypto.values())

  for (const h of equities) out.push({ holdingId: h.id, error: `Update ${h.symbol} by hand — live prices cover crypto only` })
  return out
}
