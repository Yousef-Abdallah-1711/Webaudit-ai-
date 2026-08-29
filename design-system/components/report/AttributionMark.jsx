import React from 'react';
export function AttributionMark({kind='measured'}){
  const m=kind==='measured'?['var(--sev-info)','Measured','M4 20V10m5 10V4m5 16v-7m5 7V8']:['var(--text-muted)','AI judgment','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 7a2 2 0 1 1 4 0c0 1.5-2 1.8-2 3m0 3v.5'];
  return <span title={kind==='measured'?'Observed directly by a check':'Concluded by a model from measured input'} style={{display:'inline-flex',alignItems:'center',gap:'5px',fontFamily:'var(--font-mono)',fontSize:'11px',letterSpacing:'.3px',color:m[0],textTransform:'uppercase'}}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d={m[2]}/></svg>{m[1]}
  </span>;
}
