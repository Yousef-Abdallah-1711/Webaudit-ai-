/* eslint-disable */
/**
 * The showcase dashboard UI.
 *
 * Composed entirely from the WebAudit AI design system primitives
 * (window.WebAuditAIDesignSystem_fa5933) + the design system's own theme/strings
 * helpers. All data comes from window.__AUDIT__, which is the real audit output
 * produced by ../src/runner.ts against https://app.esaalnybot.tech/ — no mock
 * data anywhere in this view.
 */
const DS = window.WebAuditAIDesignSystem_fa5933;
const { Button, Badge, Card, Eyebrow, SeverityBadge, StatRow, ScoreArc, ModuleStatus, IssueCard, AttributionMark } = DS;
const { useT } = window;

const A = window.__AUDIT__;
const RB = window.__RUNBOOK__ || null;
const ASSETS = window.__ASSETS__ || { desktop: './assets/screenshot-desktop.png', mobile: './assets/screenshot-mobile.png' };
const DL = window.__DOWNLOADS__ || { report: './report.md', audit: './data/audit.json', runbook: './PENTEST-RUNBOOK.md' };

const sevLower = (s) => String(s || 'info').toLowerCase();
const attrLower = (a) => (a === 'AI_JUDGMENT' ? 'ai-judgment' : 'measured');
const stateLower = (s) =>
  ({ COMPLETE: 'complete', DEGRADED: 'degraded', NOT_APPLICABLE: 'not-applicable', FAILED: 'degraded', PENDING: 'waiting', RUNNING: 'running' }[s] || 'complete');

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function useViewportWidth() {
  const [width, setWidth] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function allFindings() {
  const out = [];
  for (const area of A.areas) {
    for (const f of area.findings) out.push(f);
    // AI-layer design judgments live on the narrative, not on the area.
  }
  if (A.aiNarrative && Array.isArray(A.aiNarrative.designJudgments)) {
    for (const j of A.aiNarrative.designJudgments) {
      out.push({
        module: 'UI',
        area: 'Design',
        checkId: j.checkId,
        fingerprint: j.checkId,
        severity: j.severity,
        attribution: 'AI_JUDGMENT',
        title: j.title,
        explanation: j.explanation,
        consequence: j.consequence,
        location: null,
        evidence: null,
        fixPrompt: j.fixPrompt,
        fixable: j.severity !== 'INFO',
      });
    }
  }
  return out.sort((a, b) => SEV_RANK[sevLower(a.severity)] - SEV_RANK[sevLower(b.severity)]);
}

function Meta() {
  const m = A.meta;
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.7 }}>
      {m.target} · completed {new Date(m.completedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC · {(m.durationMs / 1000).toFixed(1)}s ·{' '}
      {A.meta.capabilityCount} capabilities · browser: {m.browser.split('(')[0].trim()}
    </div>
  );
}

