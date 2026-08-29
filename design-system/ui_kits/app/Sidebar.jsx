const { Button, Badge, Eyebrow } = window.WebAuditAIDesignSystem_fa5933;

const I={
  scan:'M12 5v14M5 12h14',
  progress:'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  report:'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5',
  fixes:'m4 12 5 5L20 6',
  readiness:'M6 21V4h12l-2 4 2 4H6',
  usage:'M4 20V10m5 10V4m5 16v-7m5 7V8',
  billing:'M3 7h18v12H3Zm0 4h18M7 15h4',
  profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  admin:'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7Z',
  toggle:'M4 6h16M4 12h16M4 18h16',
  chevron:'m9 6 6 6-6 6'
};

function Ico({d,size=17}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d={d}/></svg>}

const GROUPS=[
  ['g_audits',[['scan','n_scan',I.scan],['progress','n_progress',I.progress],['report','n_report',I.report],['fixes','n_fixes',I.fixes],['readiness','n_readiness',I.readiness]]],
  ['g_account',[['usage','n_usage',I.usage],['billing','n_billing',I.billing],['profile','n_profile',I.profile]]]
];

function NavItem({open,active,label,icon,onClick,badge}){
  const [h,setH]=React.useState(false);
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} title={open?undefined:label}
    style={{display:'flex',alignItems:'center',gap:'11px',width:'100%',border:0,cursor:'pointer',textAlign:'left',
      padding:open?'0 12px':'0',height:'38px',justifyContent:open?'flex-start':'center',
      borderRadius:'var(--radius-control)',fontFamily:'var(--font-sans)',fontSize:'14px',
      fontWeight:active?600:400,transition:'var(--transition-color)',
      background:active?'var(--surface-page)':h?'rgba(255,255,255,.55)':'transparent',
      color:active?'var(--text-strong)':'var(--text-secondary)',
      boxShadow:active?'inset 2px 0 0 var(--accent)':'none'}}>
    <Ico d={icon}/>
    {open&&<span style={{whiteSpace:'nowrap',overflow:'hidden'}}>{label}</span>}
    {open&&badge!=null&&<span style={{marginInlineStart:'auto',fontFamily:'var(--font-mono)',fontSize:'11px',color:'var(--sev-critical)'}}>{badge}</span>}
  </button>;
}

