import React from 'react';
function band(s){return s>=85?'var(--sev-resolved)':s>=70?'var(--sev-low)':s>=50?'var(--sev-medium)':s>=30?'var(--sev-high)':'var(--sev-critical)'}
export function ScoreArc({score=0,delta=null,size=180,label='Health score'}){
  // The measured score is what renders. The count-up is an enhancement layered on top, so a
  // throttled or never-firing rAF can only cost the animation — never the number.
  const [v,setV]=React.useState(score);
  React.useEffect(()=>{
    setV(score);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(typeof requestAnimationFrame!=='function')return;
    const t0=performance.now(),d=600;let raf,done=false;
    const step=t=>{const p=Math.min(1,(t-t0)/d);setV(Math.round(score*(1-Math.pow(1-p,3))));
      if(p<1&&!done)raf=requestAnimationFrame(step);else setV(score)};
    raf=requestAnimationFrame(step);
    return()=>{done=true;cancelAnimationFrame(raf)}},[score]);
  const r=(size-16)/2,c=Math.PI*r*1.5,off=c*(1-v/100);
  return <div style={{width:size,textAlign:'center',fontFamily:'var(--font-sans)'}}>
    <svg width={size} height={size*0.78} viewBox={`0 0 ${size} ${size*0.78}`}>
      <g transform={`rotate(135 ${size/2} ${size/2})`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-default)" strokeWidth="8" strokeDasharray={`${c} 999`} strokeLinecap="butt"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band(score)} strokeWidth="8" strokeDasharray={`${c} 999`} strokeDashoffset={off} strokeLinecap="butt"/>
      </g>
      <text x={size/2} y={size*0.46} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={size*0.3} fontWeight="700" fill="var(--text-strong)" style={{fontVariantNumeric:'tabular-nums'}}>{v}</text>
      {delta!=null&&<text x={size/2} y={size*0.62} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill={delta>=0?'var(--sev-resolved)':'var(--sev-critical)'}>{delta>=0?'+':''}{delta} vs baseline</text>}
    </svg>
    <div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'-4px'}}>{label}</div>
  </div>;
}
