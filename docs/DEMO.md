# Demo for Julie and Philipp

## What the recording proves

On September 10, 2026, `gpt-6-astra` completed the real Agents SDK workflow against the synthetic browser applications. No canned provider was used in that run.

- The coordinator offered an investigation when Add New Bill became the workspace context.
- Investigation took 48.7 seconds and 13 browser commands. It opened all three invoice messages, inspected the full one-record bill list, searched the missing invoice numbers, and checked the vendor sheet.
- Northstar Software INV-2026-0831, USD 1,280.00, matched BILL-1092.
- Marlow Design MD-2608, USD 4,250.00, had no match in the records searched and an approved vendor.
- Beacon Office BO-8820, USD 860.00, had pending onboarding and no preparation action.
- Preparation took 13.3 seconds and four commands. Marlow's six invoice fields were filled and verified. The bill was not saved.

The approximately 80-second recording includes the manual review steps and source inspection. Local files:

- `recordings/close-copilot-live-demo.mp4`
- `recordings/live-demo-result.json`
- `recordings/01-contextual-suggestion.png` through `04-prepared-unsaved-bill.png`

These artifacts contain synthetic data and remain local. The current runtime additionally blocks overwriting existing bill details, verifies the form currency, and stops when a user intervenes; the automated browser suite covers those follow-up hardening changes.

## Rehearse interactively

Run `pnpm start`, then `pnpm open`. Create a fresh workspace (the plus button) for each clean demonstration. Keep all three synthetic tabs selected, leave the date range as August 1–September 10, and turn on **Demo guide**.

Narration:

1. “We choose the context. Only these tabs are watched.”
2. “Opening a bill creates an opportunity to help. We accept the investigation.”
3. “The assistant reads actual browser observations. A missing match is scoped to the records checked.”
4. “Here is the invoice email and captured evidence behind the candidate.”
5. “We select the candidate. The assistant prepares the bill and checks its values.”
6. “The final save stays with us, after accounting review.”

## Real-account rehearsal still needed

Julie: open a blank vendor-bill form in the provided NetSuite sandbox and the chosen Gmail demo inbox in the dedicated Chrome profile. Load the built unpacked extension and pair it. Computer Use permissions are currently unavailable to this Codex task; enabling them permits a supervised inspection of the real controls.

Philipp: confirm the intended Gmail sample invoices, the optional onboarding-sheet tab, and the expense account/tax/period expected for the demo candidate. No new infrastructure or API key is needed; Julie's local key has already passed the live run.

Begin with read-only inspection and confirm the custom form's controls. If its widgets or invoice attachments are unsupported, adapt and test those observed controls before preparing a real sandbox bill. The recording does not establish real-account integration accuracy.
