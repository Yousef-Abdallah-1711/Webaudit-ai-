# motakamel Documentation

This documentation is generated from the source code and kept in sync by the `project-docs` skill. Reference tables are machine-written; the prose is not.

## Where things are

<!-- gen:docs-map:start hash=da74179f9fdb -->
| Document | Contents |
| --- | --- |
| [Endpoints](docs/reference/endpoints.md) | every route, its auth and source |
| [Middleware](docs/reference/middleware.md) | the request chain in order |
| [Data model](docs/reference/data-model.md) | models, fields, relations |
| [Pages](docs/reference/pages.md) | routes and what renders them |
| [Components](docs/reference/components.md) | component inventory and props |
| [Environment](docs/reference/env-vars.md) | configuration keys |
| [Architecture](docs/architecture/overview.md) | how the system fits together |
| [Features](docs/features/) | per-feature walkthroughs |
<!-- gen:docs-map:end -->

## At a glance

<!-- gen:docs-summary:start hash=cdebdd61f528 -->
73 endpoints, 28 pages, 68 components, 45 models, 28 features.
<!-- gen:docs-summary:end -->

## How this documentation is maintained

`docs/reference/` is generated from the source code and is rewritten on every
run — do not edit it by hand. Everything else is prose: written once, kept by
hand, and never overwritten. Generated tables inside prose documents are fenced
by `<!-- gen:*:start -->` markers; edit around them, never inside them.

| Command | What it does |
| --- | --- |
| `$docs-generate` | First full build |
| `$docs-update` | Refresh what changed |
| `$docs-check` | Report drift without writing anything |
