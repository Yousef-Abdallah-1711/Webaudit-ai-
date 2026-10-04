# Page map — `/ar/`

Reference: [Katteb Arabic landing page](https://katteb.com/ar/). The route declares `lang="ar"`, `dir="rtl"` and has a right-aligned brand header. Labels below are short identifiers; section descriptions are paraphrased rather than copied page text.

| Order | DOM anchor / section | Purpose and content shape | Desktop composition | Mobile change |
| --- | --- | --- | --- | --- |
| 0 | Header | Brand, chat/agents/tasks/goals/pricing links, language, login and free-start action | Single horizontal nav over hero, logo at far right | Hamburger + compact logo + free-start CTA |
| 1 | Hero (no id) | Goal-focused promise, supporting copy, text prompt, goal/task choices, distinction line | Centered narrow copy and wide prompt card over dark animated/art-directed background | Headline and form shrink; prompt/actions occupy near-full width; background ray art remains |
| 2 | `#watch` | Video explainer headline, description, play surface | Centered copy above a 16:9 video frame | Stacks; title wraps over multiple lines; player fills content width |
| 3 | `#tasks-and-goals` | Contrast one-off task with ongoing goal | Text lead-in, animated visual comparison, then comparison table | Long vertical section; comparison becomes stacked/scrollable layout (exact table mechanics not yet inspected) |
| 4 | `#how-goals-work` | Five numbered stages: state desired outcome, research, write plan, execute, measure/report | Section intro then alternating/paired step content with product UI illustrations | Steps stack with larger total height |
| 5 | `#goal-room` | Five goal examples and detailed progress dashboard | Selector/list paired with dashboard/report and plan detail | Selector/dashboard stack; this section grows from ~1,438px to ~2,061px at captured widths |
| 6 | `#daily-report` | Daily reporting through email, Telegram, or Slack | Dark, two-column feature narrative and selected channel mockup | Dark band stacks copy, tabs and report mockup; ~1,052px at captured mobile width |
| 7 | `#in-charge` | Six trust/control capabilities | Intro plus feature cards/illustrations | Feature sequence stacks; captured section height ~2,035px |
| 8 | `#goal-library` | Goal-category tabs and example cards plus task cross-promotion | Multi-column card grid, category rail and library CTA | Category controls/cards reflow; captured section height ~1,488px |
| 9 | `#pricing` | Lite and Goals monthly plan comparison, included features, signup / enterprise CTA | Two prominent side-by-side plan cards | Plans stack; captured section height ~1,840px |
| 10 | `#faq` | Contact aside and seven collapsible questions | Heading and compact accordion/list | Content stacks; captured section height ~1,116px |
| 11 | `#set-a-goal` | Goal description, duration radios and write-plan/free-chat actions | Centered closing conversion panel | Full-width field and stacked controls; captured section height ~697px |
| 12 | Footer | Brand paragraph, social icons, five link groups and copyright | Multi-column footer | Narrow stacked/accordion-like footer expected; capture full-page mobile screenshot for ordering |

## Shared section pattern

- Most content sits on a pale blue-white canvas with dark ink headings.
- Sections use small numbered eyebrow labels (01–08) and bold, centered or split headings.
- The layout alternates demonstration UI with explanatory text and uses product-like cards/screens rather than stock photography.
- The daily report is the strong dark interruption between mostly light sections; the opening hero is the largest dark atmospheric panel.
- Section names and heights above are based on observed DOM and computed layout at 1440×900 and 390×844; detailed content heights will shift with text/font rendering.

## Page-level counts

- 1 header, 11 `<section>` elements (hero plus ten following anchored sections), 1 footer.
- 5 example tabs in the live goal room; 3 daily-report channel tabs; 11 goal-library categories including “most popular”; 2 pricing cards; 7 FAQ triggers; 5 deadline radio choices.
