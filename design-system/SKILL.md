---
name: webaudit-ai-design
description: Use this skill to generate well-branded interfaces and assets for WebAudit AI, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Copy and generated bundle

Production copy is owned by `apps/web/messages/{locale}/*.json` and consumed through `next-intl`.
This skill's standalone mockups use their own canonical browser-global string catalog at
`design-system/ui_kits/strings.jsx`; it is not imported by the production app. The generated
`design-system/_ds_bundle.js` and `_ds_manifest.json` come from external tooling that is not in
this repository, so there is no local regeneration command and neither file should be hand-edited.
