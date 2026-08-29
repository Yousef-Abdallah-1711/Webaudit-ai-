const { Button, Badge, Input, Card, Eyebrow, StatRow, TwoToneHeading, PromoBar, SeverityBadge, ScoreArc, ModuleStatus } = window.WebAuditAIDesignSystem_fa5933;

function Wordmark({size=19}){return <div dir="ltr" style={{fontSize:size,fontWeight:700,letterSpacing:'-0.4px',color:'var(--text-strong)',whiteSpace:'nowrap'}}>Web<span style={{color:'var(--accent)'}}>Audit</span> AI</div>}

function PublicHeader({active}){
  const [t]=useT();
  const nav=[['index.html','nav_product'],['Pricing.html','nav_pricing'],['#','nav_docs'],['#','nav_changelog']];
  return <header style={{background:'var(--surface-page)',borderBottom:'var(--border-width) solid var(--border-default)',position:'sticky',top:0,zIndex:20}}>
    <div style={{maxWidth:'1120px',margin:'0 auto',padding:'0 24px',height:'64px',display:'flex',alignItems:'center',gap:'28px'}}>
      <a href="index.html" style={{textDecoration:'none'}}><Wordmark/></a>
      <nav style={{display:'flex',gap:'22px'}}>
        {nav.map(([h,k])=><a key={k} href={h} style={{fontSize:'14px',fontWeight:active===k?600:400,color:active===k?'var(--text-strong)':'var(--text-secondary)',textDecoration:'none',transition:'var(--transition-color)'}}>{t(k)}</a>)}
      </nav>
      <div style={{marginInlineStart:'auto',display:'flex',alignItems:'center',gap:'8px'}}>
        <LangToggle/><ThemeToggle/>
        <Button variant="ghost" size="sm" href="Login.html">{t('signin')}</Button>
        <Button size="sm" href="Register.html">{t('start_free')}</Button>
      </div>
    </div>
  </header>;
}

function PublicFooter(){
  const [t]=useT();
  const cols=[['foot_product',['a_seo','loop_eyebrow','n_readiness']],['foot_pricing',['foot_pricing','credits','top_up']],['foot_company',['nav_docs','nav_changelog','foot_zero']]];
  return <footer style={{borderTop:'var(--border-width) solid var(--border-default)',background:'var(--surface-raised)'}}>
    <div style={{maxWidth:'1120px',margin:'0 auto',padding:'48px 24px 24px',display:'grid',gridTemplateColumns:'1.6fr repeat(3,1fr)',gap:'32px'}}>
      <div>
        <Wordmark size={17}/>
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'12px 0 0',maxWidth:'34ch',textWrap:'pretty'}}>{t('foot_tag')}</p>
      </div>
      {cols.map(([h,items])=><div key={h}>
        <div style={{font:'var(--type-eyebrow)',fontSize:'11px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'12px'}}>{t(h)}</div>
        <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
          {items.map(i=><a key={i} href="#" style={{font:'var(--type-small)',color:'var(--text-secondary)',textDecoration:'none'}}>{t(i)}</a>)}
        </div>
      </div>)}
    </div>
    <div style={{maxWidth:'1120px',margin:'0 auto',padding:'20px 24px 32px',borderTop:'var(--border-width) solid var(--border-default)',display:'flex',gap:'18px',flexWrap:'wrap',alignItems:'center'}}>
      <span style={{font:'var(--type-small)',color:'var(--text-muted)'}}>© 2026 WebAudit AI</span>
      <a href="../app/index.html" style={{font:'var(--type-small)'}}>{t('foot_dashboard')}</a>
      <a href="../admin/index.html" style={{font:'var(--type-small)'}}>{t('foot_admin')}</a>
      <span dir="ltr" style={{font:'var(--type-small)',color:'var(--text-muted)',marginInlineStart:'auto',fontFamily:'var(--font-mono)',fontSize:'12px'}}>{t('foot_zero')}</span>
    </div>
  </footer>;
}

function PublicPage({active,children,tint}){
  return <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:tint||'var(--surface-page)'}}>
    <PublicHeader active={active}/>
    <main style={{flex:1}}>{children}</main>
    <PublicFooter/>
  </div>;
}
Object.assign(window,{Wordmark,PublicHeader,PublicFooter,PublicPage});
