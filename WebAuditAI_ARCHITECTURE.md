# WebAudit AI — Full Architecture & Code Structure
> Version 3.0 | Skills System + UX Flow + Agent Orchestration + Production Readiness

---

## Table of Contents
1. [Skills Vendor Strategy (No External Dependencies)](#1-skills-vendor-strategy)
2. [Flexible Skills Architecture](#2-flexible-skills-architecture)
3. [Full Project Code Structure](#3-full-project-code-structure)
4. [Module + Skills + AI Layers Interaction](#4-module--skills--ai-layers-interaction)
5. [Auth Flow (GitHub + Upload + URL)](#5-auth-flow)
6. [User UX Flow (Scan → Fix → All Green)](#6-user-ux-flow)
7. [Main Agent Orchestrator](#7-main-agent-orchestrator)
8. [Production Readiness Agent](#8-production-readiness-agent)
9. [Login / Register / Auth Code Structure](#9-login--register--auth)

---

## 1. Skills Vendor Strategy

### Problem
If we clone from GitHub and the repo gets deleted → we lose the skill.

### Solution: Vendor Everything Internally

```
webaudit-ai/
└── packages/
    └── skills-vendor/           ← ALL external skills live here permanently
        ├── impeccable/          ← copied from pbakaus/impeccable
        ├── security-coverage/   ← copied from Yousef-Abdallah-1711/security-coverage
        ├── testing-coverage/    ← copied from rakymat-plugins/testing-coverage
        ├── docs-creator/        ← copied from rakymat-plugins/docs-creator
        ├── ui-clone/            ← copied from rakymat-plugins/ui-clone
        └── technical-seo-fixer/ ← copied from rakymat-plugins/technical-seo-fixer
```

### Vendor Rules
```
1. NEVER import directly from GitHub at runtime
2. Copy full source into skills-vendor/ at setup time
3. Each vendored skill has its own package.json with pinned version
4. Git history preserved (git subtree or manual copy)
5. Updates: manual copy + changelog entry
6. If original repo deleted → we still have full copy
```

### Adding a New External Skill
```bash
# Script to vendor a new skill
pnpm skill:vendor <github-url> <skill-name>

# Example:
pnpm skill:vendor https://github.com/example/new-skill my-new-skill

# What the script does:
# 1. Clones repo to temp folder
# 2. Copies to packages/skills-vendor/my-new-skill/
# 3. Creates skill manifest (skill.manifest.json)
# 4. Registers in skills registry
# 5. Deletes temp clone
```

### Skill Manifest (skill.manifest.json)
```json
{
  "id": "impeccable",
  "name": "Impeccable — AI Slop Detector",
  "version": "1.2.0",
  "originalSource": "https://github.com/pbakaus/impeccable",
  "vendoredAt": "2026-01-15",
  "lastUpdated": "2026-01-15",
  "module": "ui",
  "layer": "ai",
  "license": "MIT",
  "entrypoint": "src/index.ts",
  "config": {
    "requiresScreenshot": true,
    "requiresCode": false,
    "tokensEstimate": 500
  }
}
```

---

## 2. Flexible Skills Architecture

### Core Principle
Skills are **plugins** — you can add, remove, update, or disable any skill
without touching the core module code. Zero coupling.

### Skill Interface (The Contract)
```typescript
// packages/types/src/skill.types.ts

export interface AuditSkill {
  // Identity
  id: string
  name: string
  version: string
  module: ModuleType
  layer: 'code' | 'ai' | 'both'

  // Metadata
  requiresCode: boolean      // needs repo/ZIP
  requiresScreenshot: boolean
  estimatedTokens?: number

  // Code Layer (runs before AI — no tokens used)
  // Returns structured data passed to AI layer
  runCodeLayer?(input: SkillInput): Promise<SkillCodeResult>

  // AI Layer (adds to AI context)
  getSystemPromptAddition?(): string        // extra instructions for AI
  getContextData?(codeResult: SkillCodeResult, input: SkillInput): string

  // Validation
  canRun(input: SkillInput): boolean       // check if skill applies
}

export type ModuleType = 'performance' | 'security' | 'ui' | 'testing' | 'seo'

export interface SkillInput {
  url?: string
  code?: CodeInput        // parsed code from repo/ZIP
  screenshot?: Buffer     // desktop screenshot
  screenshotMobile?: Buffer
  previousResults?: Record<string, any>  // from other modules
  userAnswers?: Record<string, string>   // from questionnaire
}

export interface SkillCodeResult {
  skillId: string
  findings: Finding[]
  metadata?: Record<string, any>
}

export interface Finding {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  location?: string     // file path or URL
  evidence?: string     // code snippet or screenshot region
  fixable: boolean
}
```

### Skills Registry
```typescript
// apps/backend/src/skills/registry.ts

export class SkillsRegistry {
  private skills: Map<string, AuditSkill> = new Map()

  // Auto-loads all skills from skills-vendor + custom skills
  async initialize() {
    await this.loadVendoredSkills()
    await this.loadCustomSkills()
    await this.syncWithDatabase()
  }

  // Get all active skills for a module
  getSkillsForModule(module: ModuleType, layer?: 'code' | 'ai' | 'both'): AuditSkill[] {
    return Array.from(this.skills.values())
      .filter(s => s.module === module)
      .filter(s => !layer || s.layer === layer || s.layer === 'both')
      .filter(s => this.isEnabled(s.id))
  }

  // Admin: enable/disable a skill
  async setSkillEnabled(skillId: string, enabled: boolean, planIds?: string[]) {
    await db.skills.update({
      where: { skillId },
      data: { isActive: enabled, enabledForPlans: planIds }
    })
  }

  // Add new skill at runtime (admin action)
  async registerSkill(manifestPath: string): Promise<AuditSkill> {
    const manifest = await loadManifest(manifestPath)
    const skill = await importSkill(manifest.entrypoint)
    this.skills.set(manifest.id, skill)
    await db.skills.upsert({ where: { skillId: manifest.id }, ... })
    return skill
  }
}

export const skillsRegistry = new SkillsRegistry()
```

### How to Add a New Skill (Step by Step)

```
OPTION A: Vendor an external skill
─────────────────────────────────
1. pnpm skill:vendor <github-url> <skill-name>
2. Script copies to packages/skills-vendor/<skill-name>/
3. Create adapter: apps/backend/src/skills/<module>/<skill-name>.skill.ts
4. Adapter implements AuditSkill interface
5. Registry auto-discovers on next restart
6. Admin enables it in dashboard

OPTION B: Build a custom skill from scratch
────────────────────────────────────────────
1. Create: apps/backend/src/skills/<module>/<skill-name>.skill.ts
2. Implement AuditSkill interface
3. Add skill.manifest.json
4. Registry auto-discovers
5. Admin enables it in dashboard

OPTION C: Add via Admin Dashboard (no code needed)
───────────────────────────────────────────────────
1. Admin uploads a .skill.js bundle
2. System validates it implements AuditSkill interface
3. System sandboxes it (vm2)
4. Admin enables it per plan
```

### Module → Skills Mapping (Current)

```
MODULE: performance
  Code Layer Skills:
    ├── lighthouse-analyzer    (built-in)
    ├── webpagetest-runner     (built-in)
    ├── n1-detector            (built-in — keyword + network analysis)
    ├── bundle-analyzer        (built-in — needs code)
    └── load-tester            (built-in — k6 wrapper)
  AI Layer Skills:
    └── performance-ai         (built-in system prompt)

MODULE: security
  Code Layer Skills:
    ├── headers-checker        (built-in)
    ├── ssl-analyzer           (built-in)
    ├── owasp-checker          (built-in)
    ├── rate-limit-tester      (built-in)
    ├── auth-checker           (built-in)
    ├── data-leak-scanner      (built-in)
    └── dependency-scanner     (built-in — needs code)
  AI Layer Skills:
    ├── security-coverage      (vendored from Yousef-Abdallah-1711)
    └── security-ai            (built-in system prompt)

MODULE: ui
  Code Layer Skills:
    ├── screenshot-capture     (built-in — Puppeteer)
    ├── css-analyzer           (built-in — needs code)
    └── questionnaire          (built-in — collects user answers)
  AI Layer Skills:
    ├── impeccable             (vendored from pbakaus)
    ├── ui-clone               (vendored from rakymat-plugins)
    └── ui-ai                  (built-in system prompt)

MODULE: testing
  Code Layer Skills:
    ├── playwright-runner      (built-in)
    └── contradiction-detector (built-in)
  AI Layer Skills:
    ├── testing-coverage       (vendored from rakymat-plugins)
    └── testing-ai             (built-in system prompt)

MODULE: seo
  Code Layer Skills:
    ├── meta-checker           (built-in)
    ├── cwv-analyzer           (built-in)
    └── content-checker        (built-in)
  AI Layer Skills:
    ├── technical-seo-fixer    (vendored from rakymat-plugins)
    ├── docs-creator           (vendored from rakymat-plugins)
    └── seo-ai                 (built-in system prompt)
```

---

## 3. Full Project Code Structure

```
webaudit-ai/
│
├── apps/
│   │
│   ├── web/                                    # Next.js 14 Frontend
│   │   ├── app/
│   │   │   ├── (public)/                       # No auth required
│   │   │   │   ├── page.tsx                    # Landing page
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   └── demo/page.tsx               # Interactive demo
│   │   │   │
│   │   │   ├── (auth)/                         # Auth pages
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── signup/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── verify-email/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── forgot-password/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── reset-password/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── (dashboard)/                    # Authenticated user area
│   │   │   │   ├── layout.tsx                  # Auth guard + sidebar
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx                # Overview + recent scans
│   │   │   │   ├── scan/
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx            # New scan form
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx            # Live scan progress
│   │   │   │   │       └── questionnaire/
│   │   │   │   │           └── page.tsx        # UI questionnaire (mid-scan)
│   │   │   │   ├── reports/
│   │   │   │   │   ├── page.tsx                # All reports list
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx            # Full report view
│   │   │   │   │       └── fix/
│   │   │   │   │           └── [issueId]/
│   │   │   │   │               └── page.tsx    # Issue fix guide
│   │   │   │   ├── fixes/
│   │   │   │   │   └── page.tsx                # All issues tracker (green board)
│   │   │   │   ├── billing/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── settings/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── (admin)/                        # Admin area
│   │   │   │   ├── layout.tsx                  # Admin guard
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx                # Admin dashboard
│   │   │   │       ├── users/
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── [id]/page.tsx
│   │   │   │       ├── plans/page.tsx
│   │   │   │       ├── billing/page.tsx         # Profit dashboard
│   │   │   │       ├── api-providers/page.tsx
│   │   │   │       ├── skills/page.tsx
│   │   │   │       ├── queue/page.tsx
│   │   │   │       └── settings/page.tsx
│   │   │   │
│   │   │   └── api/                            # Next.js API routes (thin)
│   │   │       ├── auth/[...nextauth]/route.ts
│   │   │       └── webhooks/stripe/route.ts
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                             # shadcn/ui base components
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── SignupForm.tsx
│   │   │   │   └── OAuthButtons.tsx
│   │   │   ├── scan/
│   │   │   │   ├── ScanForm.tsx                # URL/GitHub/ZIP input
│   │   │   │   ├── ScanProgress.tsx            # Live progress with WebSocket
│   │   │   │   ├── ModuleStatus.tsx            # Per-module status indicator
│   │   │   │   └── UIQuestionnaire.tsx         # Mid-scan UI questions
│   │   │   ├── report/
│   │   │   │   ├── ReportHeader.tsx
│   │   │   │   ├── HealthScore.tsx             # Animated score ring
│   │   │   │   ├── ExecutiveSummary.tsx
│   │   │   │   ├── ModuleTabs.tsx
│   │   │   │   ├── IssueCard.tsx               # Single issue with fix prompt
│   │   │   │   ├── AnnotatedScreenshot.tsx     # Screenshot with issue markers
│   │   │   │   ├── LoadTestChart.tsx           # Recharts — load vs response time
│   │   │   │   └── AIPromptCopy.tsx            # Copy-paste prompt button
│   │   │   ├── fixes/
│   │   │   │   ├── FixesBoard.tsx              # Kanban-style issue tracker
│   │   │   │   ├── IssueRow.tsx                # Issue with status (red/yellow/green)
│   │   │   │   └── FinalReviewButton.tsx       # Trigger production readiness check
│   │   │   └── admin/
│   │   │       ├── ProfitDashboard.tsx
│   │   │       ├── UserTable.tsx
│   │   │       ├── QueueMonitor.tsx
│   │   │       └── SkillsManager.tsx
│   │   │
│   │   └── lib/
│   │       ├── api-client.ts                   # Typed API calls to backend
│   │       ├── websocket.ts                    # WebSocket client
│   │       ├── auth.ts                         # NextAuth config
│   │       └── utils.ts
│   │
│   ├── backend/                                # Express.js API
│   │   └── src/
│   │       ├── index.ts                        # App entrypoint
│   │       ├── server.ts                       # Express setup
│   │       │
│   │       ├── routes/
│   │       │   ├── auth.routes.ts
│   │       │   ├── scan.routes.ts
│   │       │   ├── report.routes.ts
│   │       │   ├── billing.routes.ts
│   │       │   ├── admin/
│   │       │   │   ├── users.routes.ts
│   │       │   │   ├── plans.routes.ts
│   │       │   │   ├── billing.routes.ts
│   │       │   │   ├── api-providers.routes.ts
│   │       │   │   ├── skills.routes.ts
│   │       │   │   └── queue.routes.ts
│   │       │   └── webhook.routes.ts
│   │       │
│   │       ├── modules/                        # Code Layer (no AI, no tokens)
│   │       │   ├── performance/
│   │       │   │   ├── lighthouse.ts
│   │       │   │   ├── webpagetest.ts
│   │       │   │   ├── network-inspector.ts    # N+1 via DevTools Protocol
│   │       │   │   ├── bundle-analyzer.ts
│   │       │   │   └── load-tester.ts          # k6 wrapper
│   │       │   ├── security/
│   │       │   │   ├── headers-checker.ts
│   │       │   │   ├── ssl-analyzer.ts
│   │       │   │   ├── owasp-checker.ts
│   │       │   │   ├── rate-limit-tester.ts
│   │       │   │   ├── auth-checker.ts
│   │       │   │   └── data-leak-scanner.ts
│   │       │   ├── ui/
│   │       │   │   ├── screenshot.ts
│   │       │   │   ├── css-analyzer.ts
│   │       │   │   └── questionnaire-runner.ts
│   │       │   ├── testing/
│   │       │   │   ├── playwright-runner.ts
│   │       │   │   └── contradiction-detector.ts
│   │       │   └── seo/
│   │       │       ├── meta-checker.ts
│   │       │       ├── cwv-analyzer.ts
│   │       │       └── content-checker.ts
│   │       │
│   │       ├── skills/                         # Skills system
│   │       │   ├── registry.ts                 # Skills registry
│   │       │   ├── loader.ts                   # Loads skills from vendor + custom
│   │       │   ├── sandbox.ts                  # vm2 sandbox for uploaded skills
│   │       │   └── adapters/                   # Adapters for vendored skills
│   │       │       ├── impeccable.skill.ts
│   │       │       ├── security-coverage.skill.ts
│   │       │       ├── testing-coverage.skill.ts
│   │       │       ├── docs-creator.skill.ts
│   │       │       ├── ui-clone.skill.ts
│   │       │       └── technical-seo-fixer.skill.ts
│   │       │
│   │       ├── ai/                             # AI Layer
│   │       │   ├── config.ts                   # Multi-LLM config
│   │       │   ├── executor.ts                 # Fallback executor
│   │       │   ├── providers/
│   │       │   │   ├── claude.provider.ts
│   │       │   │   ├── openai.provider.ts
│   │       │   │   └── gemini.provider.ts
│   │       │   └── prompts/
│   │       │       ├── base.prompt.ts          # Shared system context
│   │       │       ├── performance.prompt.ts
│   │       │       ├── security.prompt.ts
│   │       │       ├── ui.prompt.ts
│   │       │       ├── testing.prompt.ts
│   │       │       ├── seo.prompt.ts
│   │       │       └── master-report.prompt.ts
│   │       │
│   │       ├── orchestrator/                   # Main Agent
│   │       │   ├── scan-orchestrator.ts        # Coordinates all modules
│   │       │   ├── module-runner.ts            # Runs code layer + skills + AI
│   │       │   ├── production-agent.ts         # Final production readiness check
│   │       │   └── issue-tracker.ts            # Tracks fix status per issue
│   │       │
│   │       ├── queue/
│   │       │   ├── scan.queue.ts
│   │       │   ├── priorities.ts
│   │       │   └── workers/
│   │       │       ├── scan.worker.ts
│   │       │       └── report.worker.ts
│   │       │
│   │       ├── services/
│   │       │   ├── credits.service.ts
│   │       │   ├── billing.service.ts
│   │       │   ├── storage.service.ts
│   │       │   ├── email.service.ts
│   │       │   └── websocket.service.ts        # Real-time scan progress
│   │       │
│   │       ├── middleware/
│   │       │   ├── auth.middleware.ts
│   │       │   ├── ratelimit.middleware.ts
│   │       │   ├── credits.middleware.ts
│   │       │   └── admin.middleware.ts
│   │       │
│   │       └── db/
│   │           ├── schema.prisma
│   │           ├── client.ts
│   │           └── migrations/
│   │
│   └── worker/                                 # Dedicated worker process
│       └── src/
│           ├── index.ts                        # Worker entrypoint (separate process)
│           └── processors/
│               ├── scan.processor.ts
│               └── report.processor.ts
│
├── packages/
│   ├── types/                                  # Shared TypeScript types
│   │   └── src/
│   │       ├── skill.types.ts
│   │       ├── scan.types.ts
│   │       ├── report.types.ts
│   │       ├── credits.types.ts
│   │       └── admin.types.ts
│   │
│   ├── utils/                                  # Shared utilities
│   │   └── src/
│   │       ├── url-validator.ts
│   │       ├── score-calculator.ts
│   │       ├── cost-calculator.ts
│   │       └── severity-sorter.ts
│   │
│   ├── config/                                 # Shared constants
│   │   └── src/
│   │       └── constants.ts
│   │
│   └── skills-vendor/                          # ALL vendored skills live here
│       ├── impeccable/                         # Full source copy
│       │   ├── skill.manifest.json
│       │   └── src/
│       ├── security-coverage/
│       │   ├── skill.manifest.json
│       │   └── src/
│       ├── testing-coverage/
│       │   ├── skill.manifest.json
│       │   └── src/
│       ├── docs-creator/
│       │   ├── skill.manifest.json
│       │   └── src/
│       ├── ui-clone/
│       │   ├── skill.manifest.json
│       │   └── src/
│       └── technical-seo-fixer/
│           ├── skill.manifest.json
│           └── src/
│
├── infrastructure/
│   ├── docker-compose.yml              # Local dev (postgres + redis)
│   ├── docker-compose.prod.yml
│   └── k6/
│       └── load-test.js
│
├── scripts/
│   ├── skill-vendor.sh                 # Vendor a new skill from GitHub
│   └── skill-update.sh                 # Update a vendored skill
│
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Module + Skills + AI Layers Interaction

### How One Module Runs (Complete Flow)

```
Module Runner receives: { url, code?, screenshot?, userAnswers? }
                ↓
═══════════════════════════════════════
PHASE 1: CODE LAYER (Zero AI, Zero Tokens)
═══════════════════════════════════════
  Load active code-layer skills for this module
  Run each skill's runCodeLayer() in parallel
  Each returns: Finding[]

  Example for Security module:
  ┌─────────────────────────────────────────┐
  │ headers-checker.runCodeLayer()          │
  │   → checks CSP, HSTS, X-Frame          │
  │   → returns [Finding, Finding, ...]     │
  ├─────────────────────────────────────────┤
  │ ssl-analyzer.runCodeLayer()             │
  │   → checks cert, protocols             │
  │   → returns [Finding, ...]             │
  ├─────────────────────────────────────────┤
  │ data-leak-scanner.runCodeLayer()        │
  │   → scans HTML for API keys            │
  │   → returns [Finding, ...]             │
  └─────────────────────────────────────────┘
  Merge all findings → CodeLayerResult
                ↓
═══════════════════════════════════════
PHASE 2: AI LAYER (Tokens used here)
═══════════════════════════════════════
  Build AI prompt:
  ┌─────────────────────────────────────────┐
  │ BASE SYSTEM PROMPT                      │
  │ + Module-specific system prompt         │
  │ + Each AI skill's getSystemPromptAddition() │
  │ + Each AI skill's getContextData()      │
  │ + Code layer findings (structured)      │
  │ + URL / code / screenshot (if needed)   │
  └─────────────────────────────────────────┘

  Run through AIExecutor (with fallback):
  → Try Claude claude-sonnet-4-6
  → If fail → Try GPT-4o
  → If fail → Try Gemini 1.5 Pro

  AI returns:
  ┌─────────────────────────────────────────┐
  │ {                                       │
  │   score: 72,                            │
  │   summary: "...",                       │
  │   issues: [                             │
  │     {                                   │
  │       id: "sec-001",                    │
  │       title: "Missing CSP Header",      │
  │       severity: "high",                 │
  │       explanation: "...",               │
  │       fixPrompt: "...",                 │
  │       resources: ["helmet.js docs"]     │
  │     }                                   │
  │   ]                                     │
  │ }                                       │
  └─────────────────────────────────────────┘
                ↓
  Module Result stored in DB
  WebSocket event sent to client: { module: 'security', status: 'complete' }
```

### Full Scan Execution (All Modules)

```
ScanOrchestrator.run(scanId)
        ↓
PHASE 1: Parallel modules (no dependencies)
┌──────────────┬──────────────┬──────────────┐
│ Performance  │   Security   │     SEO      │
│   Module     │   Module     │   Module     │
│  [~45 sec]   │  [~30 sec]   │  [~20 sec]   │
└──────────────┴──────────────┴──────────────┘
  All complete → emit partial results to client
        ↓
PHASE 2: UI Module (uses perf data for context)
┌──────────────────────────────────────────────┐
│                  UI Module                   │
│  Screenshot → Vision → Impeccable → ui-clone │
│                  [~60 sec]                   │
│                                              │
│  ⚠️ PAUSE: If questionnaire needed           │
│  → Send WebSocket: { action: 'questionnaire' }│
│  → Wait for user answers (max 10 min)        │
│  → Continue with answers                     │
└──────────────────────────────────────────────┘
        ↓
PHASE 3: Testing Module
┌──────────────────────────────────────────────┐
│               Testing Module                 │
│  Playwright runs → contradiction detection   │
│                  [~90 sec]                   │
└──────────────────────────────────────────────┘
        ↓
PHASE 4: Master AI Layer
┌──────────────────────────────────────────────┐
│            Master AI Layer                   │
│  All module results → Claude Opus 4          │
│  → Overall Health Score                      │
│  → Priority matrix                           │
│  → Executive summary                         │
│  → Action roadmap                            │
│  → Per-issue AI prompts                      │
│                  [~30 sec]                   │
└──────────────────────────────────────────────┘
        ↓
PHASE 5: Docs Creator
┌──────────────────────────────────────────────┐
│              Docs Creator Skill              │
│  Generates DOCS.md + DESIGN.md              │
│  Stored in user's dashboard                  │
│                  [~20 sec]                   │
└──────────────────────────────────────────────┘
        ↓
Final report stored → WebSocket: scan complete
```

---

## 5. Auth Flow

### 5.1 Email/Password Registration

```
User fills signup form (email + password)
        ↓
Frontend: POST /api/auth/register
        ↓
Backend:
  1. Validate email format + password strength
  2. Check email not already registered
  3. Hash password (bcrypt, cost 12)
  4. Create user record (is_verified: false)
  5. Assign Free plan (50 credits)
  6. Send verification email (Resend)
  7. Return: { message: 'Check your email' }
        ↓
User clicks email link → GET /verify-email?token=xxx
        ↓
Backend:
  1. Validate token (not expired, valid)
  2. Set user.is_verified = true
  3. Delete token
  4. Return JWT access + refresh tokens
        ↓
User redirected to /dashboard (first scan prompt)
```

### 5.2 Google OAuth

```
User clicks "Continue with Google"
        ↓
NextAuth.js → Google OAuth flow
        ↓
Callback: NextAuth receives { email, name, googleId }
        ↓
Backend (NextAuth callback):
  1. Find user by email OR googleId
  2a. Found → update googleId if missing → login
  2b. Not found → create user
      → Assign Free plan (50 credits)
      → Mark is_verified: true (Google verified email)
  3. Return session
        ↓
User lands on /dashboard
```

### 5.3 GitHub OAuth (for repo scanning)

```
User clicks "Connect GitHub" (in settings or scan form)
        ↓
GitHub OAuth flow → scopes: read:user, repo (public only in MVP)
        ↓
Backend:
  1. Get GitHub access token
  2. Encrypt and store in user.github_token_enc
  3. Link github_id to user record
        ↓
When user scans a GitHub repo:
  Backend uses stored token to:
  1. Clone repo to temp folder (/tmp/scan-{uuid}/)
  2. Run code analysis
  3. Delete temp folder after scan
```

### 5.4 File Upload (ZIP)

```
User uploads ZIP file (max 50MB)
        ↓
Frontend: POST /api/scan/upload (multipart/form-data)
        ↓
Backend:
  1. Validate file type (.zip only)
  2. Validate file size (< 50MB)
  3. Store in Cloudflare R2 temporarily
  4. Create scan record with input_type: 'zip'
  5. Queue scan job with R2 path
        ↓
Worker:
  1. Download ZIP from R2
  2. Extract to /tmp/scan-{uuid}/
  3. Run code analysis
  4. Delete temp files + R2 temp file
```

---

## 6. User UX Flow (Scan → Fix → All Green)

```
STEP 1: CHOOSE INPUT
─────────────────────
User arrives at /scan/new
  Three tabs:
  ┌──────────────────────────────────────────┐
  │  [🌐 URL]  [📁 GitHub]  [📦 ZIP Upload]  │
  ├──────────────────────────────────────────┤
  │  URL tab:                                │
  │  [ https://mysite.com          ] [Scan]  │
  │                                          │
  │  Select modules:                         │
  │  ☑ Performance  ☑ Security  ☑ UI        │
  │  ☑ Testing      ☑ SEO                   │
  │                                          │
  │  Credits required: 80 (Full Audit)       │
  │  Your balance: 250 credits               │
  └──────────────────────────────────────────┘


STEP 2: LIVE SCAN PROGRESS
───────────────────────────
/scan/{id} — Real-time via WebSocket

  Overall Progress: ████████░░ 75%

  ┌─────────────────────────────────────┐
  │ ✅ Performance    Complete  Score: 68│
  │ ✅ Security       Complete  Score: 55│
  │ ⏳ UI             Running...         │
  │ ⏸  Testing        Waiting            │
  │ ⏸  SEO            Waiting            │
  └─────────────────────────────────────┘

  [Module results stream in as each completes]


STEP 2b: QUESTIONNAIRE (if UI module)
──────────────────────────────────────
Mid-scan, UI module pauses and shows:

  "Quick questions about your UI goals"

  Q1: What style fits your audience?
      ○ Professional  ○ Creative
      ○ Minimal       ○ Bold

  Q2: Any website whose UI you love?
      [ https://stripe.com ]

  Q3: Your brand colors? (optional)
      [ #2563EB ] [ #1E293B ]

  Q4: Who is your target audience?
      ○ Developers  ○ Businesses
      ○ Consumers   ○ Mixed

  [Continue Scan →]


STEP 3: FULL REPORT
──────────────────────
/reports/{id}

  ┌─────────────────────────────────────────┐
  │  WebAudit AI Report — mysite.com        │
  │  Overall Health Score: 61/100           │
  │  ████████████░░░░░░░  Needs Attention   │
  ├─────────────────────────────────────────┤
  │  Executive Summary:                     │
  │  "Your site has 3 critical security     │
  │   issues that could expose user data.   │
  │   Performance breaks down at 200+       │
  │   concurrent users..."                  │
  ├─────────────────────────────────────────┤
  │  [Performance 68] [Security 42] [UI 71] │
  │  [Testing 80]     [SEO 55]              │
  └─────────────────────────────────────────┘

  Each module tab shows:
  - Score gauge
  - Issues list (Critical → Low)
  - Per-issue: explanation + fix prompt (copy button)
  - AI prompt: "Copy this and paste into Claude:"


STEP 4: FIXES TRACKER (The Green Board)
──────────────────────────────────────────
/fixes (or /reports/{id}/fixes)

  All issues from all modules in one board:

  ┌────────────────────────────────────────────────────┐
  │  Issues Tracker — mysite.com                       │
  │  🔴 3 Critical  🟠 5 High  🟡 8 Medium  🟢 2 Done │
  ├────────────────────────────────────────────────────┤
  │ 🔴 [SEC-001] Missing Content Security Policy       │
  │     [Copy Fix Prompt] [Mark as Fixed] [Verify ✓]  │
  ├────────────────────────────────────────────────────┤
  │ 🔴 [SEC-002] JWT using HS256 (should be RS256)     │
  │     [Copy Fix Prompt] [Mark as Fixed] [Verify ✓]  │
  ├────────────────────────────────────────────────────┤
  │ 🔴 [PERF-001] N+1 Query in /api/dashboard         │
  │     [Copy Fix Prompt] [Mark as Fixed] [Verify ✓]  │
  ├────────────────────────────────────────────────────┤
  │ 🟢 [SEO-001] Missing meta description — FIXED      │
  │     Verified ✅ (re-scanned 2 hours ago)           │
  └────────────────────────────────────────────────────┘

  User flow per issue:
  1. Click "Copy Fix Prompt" → paste into Claude
  2. Claude helps fix the issue
  3. User deploys fix
  4. User clicks "Mark as Fixed"
  5. System re-scans that specific check to verify
  6. If verified → issue turns 🟢 green
  7. If still failing → stays 🔴 with updated details


STEP 5: RE-VERIFY (Partial Re-scan)
──────────────────────────────────────
When user marks issue as fixed:

  System runs targeted re-check (not full scan):
  - SEC-001: re-check headers only
  - Uses 3 credits (not 80)
  - Result in ~10 seconds
  - Updates issue status in real-time


STEP 6: FINAL PRODUCTION READINESS REVIEW
──────────────────────────────────────────
When all Critical + High issues are green,
button appears:

  ┌─────────────────────────────────────────┐
  │  🎯 Run Production Readiness Check      │
  │  All critical issues resolved!          │
  │  Let's do a final complete review       │
  │                     [Run Final Check →] │
  └─────────────────────────────────────────┘

  This triggers the Production Readiness Agent.
```

---

## 7. Main Agent Orchestrator

```typescript
// apps/backend/src/orchestrator/scan-orchestrator.ts

export class ScanOrchestrator {
  constructor(
    private skillsRegistry: SkillsRegistry,
    private aiExecutor: AIExecutor,
    private wsService: WebSocketService,
    private storageService: StorageService,
  ) {}

  async run(scan: Scan): Promise<FinalReport> {

    // Notify client: scan started
    this.wsService.emit(scan.userId, 'scan:started', { scanId: scan.id })

    // ── PHASE 1: Parallel modules ──────────────────────────
    const phase1Results = await Promise.allSettled([
      this.runModule('performance', scan),
      this.runModule('security', scan),
      this.runModule('seo', scan),
    ])

    // Emit partial results as they complete
    phase1Results.forEach((result, i) => {
      const module = ['performance', 'security', 'seo'][i]
      if (result.status === 'fulfilled') {
        this.wsService.emit(scan.userId, 'module:complete', {
          module,
          score: result.value.score,
          issueCount: result.value.issues.length,
        })
      }
    })

    // ── PHASE 2: UI Module (may pause for questionnaire) ───
    // Check if questionnaire needed
    const needsQuestionnaire = scan.modules.includes('ui')
    if (needsQuestionnaire) {
      this.wsService.emit(scan.userId, 'questionnaire:needed', {
        scanId: scan.id,
      })
      // Wait for user answers (stored in DB when submitted)
      const answers = await this.waitForQuestionnaire(scan.id, 10 * 60 * 1000)
      scan.userAnswers = answers
    }

    const uiResult = await this.runModule('ui', scan, {
      performanceResult: phase1Results[0],
    })
    this.wsService.emit(scan.userId, 'module:complete', { module: 'ui', ... })

    // ── PHASE 3: Testing ────────────────────────────────────
    const testResult = await this.runModule('testing', scan)
    this.wsService.emit(scan.userId, 'module:complete', { module: 'testing', ... })

    // ── PHASE 4: Master AI Report ───────────────────────────
    this.wsService.emit(scan.userId, 'scan:finalizing', {})

    const masterReport = await this.runMasterAILayer({
      performance: phase1Results[0],
      security: phase1Results[1],
      seo: phase1Results[2],
      ui: uiResult,
      testing: testResult,
    })

    // ── PHASE 5: Docs Creator ───────────────────────────────
    const docs = await this.runDocsCreator(scan, masterReport)

    // ── Store final result ──────────────────────────────────
    const reportUrl = await this.storageService.storeReport(masterReport)
    await db.scans.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        result: masterReport,
        resultUrl: reportUrl,
        completedAt: new Date(),
      }
    })

    // Notify client: complete
    this.wsService.emit(scan.userId, 'scan:complete', {
      scanId: scan.id,
      reportUrl: `/reports/${scan.id}`,
      overallScore: masterReport.overallScore,
    })

    return masterReport
  }

  private async runModule(
    module: ModuleType,
    scan: Scan,
    context?: Record<string, any>
  ): Promise<ModuleResult> {

    const moduleRunner = new ModuleRunner(module, this.skillsRegistry, this.aiExecutor)
    return moduleRunner.run({
      url: scan.inputValue,
      code: scan.parsedCode,
      userAnswers: scan.userAnswers,
      context,
    })
  }
}
```

---

## 8. Production Readiness Agent

```typescript
// apps/backend/src/orchestrator/production-agent.ts

export class ProductionReadinessAgent {

  async run(scanId: string, userId: string): Promise<ProductionReport> {

    // 1. Get current state of all issues
    const scan = await db.scans.findUnique({ where: { id: scanId } })
    const issues = await db.issues.findMany({ where: { scanId } })
    const unfixedCritical = issues.filter(i => i.severity === 'critical' && !i.isFixed)
    const unfixedHigh = issues.filter(i => i.severity === 'high' && !i.isFixed)

    // 2. Re-run ALL modules fresh (parallel)
    const freshResults = await Promise.allSettled([
      this.runModule('performance'),
      this.runModule('security'),
      this.runModule('ui'),
      this.runModule('testing'),
      this.runModule('seo'),
    ])

    // 3. Compare with previous scan
    const regressions = this.detectRegressions(scan.result, freshResults)
    const improvements = this.detectImprovements(scan.result, freshResults)

    // 4. Run final AI verdict
    const verdict = await this.aiExecutor.run('production_readiness', {
      freshResults,
      regressions,
      improvements,
      previousScore: scan.result.overallScore,
      remainingIssues: issues.filter(i => !i.isFixed),
    })

    // 5. Generate production readiness certificate
    const isProductionReady = (
      verdict.criticalIssues === 0 &&
      verdict.highIssues === 0 &&
      verdict.overallScore >= 75 &&
      regressions.length === 0
    )

    const report: ProductionReport = {
      isProductionReady,
      overallScore: verdict.overallScore,
      previousScore: scan.result.overallScore,
      improvement: verdict.overallScore - scan.result.overallScore,
      checklist: {
        performance: { passed: freshResults[0].score >= 75, score: freshResults[0].score },
        security: { passed: freshResults[1].score >= 80, score: freshResults[1].score },
        ui: { passed: freshResults[2].score >= 70, score: freshResults[2].score },
        testing: { passed: freshResults[3].passRate >= 90, score: freshResults[3].score },
        seo: { passed: freshResults[4].score >= 70, score: freshResults[4].score },
      },
      regressions,
      improvements,
      verdict: isProductionReady
        ? "✅ Your site is Production Ready! All critical checks passed."
        : `❌ Not yet production ready. ${verdict.blockers.join(', ')}`,
      remainingActions: isProductionReady ? [] : verdict.remainingActions,
    }

    // 6. If production ready → send congratulations email
    if (isProductionReady) {
      await this.emailService.sendProductionReadyCertificate(userId, report)
    }

    return report
  }
}
```

### Production Readiness Checklist (UI)

```
Final Production Readiness Check
══════════════════════════════════

Running full re-audit of mysite.com...
████████████████████ Complete

┌─────────────────────────────────────────────────────┐
│  PRODUCTION READINESS REPORT                        │
│  mysite.com — August 22, 2026                       │
├─────────────────────────────────────────────────────┤
│  Overall Score:  84/100  (+23 from first scan)      │
│                                                     │
│  ✅ Performance    82/100  (was 68)                  │
│  ✅ Security       91/100  (was 42)  ← Big win!      │
│  ✅ UI/Design      78/100  (was 71)                  │
│  ✅ Testing        88/100  (was 80)                  │
│  ⚠️  SEO           68/100  (was 55)  ← Still low    │
│                                                     │
│  Critical Issues:  0  ✅                             │
│  High Issues:      0  ✅                             │
│  Medium Issues:    4  ⚠️                             │
│  Low Issues:       7  ℹ️                             │
│                                                     │
│  No regressions detected ✅                          │
├─────────────────────────────────────────────────────┤
│  VERDICT:                                           │
│                                                     │
│  ⚠️  ALMOST PRODUCTION READY                        │
│                                                     │
│  SEO score below 75. Your site will have limited   │
│  organic discovery. Recommend fixing 2 SEO issues  │
│  before launch for maximum impact.                  │
│                                                     │
│  [Fix SEO Issues]  [Launch Anyway]                  │
└─────────────────────────────────────────────────────┘
```

---

## 9. Login / Register / Auth

### API Endpoints

```
POST   /api/auth/register          # Email + password signup
POST   /api/auth/login             # Email + password login
POST   /api/auth/logout            # Clear refresh token
POST   /api/auth/refresh           # Get new access token
GET    /api/auth/verify/:token     # Verify email
POST   /api/auth/forgot-password   # Send reset email
POST   /api/auth/reset-password    # Reset with token
GET    /api/auth/me                # Get current user
POST   /api/auth/github/connect    # Connect GitHub account
DELETE /api/auth/github/disconnect # Disconnect GitHub
```

### JWT Strategy

```typescript
// Access token: 15 minutes, in Authorization header
// Refresh token: 7 days, in httpOnly cookie

// Refresh flow:
// 1. Access token expires → 401
// 2. Client sends refresh request (cookie auto-sent)
// 3. Server validates refresh token
// 4. Returns new access token
// 5. If refresh expired → redirect to login
```

### Route Protection

```typescript
// Frontend: middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get('session')

  // Protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/scan') ||
      request.nextUrl.pathname.startsWith('/reports') ||
      request.nextUrl.pathname.startsWith('/fixes')) {
    if (!token) return NextResponse.redirect('/login')
  }

  // Admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!token || !isAdmin(token)) return NextResponse.redirect('/dashboard')
  }
}

// Backend: middleware
export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const user = await verifyJWT(token)
  req.user = user
  next()
}

export const requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' })
    next()
  })
}

export const requireCredits = (amount: number) => async (req, res, next) => {
  const user = await db.users.findUnique({ where: { id: req.user.id } })
  if (user.credits < amount) {
    return res.status(402).json({
      error: 'Insufficient credits',
      required: amount,
      balance: user.credits,
    })
  }
  next()
}
```

---

## Summary: How Everything Connects

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│  Next.js (Vercel) ←→ WebSocket ←→ Express Backend (Railway)    │
└─────────────────────────────────────────────────────────────────┘
              ↕ REST API + WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER                                 │
│                                                                  │
│  Auth Routes → JWT → Credits Check → Scan Routes                │
│                              ↓                                  │
│               BullMQ Queue (Redis)                               │
│                              ↓                                  │
│              Worker Process (separate)                           │
│                              ↓                                  │
│           ScanOrchestrator (Main Agent)                          │
│         ┌──────────┬──────────┬──────────┐                      │
│         │Perf      │Security  │SEO       │ ← Phase 1 (parallel) │
│         └──────────┴──────────┴──────────┘                      │
│                    │UI Module│            ← Phase 2 (sequential) │
│                    └─────────┘                                   │
│                  │Testing Module│         ← Phase 3              │
│                  └──────────────┘                                │
│              │Master AI Layer│            ← Phase 4              │
│              └───────────────┘                                   │
│                                                                  │
│  Each Module:                                                    │
│    Code Layer Skills (no tokens) → AI Layer Skills → AI LLM     │
│    Primary LLM → Fallback LLM → Fallback LLM                    │
│                                                                  │
│  Skills live in: packages/skills-vendor/ (vendored, permanent)  │
└─────────────────────────────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                    │
│  PostgreSQL (Prisma) ← primary data                             │
│  Redis ← queue + rate limiting + session cache                   │
│  Cloudflare R2 ← reports + screenshots + ZIP uploads            │
└─────────────────────────────────────────────────────────────────┘
```

---

*Document Version: 3.0*
*Status: Ready for Sprint 1*
