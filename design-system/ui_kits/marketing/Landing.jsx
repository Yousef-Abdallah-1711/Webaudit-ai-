const { Button, Input, Badge, StatRow, Eyebrow, TwoToneHeading, PromoBar, Card, SeverityBadge, ScoreArc, ModuleStatus } = window.WebAuditAIDesignSystem_fa5933;
const { PublicPage } = window;

function Wrap({tint,children,pad='88px 24px'}){return <section style={{background:tint||'var(--surface-page)',padding:pad}}><div style={{maxWidth:'896px',margin:'0 auto'}}>{children}</div></section>}

function Hero(){
  const [t]=useT();
  const [url,setUrl]=React.useState('');
  return <section style={{position:'relative',overflow:'hidden',padding:'88px 24px 96px',textAlign:'center'}}>
    <div style={{position:'absolute',inset:0,background:'var(--wash-tl)',pointerEvents:'none'}}/>
    <div style={{position:'relative',maxWidth:'896px',margin:'0 auto'}}>
      <TwoToneHeading lead={t('hero_lead')} accent={t('hero_accent')}/>
      <p style={{font:'var(--type-lead)',color:'var(--text-secondary)',maxWidth:'62ch',margin:'20px auto 0',textWrap:'pretty'}}>{t('hero_sub')}</p>
      <div style={{display:'flex',gap:'12px',maxWidth:'620px',margin:'36px auto 0',flexWrap:'wrap'}}>
        <div style={{flex:'1 1 320px'}}><Input prefix="https://" placeholder={t('url_ph')} value={url} onChange={e=>setUrl(e.target.value)}/></div>
        <Button href="Register.html">{t('hero_cta')}</Button>
      </div>
      <div style={{marginTop:'20px',display:'flex',justifyContent:'center'}}>
        <StatRow align="center" items={[{value:'50',label:t('stat_credits')},{value:'5',label:t('stat_areas')},{value:'3',label:t('stat_recheck')}]}/>
      </div>
    </div>
  </section>;
}

function Difference(){
  const [t]=useT();
  return <Wrap tint="var(--surface-raised)">
    <Eyebrow tone="accent">{t('diff_eyebrow')}</Eyebrow>
    <h2 style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',margin:'12px 0 0'}}>{t('diff_h2')}</h2>
    <p style={{font:'var(--type-body-lg)',color:'var(--text-secondary)',maxWidth:'60ch',marginTop:'16px',textWrap:'pretty'}}>{t('diff_lead')}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginTop:'40px'}}>
      {[['diff_1t','diff_1d'],['diff_2t','diff_2d'],['diff_3t','diff_3d']].map(([a,b])=>
        <Card key={a} title={t(a)} padding={20}><p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0,textWrap:'pretty'}}>{t(b)}</p></Card>)}
    </div>
  </Wrap>;
}

function Areas(){
  const [t]=useT();
  const rows=[['a_perf','a_perf_d',20],['a_sec','a_sec_d',25],['a_des','a_des_d',20],['a_test','a_test_d',20],['a_seo','a_seo_d',10]];
  return <Wrap>
    <Eyebrow tone="accent">{t('areas_eyebrow')}</Eyebrow>
    <h2 style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',margin:'12px 0 24px'}}>{t('areas_h2')}</h2>
    <div style={{border:'var(--border-width) solid var(--border-default)'}}>
      {rows.map(([n,d,c],i)=><div key={n} style={{display:'flex',gap:'16px',alignItems:'baseline',padding:'18px 20px',borderTop:i?'var(--border-width) solid var(--border-default)':'none'}}>
        <div style={{width:'170px',fontSize:'16px',fontWeight:600,color:'var(--text-strong)'}}>{t(n)}</div>
        <div style={{flex:1,font:'var(--type-small)',color:'var(--text-secondary)'}}>{t(d)}</div>
        <div dir="ltr" style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-muted)'}}>{c} cr</div>
      </div>)}
    </div>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'14px',textWrap:'pretty'}}>{t('areas_note')}</p>
  </Wrap>;
}

function Proof(){
  const [t]=useT();
  return <Wrap tint="var(--surface-sunken)">
    <div style={{display:'flex',gap:'40px',alignItems:'center',flexWrap:'wrap'}}>
      <ScoreArc score={84} delta={23}/>
      <div style={{flex:'1 1 360px',display:'flex',flexDirection:'column',gap:'8px'}}>
        <ModuleStatus area={t('a_sec')} state="complete" issues={7}/>
        <ModuleStatus area={t('a_perf')} state="complete" issues={4}/>
        <ModuleStatus area={t('a_test')} state="degraded" detail="2 / 5"/>
      </div>
    </div>
    <p style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'24px',maxWidth:'62ch',textWrap:'pretty'}}>{t('proof_note')}</p>
  </Wrap>;
}

function Loop(){
  const [t]=useT();
  return <Wrap>
    <Eyebrow tone="accent">{t('loop_eyebrow')}</Eyebrow>
    <h2 style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',margin:'12px 0 28px'}}>{t('loop_h2')}</h2>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px'}}>
      {[['01','loop_1t','loop_1d'],['02','loop_2t','loop_2d'],['03','loop_3t','loop_3d'],['04','loop_4t','loop_4d']].map(([n,a,b])=>
        <div key={n} style={{borderTop:'3px solid var(--accent)',paddingTop:'14px'}}>
          <div dir="ltr" style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--accent)'}}>{n}</div>
          <div style={{fontSize:'17px',fontWeight:600,margin:'6px 0'}}>{t(a)}</div>
          <div style={{font:'var(--type-small)',color:'var(--text-secondary)',textWrap:'pretty'}}>{t(b)}</div>
        </div>)}
    </div>
  </Wrap>;
}

function FinalCta(){
  const [t]=useT();
  return <section style={{position:'relative',overflow:'hidden',background:'var(--surface-inverse)',padding:'80px 24px',textAlign:'center'}}>
    <div style={{position:'absolute',inset:0,background:'var(--wash-br)',pointerEvents:'none'}}/>
    <div style={{position:'relative',maxWidth:'896px',margin:'0 auto'}}>
      <h2 style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',color:'#fafafa',margin:0}}>{t('cta_h2')}</h2>
      <p style={{font:'var(--type-body)',color:'#9ca3af',margin:'14px 0 28px',textWrap:'pretty'}}>{t('cta_lead')}</p>
      <Button href="Register.html">{t('hero_cta')}</Button>
    </div>
  </section>;
}

function Landing(){
  const [t]=useT();
  return <div>
    <PromoBar message={t('promo')} code="START50"/>
    <PublicPage active="nav_product">
      <Hero/><Difference/><Proof/><Areas/><Loop/><FinalCta/>
    </PublicPage>
  </div>;
}
Object.assign(window,{Landing});
