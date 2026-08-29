import React from 'react';
import { SeverityBadge } from '../core/SeverityBadge.jsx';
import { AttributionMark } from './AttributionMark.jsx';
const sev={critical:'var(--sev-critical)',high:'var(--sev-high)',medium:'var(--sev-medium)',low:'var(--sev-low)',info:'var(--sev-info)',resolved:'var(--sev-resolved)'};
export function IssueCard({severity='high',title,location,description,attribution='measured',prompt,area,onCopy}){
  const [copied,setCopied]=React.useState(false);
  return <div style={{background:'var(--surface-card)',border:'var(--border-width) solid var(--border-default)',borderInlineStart:'3px solid '+(sev[severity]||sev.high),borderRadius:'var(--radius-card)',padding:'18px 20px',fontFamily:'var(--font-sans)'}}>
    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px',flexWrap:'wrap'}}>
      <SeverityBadge level={severity}/>
      {area&&<span style={{font:'var(--type-small)',color:'var(--text-muted)'}}>{area}</span>}
      <span style={{marginInlineStart:'auto'}}><AttributionMark kind={attribution}/></span>
    </div>
    <div style={{fontSize:'17px',fontWeight:600,color:'var(--text-strong)',marginBottom:'6px'}}>{title}</div>
    {location&&<div dir="ltr" style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-zinc)',marginBottom:'10px',wordBreak:'break-all'}}>{location}</div>}
    {description&&<p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'0 0 14px',maxWidth:'62ch',textWrap:'pretty'}}>{description}</p>}
    {prompt&&<button onClick={()=>{setCopied(true);onCopy&&onCopy(prompt);setTimeout(()=>setCopied(false),1600)}}
      style={{height:'36px',padding:'0 16px',borderRadius:'var(--radius-control)',border:'var(--border-width) solid var(--border-default)',background:copied?'var(--sev-resolved-bg)':'var(--surface-page)',color:copied?'var(--sev-resolved)':'var(--text-primary)',fontFamily:'var(--font-sans)',fontSize:'14px',fontWeight:500,cursor:'pointer',transition:'var(--transition-color)'}}>
      {copied?'Copied':'Copy fix prompt'}</button>}
  </div>;
}
