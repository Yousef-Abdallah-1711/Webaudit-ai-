const { Button, Badge, Input, Card, Eyebrow } = window.WebAuditAIDesignSystem_fa5933;

const AI={
  overview:'M4 20V10m5 10V4m5 16v-7m5 7V8',
  users:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  plans:'M3 7h18v12H3Zm0 4h18M7 15h4',
  caps:'M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z',
  providers:'M12 3v6m0 6v6M5 8l7 4 7-4M5 16l7-4 7 4',
  queue:'M4 6h16M4 12h16M4 18h10',
  margin:'M4 18 10 12l4 4 6-8m0 0h-5m5 0v5',
  scans:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5.5 12.5L21 21',
  log:'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5',
  settings:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-1.4 3.4 1 2-2 2-2-1L12 20l-1.4-1.6-2 1-2-2 1-2L4 12l1.6-1.4-1-2 2-2 2 1L12 4l1.4 1.6 2-1 2 2-1 2Z',
  toggle:'M4 6h16M4 12h16M4 18h16',
  exit:'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9'
};
function AIco({d,size=17}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d={d}/></svg>}

const AGROUPS=[
  ['Platform',[['overview','Overview',AI.overview],['queue','Queue',AI.queue],['scans','Scans',AI.scans]]],
  ['Catalogue',[['caps','Capabilities',AI.caps],['providers','AI providers',AI.providers]]],
  ['Commerce',[['users','Users',AI.users],['plans','Plans',AI.plans],['margin','Margin',AI.margin]]],
  ['Governance',[['log','Audit log',AI.log],['settings','Settings',AI.settings]]]
];

function ANavItem({open,active,label,icon,onClick}){
  const [h,setH]=React.useState(false);
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} title={open?undefined:label}
    style={{display:'flex',alignItems:'center',gap:'11px',width:'100%',border:0,cursor:'pointer',textAlign:'left',
      padding:open?'0 12px':'0',height:'38px',justifyContent:open?'flex-start':'center',borderRadius:'var(--radius-control)',
      fontFamily:'var(--font-sans)',fontSize:'14px',fontWeight:active?600:400,transition:'var(--transition-color)',
      background:active?'rgba(255,255,255,.10)':h?'rgba(255,255,255,.05)':'transparent',
      color:active?'#fafafa':'#9ca3af',boxShadow:active?'inset 2px 0 0 var(--accent)':'none'}}>
    <AIco d={icon}/>{open&&<span style={{whiteSpace:'nowrap',overflow:'hidden'}}>{label}</span>}
  </button>;
}

function AdminSidebar({view,setView,open,setOpen}){
  return <aside style={{width:open?248:60,flexShrink:0,background:'#1f2937',borderInlineEnd:'var(--border-width) solid #374151',
    height:'100vh',position:'sticky',top:0,display:'flex',flexDirection:'column',transition:'width 150ms var(--easing)',overflow:'hidden'}}>
    <div style={{height:'60px',display:'flex',alignItems:'center',gap:'8px',padding:open?'0 12px':'0',justifyContent:open?'flex-start':'center',flexShrink:0}}>
      <button onClick={()=>setOpen(!open)} aria-label={open?'Collapse sidebar':'Expand sidebar'} title={open?'Collapse sidebar':'Expand sidebar'}
        style={{width:'34px',height:'34px',display:'grid',placeItems:'center',border:0,background:'transparent',borderRadius:'var(--radius-control)',color:'#9ca3af',cursor:'pointer',flexShrink:0}}>
        <AIco d={AI.toggle} size={19}/></button>
      {open&&<div style={{display:'flex',alignItems:'center',gap:'8px',whiteSpace:'nowrap'}}>
        <span style={{fontSize:'15px',fontWeight:700,letterSpacing:'-0.3px',color:'#fafafa'}}>Web<span style={{color:'var(--accent)'}}>Audit</span></span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:'10px',letterSpacing:'1px',textTransform:'uppercase',color:'var(--accent)',border:'var(--border-width) solid var(--accent)',padding:'1px 5px'}}>operator</span>
      </div>}
    </div>
    <div style={{flex:1,overflowY:'auto',padding:open?'6px 10px':'6px 8px'}}>
      {AGROUPS.map(([g,items])=><div key={g} style={{marginBottom:'16px'}}>
        {open&&<div style={{fontFamily:'var(--font-sans)',fontWeight:700,fontSize:'10px',letterSpacing:'1.5px',textTransform:'uppercase',color:'#6b7280',padding:'0 12px 6px'}}>{g}</div>}
        {!open&&<div style={{height:'1px',background:'#374151',margin:'0 6px 8px'}}/>}
        <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
          {items.map(([k,l,ic])=><ANavItem key={k} open={open} active={view===k} label={l} icon={ic} onClick={()=>setView(k)}/>)}
        </div>
      </div>)}
    </div>
    <div style={{borderTop:'var(--border-width) solid #374151',padding:open?'12px':'12px 8px',flexShrink:0,display:'flex',flexDirection:'column',gap:'8px'}}>
      {open&&<div style={{fontFamily:'var(--font-mono)',fontSize:'11px',color:'#6b7280'}}>every action here is recorded</div>}
      <div style={{display:'flex',gap:'8px',alignItems:'center',justifyContent:open?'flex-start':'center'}}>
        <a href="../app/index.html" title="Back to dashboard" style={{width:'34px',height:'34px',display:'grid',placeItems:'center',border:'var(--border-width) solid #374151',borderRadius:'var(--radius-control)',color:'#9ca3af'}}><AIco d={AI.exit} size={16}/></a>
        {open&&<a href="../marketing/index.html" style={{font:'var(--type-small)',color:'#9ca3af'}}>Public site</a>}
      </div>
    </div>
  </aside>;
}

