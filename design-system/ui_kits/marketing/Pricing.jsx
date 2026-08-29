const { Button, Badge, Card, Eyebrow } = window.WebAuditAIDesignSystem_fa5933;
const { PublicPage } = window;

const tiers=[
 {name:'Free',credits:'50, once',price:'$0',feat:['1 concurrent audit','7-day retention','URL input'],cta:'Start free',pop:false},
 {name:'Starter',credits:'300 / mo',price:'$29',feat:['1 concurrent audit','30-day retention','Readiness pass'],cta:'Choose Starter',pop:false},
 {name:'Pro',credits:'1,200 / mo',price:'$99',feat:['3 concurrent audits','12-month retention','Repository input','Load generation'],cta:'Choose Pro',pop:true},
 {name:'Business',credits:'4,000 / mo',price:'$299',feat:['6 concurrent audits','24-month retention','Everything in Pro'],cta:'Choose Business',pop:false}];

function TierGrid({onPick,current}){
  return <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px'}}>
    {tiers.map(t=>{const isNow=current===t.name;return <div key={t.name} style={{border:'var(--border-width) solid '+(t.pop||isNow?'var(--accent)':'var(--border-default)'),borderRadius:'var(--radius-card)',padding:'24px',display:'flex',flexDirection:'column',gap:'14px',background:'var(--surface-page)'}}>
      <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'18px',fontWeight:700}}>{t.name}</span>{isNow?<Badge tone="accent">Current</Badge>:t.pop&&<Badge tone="accent">Most depth</Badge>}</div>
      <div><span style={{font:'var(--type-h3)'}}>{t.price}</span><span style={{font:'var(--type-small)',color:'var(--text-muted)'}}> / mo</span></div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)'}}>{t.credits}</div>
      <div style={{borderTop:'var(--border-width) solid var(--border-default)',paddingTop:'14px',display:'flex',flexDirection:'column',gap:'8px',flex:1}}>
        {t.feat.map(x=><div key={x} style={{font:'var(--type-small)',color:'var(--text-primary)'}}>{x}</div>)}
      </div>
      <Button variant={t.pop&&!isNow?'primary':'secondary'} fullWidth disabled={isNow} onClick={()=>onPick&&onPick(t.name)} href={onPick?undefined:'Register.html'}>{isNow?'Current plan':t.cta}</Button>
    </div>})}
  </div>;
}

function CostTable(){
  return <div>
    <Eyebrow tone="accent">What things cost</Eyebrow>
    <div style={{border:'var(--border-width) solid var(--border-default)',marginTop:'12px'}}>
      {[['One audit area','10–25'],['Full audit, all five, bundled','80'],['Targeted re-check of one issue','3'],['Production-readiness pass','60']].map(([a,b],i)=>
        <div key={a} style={{display:'flex',padding:'14px 18px',borderTop:i?'var(--border-width) solid var(--border-default)':'none'}}>
          <span style={{font:'var(--type-body)'}}>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:'14px'}}>{b} cr</span></div>)}
    </div>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'14px'}}>Top-ups are paid-plan only. Platform faults, provider outages and internal errors refund or never debit.</p>
  </div>;
}

function PricingPage(){
  const [,lang]=useT();
  return <PublicPage active="nav_pricing">
    <section dir={lang==='ar'?'ltr':undefined} style={{padding:'72px 24px 44px',textAlign:'center'}}>
      <h1 style={{font:'var(--type-display)',letterSpacing:'var(--track-display)',margin:0}}>Credits, not seats.</h1>
      <p style={{font:'var(--type-lead)',color:'var(--text-secondary)',maxWidth:'56ch',margin:'18px auto 0'}}>Plan credits expire at renewal. Purchased top-ups never expire, and expiring credits are always spent first.</p>
    </section>
    <section dir={lang==='ar'?'ltr':undefined} style={{padding:'0 24px 80px'}}>
      <div style={{maxWidth:'1120px',margin:'0 auto'}}><TierGrid/></div>
      <div style={{maxWidth:'896px',margin:'56px auto 0'}}><CostTable/></div>
    </section>
  </PublicPage>;
}
Object.assign(window,{PricingPage,TierGrid,CostTable});
