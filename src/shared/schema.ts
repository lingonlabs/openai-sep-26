import { z } from 'zod';

export const Money = z.string().regex(/^(0|[1-9]\d{0,10})\.\d{2}$/);
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const EntrySchema = z.object({
  id: z.string().min(1).max(100), postingDate: DateString,
  postingPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('USD'), kind: z.enum(['standard', 'accrual', 'reversal', 'payroll']),
  vendorId: z.string().max(100).nullable(), invoiceId: z.string().max(100).nullable(),
  bankLineId: z.string().max(100).nullable(), payrollId: z.string().max(100).nullable(),
  reversalOf: z.string().max(100).nullable(), memo: z.string().max(4000),
  lines: z.array(z.object({
    id: z.string().min(1).max(100), account: z.string().min(1).max(30),
    debit: Money, credit: Money, memo: z.string().max(1000),
  }).strict()).min(2).max(100),
}).strict().refine(e => new Set(e.lines.map(l => l.id)).size === e.lines.length, 'Duplicate line IDs');
export type Entry = z.infer<typeof EntrySchema>;

export const ChangeSchema = z.object({
  field: z.enum(['postingDate', 'postingPeriod', 'memo', 'account', 'debit', 'credit']),
  lineId: z.string().nullable(), from: z.string(), to: z.string(),
}).strict();
export type Change = z.infer<typeof ChangeSchema>;
export const IssueCode = z.enum(['DUPLICATE', 'WRONG_PERIOD', 'BANK_MISMATCH', 'UNBALANCED',
  'INVALID_ACCOUNT', 'ROUNDING', 'UNUSUAL_AMOUNT', 'DISPUTED', 'MISSING_EVIDENCE']);
export const IssueSchema = z.object({
  code: IssueCode, severity: z.enum(['warn', 'block']), message: z.string(),
  evidenceIds: z.array(z.string()), changes: z.array(ChangeSchema),
}).strict();
export type Issue = z.infer<typeof IssueSchema>;
export const VerdictSchema = z.object({
  decision: z.enum(['allow', 'warn', 'block']), summary: z.string(),
  evidenceIds: z.array(z.string()), issues: z.array(IssueSchema), manualAction: z.string().nullable(),
}).strict();
export type Verdict = z.infer<typeof VerdictSchema>;

export const GateRequestSchema = z.object({
  requestId: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  packVersion: z.string(), entry: EntrySchema,
}).strict();
export type GateRequest = z.infer<typeof GateRequestSchema>;
export const GateResponseSchema = z.object({
  requestId: z.string(), fingerprint: z.string(), packVersion: z.string(), verdict: VerdictSchema,
  meta: z.object({ mode: z.enum(['demo', 'live']), model: z.string().nullable(), ms: z.number(),
    inputTokens: z.number(), cachedTokens: z.number(), cacheWriteTokens: z.number(), outputTokens: z.number(),
    promptVersion: z.string(), prefixHash: z.string() }),
});
export type GateResponse = z.infer<typeof GateResponseSchema>;

export interface Evidence { id: string; source: string; text: string }
export interface ClosePack {
  version: string; company: string; synthetic: true; period: string;
  accounts: { id: string; name: string; active: boolean }[];
  postedEntries: { id: string; date: string; period: string; vendorId: string | null;
    invoiceId: string | null; amount: string; currency: string; kind: string }[];
  bankLines: { id: string; date: string; amount: string; currency: string; description: string }[];
  payroll: { id: string; amount: string }[];
  vendorHistory: { id: string; vendorId: string; typicalAmount: string }[];
  disputedInvoices: { id: string; vendorId: string; invoiceId: string }[];
  evidence: Evidence[];
}

export function cents(value: string): bigint { return BigInt(value.replace('.', '')); }
export function money(value: bigint): string {
  const sign = value < 0n ? '-' : ''; const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function totals(entry: Entry) {
  return entry.lines.reduce((s, l) => ({ debit: s.debit + cents(l.debit), credit: s.credit + cents(l.credit) }),
    { debit: 0n, credit: 0n });
}
export function canonicalEntry(entry: Entry): string { return JSON.stringify(EntrySchema.parse(entry)); }
export async function fingerprint(entry: Entry): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalEntry(entry)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

// All edits are constrained by stable line IDs and compare-before-write values.
export function applyChanges(entry: Entry, changes: Change[]): Entry {
  if (changes.length > 12) throw new Error('Edit limit exceeded');
  const next = structuredClone(entry); const targets = new Set<string>();
  for (const change of changes) {
    const key = `${change.lineId ?? 'header'}:${change.field}`;
    if (targets.has(key)) throw new Error('Conflicting proposed edits');
    targets.add(key);
    if (['postingDate', 'postingPeriod', 'memo'].includes(change.field) && change.lineId === null) {
      const field = change.field as 'postingDate' | 'postingPeriod' | 'memo';
      if (next[field] !== change.from) throw new Error('Entry changed since review');
      next[field] = change.to;
    } else if (['account', 'debit', 'credit'].includes(change.field) && change.lineId !== null) {
      const line = next.lines.find(l => l.id === change.lineId);
      const field = change.field as 'account' | 'debit' | 'credit';
      if (!line || line[field] !== change.from) throw new Error('Line changed since review');
      line[field] = change.to;
    } else throw new Error('Unsupported edit target');
  }
  const parsed = EntrySchema.parse(next);
  const balance = totals(parsed);
  if (balance.debit !== balance.credit) throw new Error('Proposed correction would leave the entry unbalanced');
  return parsed;
}
export function proposedChanges(verdict: Verdict): Change[] {
  return verdict.issues.flatMap(issue => issue.changes);
}
