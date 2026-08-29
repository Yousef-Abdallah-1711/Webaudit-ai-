import React from 'react';
export function Input({prefix,placeholder,value,onChange,type='text',fullWidth=true,invalid=false,mono=false,...rest}){
  const [f,setF]=React.useState(false);
  return <div style={{position:'relative',width:fullWidth?'100%':'auto'}}>
    {prefix&&<span style={{position:'absolute',left:'12px',top:0,height:'48px',display:'flex',alignItems:'center',font:'var(--type-small)',color:'var(--text-muted)',fontFamily:'var(--font-mono)',pointerEvents:'none'}}>{prefix}</span>}
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{height:'48px',width:'100%',boxSizing:'border-box',border:'var(--border-width) solid '+(invalid?'var(--sev-critical)':'var(--border-subtle)'),borderRadius:'var(--radius-control)',padding:prefix?'4px 12px 4px 64px':'4px 12px',fontFamily:mono?'var(--font-mono)':'var(--font-sans)',fontSize:'14px',color:'var(--text-primary)',background:'var(--surface-field)',outline:'none',boxShadow:f?'var(--shadow-focus)':'none',transition:'var(--transition-color)'}} {...rest}/>
  </div>;
}
