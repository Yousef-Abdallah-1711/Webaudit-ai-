# Interaction manifest

Observed from the public page and accessibility tree. “Verified” means the control and its affordance are present; transitions that change state remain to be exercised and captured during a later implementation review.

| Area | Control | Expected behavior | Current evidence / state |
| --- | --- | --- | --- |
| Header | Logo | Navigate to `/ar/` | Link present |
| Header | Chat, agents, tasks, goals, pricing | Navigate to public product sections/pages | Links present; goal label carries a “new” marker |
| Header | EN | Switch to English landing page | Link present (`/?lang=en`) |
| Header | Sign in / free start | Route to chat/join or chat app | Links present; backend is out of scope |
| Mobile header | Hamburger | Toggle compact navigation | Button present in mobile screenshot; open state not captured |
| Hero | Goal prompt | Accept free text describing desired outcome | Editable textarea `hero-prompt` present |
| Hero | “Choose goal” | Focus/jump to final goal form or library flow | Button appears in hero; exact click outcome not yet verified |
| Hero | “Start task” | Route into one-off task flow | Button present; destination not established from rendered text |
| Video section | Play control | Open/start 5:38 explainer | Accessible button present; video player/runtime not inspected |
| Comparison | Replay | Restart task-vs-goal timeline/demo | Button present, labeled “Replay” |
| Goal room | Five example tabs | Select one of five goal dashboard states | Tab group and selected state present; all goal data visible in page DOM |
| Daily report | Email / Telegram / Slack tabs | Change selected channel mockup | Three tabs; Telegram initially selected |
| Goal library | Category tabs | Filter the goal examples | Eleven tabs; “Most popular” initially selected |
| Goal card | “Set this goal” / title link | Open goal detail/goal setup | Controls and goal detail links present |
| Library task teaser | Task cards and browse-all links | Navigate to task catalog/detail | Links present |
| Pricing | Plan CTA | Continue to plan/billing flow | Two links route to `chat/billing?lang=ar`; payment behavior out of scope |
| FAQ | Seven accordion buttons | Expand/collapse answer | One answer initially expanded; six collapsed |
| Final goal form | Goal textarea | Accept goal description | `hg-end-input` present |
| Final goal form | Duration radios | Select 14, 30, 60, 90, or 180 days | Five options; 30 days initially selected |
| Final goal form | Write plan free | Submit goal to free plan-writing flow | Button present; do not mock success without backend |
| Footer | Social and navigation links | Navigate to external profiles/public pages | Links present |

## Required future interaction checks

- Verify mobile navigation and focus/escape behavior.
- Click through all goal-room, reporting-channel, and library-category tabs and record selected states/content changes.
- Expand and collapse each FAQ item; confirm semantics, single/multiple-open behavior, and keyboard use.
- Verify hero CTA anchor behavior and final-form deadline updates without submitting to the real service.
- Record hover, focus-visible, disabled, loading, error, and reduced-motion appearances where observable.
