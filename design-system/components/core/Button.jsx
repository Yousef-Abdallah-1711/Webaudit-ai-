import React from 'react';
const base={height:'48px',boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'8px',padding:'0 32px',borderRadius:'var(--radius-control)',fontFamily:'var(--font-sans)',fontSize:'14px',fontWeight:500,cursor:'pointer',border:'var(--border-width) solid transparent',transition:'var(--transition-color)',textDecoration:'none',whiteSpace:'nowrap'};
const variants={
  primary:{background:'var(--accent)',color:'var(--text-on-accent)'},
  secondary:{background:'var(--surface-page)',color:'var(--text-primary)',borderColor:'var(--border-default)'},
  ghost:{background:'transparent',color:'var(--text-secondary)'},
  inverse:{background:'var(--surface-page)',color:'var(--text-primary)'}
};
const sizes={sm:{height:'36px',padding:'0 16px',fontSize:'14px'},md:{},lg:{height:'56px',padding:'0 40px',fontSize:'16px'}};
export function Button({variant='primary',size='md',disabled=false,fullWidth=false,icon=null,onClick,href,children,...rest}){
  const [h,setH]=React.useState(false);
  const v=variants[variant]||variants.primary;
  const style={...base,...v,...(sizes[size]||{}),...(fullWidth?{width:'100%'}:{}),
    ...(h&&!disabled?{background:variant==='primary'?'var(--accent-hover)':variant==='ghost'?'var(--surface-raised)':'var(--surface-raised)',color:variant==='ghost'?'var(--text-strong)':v.color}:{}),
    ...(disabled?{opacity:.45,cursor:'not-allowed'}:{})};
  const Tag=href?'a':'button';
  return <Tag href={href} style={style} disabled={href?undefined:disabled} onClick={disabled?undefined:onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} {...rest}>{icon}{children}</Tag>;
}
