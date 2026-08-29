import * as React from 'react';
/** Required on every finding (FR-032): says whether we observed it or concluded it. A trust feature. */
export interface AttributionMarkProps { kind?: 'measured' | 'ai-judgment' }
export function AttributionMark(props: AttributionMarkProps): JSX.Element;
