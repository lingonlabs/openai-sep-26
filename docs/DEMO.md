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

## Real-account check on September 10

The connected Chrome extension and live Astra agent read the selected work Gmail message and the sandbox Bill form. They also opened and read the real Bills list, which showed five records. The test invoice was not among those visible records; this was not an account-wide search.

The run exposed integration gaps now covered by regression tests: supported tabs were treated as closed during navigation; navigation sometimes destroyed the click reply channel; NetSuite required-field labels contained newlines and asterisks; Gmail's search input was labeled `Ask Gmail`. Loading now waits without replaying the preceding action. If a click loses its reply, the extension reads and verifies a different document in the same tab and origin before continuing; other unknown outcomes still stop. Labels are normalized, and the Gmail search field is recognized only in Gmail. The extension build is 0.2.2. Reload it in Chrome and refresh the selected pages to apply the changes. Both updated Gmail search and navigation recovery still need a real-browser retest after that reload.

Automatic preparation on the real NetSuite form is **not ready**. Its Vendor input is a custom combobox with no exposed options; the runtime now refuses to type an unverified vendor into it. The form uses Bill Total and item/expense sublists, unlike the synthetic form. Its displayed posting period also differed from the invoice date and needs human confirmation. Custom picker selection, line/account coding, and verification need an application-specific adapter. No real bill fields were filled or saved during this check.

The test email also contains the literal vendor placeholder `[Exact existing NetSuite vendor name]`. Such findings now require review and cannot become preparation candidates. Use an actual existing sandbox vendor name for the next rehearsal.

## Remaining real-account rehearsal

Julie: reload Close Copilot in Chrome's extensions page, refresh the selected Gmail and NetSuite tabs, and supply the exact sandbox vendor name for the test invoice. The existing Chrome pairing works; no new key or sign-in is needed. Native Chrome screen control failed in this task, so the extension reload needs to be done in Chrome.

Philipp: confirm the intended Gmail sample invoices, the optional onboarding-sheet tab, and the expense account/tax/period expected for the demo candidate. No new infrastructure or API key is needed; Julie's local key has already passed the live run.

Begin with read-only inspection and confirm the custom form's controls. If its widgets or invoice attachments are unsupported, adapt and test those observed controls before preparing a real sandbox bill. The recording does not establish real-account integration accuracy.
