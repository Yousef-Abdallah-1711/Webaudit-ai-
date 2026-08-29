import * as React from 'react';
/** Full-width dismissible emerald band with uppercase small text and an inline code chip. */
export interface PromoBarProps { message: string; code?: string; dark?: boolean; onDismiss?: () => void }
export function PromoBar(props: PromoBarProps): JSX.Element;