/* ─────────────────────────  Report  ───────────────────────── */
function ReportView() {
  const [area, setArea] = React.useState('All');
  const viewport = useViewportWidth();
  const compact = viewport < 920;
  const tabs = ['All', ...A.areas.map((a) => a.label)];
  const findings = allFindings();
  const list = area === 'All' ? findings : findings.filter((f) => f.area === area);
  const counts = A.counts;
  const n = A.aiNarrative;

  return (
    <div>
      <PageHead
        eyebrow="Passive configuration audit"
        title="app.esaalnybot.tech"
        meta={null}
        actions={<><a href={DL.report} download="esaalnybot-audit-report.md" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">Full report.md</Button></a><a href={DL.audit} download="esaalnybot-audit.json" style={{ textDecoration: 'none' }}><Button size="sm">Raw JSON</Button></a></>}
      />
      <div style={{ marginTop: '-14px', marginBottom: '20px' }}><Meta /></div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '260px 1fr', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: '16px', position: compact ? 'static' : 'sticky', top: '20px', overflowX: compact ? 'auto' : 'visible', paddingBottom: compact ? '2px' : 0 }}>
          <Card padding={20}>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <ScoreArc score={A.overall.score ?? 0} delta={null} />
            </div>
            <div style={{ font: 'var(--type-small)', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
              overall · mean of {A.overall.scoredModules.length} scored areas
            </div>
          </Card>
          <Card padding={20} title="Areas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {A.areas.map((a) => (
                <ModuleStatus
                  key={a.module}
                  compact
                  area={a.label}
                  state={stateLower(a.state)}
                  issues={a.findings.length}
                  detail={a.degradedReason || (a.state === 'COMPLETE' && a.findings.length === 0 ? 'no defects measured' : undefined)}
                />
              ))}
            </div>
            <div style={{ font: 'var(--type-small)', color: 'var(--text-muted)', marginTop: '12px', textWrap: 'pretty' }}>
              Score per area = 100 − Σ severity weights of MEASURED findings (25/12/5/2/0), floored at 0. AI judgments never move a score.
            </div>
          </Card>
        </div>

        <div>
          <Card padding={24} title="Executive summary" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Badge tone="neutral">AI narrative</Badge>
              <span style={{ font: 'var(--type-small)', color: 'var(--text-muted)' }}>
                authored from measured findings · no runtime LLM call
              </span>
            </div>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-primary)', margin: 0, maxWidth: '78ch', textWrap: 'pretty', whiteSpace: 'pre-wrap' }}>
              {n ? n.executiveSummary : '(run src/ai-narrative.ts)'}
            </p>
            <div style={{ marginTop: '16px' }}>
              <StatRow
                items={[
                  { value: counts.CRITICAL, label: 'critical' },
                  { value: counts.HIGH, label: 'high' },
                  { value: counts.MEDIUM, label: 'medium' },
                  { value: counts.LOW, label: 'low' },
                ]}
              />
            </div>
          </Card>

          {n && n.coverage && (
            <Card padding={24} style={{ marginBottom: '16px', borderLeft: '3px solid var(--sev-medium)' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '8px' }}>{n.coverage.heading}</div>
              <p style={{ font: 'var(--type-small)', color: 'var(--text-primary)', margin: '0 0 12px', maxWidth: '80ch', textWrap: 'pretty' }}>{n.coverage.body}</p>
              <div style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {n.coverage.passive.map((x, i) => <p key={'p' + i} style={{ margin: '0 0 6px' }}>✓ {x}</p>)}
                {n.coverage.active.map((x, i) => <p key={'a' + i} style={{ margin: '0 0 6px', color: 'var(--sev-high)' }}>✗ {x}</p>)}
              </div>
            </Card>
          )}
          {n && (
            <Card padding={24} title="Scope" style={{ marginBottom: '16px' }}>
              <p style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, maxWidth: '78ch', textWrap: 'pretty' }}>{n.scopeNote}</p>
            </Card>
          )}

          <div style={{ display: 'flex', gap: '2px', borderBottom: 'var(--border-width) solid var(--border-default)', marginBottom: '16px', flexWrap: 'wrap' }}>
            {tabs.map((tb) => (
              <button
                key={tb}
                onClick={() => setArea(tb)}
                style={{
                  background: 'none', border: 0,
                  borderBottom: '2px solid ' + (area === tb ? 'var(--accent)' : 'transparent'),
                  marginBottom: '-1px', padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: '14px',
                  fontWeight: area === tb ? 600 : 400,
                  color: area === tb ? 'var(--text-strong)' : 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {tb}
                {tb !== 'All' && (
                  <span style={{ marginInlineStart: '7px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {findings.filter((f) => f.area === tb).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {area !== 'All' && (() => {
            const ar = A.areas.find((a) => a.label === area);
            if (!ar) return null;
            return (
              <Card padding={20} style={{ marginBottom: '16px' }}>
                <div style={{ font: 'var(--type-small)', color: 'var(--text-primary)', textWrap: 'pretty', whiteSpace: 'pre-wrap' }}>
                  {A.aiNarrative && A.aiNarrative.areaNarratives[ar.module]}
                </div>
              </Card>
            );
          })()}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {list.length === 0 && (
              <Card padding={20}><span style={{ color: 'var(--text-secondary)' }}>No findings in this area — every check that could run measured clean.</span></Card>
            )}
            {list.map((f) => (
              <IssueCard
                key={f.fingerprint}
                severity={sevLower(f.severity)}
                title={f.title}
                area={f.area}
                location={f.location || undefined}
                description={f.explanation}
                attribution={attrLower(f.attribution)}
                prompt={f.fixPrompt}
                onCopy={(p) => navigator.clipboard && navigator.clipboard.writeText(p)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Priorities  ───────────────────────── */
function PrioritiesView() {
  const n = A.aiNarrative;
  if (!n) return <Card padding={20}>Run src/ai-narrative.ts.</Card>;
  return (
    <div>
      <PageHead eyebrow="Recommended order" title="What to fix first" meta="AI-layer prioritisation over the measured findings" />
      <div style={{ maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {n.prioritised.map((p) => (
          <Card key={p.rank} padding={20}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--accent)', lineHeight: 1, minWidth: '28px' }}>
                {p.rank}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <SeverityBadge level={sevLower(p.severity)} />
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{p.title}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', margin: '8px 0', flexWrap: 'wrap' }}>
                  <Badge tone="neutral">{p.area}</Badge>
                  <Badge tone="neutral">effort: {p.effort}</Badge>
                </div>
                <p style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, textWrap: 'pretty' }}>{p.why}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────  Fixes board  ───────────────────────── */
function FixesView() {
  const findings = allFindings().filter((f) => sevLower(f.severity) !== 'info');
  const [open, setOpen] = React.useState(null);
  return (
    <div>
      <PageHead
        eyebrow="Fixes"
        title="app.esaalnybot.tech"
        meta={`${findings.length} open findings · each carries a deterministic fingerprint and a paste-ready prompt`}
      />
      <div style={{ marginBottom: '16px' }}>
        <StatRow
          items={[
            { value: findings.filter((f) => ['critical', 'high'].includes(sevLower(f.severity))).length, label: 'blocking (critical + high)' },
            { value: findings.filter((f) => sevLower(f.severity) === 'medium').length, label: 'medium' },
            { value: findings.filter((f) => sevLower(f.severity) === 'low').length, label: 'low' },
            { value: 0, label: 'resolved' },
          ]}
        />
      </div>
      <div style={{ border: 'var(--border-width) solid var(--border-default)', background: 'var(--surface-page)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        {findings.map((f, k) => (
          <div key={f.fingerprint} style={{ padding: '16px 20px', borderTop: k ? 'var(--border-width) solid var(--border-default)' : 'none', borderLeft: '3px solid var(--sev-' + sevLower(f.severity) + ')' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <SeverityBadge level={sevLower(f.severity)} />
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{f.title}</span>
              <AttributionMark kind={attrLower(f.attribution)} />
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setOpen(open === f.fingerprint ? null : f.fingerprint)}
                  style={{ height: '34px', padding: '0 12px', borderRadius: 'var(--radius-control)', border: 'var(--border-width) solid var(--border-default)', background: 'var(--surface-page)', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer' }}
                >
                  {open === f.fingerprint ? 'Hide prompt' : 'Fix prompt'}
                </button>
                <button
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(f.fixPrompt)}
                  style={{ height: '34px', padding: '0 12px', borderRadius: 'var(--radius-control)', border: 'var(--border-width) solid var(--border-default)', background: 'var(--surface-page)', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer' }}
                >
                  Copy
                </button>
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-zinc)', marginTop: '8px' }}>
              {(f.location || f.area)} · {f.checkId}
              {/^[0-9a-f]{32,}$/.test(f.fingerprint) ? ' · fp ' + f.fingerprint.slice(0, 12) : ''}
            </div>
            {open === f.fingerprint && (
              <pre style={{ marginTop: '10px', background: 'var(--surface-sunken)', border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {f.fixPrompt}
              </pre>
            )}
          </div>
        ))}
      </div>
      <p style={{ font: 'var(--type-small)', color: 'var(--text-muted)', marginTop: '14px', textWrap: 'pretty' }}>
        In the full product, marking an issue fixed runs one narrow re-check (3 credits) and it turns green only when that check passes — no user action writes RESOLVED.
      </p>
    </div>
  );
}

/* ─────────────────────────  Evidence  ───────────────────────── */
function EvidenceView() {
  const pm = A.pageMetrics;
  const viewport = useViewportWidth();
  const compact = viewport < 920;
  return (
    <div>
      <PageHead eyebrow="Evidence" title="How this audit was produced" meta={A.meta.engine.slice(0, 120)} />
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        <Card padding={20} title="Rendered page — 1440px">
          <img src={ASSETS.desktop} alt="desktop render" style={{ width: '100%', border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)' }} />
        </Card>
        <Card padding={20} title="Rendered page — 390px">
          <img src={ASSETS.mobile} alt="mobile render" style={{ width: '100%', maxWidth: '300px', display: 'block', margin: '0 auto', border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)' }} />
        </Card>
      </div>

      {pm && (
        <Card padding={20} title="Measured page load (real headless Chromium)" style={{ marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px' }}>
            {[
              ['First contentful paint', pm.timings.firstContentfulPaintMs + ' ms'],
              ['DOM interactive', pm.timings.domInteractiveMs + ' ms'],
              ['Load', pm.timings.loadMs + ' ms'],
              ['TTFB', pm.timings.ttfbMs + ' ms'],
              ['Transfer', pm.transferKb + ' KB'],
              ['Requests', String(pm.resourceCount)],
              ['DOM nodes', String(pm.domNodes)],
              ['Body text', pm.textLength + ' chars'],
            ].map(([l, v]) => (
              <div key={l} style={{ border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)', padding: '12px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)' }}>{v}</div>
                <div style={{ font: 'var(--type-small)', color: 'var(--text-muted)', marginTop: '2px' }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding={0} title="" style={{ marginTop: '20px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border-width) solid var(--border-default)', fontSize: '15px', fontWeight: 600 }}>
          Capability execution — the 13 real vendored capabilities
        </div>
        {A.areas.map((a) => (
          <div key={a.module}>
            <div style={{ padding: '10px 20px', background: 'var(--surface-raised)', font: 'var(--type-eyebrow)', fontSize: '10px', letterSpacing: 'var(--track-eyebrow)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {a.label} — {a.state} {a.score !== null ? '· score ' + a.score : ''}
            </div>
            {a.capabilities.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 20px', borderTop: 'var(--border-width) solid var(--border-default)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', minWidth: compact ? 0 : '210px', overflowWrap: 'anywhere' }}>{c.id}</span>
                <Badge tone={c.error ? 'neutral' : c.ran ? 'success' : 'neutral'}>{c.layer}</Badge>
                <span style={{ font: 'var(--type-small)', color: 'var(--text-secondary)' }}>
                  {c.ran ? (c.succeeded ? `${c.findingCount} findings · ${c.durationMs}ms` : `error: ${c.error}`) : c.layer === 'AI' ? 'AI layer — contributes to prompt only (no runtime model)' : (c.skippedReason || 'not run')}
                </span>
                {c.egressViolations && c.egressViolations.length > 0 && <Badge tone="neutral">egress blocked ×{c.egressViolations.length}</Badge>}
              </div>
            ))}
          </div>
        ))}
      </Card>

      {A.pipelineParity && A.pipelineParity.ran && (
        <Card padding={20} title="Engine parity — cross-checked against the full production pipeline" style={{ marginTop: '20px' }}>
          <p style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', marginTop: 0 }}>
            The same audit was also run through the real <code>startApi</code> + <code>startWorker</code> stack (Express API, BullMQ queue, 5-phase orchestrator, Postgres + Redis) — a real <code>Scan</code> row driven to <code>COMPLETED</code>.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 10px' }}>Area</th>
                  <th style={{ padding: '6px 10px' }}>Standalone runner</th>
                  <th style={{ padding: '6px 10px' }}>Full pipeline</th>
                  <th style={{ padding: '6px 10px' }}>Match</th>
                </tr>
              </thead>
              <tbody>
                {A.pipelineParity.perArea.map((r) => (
                  <tr key={r.module} style={{ borderTop: 'var(--border-width) solid var(--border-default)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.label}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{r.standalone.state} · {r.standalone.score ?? 'n/a'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{r.pipeline.state} · {r.pipeline.score ?? 'n/a'}</td>
                    <td style={{ padding: '6px 10px' }}>{r.scoresMatch ? '✅' : '⚠️'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border-default)', fontWeight: 700 }}>
                  <td style={{ padding: '6px 10px' }}>Overall</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{A.pipelineParity.overall.standalone ?? 'n/a'}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{A.pipelineParity.overall.pipeline ?? 'n/a'}</td>
                  <td style={{ padding: '6px 10px' }}>{A.pipelineParity.overall.match ? '✅' : '⚠️'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul style={{ font: 'var(--type-small)', color: 'var(--text-muted)', marginBottom: 0, paddingInlineStart: '18px', lineHeight: 1.8 }}>
            {A.pipelineParity.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Card>
      )}

      <Card padding={20} title="What is real here" style={{ marginTop: '20px' }}>
        <ul style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, paddingInlineStart: '18px', lineHeight: 1.9 }}>
          <li>The 13 capabilities are the product's real <code>packages/capabilities-vendored/*</code> — unmodified.</li>
          <li>Resolution, concurrent isolated execution, <code>globalThis.fetch</code> poisoning, per-area state and per-area scoring are the product's own <code>apps/worker/src/module-runner/*</code>, imported not copied.</li>
          <li><code>ctx.fetch</code> is the product's SSRF-guarded <code>safeFetch</code>; <code>ctx.withPage</code> is the product's real Playwright browser pool.</li>
          <li>Every per-finding severity, location and evidence is MEASURED. The executive summary, per-area narrative, prioritisation and the 4 design observations are the AI layer, authored by Claude from those measurements — labelled, and never moving a score.</li>
          <li>Not run: the runtime AI executor (no LLM key), billing, and anything behind the target's sign-in.</li>
        </ul>
      </Card>
    </div>
  );
}

/* ─────────────────────────  Pentest plan + execution tracker  ───────────────────────── */
const SEV_COLOR = (s) => 'var(--sev-' + sevLower(s) + ')';

const PT_STATUS = {
  'not-started': { label: 'Not started', color: 'var(--text-muted)', bg: 'transparent' },
  'in-progress': { label: 'In progress', color: 'var(--sev-medium)', bg: 'var(--sev-medium-bg)' },
  observed: { label: 'Observed (passive)', color: 'var(--text-secondary)', bg: 'var(--surface-raised)' },
  partial: { label: 'Partial — needs active test', color: 'var(--sev-high)', bg: 'var(--sev-high-bg)' },
  fail: { label: 'Vulnerable', color: 'var(--sev-critical)', bg: 'var(--sev-critical-bg)' },
  pass: { label: 'Secure', color: 'var(--sev-resolved)', bg: 'var(--sev-resolved-bg)' },
  na: { label: 'N/A', color: 'var(--text-muted)', bg: 'transparent' },
};
const PT_ORDER = ['not-started', 'in-progress', 'observed', 'partial', 'fail', 'pass', 'na'];
const PT_KEY = 'esaalny_pt_v1';

function ptLoad() {
  try {
    return JSON.parse(localStorage.getItem(PT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function ptSave(m) {
  try {
    localStorage.setItem(PT_KEY, JSON.stringify(m));
  } catch {
    /* private mode / disabled — tracker is session-only */
  }
}

function useTracker() {
  const seeded = React.useMemo(() => {
    const stored = ptLoad();
    const out = { ...stored };
    for (const o of (RB && RB.passiveObservations) || []) {
      if (!out[o.caseId]) out[o.caseId] = { status: o.status, notes: o.note };
    }
    return out;
  }, []);
  const [map, setMap] = React.useState(seeded);
  const update = (id, patch) =>
    setMap((m) => {
      const next = { ...m, [id]: { status: 'not-started', notes: '', ...m[id], ...patch } };
      ptSave(next);
      return next;
    });
  const reset = () => {
    try {
      localStorage.removeItem(PT_KEY);
    } catch {
      /* ignore */
    }
    const fresh = {};
    for (const o of (RB && RB.passiveObservations) || []) fresh[o.caseId] = { status: o.status, notes: o.note };
    setMap(fresh);
  };
  return [map, update, reset];
}

function exportFindings(map) {
  const lines = ['# Esaalny pentest — findings log', '', `Exported ${new Date().toISOString()}`, ''];
  const rows = [];
  for (const ph of RB.phases)
    for (const c of ph.cases) {
      const e = map[c.id];
      if (!e || e.status === 'not-started' || e.status === 'pass' || e.status === 'na') continue;
      rows.push({ ph, c, e });
    }
  if (rows.length === 0) lines.push('_No findings recorded yet._');
  const rank = { fail: 0, partial: 1, 'in-progress': 2, observed: 3 };
  rows.sort((a, b) => (rank[a.e.status] ?? 9) - (rank[b.e.status] ?? 9));
  for (const { ph, c, e } of rows) {
    lines.push(`## [${c.id}] ${c.title}`);
    lines.push('');
    lines.push(`- Phase: ${ph.id} — ${ph.name}`);
    lines.push(`- Status: **${PT_STATUS[e.status].label}**`);
    lines.push(`- Severity if confirmed: ${c.severityIfFound}`);
    lines.push(`- Target: ${c.target} · Refs: ${c.refs.join(', ')}`);
    lines.push(`- Remediation: ${c.remediation}`);
    lines.push('');
    lines.push('**Tester notes / evidence:**');
    lines.push('');
    lines.push((e.notes || '(none)').trim());
    lines.push('');
  }
  return lines.join('\n');
}

function StatusPill({ status }) {
  const s = PT_STATUS[status] || PT_STATUS['not-started'];
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, color: s.color, background: s.bg, border: '1px solid ' + s.color, borderRadius: 'var(--radius-pill)', padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function RunbookView() {
  const [open, setOpen] = React.useState(RB ? RB.phases[0].id : null);
  const [caseOpen, setCaseOpen] = React.useState(null);
  const [tab, setTab] = React.useState('plan');
  const viewport = useViewportWidth();
  const compact = viewport < 700;
  const [map, update, reset] = useTracker();
  if (!RB) return <Card padding={20}>Run <code>src/build-runbook.ts</code>.</Card>;

  const total = RB.summary.testCases;
  const done = Object.values(map).filter((e) => e && e.status && e.status !== 'not-started').length;
  const counts = {};
  for (const e of Object.values(map)) if (e && e.status) counts[e.status] = (counts[e.status] || 0) + 1;
  const findingsMd = exportFindings(map);

  return (
    <div>
      <PageHead
        eyebrow="Manual penetration test — execution tracker"
        title="Full pentest — app · api · widget"
        meta={`${RB.summary.phases} phases · ${total} test cases · ${done}/${total} worked · progress saved in this browser`}
        actions={
          <>
            <a href={'data:text/markdown;charset=utf-8,' + encodeURIComponent(findingsMd)} download="Esaalny-findings-log.md" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="sm">Export findings</Button>
            </a>
            <a href={DL.runbook} download="Esaalny-PENTEST-RUNBOOK.md" style={{ textDecoration: 'none' }}>
              <Button size="sm">Runbook.md</Button>
            </a>
          </>
        }
      />

      <Card padding={20} style={{ marginBottom: '16px', borderLeft: '3px solid var(--sev-high)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <Badge tone="neutral">Execution tracker</Badge>
          <span style={{ font: 'var(--type-small)', color: 'var(--text-muted)' }}>
            passive checks are pre-filled below · active testing is the human tester's job, under written authorisation
          </span>
        </div>
        <p style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, maxWidth: '82ch', textWrap: 'pretty' }}>
          The WebAudit AI scan (Report tab) is passive configuration analysis. This is the active, offensive engagement it
          does <strong>not</strong> do — SQL/NoSQL injection, authentication (login / register / password-reset), rate
          limiting and brute force, reaching the admin dashboard, IDOR and cross-tenant isolation, SSRF, XSS, the chatbot
          widget, business logic. Each test case has an objective, steps, payloads, tools, evidence to capture, "secure
          looks like" and remediation. Set a status and record evidence per case as you work; use <em>Export findings</em>
          for the report. Only the {(RB.passiveObservations || []).length} rows marked "Observed" / "Partial" have been
          checked (non-intrusively); everything else is <em>Not started</em>.
        </p>
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--surface-sunken)' }}>
            {PT_ORDER.filter((s) => s !== 'not-started' && counts[s]).map((s) => (
              <div key={s} title={`${PT_STATUS[s].label}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: PT_STATUS[s].color }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', font: 'var(--type-small)', color: 'var(--text-muted)' }}>
            {PT_ORDER.filter((s) => counts[s]).map((s) => (
              <span key={s}><span style={{ color: PT_STATUS[s].color, fontWeight: 700 }}>{counts[s]}</span> {PT_STATUS[s].label.toLowerCase()}</span>
            ))}
            <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>reset tracker</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].filter((s) => RB.summary.bySeverityIfFound[s]).map((s) => (
          <div key={s} style={{ border: 'var(--border-width) solid var(--border-default)', borderLeft: '3px solid ' + SEV_COLOR(s), borderRadius: 'var(--radius-control)', padding: '12px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700 }}>{RB.summary.bySeverityIfFound[s]}</div>
            <div style={{ font: 'var(--type-small)', color: 'var(--text-muted)' }}>tests for {s.toLowerCase()}-impact issues</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '2px', borderBottom: 'var(--border-width) solid var(--border-default)', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['plan', 'Test plan'], ['scope', 'Scope & rules'], ['tools', 'Toolchain'], ['reporting', 'Reporting']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: 'none', border: 0, borderBottom: '2px solid ' + (tab === k ? 'var(--accent)' : 'transparent'), marginBottom: '-1px', padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: tab === k ? 600 : 400, color: tab === k ? 'var(--text-strong)' : 'var(--text-secondary)', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {tab === 'scope' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
          <Card padding={20} title="Targets">
            {RB.meta.targets.map((t) => (
              <div key={t.key} style={{ padding: '8px 0', borderTop: 'var(--border-width) solid var(--border-default)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>{t.key} · {t.url}</div>
                <div style={{ font: 'var(--type-small)', color: 'var(--text-secondary)' }}>{t.notes}</div>
              </div>
            ))}
          </Card>
          <Card padding={20} title="Authorisation & scope"><ul style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, paddingInlineStart: '18px', lineHeight: 1.8 }}>{RB.authorization.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
          <Card padding={20} title="Rules of engagement"><ul style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, paddingInlineStart: '18px', lineHeight: 1.8 }}>{RB.rulesOfEngagement.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
          <Card padding={20} title="Prerequisites"><ul style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: 0, paddingInlineStart: '18px', lineHeight: 1.8 }}>{RB.prerequisites.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
        </div>
      )}

      {tab === 'tools' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '900px' }}>
          {RB.toolchain.map((t) => (
            <Card key={t.name} padding={18}>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{t.name}</div>
              <div style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: '4px 0 10px' }}>{t.purpose}</div>
              <pre style={{ background: 'var(--surface-sunken)', border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', whiteSpace: 'pre-wrap', margin: 0 }}>{t.config}</pre>
            </Card>
          ))}
        </div>
      )}

      {tab === 'reporting' && (
        <Card padding={20} style={{ maxWidth: '900px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: '6px 10px' }}>Field</th><th style={{ padding: '6px 10px' }}>Note</th></tr></thead>
              <tbody>{RB.reporting.map((f) => <tr key={f.field} style={{ borderTop: 'var(--border-width) solid var(--border-default)' }}><td style={{ padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.field}</td><td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{f.note}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {RB.phases.map((ph) => {
            const phDone = ph.cases.filter((c) => map[c.id] && map[c.id].status && map[c.id].status !== 'not-started').length;
            const phFail = ph.cases.filter((c) => map[c.id] && ['fail', 'partial'].includes(map[c.id].status)).length;
            return (
            <div key={ph.id} style={{ border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-card)', background: 'var(--surface-page)', overflow: 'hidden' }}>
              <button onClick={() => setOpen(open === ph.id ? null : ph.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', border: 0, background: open === ph.id ? 'var(--surface-raised)' : 'var(--surface-page)', cursor: 'pointer', padding: '14px 18px', textAlign: 'left', flexWrap: compact ? 'wrap' : 'nowrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>{ph.id}</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{ph.name}</span>
                {phFail > 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sev-critical)' }}>{phFail} to review</span>}
                <span style={{ marginLeft: compact ? 0 : 'auto', font: 'var(--type-small)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{phDone}/{ph.cases.length}</span>
              </button>
              {open === ph.id && (
                <div style={{ padding: '4px 18px 14px' }}>
                  <p style={{ font: 'var(--type-small)', color: 'var(--text-secondary)', margin: '6px 0 12px', textWrap: 'pretty' }}>{ph.goal}</p>
                  {ph.cases.map((c) => {
                    const entry = map[c.id] || { status: 'not-started', notes: '' };
                    return (
                    <div key={c.id} style={{ borderTop: 'var(--border-width) solid var(--border-default)', padding: '10px 0', borderLeft: '3px solid ' + SEV_COLOR(c.severityIfFound), paddingInlineStart: '12px', marginBottom: '2px' }}>
                      <button onClick={() => setCaseOpen(caseOpen === c.id ? null : c.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flexWrap: 'wrap' }}>
                        <SeverityBadge level={sevLower(c.severityIfFound)} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>{c.id}</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>{c.title}</span>
                        <span style={{ marginLeft: compact ? 0 : 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <StatusPill status={entry.status} />
                          <span style={{ font: 'var(--type-small)', color: 'var(--text-muted)' }}>{c.target}</span>
                        </span>
                      </button>
                      {caseOpen === c.id && (
                        <div style={{ marginTop: '10px', font: 'var(--type-small)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{c.category} · {c.refs.join(' · ')}</div>
                          <p style={{ margin: '0 0 8px' }}><strong style={{ color: 'var(--text-primary)' }}>Objective.</strong> {c.objective}</p>
                          <div style={{ margin: '0 0 8px' }}><strong style={{ color: 'var(--text-primary)' }}>Steps.</strong>
                            <ol style={{ margin: '4px 0 0', paddingInlineStart: '18px' }}>{c.steps.map((s, i) => <li key={i} style={{ marginBottom: '3px' }}>{s}</li>)}</ol>
                          </div>
                          {c.payloads && (
                            <pre style={{ background: 'var(--surface-sunken)', border: 'var(--border-width) solid var(--border-default)', borderRadius: 'var(--radius-control)', padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '11px', whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{c.payloads.join('\n')}</pre>
                          )}
                          <p style={{ margin: '0 0 6px' }}><strong style={{ color: 'var(--text-primary)' }}>Tools.</strong> {c.tools.join(', ')}</p>
                          <p style={{ margin: '0 0 6px' }}><strong style={{ color: 'var(--text-primary)' }}>Evidence.</strong> {c.evidence}</p>
                          <p style={{ margin: '0 0 6px' }}><strong style={{ color: 'var(--sev-resolved)' }}>Secure looks like.</strong> {c.secureLooksLike}</p>
                          <p style={{ margin: '0 0 12px' }}><strong style={{ color: 'var(--text-primary)' }}>Remediation.</strong> {c.remediation}</p>

                          <div style={{ borderTop: 'var(--border-width) solid var(--border-default)', paddingTop: '10px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Tester result</div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                              {PT_ORDER.filter((s) => s !== 'observed').map((s) => (
                                <button
                                  key={s}
                                  onClick={() => update(c.id, { status: s })}
                                  style={{
                                    fontSize: '12px', padding: '4px 10px', borderRadius: 'var(--radius-control)', cursor: 'pointer',
                                    border: '1px solid ' + (entry.status === s ? PT_STATUS[s].color : 'var(--border-default)'),
                                    background: entry.status === s ? PT_STATUS[s].bg : 'var(--surface-page)',
                                    color: entry.status === s ? PT_STATUS[s].color : 'var(--text-secondary)',
                                    fontWeight: entry.status === s ? 700 : 400,
                                  }}
                                >
                                  {PT_STATUS[s].label}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={entry.notes}
                              onChange={(e) => update(c.id, { notes: e.target.value })}
                              placeholder="Evidence, request/response snippets, CVSS vector, screenshots reference…"
                              rows={entry.notes && entry.notes.length > 120 ? 6 : 3}
                              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '8px 10px', borderRadius: 'var(--radius-control)', border: 'var(--border-width) solid var(--border-default)', background: 'var(--surface-page)', color: 'var(--text-primary)', resize: 'vertical' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              )}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  Shell  ───────────────────────── */
const NAV = [
  ['report', 'Report', 'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5'],
  ['priorities', 'Priorities', 'm4 12 5 5L20 6'],
  ['fixes', 'Fixes', 'M12 5v14M5 12h14'],
  ['evidence', 'Evidence', 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2'],
  ['runbook', 'Pentest plan', 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7Z'],
];

function PageHead({ eyebrow, title, meta, actions }) {
  const viewport = useViewportWidth();
  const compact = viewport < 700;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
        <h1 style={{ font: compact ? 'var(--type-card-title)' : 'var(--type-h3)', margin: '8px 0 0', color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{title}</h1>
        {meta && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>{meta}</div>}
      </div>
      <div style={{ marginInlineStart: compact ? 0 : 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{actions}</div>
    </div>
  );
}

function App() {
  const [view, setView] = React.useState('report');
  const viewport = useViewportWidth();
  const compact = viewport < 920;
  const phone = viewport < 700;
  const { ThemeToggle } = window;
  const S = { report: <ReportView />, priorities: <PrioritiesView />, fixes: <FixesView />, evidence: <EvidenceView />, runbook: <RunbookView /> };
  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', minHeight: '100vh', background: 'var(--surface-sunken)', overflowX: 'hidden' }}>
      <aside style={{ width: compact ? '100%' : 248, flexShrink: 0, background: 'var(--surface-raised)', borderInlineEnd: compact ? 0 : 'var(--border-width) solid var(--border-default)', borderBottom: compact ? 'var(--border-width) solid var(--border-default)' : 0, height: compact ? 'auto' : '100vh', position: 'sticky', top: 0, zIndex: 10, display: 'flex', flexDirection: phone ? 'column' : compact ? 'row' : 'column', alignItems: phone ? 'stretch' : compact ? 'center' : 'stretch', gap: compact ? '6px' : 0, overflowX: 'visible' }}>
        <div style={{ height: compact ? '56px' : '60px', display: 'flex', alignItems: 'center', padding: '0 18px', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text-strong)' }}>
            Web<span style={{ color: 'var(--accent)' }}>Audit</span> AI
          </div>
        </div>
        <div style={{ display: compact ? 'none' : 'block', padding: '10px 18px 6px', font: 'var(--type-eyebrow)', fontSize: '10px', letterSpacing: 'var(--track-eyebrow)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Client showcase
        </div>
        <div style={{ flex: compact ? '0 0 auto' : 1, padding: phone ? '0 8px 8px' : compact ? '0 8px' : '4px 12px', display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? '4px' : '2px', overflowX: compact ? 'auto' : 'visible' }}>
          {NAV.map(([k, label, d]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              style={{
                display: 'flex', alignItems: 'center', gap: '9px', width: compact ? 'auto' : '100%', border: 0, cursor: 'pointer', textAlign: 'left',
                padding: '0 12px', height: compact ? '44px' : '38px', borderRadius: 'var(--radius-control)', fontFamily: 'var(--font-sans)', fontSize: compact ? '13px' : '14px',
                fontWeight: view === k ? 600 : 400,
                background: view === k ? 'var(--surface-page)' : 'transparent',
                color: view === k ? 'var(--text-strong)' : 'var(--text-secondary)',
                boxShadow: view === k ? (compact ? 'inset 0 -2px 0 var(--accent)' : 'inset 2px 0 0 var(--accent)') : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: compact ? 'none' : 'block', borderTop: 'var(--border-width) solid var(--border-default)', padding: '14px 18px', flexShrink: 0 }}>
          <div style={{ marginBottom: '10px' }}>{ThemeToggle ? <ThemeToggle label /> : null}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: A.overall.score >= 80 ? 'var(--sev-resolved)' : 'var(--sev-medium)' }}>
              {A.overall.score ?? '–'}
            </span>
            <span style={{ font: 'var(--type-small)', color: 'var(--text-secondary)' }}>/ 100 passive scan</span>
          </div>
          <div style={{ font: 'var(--type-small)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {allFindings().filter((f) => sevLower(f.severity) !== 'info').length} config findings · {RB ? RB.summary.testCases + '-case pentest in the Pentest plan tab' : 'real audit'}
          </div>
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        <main style={{ padding: compact ? '20px 14px 48px' : '32px 32px 64px' }}>
          <div style={{ maxWidth: '1180px', margin: '0 auto' }}>{S[view]}</div>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
