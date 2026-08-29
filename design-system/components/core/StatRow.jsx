import React from 'react';
export function StatRow({items=[],align='left'}){
  return <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'10px',justifyContent:align==='center'?'center':'flex-start',font:'var(--type-small)',color:'var(--text-secondary)'}}>
    {items.map((it,i)=><React.Fragment key={i}>{i>0&&<span aria-hidden="true" style={{color:'var(--border-default)'}}>·</span>}<span><strong style={{color:'var(--text-strong)',fontWeight:700}}>{it.value}</strong> {it.label}</span></React.Fragment>)}
  </div>;
}
