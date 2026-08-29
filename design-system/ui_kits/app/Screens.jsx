const { Button, Badge, Input, Card, Eyebrow, SeverityBadge, StatRow, ScoreArc, ModuleStatus, IssueCard, ProgressRow, VerdictPanel, AttributionMark } = window.WebAuditAIDesignSystem_fa5933;
const { PageHead } = window;

const AREAS=[['Performance',20],['Security',25],['Design',20],['Testing',20],['Search visibility',10]];
const AREA_KEY={'Performance':'a_perf','Security':'a_sec','Design':'a_des','Testing':'a_test','Search visibility':'a_seo'};

/* ---- New scan ---- */
function ScanScreen({onStart}){
  const [t]=useT();
  const [tab,setTab]=React.useState('url');
  const [sel,setSel]=React.useState(AREAS.map(a=>a[0]));
  const all=sel.length===5;
  const cost=all?80:AREAS.filter(a=>sel.includes(a[0])).reduce((s,a)=>s+a[1],0);
  const toggle=n=>setSel(s=>s.includes(n)?s.filter(x=>x!==n):[...s,n]);
  const tabs=[['url',t('tab_url')],['repo',t('tab_repo')],['archive',t('tab_archive')]];
  return <div>
    <PageHead eyebrow={t('scan_eyebrow')} title={t('scan_title')}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:'20px',alignItems:'start'}}>
      <Card padding={24}>
        <div style={{display:'flex',borderBottom:'var(--border-width) solid var(--border-default)',marginBottom:'20px'}}>
          {tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{background:'none',border:0,borderBottom:'2px solid '+(tab===k?'var(--accent)':'transparent'),marginBottom:'-1px',padding:'10px 16px',fontFamily:'var(--font-sans)',fontSize:'14px',fontWeight:tab===k?600:400,color:tab===k?'var(--text-strong)':'var(--text-secondary)',cursor:'pointer'}}>{l}</button>)}
        </div>
        {tab==='url'&&<Input prefix="https://" placeholder={t('url_ph')}/>}
        {tab==='repo'&&<div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
          {['acme/storefront','acme/marketing-site','acme/checkout'].map((r,i)=><label key={r} style={{display:'flex',alignItems:'center',gap:'10px',border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-control)',padding:'12px 14px',cursor:'pointer'}}>
            <input type="radio" name="repo" defaultChecked={!i}/><span style={{fontFamily:'var(--font-mono)',fontSize:'14px'}}>{r}</span>
            <span style={{marginLeft:'auto',font:'var(--type-small)',color:'var(--text-muted)'}}>main</span></label>)}
        </div>}
        {tab==='archive'&&<div style={{border:'var(--border-width) dashed var(--border-default)',borderRadius:'var(--radius-card)',padding:'36px',textAlign:'center',background:'var(--surface-raised)'}}>
          <div style={{fontSize:'15px',fontWeight:600}}>{t('drop_archive')}</div>
          <div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px'}}>{t('drop_note')}</div>
        </div>}
        <div style={{marginTop:'28px'}}>
          <Eyebrow>{t('areas_label')}</Eyebrow>
          <div style={{marginTop:'12px',border:'var(--border-width) solid var(--border-default)'}}>
            {AREAS.map(([n,c],i)=><label key={n} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',borderTop:i?'var(--border-width) solid var(--border-default)':'none',cursor:'pointer'}}>
              <input type="checkbox" checked={sel.includes(n)} onChange={()=>toggle(n)}/>
              <span style={{fontSize:'15px',fontWeight:500}}>{t(AREA_KEY[n])}</span>
              <span dir="ltr" style={{marginInlineStart:'auto',fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-muted)'}}>{c} cr</span></label>)}
          </div>
        </div>
      </Card>
      <Card padding={24} title={t('quote')}>
        <div style={{display:'flex',alignItems:'baseline',gap:'8px'}}>
          <span style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',fontVariantNumeric:'tabular-nums'}}>{cost}</span>
          <span style={{font:'var(--type-small)',color:'var(--text-secondary)'}}>{t('credits')}</span>
        </div>
        {all&&<div style={{font:'var(--type-small)',color:'var(--sev-resolved)',marginTop:'6px'}}>{t('quote_bundled')}</div>}
        <div style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'16px 0',textWrap:'pretty'}}>{t('quote_note')}</div>
        <Button fullWidth disabled={!sel.length} onClick={onStart}>{t('accept_run')}</Button>
      </Card>
    </div>
  </div>;
}

/* ---- Live progress ---- */
function ProgressScreen({onDone}){
  const [t,setT]=React.useState(102);
  React.useEffect(()=>{const i=setInterval(()=>setT(x=>x+1),1000);return()=>clearInterval(i)},[]);
  const mm=Math.floor(t/60),ss=String(t%60).padStart(2,'0');
  return <div>
    <PageHead eyebrow="Live scan" title="acme.com" meta="scan 4f21a8c9 · started 1 minute ago" actions={<Button variant="secondary" size="sm">Cancel scan</Button>}/>
    <div style={{display:'flex',flexDirection:'column',gap:'10px',maxWidth:'896px'}}>
      <ProgressRow phase="Running security checks" elapsed={mm+':'+ss} done={2} total={5}/>
      <ModuleStatus area="Search visibility" state="complete" issues={3}/>
      <ModuleStatus area="Performance" state="complete" issues={4}/>
      <ModuleStatus area="Security" state="running" detail="Inspecting response headers"/>
      <ModuleStatus area="Design" state="waiting"/>
      <ModuleStatus area="Testing" state="waiting"/>
      <div style={{marginTop:'12px'}}><Button onClick={onDone}>Open report</Button></div>
    </div>
  </div>;
}

const ISSUES=[
 {severity:'critical',area:'Security',title:'No Strict-Transport-Security header on the primary host',location:'strict-transport-security',attribution:'measured',description:'The response carries no HSTS header, so a first visit over http is downgradeable before any redirect fires.',prompt:'Add a Strict-Transport-Security header with max-age=31536000; includeSubDomains to all responses from acme.com.'},
 {severity:'critical',area:'Security',title:'Dependency with a known remote-code-execution advisory',location:'package-lock.json · serialize-javascript@3.1.0',attribution:'measured',description:'GHSA-hxcc-f52p-wc94. A fixed version is available and the upgrade is semver-minor.',prompt:'Upgrade serialize-javascript to ^6.0.2 and re-run the lockfile.'},
 {severity:'high',area:'Performance',title:'Largest Contentful Paint is 4.1s on a throttled 4G profile',location:'/ · hero image',attribution:'measured',description:'The hero image is 1.4MB and is not preloaded. LCP threshold for a pass is 2.5s.',prompt:'Compress the hero image to webp under 200KB and add a preload link for it.'},
 {severity:'high',area:'Design',title:'Primary CTA and severity chips are the same hue',location:'.btn-primary, .chip-high',attribution:'ai-judgment',description:'Two different meanings share one colour, so a badge and an action are hard to tell apart at a glance.',prompt:'Give severity chips a distinct hue from the CTA accent.'},
 {severity:'medium',area:'Search visibility',title:'Meta description missing on three routes',location:'/pricing, /docs, /changelog',attribution:'measured',description:'Search engines will synthesise a description from body copy.',prompt:'Add a unique meta description to /pricing, /docs and /changelog.'},
 {severity:'low',area:'Search visibility',title:'Heading order skips from h1 to h3',location:'main > section:nth-of-type(2)',attribution:'measured',description:'Assistive technology reports a gap in the document outline.',prompt:'Change the section heading from h3 to h2.'}];

/* ---- Report ---- */
function ReportScreen(){
  const [area,setArea]=React.useState('All');
  const tabs=['All','Security','Performance','Design','Testing','Search visibility'];
  const list=area==='All'?ISSUES:ISSUES.filter(i=>i.area===area);
  return <div>
    <PageHead eyebrow="Report" title="acme.com" meta="scan 4f21a8c9 · completed 23 Aug 2026, 14:02 · 3m 41s" actions={<><Button variant="secondary" size="sm">Export</Button><Button size="sm">Re-audit</Button></>}/>
    <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:'20px',alignItems:'start'}}>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={20}><div style={{display:'grid',placeItems:'center'}}><ScoreArc score={62} delta={null}/></div></Card>
        <Card padding={20} title="Areas">
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            <ModuleStatus compact area="Security" state="complete" issues={2}/>
            <ModuleStatus compact area="Performance" state="complete" issues={1}/>
            <ModuleStatus compact area="Design" state="complete" issues={1}/>
            <ModuleStatus compact area="Search visibility" state="complete" issues={2}/>
            <ModuleStatus compact area="Testing" state="degraded" detail="2 of 5 checks skipped"/>
          </div>
        </Card>
      </div>
      <div>
        <Card padding={24} title="Executive summary" style={{marginBottom:'16px'}}>
          <p style={{font:'var(--type-body)',color:'var(--text-primary)',margin:0,maxWidth:'70ch',textWrap:'pretty'}}>
            Two critical security findings block a launch: the primary host serves no HSTS header, and a dependency carries a remote-code-execution advisory with a semver-minor fix available. Performance is close — LCP is 4.1s against a 2.5s threshold, driven almost entirely by an uncompressed hero image. Testing is degraded: the functional runner was unavailable, so 2 of 5 flows were not exercised and you were not charged for them.
          </p>
          <div style={{marginTop:'16px'}}><StatRow items={[{value:2,label:'critical'},{value:2,label:'high'},{value:1,label:'medium'},{value:1,label:'low'}]}/></div>
        </Card>
        <div style={{display:'flex',gap:'2px',borderBottom:'var(--border-width) solid var(--border-default)',marginBottom:'16px',flexWrap:'wrap'}}>
          {tabs.map(t=><button key={t} onClick={()=>setArea(t)} style={{background:'none',border:0,borderBottom:'2px solid '+(area===t?'var(--accent)':'transparent'),marginBottom:'-1px',padding:'10px 14px',fontFamily:'var(--font-sans)',fontSize:'14px',fontWeight:area===t?600:400,color:area===t?'var(--text-strong)':'var(--text-secondary)',cursor:'pointer'}}>{t}</button>)}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>{list.map((i,k)=><IssueCard key={k} {...i}/>)}</div>
      </div>
    </div>
  </div>;
}

