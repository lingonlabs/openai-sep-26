# Prototype validation

Verified on 2026-09-10 with Node 25.6.1 and pnpm 10.30.2.

| Check | Result |
| --- | --- |
| Dependency publication dates | All 699 locked registry versions passed the 14-day minimum-age check, including Markdown, transitive and optional packages. |
| Automated tests | 19 tests passed, including control-level freshness, return visits after acceptance/dismissal, retained browser errors, Markdown rendering, and unsafe-content handling. |
| Type checking | Shared contracts, server, and extension passed. |
| Production build | WXT Chrome MV3 build passed. |
| Live Astra connection | Successful API response using the configured model. |
| Live Agents SDK tool loop with synthetic observations | Correctly classified NS-1041 as recorded and NS-1042 as a candidate, with two sources each. |
| Interface preview | Visually checked; 390px viewport checked for horizontal overflow. Preview is labeled and cannot control tabs. |
| Extension pairing and workspace | User loaded the unpacked extension, paired it, and selected the NetSuite sandbox in a workspace. |
| Real NetSuite inspection | Completed one agent-requested inspect action through the paired extension. Astra identified the Home dashboard and its navigation/form controls. No click, fill, navigation, or save was requested or performed. |
| Real ambient suggestion | After the rebuild/reload instructions, the user opened Add New Bill in NetSuite and confirmed that the floating suggestion appeared. |

The real test used the local development control endpoint to start a task in the
same Hub/Agents SDK workflow used by the side panel. The browser observation came
from the extension's selected tab. No direct Chrome automation or application
connector was used. Account content and credentials are excluded from this record.

## Next real-account checks

- Verify dismissal and pause on the real bill page; detection and the floating suggestion are user-confirmed.
- Select demo Gmail and accept an investigation; verify search and invoice reading.
- Compare invoice evidence with NetSuite, including duplicate and uncertain matches.
- Include the vendor Sheet if desired and test its actual representation.
- Prepare an unsaved bill and rehearse stop, stale-page recovery, and human review.

The successful Home inspection establishes the real agent-to-extension round trip.
It does not yet establish reliable bill entry, Gmail search, attachment reading,
Google Sheets interaction, or completion of the full closing scenario.

## Browsing and visibility fixes

The first Gmail investigation inspected both Gmail and NetSuite but failed to fill
search twice. Its result explicitly reported page-change errors and incomplete
comparison. The observer previously rejected actions after any DOM mutation, even
when the target control was unchanged. It now validates the latest inspection,
page URL, original connected/visible DOM node, control attributes, label, and value.
Unrelated mailbox updates can proceed without invalidating a stable search field.

The side panel now opens Activity on task start, shows current work and elapsed
time, retains each browser error, and renders Markdown with tables and links.
The local synthetic activity preview was checked for rendered headings, lists,
tables, and readable failure details. Real account data is not used in that preview.

Suggestion suppression now belongs to one bill visit instead of suppressing every
bill for the same vendor for a day. Automated tests cover new documents and leaving
then reopening a bill within the same document. Live repeat-visit verification is
still pending. Extension reloads now preserve tab selection; only the actual Chrome
startup event clears stale tab IDs. The first live retry filled the search field
successfully and exposed its “Ask Gmail” label. Search recognition now uses the
control’s search role, region, type, or Gmail query-field identity, with a regression
test ensuring ordinary form fields cannot use Enter.
