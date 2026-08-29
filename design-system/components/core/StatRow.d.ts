import * as React from 'react';
/** Middot-separated counter row, e.g. "3 critical · 5 high · 8 medium · 2 resolved". */
export interface StatRowProps { items: { value: React.ReactNode; label: string }[]; align?: 'left' | 'center' }
export function StatRow(props: StatRowProps): JSX.Element;
