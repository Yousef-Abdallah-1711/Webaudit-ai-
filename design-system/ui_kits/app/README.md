# Application UI kit

One click-through. Sign in → quote a scan → watch it run → read the report → work the fixes board →
readiness verdict. Billing and the operator console are reachable from the same nav.

| File | Contains |
| --- | --- |
| `index.html` | Entry — auth gate, then the shell with seven views |
| `Shell.jsx` | `AppShell` (sticky 64px header, 1280px measure, credit balance), `PageHead`, `Wordmark` |
| `Auth.jsx` | Sign in / OAuth |
| `Screens.jsx` | New scan, live progress, report, fixes board, readiness, billing, admin |

Behaviours the specification makes load-bearing, and which this kit reproduces rather than decorates:

- **The quote is not a charge.** The new-scan panel shows the cost and says nothing is debited until accepted.
- **Areas land independently.** Live progress shows completed areas above a running one.
- **Degraded never reads as a pass.** Testing sits in amber with a 3px left rule and a plain-words detail line.
- **Green requires a passing check.** "I fixed this" runs a 3-credit re-check; a failure shows current failing evidence inline, in mono, not behind a click.
- **Every finding carries attribution.** `measured` or `AI judgment`, visible, never hover-revealed.
- **Two credit lifetimes are shown distinctly** on billing, with the refund line visible in the ledger.
