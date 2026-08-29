import React from 'react';
export function Card({title,eyebrow,footer,padding=24,accentRule=null,elevated=false,children,style={},...rest}){
  return <div style={{background:'var(--surface-card)',border:'var(--border-width) solid var(--border-card)',borderRadius:'var(--radius-card)',borderInlineStart:accentRule?'3px solid '+accentRule:undefined,boxShadow:elevated?'var(--shadow-card)':'none',padding:padding+'px',...style}} {...rest}>
    {eyebrow&&<div style={{font:'var(--type-eyebrow)',fontSize:'12px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'8px'}}>{eyebrow}</div>}
    {title&&<div style={{font:'var(--type-card-title)',color:'var(--text-strong)',marginBottom:'12px'}}>{title}</div>}
    {children}
    {footer&&<div style={{marginTop:'16px',paddingTop:'16px',borderTop:'var(--border-width) solid var(--border-default)',font:'var(--type-small)',color:'var(--text-secondary)'}}>{footer}</div>}
  </div>;
}
