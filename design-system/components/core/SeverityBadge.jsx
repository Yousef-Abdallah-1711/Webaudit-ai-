import React from 'react';
const map={
  critical:['var(--sev-critical)','var(--sev-critical-bg)','Critical','M12 2 1 21h22L12 2Zm0 6v6m0 3v.5'],
  high:['var(--sev-high)','var(--sev-high-bg)','High','M12 3v12m0 4v.5M4 20h16'],
  medium:['var(--sev-medium)','var(--sev-medium-bg)','Medium','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3v.5'],
  low:['var(--sev-low)','var(--sev-low-bg)','Low','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6'],
  info:['var(--sev-info)','var(--sev-info-bg)','Info','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.5m0 3v5'],
  resolved:['var(--sev-resolved)','var(--sev-resolved-bg)','Resolved','m4 12 5 5L20 6']
};
export function SeverityBadge({level='medium',label,count}){
  const [fg,bg,text,d]=map[level]||map.medium;
  return <span style={{display:'inline-flex',alignItems:'center',gap:'6px',background:bg,color:fg,border:'var(--border-width) solid currentColor',borderRadius:'var(--radius-pill)',padding:'3px 10px',fontFamily:'var(--font-sans)',fontSize:'12px',fontWeight:700,lineHeight:'16px'}}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
    {label||text}{count!=null&&<span style={{fontWeight:500,opacity:.75}}>{count}</span>}
  </span>;
}