/* ---- Fixes board ---- */
function FixesScreen(){
  const [state,setState]=React.useState({0:'open',1:'open',2:'resolved',3:'open',4:'failed',5:'resolved'});
  const assert=k=>setState(s=>({...s,[k]:s[k]==='open'?(k%2?'failed':'resolved'):s[k]}));
  const counts=Object.values(state);
  return <div>
    <PageHead eyebrow="Fixes" title="acme.com" meta="6 issues · last verified 2 minutes ago" actions={<Button variant="secondary" size="sm">Re-check all — 18 cr</Button>}/>
    <div style={{marginBottom:'16px'}}><StatRow items={[{value:ISSUES.filter((i,k)=>state[k]!=='resolved'&&i.severity==='critical').length,label:'critical'},{value:ISSUES.filter((i,k)=>state[k]!=='resolved'&&i.severity==='high').length,label:'high'},{value:ISSUES.filter((i,k)=>state[k]!=='resolved'&&['medium','low'].includes(i.severity)).length,label:'medium and low'},{value:counts.filter(c=>c==='resolved').length,label:'resolved'}]}/></div>
    <div style={{border:'var(--border-width) solid var(--border-default)',background:'var(--surface-page)',borderRadius:'var(--radius-card)',overflow:'hidden'}}>
      {ISSUES.map((i,k)=>{const st=state[k];return <div key={k} style={{padding:'16px 20px',borderTop:k?'var(--border-width) solid var(--border-default)':'none',borderLeft:'3px solid var(--sev-'+(st==='resolved'?'resolved':i.severity)+')',background:st==='resolved'?'var(--sev-resolved-bg)':'var(--surface-page)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <SeverityBadge level={st==='resolved'?'resolved':i.severity}/>
          <span style={{fontSize:'15px',fontWeight:600,color:'var(--text-strong)'}}>{i.title}</span>
          <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'12px'}}>
            {st==='resolved'&&<span style={{font:'var(--type-small)',color:'var(--sev-resolved)',fontFamily:'var(--font-mono)'}}>verified 14:31</span>}
            <button onClick={()=>assert(k)} disabled={st==='resolved'} style={{height:'36px',padding:'0 14px',borderRadius:'var(--radius-control)',border:'var(--border-width) solid var(--border-default)',background:'var(--surface-page)',fontFamily:'var(--font-sans)',fontSize:'14px',cursor:st==='resolved'?'default':'pointer',opacity:st==='resolved'?.4:1}}>{st==='resolved'?'Verified':'I fixed this — 3 cr'}</button>
          </span>
        </div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-zinc)',marginTop:'8px'}}>{i.location}</div>
        {st==='failed'&&<div style={{marginTop:'10px',background:'var(--sev-critical-bg)',border:'var(--border-width) solid var(--sev-critical)',borderRadius:'var(--radius-control)',padding:'12px 14px'}}>
          <div style={{font:'var(--type-small)',fontWeight:700,color:'var(--sev-critical)',marginBottom:'6px'}}>Re-check failed at 14:29 — current evidence</div>
          <pre style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--text-zinc)',margin:0,whiteSpace:'pre-wrap'}}>GET https://acme.com/{'\n'}strict-transport-security: (absent){'\n'}expected: max-age &gt;= 31536000</pre>
        </div>}
      </div>})}
    </div>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'14px'}}>Marking an issue fixed runs one narrow check. It turns green only when that check passes.</p>
  </div>;
}

