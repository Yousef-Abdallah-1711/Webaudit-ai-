/**
 * T241 — scaffold placeholder.
 *
 * Proves `(dashboard)/layout.tsx` (AppShell/Sidebar) boots with a real page
 * inside it — a layout with no page under it renders nothing `next build`
 * can verify. Not a ported screen: whichever Phase 3 (US1) task ports the
 * real "New scan" page replaces this, the same way T240 replaced T236a's
 * root scaffold.
 */
export default function ScanPlaceholder(): React.ReactElement {
  return (
    <div>
      <p style={{ font: 'var(--type-eyebrow)', color: 'var(--text-muted)' }}>Dashboard</p>
      <h1 style={{ font: 'var(--type-h3)', marginTop: 'var(--space-2)', marginBottom: 0 }}>
        Scaffold — a Phase 3 task ports the real scan page here.
      </h1>
    </div>
  );
}
