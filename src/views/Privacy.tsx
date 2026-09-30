const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined
const UPDATED = '30 September 2026'

export function Privacy() {
  const contact = CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : 'the operator of this site'
  return (
    <article className="panel page-enter prose" style={{ maxWidth: 820 }}>
      <p className="muted" style={{ marginTop: 0 }}>Last updated {UPDATED}</p>

      <h2>The short version</h2>
      <ul>
        <li>You need an account to use Finspace, so your data is always protected by a login <b>and</b> encryption.</li>
        <li>Your finances are <b>encrypted on your device</b> with an encryption passphrase that never leaves it. We store only scrambled data we can’t read — not even our staff or database provider can see your numbers.</li>
        <li>By default your encrypted data is saved to your account so it’s available on your devices. You can choose to keep it on this device only.</li>
        <li>No cookies, no analytics, no advertising, no tracking pixels, no selling or sharing of data.</li>
        <li>Nothing connects to your bank. You enter or import your own numbers.</li>
        <li>You can export, or delete your data and account, at any time from Settings.</li>
      </ul>

      <h2>What’s stored on your device</h2>
      <p>An encrypted copy of your accounts, transactions, investments, budgets, goals and preferences (AES-256-GCM, key derived from your encryption passphrase with PBKDF2-SHA256), and your sign-in session. Browser storage is used only to make the app work — never to track you — so no cookie banner is needed.</p>

      <h2>Optional services and what they receive</h2>
      <p>These are only contacted when you use the related feature. Like any website, they see your IP address and browser type.</p>
      <ul>
        <li><b>CoinGecko</b> (crypto prices) — the coin IDs you ask about.</li>
        <li><b>Finnhub</b> (stock prices) — the ticker symbols you ask about and your own free API key.</li>
        <li><b>Frankfurter / European Central Bank rates</b> (exchange rates) — the currency codes you ask about.</li>
      </ul>
      <p>Fonts and all other files are served from this site — nothing loads from Google or other third parties.</p>

      <h2>Your account</h2>
      <ul>
        <li><b>What we store:</b> your email address, a securely hashed password (managed by Supabase Auth), your encrypted data (unless you choose to store it on your device only), the name of the device and browser that last saved it, and timestamps.</li>
        <li><b>What we can’t see:</b> your finances. They’re encrypted in your browser before they’re saved, with a passphrase that never leaves your device. We can’t recover the passphrase or read your data.</li>
        <li><b>Where:</b> Supabase, in their London (UK) region. Supabase acts as our data processor.</li>
        <li><b>Why (lawful basis):</b> to provide the service you signed up for (UK GDPR / GDPR Article 6(1)(b), performance of a contract).</li>
        <li><b>How long:</b> until you delete your account. <em>Settings › Account & storage › Delete my account</em> removes your login, the encrypted copy and the data on your device immediately.</li>
      </ul>

      <h2>Your rights</h2>
      <p>You can access and export your data (Settings › download a backup or CSV), correct it (edit any record), and erase it (Settings › erase data, and delete your account if you have one). Under UK GDPR / GDPR you also have rights to restrict or object to processing and to data portability. To exercise a right or ask a question, contact {contact}. You can complain to the Information Commissioner’s Office (ico.org.uk) or your local data-protection authority.</p>

      <h2>Security</h2>
      <p>Mandatory accounts with email confirmation, end-to-end encryption of all financial data, per-account database access rules, strict Content Security Policy, no third-party scripts, HTTPS only, clickjacking protection, automatic locking and wrong-passphrase delays, validation of every imported or restored record, and protection against spreadsheet formula injection in CSV exports. No system is perfectly secure — keep backups, and use a strong password and passphrase.</p>

      <h2>Terms of use</h2>
      <ul>
        <li><b>Not financial advice.</b> Finspace shows calculations and descriptions of your own data. It doesn’t recommend investments or financial decisions. Talk to a regulated adviser for personal advice.</li>
        <li><b>Accuracy.</b> Results are only as accurate as what you enter. Market prices and exchange rates from optional services may be delayed or wrong; they’re labelled with their source and time.</li>
        <li><b>Your responsibility.</b> Keep your password and encryption passphrase safe — if you lose them, encrypted data can’t be recovered. Keep backups.</li>
        <li><b>Provided “as is”,</b> without warranties, to the extent the law allows. It’s intended for adults (18+).</li>
      </ul>

      <h2>Changes</h2>
      <p>If this notice changes, the date at the top will change. Significant changes will be shown in the app.</p>
    </article>
  )
}
