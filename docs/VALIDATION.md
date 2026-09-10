# Prototype validation

Verified on 2026-09-10 with Node 25.6.1 and pnpm 10.30.2.

| Check | Result |
| --- | --- |
| Dependency publication dates | All 604 locked registry versions passed the 14-day minimum-age check, including transitive and optional packages. |
| Automated tests | 14 tests passed: workspace/account/document scoping, ambient detection and dismissal, tool routing, evidence/history, cancellation, and read-only action enforcement. |
| Type checking | Shared contracts, server, and extension passed. |
| Production build | WXT Chrome MV3 build passed. |
| Live Astra connection | Successful API response using the configured model. |
| Live Agents SDK tool loop with synthetic observations | Correctly classified NS-1041 as recorded and NS-1042 as a candidate, with two sources each. |
| Interface preview | Visually checked; 390px viewport checked for horizontal overflow. Preview is labeled and cannot control tabs. |
| Extension pairing and workspace | User loaded the unpacked extension, paired it, and selected the NetSuite sandbox in a workspace. |
| Real NetSuite inspection | Completed one agent-requested inspect action through the paired extension. Astra identified the Home dashboard and its navigation/form controls. No click, fill, navigation, or save was requested or performed. |

The real test used the local development control endpoint to start a task in the
same Hub/Agents SDK workflow used by the side panel. The browser observation came
from the extension's selected tab. No direct Chrome automation or application
connector was used. Account content and credentials are excluded from this record.

## Next real-account checks

- Reload the extension after the latest build to pick up observer reinjection fixes.
- Open Add New Bill; verify detection, floating suggestion, dismissal, and pause.
- Select demo Gmail and accept an investigation; verify search and invoice reading.
- Compare invoice evidence with NetSuite, including duplicate and uncertain matches.
- Include the vendor Sheet if desired and test its actual representation.
- Prepare an unsaved bill and rehearse stop, stale-page recovery, and human review.

The successful Home inspection establishes the real agent-to-extension round trip.
It does not yet establish reliable bill entry, Gmail search, attachment reading,
Google Sheets interaction, or completion of the full closing scenario.
