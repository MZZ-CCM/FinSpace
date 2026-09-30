/**
 * Optional live prices — every source here is free:
 *  • CoinGecko public API — no key, no account (crypto)
 *  • Finnhub free tier — user-supplied free key (US stocks & ETFs)
 *  • Frankfurter (ECB rates) — no key, converts USD quotes into your currency
 * Nothing is ever required: manual prices always work.
 */
import type { Holding } from './types'

export interface QuoteResult {
  holdingId: string
  price?: number
  error?: string
  source?: 'finnhub' | 'coingecko' | 'coinbase'
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

async function usdTo(currency: string): Promise<number> {
  if (currency === 'USD') return 1
  const j = await getJSON(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${currency}`)
  const rate = j?.rates?.[currency]
  if (!rate) throw new Error(`No free exchange rate for ${currency}`)
  return rate
}

export async function fetchQuotes(holdings: Holding[], currency: string, finnhubKey?: string): Promise<QuoteResult[]> {
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

  if (equities.length) {
    if (!finnhubKey) {
      for (const h of equities) out.push({ holdingId: h.id, error: 'Add a free Finnhub key in Settings to fetch stock prices' })
    } else {
      let fx = 1
      try {
        fx = await usdTo(currency)
      } catch (e) {
        for (const h of equities) out.push({ holdingId: h.id, error: (e as Error).message })
        return out
      }
      for (const h of equities) {
        try {
          const j = await getJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(h.symbol)}&token=${encodeURIComponent(finnhubKey)}`)
          if (j?.c) out.push({ holdingId: h.id, price: Math.round(j.c * fx * 100) / 100, source: 'finnhub' })
          else out.push({ holdingId: h.id, error: `No quote for ${h.symbol} (free tier covers US listings)` })
        } catch (e) {
          out.push({ holdingId: h.id, error: (e as Error).message })
        }
      }
    }
  }
  return out
}