/* ---- Readiness ---- */
function ReadinessScreen(){
  return <div>
    <PageHead eyebrow="Readiness" title="Production readiness pass" meta="fresh full re-audit · baseline scan 4f21a8c9 · 60 credits"/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',alignItems:'start'}}>
      <VerdictPanel verdict="go" score={91} baseline={62} areas={[
        {name:'Security',score:96,threshold:80,pass:true},
        {name:'Performance',score:88,threshold:80,pass:true},
        {name:'Design',score:84,threshold:70,pass:true},
        {name:'Testing',score:90,threshold:80,pass:true},
        {name:'Search visibility',score:95,threshold:70,pass:true}]}/>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={22} title="Against baseline">
          {[['Resolved','5 issues','var(--sev-resolved)'],['Regressed','0 areas','var(--text-secondary)'],['New findings','1 low','var(--sev-low)']].map(([a,b,c])=>
            <div key={a} style={{display:'flex',padding:'10px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
              <span style={{font:'var(--type-small)'}}>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:'13px',color:c}}>{b}</span></div>)}
        </Card>
        <Card padding={22} title="Certificate">
          <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'0 0 16px'}}>A shareable artifact recording that acme.com passed every threshold on 23 August 2026.</p>
          <Button variant="secondary" fullWidth>Download certificate</Button>
        </Card>
      </div>
    </div>
  </div>;
}

