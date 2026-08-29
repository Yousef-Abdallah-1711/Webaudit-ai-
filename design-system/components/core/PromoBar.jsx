import React from 'react';
export function PromoBar({message,code,dark=false,onDismiss}){
  const [gone,setGone]=React.useState(false);
  if(gone)return null;
  return <div style={{background:dark?'var(--promo-bg-dark)':'var(--promo-bg)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',gap:'12px',padding:'10px 16px',fontFamily:'var(--font-sans)',fontSize:'13px',fontWeight:500,letterSpacing:'.6px',textTransform:'uppercase',position:'relative'}}>
    <span>{message}</span>
    {code&&<code style={{fontFamily:'var(--font-mono)',background:'rgba(0,0,0,.22)',padding:'3px 8px',borderRadius:'var(--radius-control)',letterSpacing:'normal',textTransform:'none'}}>{code}</code>}
    <button onClick={()=>{setGone(true);onDismiss&&onDismiss();}} aria-label="Dismiss" style={{position:'absolute',right:'14px',background:'none',border:0,color:'#fff',cursor:'pointer',fontSize:'16px',lineHeight:1,opacity:.8}}>×</button>
  </div>;
}
