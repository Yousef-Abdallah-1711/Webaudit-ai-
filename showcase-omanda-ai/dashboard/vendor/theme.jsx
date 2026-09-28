function waRead(k,d){try{return localStorage.getItem(k)||d}catch(e){return d}}
function waStore(key,initial,apply){
  const s={v:waRead(key,initial),subs:new Set(),
    set(nv){s.v=nv;try{localStorage.setItem(key,nv)}catch(e){}apply(nv);s.subs.forEach(f=>f())}};
  apply(s.v);return s;
}
const waTheme=waStore('wa-theme','light',v=>document.documentElement.setAttribute('data-theme',v));
const waLang=waStore('wa-lang','en',v=>{const h=document.documentElement;h.lang=v;h.dir=v==='ar'?'rtl':'ltr'});

function waUse(store){
  const [,force]=React.useReducer(x=>x+1,0);
  React.useEffect(()=>{store.subs.add(force);return()=>store.subs.delete(force)},[]);
  return [store.v,v=>store.set(v)];
}
function useTheme(){return waUse(waTheme)}
function useLang(){return waUse(waLang)}
function useT(){
  const [lang,setLang]=useLang();
  const t=k=>{const tb=window.WA_STRINGS||{};return (tb[lang]&&tb[lang][k])??(tb.en&&tb.en[k])??k};
  return [t,lang,setLang];
}

const SUN='M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
const MOON='M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z';

function ThemeToggle({compact=false,label=false}){
  const [th,setT]=useTheme();const dark=th==='dark';const [h,setH]=React.useState(false);
  const [t]=useT();
  return <button onClick={()=>setT(dark?'light':'dark')} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    aria-label={dark?'Switch to light mode':'Switch to dark mode'} title={dark?'Light':'Dark'}
    style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',height:compact?'30px':'36px',width:label?'100%':(compact?'30px':'36px'),
      boxSizing:'border-box',border:'var(--border-width) solid '+(label?'var(--border-default)':'transparent'),borderRadius:'var(--radius-control)',
      background:h?'var(--surface-raised)':'transparent',color:'var(--text-secondary)',cursor:'pointer',
      fontFamily:'var(--font-sans)',fontSize:'13px',transition:'var(--transition-color)',padding:label?'0 12px':0}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={dark?MOON:SUN}/></svg>
    {label&&<span>{dark?t('theme_dark'):t('theme_light')}</span>}
  </button>;
}

function LangToggle({label=false}){
  const [lang,setLang]=useLang();
  const [h,setH]=React.useState(false);
  const next=lang==='ar'?'en':'ar';
  return <button onClick={()=>setLang(next)} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    aria-label={'Switch to '+(next==='ar'?'Arabic':'English')} title={next==='ar'?'العربية':'English'}
    style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',height:'36px',width:label?'100%':'auto',boxSizing:'border-box',
      padding:'0 12px',border:'var(--border-width) solid '+(label?'var(--border-default)':'transparent'),borderRadius:'var(--radius-control)',
      background:h?'var(--surface-raised)':'transparent',color:'var(--text-secondary)',cursor:'pointer',
      fontFamily:'var(--font-sans)',fontSize:'13px',fontWeight:500,transition:'var(--transition-color)'}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3C9.5 5.4 9.5 18.6 12 21"/></svg>
    <span>{lang==='ar'?'EN':'ع'}</span>
  </button>;
}
Object.assign(window,{useTheme,useLang,useT,ThemeToggle,LangToggle,waTheme,waLang});