/* ---- Billing ---- */
function BillingScreen(){
  return <div>
    <PageHead eyebrow="Billing and plans" title="Pro — 1,200 credits a month" meta="renews 12 September 2026" actions={<Button variant="secondary" size="sm">Cancel subscription</Button>}/>
    <div style={{marginBottom:'22px'}}>
      <div style={{font:'var(--type-eyebrow)',fontSize:'11px',letterSpacing:'var(--track-eyebrow)',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'12px'}}>Change plan</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px'}}>
        {[["Free","$0","50, once",["1 concurrent audit","7-day retention"]],["Starter","$29","300 / mo",["1 concurrent audit","30-day retention"]],["Pro","$99","1,200 / mo",["3 concurrent audits","12-month retention","Repository input"]],["Business","$299","4,000 / mo",["6 concurrent audits","24-month retention"]]].map(([n,p,c,fe])=>{const now=n==='Pro';return <div key={n} style={{border:'var(--border-width) solid '+(now?'var(--accent)':'var(--border-default)'),borderRadius:'var(--radius-card)',background:'var(--surface-page)',padding:'18px',display:'flex',flexDirection:'column',gap:'10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'16px',fontWeight:700}}>{n}</span>{now&&<Badge tone="accent">Current</Badge>}</div>
          <div><span style={{fontSize:'22px',fontWeight:700}}>{p}</span><span style={{font:'var(--type-small)',color:'var(--text-muted)'}}> / mo</span></div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--text-secondary)'}}>{c}</div>
          <div style={{borderTop:'var(--border-width) solid var(--border-default)',paddingTop:'10px',display:'flex',flexDirection:'column',gap:'6px',flex:1}}>{fe.map(x=><span key={x} style={{font:'var(--type-small)',fontSize:'13px',color:'var(--text-secondary)'}}>{x}</span>)}</div>
          <Button variant="secondary" size="sm" fullWidth disabled={now}>{now?'Current plan':'Switch'}</Button>
        </div>})}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginBottom:'20px'}}>
      <Card padding={22} eyebrow="Plan credits"><div style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',fontVariantNumeric:'tabular-nums'}}>920</div><div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px'}}>Expire at renewal. Spent first.</div></Card>
      <Card padding={22} eyebrow="Purchased credits"><div style={{font:'var(--type-h2)',letterSpacing:'var(--track-h2)',fontVariantNumeric:'tabular-nums'}}>200</div><div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px'}}>Never expire.</div></Card>
      <Card padding={22} eyebrow="Top up"><div style={{display:'flex',gap:'8px',marginTop:'4px'}}>{['250','1,000'].map(n=><Button key={n} variant="secondary" size="sm">{n} cr</Button>)}</div><div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'12px'}}>Paid plans only.</div></Card>
    </div>
    <Card padding={0} style={{overflow:'hidden'}}>
      <div style={{padding:'18px 22px',borderBottom:'var(--border-width) solid var(--border-default)',fontSize:'16px',fontWeight:600}}>Ledger</div>
      {[['23 Aug 14:02','Full audit — acme.com','−80','plan'],['23 Aug 14:31','Re-check — HSTS header','−3','plan'],['23 Aug 14:33','Refund — provider outage','+20','plan'],['21 Aug 09:10','Top-up purchase','+200','purchased'],['12 Aug 00:00','Monthly renewal','+1,200','plan']].map(([d,a,c,k],i)=>
        <div key={i} style={{display:'flex',alignItems:'center',gap:'16px',padding:'14px 22px',borderTop:i?'var(--border-width) solid var(--border-default)':'none'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-muted)',width:'110px'}}>{d}</span>
          <span style={{font:'var(--type-small)'}}>{a}</span>
          <Badge>{k}</Badge>
          <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:'14px',color:c.startsWith('+')?'var(--sev-resolved)':'var(--text-primary)'}}>{c}</span>
        </div>)}
    </Card>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'14px'}}>You are never charged for our failures. Platform faults, provider outages and internal errors refund or never debit.</p>
  </div>;
}