function AdminShell({view,setView,children}){
  const [open,setOpen]=React.useState(true);
  const [theme,setTheme]=useTheme();
  return <div style={{display:'flex',minHeight:'100vh',background:'var(--surface-sunken)'}}>
    <AdminSidebar view={view} setView={setView} open={open} setOpen={setOpen}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{height:'52px',borderBottom:'var(--border-width) solid var(--border-default)',background:'var(--surface-page)',display:'flex',alignItems:'center',gap:'12px',padding:'0 24px'}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--text-muted)'}}>operator · khalid@webaudit.ai</span>
        <span style={{marginInlineStart:'auto',display:'flex',alignItems:'center',gap:'10px'}}>
          <Badge tone="success">7 workers</Badge><Badge>3 queued</Badge><ThemeToggle/>
        </span>
      </div>
      <main dir="ltr" style={{padding:'28px 24px 64px'}}><div style={{maxWidth:'1280px',margin:'0 auto'}}>{children}</div></main>
    </div>
  </div>;
}

function AHead({eyebrow,title,meta,actions}){
  return <div style={{display:'flex',alignItems:'flex-end',gap:'16px',marginBottom:'22px',flexWrap:'wrap'}}>
    <div>
      <Eyebrow tone="accent">{eyebrow}</Eyebrow>
      <h1 style={{font:'var(--type-h3)',margin:'8px 0 0',color:'var(--text-strong)'}}>{title}</h1>
      {meta&&<div style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)',marginTop:'6px'}}>{meta}</div>}
    </div>
    <div style={{marginInlineStart:'auto',display:'flex',gap:'10px'}}>{actions}</div>
  </div>;
}

function Table({cols,rows}){
  return <div style={{border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-card)',background:'var(--surface-page)',overflow:'hidden'}}>
    <div style={{display:'grid',gridTemplateColumns:cols.map(c=>c[1]).join(' '),gap:'16px',padding:'12px 20px',background:'var(--surface-raised)',borderBottom:'var(--border-width) solid var(--border-default)'}}>
      {cols.map(c=><span key={c[0]} style={{fontFamily:'var(--font-sans)',fontWeight:700,fontSize:'11px',letterSpacing:'.8px',textTransform:'uppercase',color:'var(--text-muted)'}}>{c[0]}</span>)}
    </div>
    {rows.map((r,i)=><div key={i} style={{display:'grid',gridTemplateColumns:cols.map(c=>c[1]).join(' '),gap:'16px',padding:'13px 20px',alignItems:'center',borderTop:i?'var(--border-width) solid var(--border-default)':'none'}}>
      {r.map((cell,j)=><div key={j} style={{font:'var(--type-small)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis'}}>{cell}</div>)}
    </div>)}
  </div>;
}

function Stat({label,value,sub,tone}){
  return <Card padding={20} eyebrow={label}>
    <div style={{font:'var(--type-h3)',fontVariantNumeric:'tabular-nums',color:tone||'var(--text-strong)'}}>{value}</div>
    {sub&&<div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px'}}>{sub}</div>}
  </Card>;
}
Object.assign(window,{AdminShell,AdminSidebar,AHead,Table,Stat,AIco,AI});
