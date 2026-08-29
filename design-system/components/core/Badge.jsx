import React from 'react';
const tones={neutral:['var(--surface-raised)','var(--text-secondary)','var(--border-default)'],accent:['#fff3ec','var(--accent)','#ffd9c2'],success:['var(--sev-resolved-bg)','var(--sev-resolved)','#a7f3d0'],inverse:['var(--surface-inverse)','var(--text-on-accent)','transparent']};
export function Badge({tone='neutral',pill=true,mono=false,icon=null,children}){
  const [bg,fg,bd]=tones[tone]||tones.neutral;
  return <span style={{display:'inline-flex',alignItems:'center',gap:'6px',background:bg,color:fg,border:'var(--border-width) solid '+bd,borderRadius:pill?'var(--radius-pill)':'var(--radius-none)',padding:'4px 10px',fontFamily:mono?'var(--font-mono)':'var(--font-sans)',fontSize:'12px',fontWeight:500,lineHeight:'16px',whiteSpace:'nowrap'}}>{icon}{children}</span>;
}