function Sidebar({view,setView,open,setOpen}){
  const [t]=useT();
  const W=open?248:60;
  return <aside style={{width:W,flexShrink:0,background:'var(--surface-raised)',borderInlineEnd:'var(--border-width) solid var(--border-default)',
    height:'100vh',position:'sticky',top:0,display:'flex',flexDirection:'column',transition:'width 150ms var(--easing)',overflow:'hidden'}}>
    <div style={{height:'60px',display:'flex',alignItems:'center',gap:'8px',padding:open?'0 12px':'0',justifyContent:open?'flex-start':'center',flexShrink:0}}>
      <button onClick={()=>setOpen(!open)} aria-label={open?'Collapse sidebar':'Expand sidebar'} title={open?'Collapse sidebar':'Expand sidebar'}
        style={{width:'34px',height:'34px',display:'grid',placeItems:'center',border:0,background:'transparent',borderRadius:'var(--radius-control)',color:'var(--text-secondary)',cursor:'pointer',transition:'var(--transition-color)',flexShrink:0}}>
        <Ico d={I.toggle} size={19}/>
      </button>
      {open&&<div style={{fontSize:'16px',fontWeight:700,letterSpacing:'-0.3px',color:'var(--text-strong)',whiteSpace:'nowrap'}}>Web<span style={{color:'var(--accent)'}}>Audit</span> AI</div>}
    </div>
    <div style={{flex:1,overflowY:'auto',padding:open?'6px 10px':'6px 8px'}}>
      {GROUPS.map(([g,items])=><div key={g} style={{marginBottom:'16px'}}>
        {open&&<div style={{font:'var(--type-eyebrow)',fontSize:'10px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:'var(--text-muted)',padding:'0 12px 6px'}}>{t(g)}</div>}
        {!open&&<div style={{height:'1px',background:'var(--border-default)',margin:'0 6px 8px'}}/>}
        <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
          {items.map(([k,l,ic])=><NavItem key={k} open={open} active={view===k} label={t(l)} icon={ic} onClick={()=>setView(k)} badge={k==='fixes'?4:null}/>)}
        </div>
      </div>)}
    </div>
    <div style={{borderTop:'var(--border-width) solid var(--border-default)',padding:open?'12px':'12px 8px',flexShrink:0}}>
      {open&&<div style={{border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-card)',background:'var(--surface-page)',padding:'12px',marginBottom:'12px'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:'6px'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:'15px',fontWeight:700,color:'var(--text-strong)'}}>1,120</span>
          <span style={{font:'var(--type-small)',fontSize:'12px',color:'var(--text-secondary)'}}>{t('credits_left')}</span>
        </div>
        <div style={{height:'4px',background:'var(--surface-sunken)',marginTop:'8px'}}><div style={{width:'77%',height:'100%',background:'var(--accent)'}}/></div>
        <button onClick={()=>setView('billing')} style={{marginTop:'10px',width:'100%',height:'30px',border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-control)',background:'var(--surface-page)',fontFamily:'var(--font-sans)',fontSize:'12px',cursor:'pointer'}}>{t('top_up')}</button>
      </div>}
      {open&&<div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
        <div style={{flex:1}}><ThemeToggle label/></div>
        <LangToggle/>
        <a href="../admin/index.html" title="Admin console" style={{width:'36px',height:'36px',display:'grid',placeItems:'center',border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-control)',color:'var(--text-secondary)'}}><Ico d={I.admin} size={16}/></a>
      </div>}
      {!open&&<div style={{display:'grid',placeItems:'center',gap:'6px',marginBottom:'10px'}}><ThemeToggle compact/></div>}
      <button onClick={()=>setView('profile')} style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',border:0,background:'transparent',cursor:'pointer',padding:0}}>
        <div style={{width:'30px',height:'30px',borderRadius:'var(--radius-pill)',background:'var(--surface-inverse)',color:'#fafafa',display:'grid',placeItems:'center',fontSize:'12px',fontWeight:600,flexShrink:0}}>KA</div>
        {open&&<div style={{textAlign:'left',overflow:'hidden'}}>
          <div style={{fontSize:'13px',fontWeight:600,color:'var(--text-strong)',whiteSpace:'nowrap'}}>Khalid Ahmed</div>
          <div style={{fontSize:'11px',color:'var(--text-muted)',whiteSpace:'nowrap'}}>Pro plan</div>
        </div>}
        {open&&<span style={{marginInlineStart:'auto',color:'var(--text-muted)'}}><Ico d={I.chevron} size={14}/></span>}
      </button>
    </div>
  </aside>;
}

// Views whose copy is translated. Everything else is still English, so it is pinned to LTR
// rather than being mirrored by the global dir=rtl.
const TRANSLATED=['scan'];
function AppShell({view,setView,children}){
  const [open,setOpen]=React.useState(true);
  const [,lang]=useT();
  const bodyDir=(lang==='ar'&&!TRANSLATED.includes(view))?'ltr':undefined;
  return <div style={{display:'flex',minHeight:'100vh',background:'var(--surface-sunken)'}}>
    <Sidebar view={view} setView={setView} open={open} setOpen={setOpen}/>
    <div style={{flex:1,minWidth:0}}>
      <main dir={bodyDir} style={{padding:'32px 32px 64px'}}><div style={{maxWidth:'1280px',margin:'0 auto'}}>{children}</div></main>
    </div>
  </div>;
}

function PageHead({eyebrow,title,meta,actions}){
  return <div style={{display:'flex',alignItems:'flex-end',gap:'16px',marginBottom:'24px',flexWrap:'wrap'}}>
    <div>
      {eyebrow&&<Eyebrow tone="accent">{eyebrow}</Eyebrow>}
      <h1 style={{font:'var(--type-h3)',margin:'8px 0 0',color:'var(--text-strong)'}}>{title}</h1>
      {meta&&<div style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)',marginTop:'6px'}}>{meta}</div>}
    </div>
    <div style={{marginInlineStart:'auto',display:'flex',gap:'10px'}}>{actions}</div>
  </div>;
}
Object.assign(window,{AppShell,Sidebar,PageHead,Ico,I});
