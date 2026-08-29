import React from 'react';
export function Eyebrow({tone='muted',children}){
  return <div style={{font:'var(--type-eyebrow)',fontSize:'12px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:tone==='accent'?'var(--accent)':'var(--text-muted)'}}>{children}</div>;
}
