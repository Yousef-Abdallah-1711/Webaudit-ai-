import React from 'react';
export function ProgressRow({elapsed='0:00',phase,done=0,total=5,safeToClose=true}){
  const pct=Math.round(done/total*100);
  return <div style={{border:'var(--border-width) solid var(--border-default)',background:'var(--surface-page)',padding:'16px 18px',fontFamily:'var(--font-sans)'}}>
    <div style={{display:'flex',alignItems:'baseline',gap:'12px',marginBottom:'10px'}}>
      <span style={{fontSize:'15px',fontWeight:600,color:'var(--text-strong)'}}>{phase}</span>
      <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)'}}>{done} of {total} areas</span>
      <span dir="ltr" style={{marginInlineStart:'auto',fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{elapsed}</span>
    </div>
    <div style={{height:'6px',background:'var(--surface-sunken)',border:'var(--border-width) solid var(--border-default)',overflow:'hidden'}}>
      <div style={{width:pct+'%',height:'100%',background:'var(--accent)',transition:'width var(--duration-land) var(--easing-reveal)'}}/>
    </div>
    {safeToClose&&<div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'10px'}}>You can close this tab. The audit keeps running and the report will be waiting.</div>}
  </div>;
}
