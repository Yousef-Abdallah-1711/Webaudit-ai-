import React from 'react';
const S={
  waiting:{fg:'var(--text-muted)',bg:'var(--surface-raised)',word:'Waiting',d:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2'},
  running:{fg:'var(--accent)',bg:'#fff3ec',word:'Running',d:'M12 3a9 9 0 1 0 9 9'},
  complete:{fg:'var(--sev-resolved)',bg:'var(--sev-resolved-bg)',word:'Complete',d:'m4 12 5 5L20 6'},
  degraded:{fg:'var(--sev-medium)',bg:'var(--sev-medium-bg)',word:'Degraded',d:'M12 2 1 21h22L12 2Zm0 7v5m0 3v.5'},
  'not-applicable':{fg:'var(--text-muted)',bg:'var(--surface-sunken)',word:'Not applicable',d:'M5 12h14'}
};
const ell={overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0};
export function ModuleStatus({area,state='waiting',detail,issues=null,compact=false}){
  const s=S[state]||S.waiting;
  const icon=<span style={{display:'inline-flex',flexShrink:0,color:s.fg,animation:state==='running'?'wa-spin 1s linear infinite':'none'}}>
    <svg width={compact?15:18} height={compact?15:18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={s.d}/></svg>
  </span>;
  const box={background:s.bg,border:'var(--border-width) solid var(--border-default)',borderInlineStart:state==='degraded'?'3px solid var(--sev-medium)':undefined,fontFamily:'var(--font-sans)',minWidth:0,overflow:'hidden'};
  if(compact)return <div style={{...box,padding:'10px 12px'}}>
    <div style={{display:'flex',alignItems:'center',gap:'8px',minWidth:0}}>
      {icon}
      <span style={{fontSize:'14px',fontWeight:600,color:'var(--text-strong)',...ell}}>{area}</span>
      {issues!=null&&<span dir="ltr" style={{marginInlineStart:'auto',flexShrink:0,fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--text-secondary)'}}>{issues}</span>}
    </div>
    <div style={{display:'flex',gap:'6px',marginTop:'3px',paddingInlineStart:'23px',minWidth:0}}>
      <span style={{fontSize:'12px',fontWeight:700,color:s.fg,flexShrink:0}}>{s.word}</span>
      {detail&&<span style={{fontSize:'12px',color:'var(--text-secondary)',...ell}}>{detail}</span>}
    </div>
  </div>;
  return <div style={{...box,display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px'}}>
    {icon}
    <span style={{fontSize:'15px',fontWeight:600,color:'var(--text-strong)',flex:'0 1 auto',...ell}}>{area}</span>
    <span style={{fontSize:'13px',fontWeight:700,color:s.fg,flexShrink:0,whiteSpace:'nowrap'}}>{s.word}</span>
    {detail&&<span style={{fontSize:'13px',color:'var(--text-secondary)',flex:'1 1 auto',...ell}}>{detail}</span>}
    {issues!=null&&<span dir="ltr" style={{marginInlineStart:'auto',flexShrink:0,fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)'}}>{issues}</span>}
  </div>;
}
