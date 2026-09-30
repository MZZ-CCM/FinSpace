import { describe, expect, it } from 'vitest'
import { parseOFX, parseQIF, pdfLinesToTxs, type PdfLine } from './statements'

describe('OFX / QFX', () => {
  it('reads SGML-style OFX with unclosed leaf tags and the ledger balance', () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>GBP<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903120000[0:GMT]<TRNAMT>-42.10<FITID>1<NAME>FRESHMART &amp; CO
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>2500.00<FITID>2<NAME>ACME PAYROLL<MEMO>Salary
</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3120.55<DTASOF>20260930</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
    const txs = parseOFX(ofx)
    expect(txs).toEqual([
      { date: '2026-09-01', payee: 'ACME PAYROLL', amount: 2500 },
      { date: '2026-09-03', payee: 'FRESHMART & CO', amount: -42.1, balance: 3120.55 },
    ])
  })
})

describe('QIF', () => {
  it('reads month-first dates, apostrophe years and categories', () => {
    const qif = `!Type:Bank
D09/03'2026
T-1,250.00
PLandlord
LHousing
^
D9/14/26
T85.20
PRefund
^`
    expect(parseQIF(qif)).toEqual([
      { date: '2026-09-03', payee: 'Landlord', amount: -1250, category: 'Housing' },
      { date: '2026-09-14', payee: 'Refund', amount: 85.2, category: undefined },
    ])
  })
  it('detects day-first dates when a day is over 12', () => {
    const qif = `!Type:Bank\nD25/09/2026\nT-10.00\nPCafe\n^\nD03/09/2026\nT-5.00\nPBus\n^`
    expect(parseQIF(qif).map((t) => t.date)).toEqual(['2026-09-25', '2026-09-03'])
  })
})

/** Builds positioned lines like a PDF text layer: [x, text] pairs per line. */
function page(rows: [number, string][][], pageNo = 1): PdfLine[] {
  return rows.map((r, i) => ({ page: pageNo, y: 700 - i * 14, tokens: r.map(([x, str]) => ({ x, str, w: str.length * 5 })) }))
}

describe('PDF statements', () => {
  it('reads a UK current-account layout with Paid out / Paid in / Balance columns', () => {
    const lines = page([
      [[40, 'Statement period 1 September 2026 to 30 September 2026']],
      [[40, 'Date'], [110, 'Description'], [360, 'Paid out'], [440, 'Paid in'], [520, 'Balance']],
      [[40, '01 Sep'], [110, 'Balance brought forward'], [520, '1,000.00']],
      [[40, '02 Sep'], [110, 'CARD PAYMENT TO FRESHMART'], [365, '42.10'], [522, '957.90']],
      [[110, 'LONDON GB']],
      [[110, 'DIRECT DEBIT ENERGYCO'], [370, '60.00'], [522, '897.90']],
      [[40, '28 Sep'], [110, 'ACME PAYROLL'], [442, '2,500.00'], [517, '3,397.90']],
    ])
    expect(pdfLinesToTxs(lines)).toEqual([
      { date: '2026-09-02', payee: 'CARD PAYMENT TO FRESHMART LONDON GB', amount: -42.1, balance: 957.9 },
      { date: '2026-09-02', payee: 'DIRECT DEBIT ENERGYCO', amount: -60, balance: 897.9 },
      { date: '2026-09-28', payee: 'ACME PAYROLL', amount: 2500, balance: 3397.9 },
    ])
  })

  it('uses the running balance to sign amounts when there are no column headings', () => {
    const lines = page([
      [[40, 'Opening balance'], [500, '100.00']],
      [[40, '03/09/2026'], [120, 'Coffee'], [420, '3.50'], [500, '96.50']],
      [[40, '04/09/2026'], [120, 'Refund'], [420, '10.00'], [500, '106.50']],
    ])
    expect(pdfLinesToTxs(lines).map((t) => [t.date, t.amount])).toEqual([['2026-09-03', -3.5], ['2026-09-04', 10]])
  })

  it('reads a card statement with CR markers and rolls the year over in January', () => {
    const lines = page([
      [[40, 'Statement date 15 January 2027   Previous statement 15 December 2026']],
      [[40, '20 Dec'], [120, 'AIRLINE TICKETS'], [460, '320.00']],
      [[40, '02 Jan'], [120, 'PAYMENT RECEIVED - THANK YOU'], [460, '500.00'], [500, 'CR']],
    ])
    expect(pdfLinesToTxs(lines)).toEqual([
      { date: '2026-12-20', payee: 'AIRLINE TICKETS', amount: -320, balance: undefined },
      { date: '2027-01-02', payee: 'PAYMENT RECEIVED - THANK YOU', amount: 500, balance: undefined },
    ])
  })

  it('ignores text that is not a transaction', () => {
    const lines = page([
      [[40, 'Your account summary']],
      [[40, 'Sort code 12-34-56 Account 12345678']],
      [[40, 'Total paid out'], [400, '102.10']],
    ])
    expect(pdfLinesToTxs(lines)).toEqual([])
  })
})
