import React from 'react';
export function VerdictPanel({verdict='go',score,baseline,blockers=[],areas=[]}){
  const go=verdict==='go';
  return <div style={{border:'var(--border-width) solid '+(go?'var(--sev-resolved)':'var(--sev-critical)'),borderRadius:'var(--radius-card)',overflow:'hidden',fontFamily:'var(--font-sans)'}}>
    <div style={{background:go?'var(--sev-resolved-bg)':'var(--sev-critical-bg)',padding:'22px 24px',borderBottom:'var(--border-width) solid var(--border-default)'}}>
      <div style={{font:'var(--type-eyebrow)',fontSize:'12px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:go?'var(--sev-resolved)':'var(--sev-critical)',marginBottom:'8px'}}>Production readiness</div>
      <div style={{font:'var(--type-h3)',color:'var(--text-strong)'}}>{go?'Ready to ship':'Not ready to ship'}</div>
      {score!=null&&<div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px',fontFamily:'var(--font-mono)'}}>Score {score}{baseline!=null&&' · baseline '+baseline+' · '+(score-baseline>=0?'+':'')+(score-baseline)}</div>}
    </div>
    <div style={{padding:'18px 24px',background:'var(--surface-page)'}}>
      {areas.map((a,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:i<areas.length-1?'var(--border-width) solid var(--border-default)':'none'}}>
        <span style={{color:a.pass?'var(--sev-resolved)':'var(--sev-critical)',display:'inline-flex'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={a.pass?'m4 12 5 5L20 6':'M6 6l12 12M18 6 6 18'}/></svg></span>
        <span style={{fontSize:'15px',color:'var(--text-primary)'}}>{a.name}</span>
        <span dir="ltr" style={{marginInlineStart:'auto',fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)'}}>{a.score} / {a.threshold}</span>
      </div>)}
      {blockers.length>0&&<div style={{marginTop:'16px'}}>
        <div style={{font:'var(--type-small)',fontWeight:700,color:'var(--sev-critical)',marginBottom:'8px'}}>Blockers</div>
        {blockers.map((b,i)=><div key={i} style={{font:'var(--type-small)',color:'var(--text-primary)',padding:'4px 0'}}>— {b}</div>)}
      </div>}
    </div>
  </div>;
}
