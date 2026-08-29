# Admin console UI kit

A **separate dashboard** from the customer one, at `ui_kits/admin/index.html`. It has its own
collapsible sidebar (dark `#1f2937` rail, so operator context is never mistaken for customer
context), its own routes, and its own top bar. The public footer links to both dashboards; each
dashboard links back to the other and to the public site.

| Group | Screens |
| --- | --- |
| Platform | Overview, Queue, Scans |
| Catalogue | Capabilities, AI providers |
| Commerce | Users, Plans, Margin |
| Governance | Audit log, Settings |

Interactive: capabilities enable/disable, provider chain reordering (with the two-vendor guard),
feature switches, sidebar collapse, theme toggle.

Every screen states the constraint it exists to enforce rather than decorating the data — disabling
a capability is safe, uploads are sandboxed or refused, exhaustion degrades rather than collapses,
margin is attributable to one capability, and every operator action lands in the append-only log.
