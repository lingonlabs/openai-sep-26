import { cents, money, totals, type ClosePack, type Entry, type Issue, type Verdict, type Change } from '../shared/schema.js';

export function structuralIssues(entry: Entry, pack: ClosePack): Issue[] {
  const issues: Issue[] = []; const t = totals(entry);
  if (t.debit !== t.credit) issues.push({ code: 'UNBALANCED', severity: 'block',
    message: `Debits ${money(t.debit)} and credits ${money(t.credit)} differ by ${money(t.debit > t.credit ? t.debit-t.credit : t.credit-t.debit)} USD.`,
    evidenceIds: ['ENTRY-BALANCE'], changes: [] });
  for (const line of entry.lines) {
    if (!pack.accounts.some(a => a.id === line.account && a.active)) issues.push({ code: 'INVALID_ACCOUNT', severity: 'block',
      message: `Account ${line.account} on ${line.id} is not in the active account list.${line.account === '6890' ? ' Review 6800, Office supplies, if appropriate.' : ''}`,
      evidenceIds: ['COA'], changes: [] });
  }
  if (entry.postingPeriod !== pack.period || entry.postingDate.slice(0,7) !== pack.period) {
    const bank = pack.bankLines.find(b => b.id === entry.bankLineId);
    const changes: Change[] = [];
    if (bank?.date.startsWith(pack.period)) {
      if (entry.postingPeriod !== pack.period) changes.push({field:'postingPeriod',lineId:null,from:entry.postingPeriod,to:pack.period});
      if (entry.postingDate !== bank.date) changes.push({field:'postingDate',lineId:null,from:entry.postingDate,to:bank.date});
    }
    issues.push({ code:'WRONG_PERIOD',severity:'block',message:`This close requires an August 2026 posting date and period ${pack.period}; the entry uses ${entry.postingDate} / ${entry.postingPeriod}.`,evidenceIds: bank ? ['POLICY-AUG',bank.id] : ['POLICY-AUG'],changes });
  }
  return issues;
}

export function verdictFromIssues(issues: Issue[], evidenceIds: string[] = [], manualAction: string | null = null): Verdict {
  const decision = issues.some(i => i.severity === 'block') ? 'block' : issues.length ? 'warn' : 'allow';
  return {decision, summary: issues.length ? issues[0].message : 'No blocking issues found in the supported close checks.',
    evidenceIds: [...new Set([...evidenceIds,...issues.flatMap(i => i.evidenceIds)])], issues, manualAction};
}

// Explicit development provider. This is never called as a fallback from live Astra.
export function demoVerdict(entry: Entry, pack: ClosePack): Verdict {
  const issues = structuralIssues(entry, pack); const refs: string[] = [];
  const amount = totals(entry).debit;
  const duplicate = entry.invoiceId && pack.postedEntries.find(p => p.invoiceId === entry.invoiceId &&
    p.vendorId === entry.vendorId && p.currency === entry.currency && cents(p.amount) === amount && entry.kind !== 'reversal');
  if (duplicate) issues.push({code:'DUPLICATE',severity:'block',message:`Invoice ${entry.invoiceId} for USD ${money(amount)} was already posted as ${duplicate.id} on ${duplicate.date}.`,evidenceIds:[duplicate.id],changes:[]});
  const bank = pack.bankLines.find(b => b.id === entry.bankLineId);
  if (bank) {
    refs.push(bank.id); const delta = amount > cents(bank.amount) ? amount-cents(bank.amount) : cents(bank.amount)-amount;
    if (delta > 0n) {
      const changes: Change[] = [];
      const debit = entry.lines.filter(l => cents(l.debit) > 0n && cents(l.credit) === 0n);
      const credit = entry.lines.filter(l => cents(l.credit) > 0n && cents(l.debit) === 0n);
      if (entry.lines.length === 2 && debit.length === 1 && credit.length === 1 && totals(entry).credit === amount) {
        changes.push({field:'debit',lineId:debit[0].id,from:debit[0].debit,to:bank.amount},
          {field:'credit',lineId:credit[0].id,from:credit[0].credit,to:bank.amount});
      }
      issues.push({code:delta===1n?'ROUNDING':'BANK_MISMATCH',severity:delta===1n?'warn':'block',
        message:`${bank.id} shows USD ${bank.amount} on ${bank.date}; this entry is USD ${money(amount)} (difference ${money(delta)}).`,evidenceIds:[bank.id],changes});
    }
    if (entry.postingDate !== bank.date && !issues.some(i => i.code === 'WRONG_PERIOD')) issues.push({
      code:'BANK_MISMATCH',severity:'block',message:`The bank fee is dated ${bank.date}, but the entry uses ${entry.postingDate}.`,evidenceIds:[bank.id],
      changes:[{field:'postingDate',lineId:null,from:entry.postingDate,to:bank.date}]});
  } else if (entry.bankLineId) issues.push({code:'MISSING_EVIDENCE',severity:'warn',message:'The referenced bank line is missing from this close pack.',evidenceIds:['POLICY-AUG'],changes:[]});
  const history = pack.vendorHistory.find(v => v.vendorId === entry.vendorId);
  if (!duplicate && history && amount >= cents(history.typicalAmount)*10n) issues.push({code:'UNUSUAL_AMOUNT',severity:'warn',
    message:`USD ${money(amount)} is at least 10 times ${entry.vendorId}'s usual USD ${history.typicalAmount}; review the new invoice.`,evidenceIds:[history.id],changes:[]});
  const dispute = pack.disputedInvoices.find(d => d.vendorId === entry.vendorId && d.invoiceId === entry.invoiceId);
  if (dispute) issues.push({code:'DISPUTED',severity:'warn',message:`Invoice ${entry.invoiceId} is marked disputed in the close checklist.`,evidenceIds:[dispute.id],changes:[]});
  if (entry.payrollId && pack.payroll.some(p => p.id === entry.payrollId && cents(p.amount) === amount)) refs.push(entry.payrollId);
  if (entry.reversalOf && pack.postedEntries.some(p => p.id === entry.reversalOf)) refs.push(entry.reversalOf);
  if (entry.kind === 'accrual' && entry.vendorId === 'LANDLORD' && amount === 500000n) refs.push('LEASE-AUG');
  return verdictFromIssues(issues,refs,duplicate ? 'Discard or correct this unsaved duplicate. No posted journal will be voided.' : issues.some(i=>i.severity==='block'&&!i.changes.length) ? 'Review the cited issue and correct the entry manually.' : null);
}
