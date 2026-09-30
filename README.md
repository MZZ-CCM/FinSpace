# Finspace — private wealth cockpit

A manual-first personal finance app for accounts, cards, spending, investments, budgets and goals. **Your own entries are the source of truth**; market prices and exchange rates are optional extras. Every user has an account, and every user's financial data is **end-to-end encrypted**.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 45 tests: financial maths, validation, encryption, commands, UI flows and account security
npm run build      # static site in dist/ (Vercel, Netlify, Cloudflare Pages, GitHub Pages)
```

## Features

| Area | Highlights |
|---|---|
| **Overview** | Net worth with assets and liabilities, change this month and this year, and a 7D–All chart · a summary of what changed since your last visit · the month in numbers · money in vs out · spending by category · **swipeable 3D card deck** · goals · upcoming payments · insights · sections you can show or hide |
| **Money** | Activity (search, filters, #tags, bulk delete with undo, CSV import and export) · Recurring (added automatically when due) · Analysis (period comparisons, largest purchases, spending pace) |
| **Accounts & cards** | 11 account types, each in its own currency · Swipe / Grid / Table / Compare views · **Import statement per card** — PDF, CSV/TSV, Excel (.xlsx), OFX/QFX and QIF, read on the device and reconciled to the statement's closing balance · update balance · pay off a card or loan |
| **Investments** | Units and prices, or just totals · made and lost this month · year to date · total return · value over time · heatmap · contribution to returns · every price labelled with its source |
| **Budgets** | **Overall monthly budget** plus category budgets (monthly or yearly) · pace marker · forecast · how much a day you can spend and stay on budget · calm warnings |
| **Goals, Insights, Reports** | Goals with the monthly amount needed · financial-health measures with the method explained · a paginated timeline · monthly, year-on-year and custom reports (print or save as PDF, CSV) |
| **Everywhere** | ⌘K palette with plain-English commands (they pre-fill a form and never save on their own) · keyboard shortcuts · undo · dark, light and system themes · share Finspace (native share sheet, or copy link) |
| **iPhone, iPad & desktop app** | Installs from Safari (Share → Add to Home Screen) or Chrome/Edge (Install) and runs full-screen: Home Screen icon, safe-area layout for the notch and home indicator, bottom sheets, 44pt touch targets, no input zoom, offline shell. Typography: Geist for interface and figures, Fraunces for headings |

## Security & privacy

| Control | Implementation |
|---|---|
| Accounts (mandatory) | Supabase Auth with email and password, email confirmation required, and a 10+ character password with a number or symbol. The app shows only the sign-in screen until there's a valid session, and it locks immediately if the session ends |
| Encryption (always on) | Each user creates an **encryption passphrase** separate from their password. AES-256-GCM with PBKDF2-SHA256 (310k iterations) encrypts the device copy and the cloud copy with the same key, so neither is ever stored in plain text. The passphrase never leaves the browser, and Supabase holds ciphertext only |
| Storage | By default, the encrypted copy is saved to the user's account (Supabase, London, eu-west-2). "If you'd rather your data be stored locally, click here" keeps it encrypted on the device only, and can delete the cloud copy |
| Device safety | Encrypted data on a device is bound to one account; another account can't open it. Auto-lock after 1–60 min of inactivity, with growing delays after wrong passphrases. In cloud mode, sign-out saves and then wipes the device. Changing the passphrase re-encrypts everywhere |
| Database | Row Level Security gives owner-only access, and anonymous access is revoked (verified: anonymous reads and RPC calls return `401`). Conflicting saves from two devices are detected rather than overwritten |
| Browser hardening | Strict CSP (no third-party scripts, and `connect-src` limited to Supabase, CoinGecko, Coinbase and Frankfurter) · HSTS · `X-Frame-Options: DENY` and `frame-ancestors 'none'` · `nosniff` · `Referrer-Policy: no-referrer` · Permissions-Policy · COOP/CORP. See `vercel.json`, `public/_headers` and `csp.txt` |
| Input handling | Every restored or synced record is validated field by field; malformed or dangling records are dropped and the count reported. CSV import has a 10 MB cap and duplicate detection. CSV exports are protected against formula injection |
| Third parties | Fonts are self-hosted: no Google Fonts, analytics, cookies or trackers. Price and rate lookups send only ticker or currency codes |
| Rights (UK GDPR / GDPR) | In-app export (JSON, encrypted, CSV), erase all data, and delete account (removes the login and the cloud copy immediately). A privacy notice and terms are at `#/privacy` |
| Accessibility (WCAG 2.2 AA) | Text contrast of at least 4.5:1 in both themes, visible focus, focus trapping in dialogs, 24px minimum targets, labelled controls, a table view for charts, meaning never shown by colour alone, reduced motion respected |
| Dependencies | `npm audit`: 0 vulnerabilities |

The Supabase security advisor flags `delete_my_account()` as a SECURITY DEFINER function that signed-in users can call. That's intentional: it only ever deletes the caller's own account (`auth.uid()`), which is the right-to-erasure feature.

## Deploy

1. Push this repo to GitHub, then import it in Vercel. The framework is detected as Vite. `.env` holds only the public Supabase URL and publishable key, which are safe in the browser.
2. **Supabase → Authentication → URL Configuration:** set **Site URL** to your Vercel URL and add it (plus `http://localhost:5173` for development) to **Redirect URLs**. Without this, email-confirmation and password-reset links go to `localhost:3000` and sign-up can't be completed.
3. **Supabase → Authentication → Providers → Email:** set the minimum password length to **10** (the app enforces this too), and turn on **leaked-password protection**.
4. **Supabase → Authentication → SMTP:** add a custom email provider (for example Resend, free tier). Supabase's built-in email only sends a few messages an hour, which isn't enough for real sign-ups.
5. Set `VITE_CONTACT_EMAIL` in Vercel so the privacy notice shows a contact for data requests.

**Free-tier notes:** Supabase free projects pause after about a week without activity (the app keeps working locally and sync resumes once you restore the project). The Vercel Hobby plan is free for personal, non-commercial use.

## Known limits

- Notifications are sent from the device, with no push server, so they arrive while the app is open or installed and recently used.
- A forgotten encryption passphrase can't be recovered by anyone. That's the price of end-to-end encryption, and users are warned when they create it.
- Crypto prices come from CoinGecko, with a Coinbase fallback. CoinGecko blocks some networks, and the fallback covers that.
- Sync resolves conflicts by asking which version to keep. It doesn't merge individual edits.