/* ---- Admin ---- */
function AdminScreen(){
  const [caps,setCaps]=React.useState({'headers-checker':true,'ssl-analyzer':true,'lighthouse-analyzer':true,'playwright-runner':false,'dependency-scanner':true});
  return <div>
    <PageHead eyebrow="Operator" title="Platform" meta="7 workers · 3 queued · 1 provider degraded"/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',alignItems:'start'}}>
      <Card padding={0} style={{overflow:'hidden'}}>
        <div style={{padding:'18px 22px',borderBottom:'var(--border-width) solid var(--border-default)',fontSize:'16px',fontWeight:600}}>Capabilities</div>
        {Object.entries(caps).map(([n,on],i)=><div key={n} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 22px',borderTop:i?'var(--border-width) solid var(--border-default)':'none'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:'13px'}}>{n}</span>
          <Badge tone={on?'success':'neutral'}>{on?'enabled':'disabled'}</Badge>
          <button onClick={()=>setCaps(c=>({...c,[n]:!c[n]}))} style={{marginLeft:'auto',height:'32px',padding:'0 12px',borderRadius:'var(--radius-control)',border:'var(--border-width) solid var(--border-default)',background:'var(--surface-page)',fontFamily:'var(--font-sans)',fontSize:'13px',cursor:'pointer'}}>{on?'Disable':'Enable'}</button>
        </div>)}
        <div style={{padding:'14px 22px',borderTop:'var(--border-width) solid var(--border-default)',font:'var(--type-small)',color:'var(--text-muted)'}}>Disabling any single capability still lets every audit complete — the area reports it unavailable.</div>
      </Card>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={22} title="Margin — last 24h">
          {[['Revenue recognised','4,180 cr'],['Provider cost','$41.22'],['Highest-cost capability','impeccable · $0.031/run'],['Gross margin','78%']].map(([a,b])=>
            <div key={a} style={{display:'flex',padding:'10px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
              <span style={{font:'var(--type-small)'}}>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:'13px'}}>{b}</span></div>)}
        </Card>
        <Card padding={22} title="Provider chain">
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {[['claude','healthy','var(--sev-resolved)'],['openai','degraded','var(--sev-medium)'],['gemini','healthy','var(--sev-resolved)']].map(([n,s,c])=>
              <div key={n} style={{display:'flex',alignItems:'center',gap:'10px',border:'var(--border-width) solid var(--border-default)',padding:'10px 14px'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'13px'}}>{n}</span>
                <span style={{marginLeft:'auto',font:'var(--type-small)',fontWeight:700,color:c}}>{s}</span></div>)}
          </div>
          <p style={{font:'var(--type-small)',color:'var(--text-muted)',margin:'12px 0 0'}}>A chain spanning fewer than two vendors is refused at startup.</p>
        </Card>
      </div>
    </div>
  </div>;
}
Object.assign(window,{ScanScreen,ProgressScreen,ReportScreen,FixesScreen,ReadinessScreen,BillingScreen,AdminScreen});
