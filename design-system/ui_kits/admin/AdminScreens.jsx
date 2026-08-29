const { Button, Badge, Input, Card, Eyebrow, SeverityBadge, StatRow, ModuleStatus } = window.WebAuditAIDesignSystem_fa5933;
const { AHead, Table, Stat, AIco, AI } = window;

const mono=s=><span style={{fontFamily:'var(--font-mono)',fontSize:'13px'}}>{s}</span>;
const num=s=><span style={{fontFamily:'var(--font-mono)',fontSize:'13px',fontVariantNumeric:'tabular-nums'}}>{s}</span>;

function Overview({go}){
  return <div>
    <AHead eyebrow="Platform" title="Overview" meta="all figures last 24 hours"/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'18px'}}>
      <Stat label="Audits completed" value="248" sub="9 degraded · 2 failed"/>
      <Stat label="Credits recognised" value="4,180" sub="112 refunded"/>
      <Stat label="Provider cost" value="$41.22" sub="gross margin 78%"/>
      <Stat label="Queue depth" value="3" sub="longest wait 41s"/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
      <Card padding={22} title="Needs attention">
        {[['openai adapter degraded','Chain still spans two vendors — no action required','medium'],
          ['playwright-runner disabled','Testing area reports 2 of 5 checks unavailable','high'],
          ['sandbox-runner unavailable','Capability upload returns 503 with no fallback','info']].map(([t,d,s])=>
          <div key={t} style={{display:'flex',gap:'12px',alignItems:'flex-start',padding:'13px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
            <SeverityBadge level={s}/>
            <div><div style={{font:'var(--type-small)',fontWeight:600,color:'var(--text-strong)'}}>{t}</div>
              <div style={{font:'var(--type-small)',fontSize:'13px',color:'var(--text-secondary)',marginTop:'3px'}}>{d}</div></div>
          </div>)}
      </Card>
      <Card padding={22} title="Area health">
        <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
          <ModuleStatus area="Security" state="complete" issues={412}/>
          <ModuleStatus area="Performance" state="complete" issues={301}/>
          <ModuleStatus area="Design" state="complete" issues={188}/>
          <ModuleStatus area="Search visibility" state="complete" issues={140}/>
          <ModuleStatus area="Testing" state="degraded" detail="playwright-runner disabled by operator"/>
        </div>
      </Card>
    </div>
  </div>;
}

function Queue(){
  const rows=[['4f21a8c9','acme.com','running','security','p2 — Pro','41s'],
    ['9c02de11','shopfront.io','waiting','—','p3 — Starter','12s'],
    ['70bb14aa','docs.internal','waiting','—','p5 — Free','6s'],
    ['b1994f02','legacy.co','stalled','testing','p2 — Pro','9m 12s']];
  return <div>
    <AHead eyebrow="Platform" title="Queue" meta="six plan-derived priority levels · BullMQ" actions={<><Button variant="secondary" size="sm">Pause intake</Button><Button size="sm">Retry stalled</Button></>}/>
    <Table cols={[['Scan','120px'],['Target','1fr'],['State','110px'],['Phase','120px'],['Priority','130px'],['Waiting','90px'],['','150px']]}
      rows={rows.map(r=>[mono(r[0]),r[1],<Badge tone={r[2]==='running'?'accent':r[2]==='stalled'?'neutral':'neutral'}>{r[2]}</Badge>,mono(r[3]),r[4],num(r[5]),
        <span style={{display:'flex',gap:'6px'}}><Button variant="ghost" size="sm">Retry</Button><Button variant="ghost" size="sm">Cancel</Button></span>])}/>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'12px'}}>A questionnaire pause holds no worker slot. Stalled jobs are terminated by the timeout sweep and only delivered areas are charged.</p>
  </div>;
}

function Scans(){
  const rows=[['4f21a8c9','acme.com','running','5','80','—'],
    ['3ac09b41','shopfront.io','complete','5','80','62'],
    ['22de71f0','legacy.co','degraded','4','60','48'],
    ['81aa0cc2','docs.internal','failed','0','0','—'],
    ['5f31b7d9','store.example','complete','2','35','71']];
  return <div>
    <AHead eyebrow="Platform" title="Scans" meta="248 in the last 24 hours" actions={<div style={{width:'240px'}}><Input placeholder="Search by scan id or target"/></div>}/>
    <Table cols={[['Scan','120px'],['Target','1fr'],['State','110px'],['Areas','70px'],['Charged','90px'],['Score','70px'],['','110px']]}
      rows={rows.map(r=>[mono(r[0]),r[1],<Badge tone={r[2]==='complete'?'success':r[2]==='running'?'accent':'neutral'}>{r[2]}</Badge>,num(r[3]),num(r[4]+' cr'),num(r[5]),<Button variant="ghost" size="sm">Inspect</Button>])}/>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'12px'}}>The failed scan was a platform fault; its 80 credits were returned to the originating lot automatically.</p>
  </div>;
}

function Capabilities(){
  const init={'headers-checker':['Security','trusted',true,'0.000'],'ssl-analyzer':['Security','trusted',true,'0.000'],
    'data-leak-scanner':['Security','trusted',true,'0.004'],'owasp-checker':['Security','trusted',true,'0.002'],
    'dependency-scanner':['Security','trusted',true,'0.001'],'lighthouse-analyzer':['Performance','trusted',true,'0.000'],
    'cwv-analyzer':['Performance','trusted',true,'0.000'],'bundle-analyzer':['Performance','trusted',true,'0.001'],
    'impeccable':['Design','trusted',true,'0.031'],'screenshot-capture':['Design','trusted',true,'0.000'],
    'playwright-runner':['Testing','trusted',false,'0.006'],'meta-checker':['Search visibility','trusted',true,'0.000'],
    'contradiction-detector':['Search visibility','untrusted',false,'0.009']};
  const [caps,setCaps]=React.useState(init);
  return <div>
    <AHead eyebrow="Catalogue" title="Capabilities" meta="13 discovered · 11 enabled · trust derives from discovery root"
      actions={<><Button variant="secondary" size="sm">Run conformance suite</Button><Button size="sm">Upload capability</Button></>}/>
    <Table cols={[['Capability','1fr'],['Area','150px'],['Trust','110px'],['Cost / run','100px'],['State','110px'],['','110px']]}
      rows={Object.entries(caps).map(([n,[area,trust,on,cost]])=>[mono(n),area,
        <Badge tone={trust==='trusted'?'success':'neutral'}>{trust}</Badge>,num('$'+cost),
        <Badge tone={on?'success':'neutral'}>{on?'enabled':'disabled'}</Badge>,
        <Button variant="ghost" size="sm" onClick={()=>setCaps(c=>({...c,[n]:[area,trust,!on,cost]}))}>{on?'Disable':'Enable'}</Button>])}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:'16px'}}>
      <Card padding={20} title="Disabling is safe" accentRule="var(--sev-resolved)">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>Disabling any single capability still lets every audit complete. Its area reports the check unavailable and the customer is not charged for it.</p>
      </Card>
      <Card padding={20} title="Uploads are sandboxed or refused" accentRule="var(--sev-high)">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>Until the sandbox runner is deployed, upload returns <span style={{fontFamily:'var(--font-mono)'}}>503 SANDBOX_UNAVAILABLE</span>. There is no unsandboxed fallback path.</p>
      </Card>
    </div>
  </div>;
}

function Providers(){
  const [chain,setChain]=React.useState([['claude','Anthropic','healthy','1,204','$28.10'],['openai','OpenAI','degraded','168','$9.02'],['gemini','Google','healthy','41','$4.10']]);
  const vendors=new Set(chain.map(c=>c[1])).size;
  return <div>
    <AHead eyebrow="Catalogue" title="AI providers" meta={'ordered fallback chain · '+vendors+' vendors'} actions={<Button size="sm">Add provider</Button>}/>
    {vendors<2&&<div style={{border:'var(--border-width) solid var(--sev-critical)',background:'var(--sev-critical-bg)',padding:'14px 18px',marginBottom:'16px',font:'var(--type-small)',color:'var(--sev-critical)'}}>A chain spanning fewer than two vendors is refused at startup.</div>}
    <Table cols={[['#','40px'],['Provider','1fr'],['Vendor','150px'],['Health','110px'],['Invocations','120px'],['Cost 24h','100px'],['','160px']]}
      rows={chain.map((c,i)=>[num(i+1),mono(c[0]),c[1],
        <span style={{font:'var(--type-small)',fontWeight:700,color:c[2]==='healthy'?'var(--sev-resolved)':'var(--sev-medium)'}}>{c[2]}</span>,
        num(c[3]),num(c[4]),
        <span style={{display:'flex',gap:'6px'}}>
          <Button variant="ghost" size="sm" onClick={()=>setChain(ch=>{if(!i)return ch;const n=[...ch];[n[i-1],n[i]]=[n[i],n[i-1]];return n})}>Up</Button>
          <Button variant="ghost" size="sm" onClick={()=>setChain(ch=>{if(i===ch.length-1)return ch;const n=[...ch];[n[i+1],n[i]]=[n[i],n[i+1]];return n})}>Down</Button>
        </span>])}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:'16px'}}>
      <Card padding={20} title="Schema failures advance the chain">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>A schema-invalid response is treated as a provider failure. Nothing is partially accepted.</p>
      </Card>
      <Card padding={20} title="Exhaustion degrades, never collapses">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>With every provider unavailable, measured findings are still delivered and the area is marked degraded.</p>
      </Card>
    </div>
  </div>;
}

function Users(){
  const rows=[['khalid@company.com','Pro','1,120','11','12 Sep','active'],
    ['dev@shopfront.io','Starter','204','4','01 Sep','active'],
    ['agency@studio.co','Business','3,880','62','19 Sep','active'],
    ['test@example.com','Free','0','2','—','exhausted'],
    ['old@legacy.co','Starter','60','1','—','unverified']];
  return <div>
    <AHead eyebrow="Commerce" title="Users" meta="1,284 accounts · 212 paying" actions={<div style={{width:'260px'}}><Input placeholder="Search by email"/></div>}/>
    <Table cols={[['Email','1fr'],['Plan','110px'],['Credits','90px'],['Audits','80px'],['Renews','100px'],['State','110px'],['','180px']]}
      rows={rows.map(r=>[mono(r[0]),<Badge tone={r[1]==='Free'?'neutral':'accent'}>{r[1]}</Badge>,num(r[2]),num(r[3]),num(r[4]),
        <Badge tone={r[5]==='active'?'success':'neutral'}>{r[5]}</Badge>,
        <span style={{display:'flex',gap:'6px'}}><Button variant="ghost" size="sm">Grant credits</Button><Button variant="ghost" size="sm">Change plan</Button></span>])}/>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'12px'}}>Granting credits creates a non-expiring lot and is recorded in the audit log against your operator account.</p>
  </div>;
}

function Plans(){
  const rows=[['Free','50, once','—','1','7d','$0'],['Starter','300 / mo','Readiness pass','1','30d','$29'],
    ['Pro','1,200 / mo','Repository, load generation','3','12mo','$99'],['Business','4,000 / mo','Everything in Pro','6','24mo','$299']];
  return <div>
    <AHead eyebrow="Commerce" title="Plans" meta="entitlements are enforced server-side before any charge" actions={<Button size="sm">New plan</Button>}/>
    <Table cols={[['Plan','130px'],['Credits','130px'],['Entitlements','1fr'],['Concurrent','110px'],['Retention','100px'],['Price','90px'],['','90px']]}
      rows={rows.map(r=>[<strong>{r[0]}</strong>,mono(r[1]),r[2],num(r[3]),num(r[4]),num(r[5]),<Button variant="ghost" size="sm">Edit</Button>])}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginTop:'18px'}}>
      <Card padding={20} title="Credit schedule">
        {[['One area','10–25'],['Full audit bundled','80'],['Re-check','3'],['Readiness pass','60']].map(([a,b])=>
          <div key={a} style={{display:'flex',padding:'8px 0',borderTop:'var(--border-width) solid var(--border-default)',font:'var(--type-small)'}}>
            <span>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)'}}>{b}</span></div>)}
      </Card>
      <Card padding={20} title="Two credit lifetimes">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>Plan credits expire at renewal. Purchased top-ups never expire. Expiring lots are always drawn first, so nothing paid for is quietly destroyed.</p>
      </Card>
      <Card padding={20} title="Top-ups">
        <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>Refused on the free tier, so it stays an evaluation rather than a route around subscribing.</p>
      </Card>
    </div>
  </div>;
}

function Margin(){
  const rows=[['impeccable','Design','188','$5.83','$0.031','61%'],
    ['contradiction-detector','Search visibility','44','$0.40','$0.009','74%'],
    ['playwright-runner','Testing','96','$0.58','$0.006','80%'],
    ['data-leak-scanner','Security','412','$1.65','$0.004','88%'],
    ['owasp-checker','Security','412','$0.82','$0.002','92%'],
    ['headers-checker','Security','412','$0.00','$0.000','100%']];
  return <div>
    <AHead eyebrow="Commerce" title="Margin" meta="attributable to the individual capability that caused the cost" actions={<Button variant="secondary" size="sm">Export</Button>}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'18px'}}>
      <Stat label="Credits recognised" value="4,180"/>
      <Stat label="Provider cost" value="$41.22"/>
      <Stat label="Gross margin" value="78%" tone="var(--sev-resolved)"/>
      <Stat label="Refunded" value="112 cr" sub="platform faults only"/>
    </div>
    <Table cols={[['Capability','1fr'],['Area','150px'],['Runs','80px'],['Cost 24h','100px'],['Per run','90px'],['Margin','90px']]}
      rows={rows.map(r=>[mono(r[0]),r[1],num(r[2]),num(r[3]),num(r[4]),
        <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:parseInt(r[5])<70?'var(--sev-medium)':'var(--sev-resolved)'}}>{r[5]}</span>])}/>
    <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'12px'}}>Cost is recorded per attempt in integer micros against the invocation that produced it, so a low-margin area is always traceable to one capability.</p>
  </div>;
}

function Log(){
  const rows=[['23 Aug 14:41','khalid@webaudit.ai','capability.disable','playwright-runner','203.0.113.4'],
    ['23 Aug 14:22','khalid@webaudit.ai','credits.grant','user 4f21 · +200','203.0.113.4'],
    ['23 Aug 11:07','ops@webaudit.ai','provider.reorder','gemini → position 3','198.51.100.9'],
    ['22 Aug 19:50','ops@webaudit.ai','plan.update','Pro concurrent 2 → 3','198.51.100.9'],
    ['22 Aug 09:14','khalid@webaudit.ai','scan.cancel','b1994f02','203.0.113.4']];
  return <div>
    <AHead eyebrow="Governance" title="Audit log" meta="every operator action is recorded · append only" actions={<div style={{width:'240px'}}><Input placeholder="Filter by actor or action"/></div>}/>
    <Table cols={[['When','150px'],['Actor','230px'],['Action','180px'],['Subject','1fr'],['Source','130px']]}
      rows={rows.map(r=>[mono(r[0]),mono(r[1]),<Badge mono pill={false}>{r[2]}</Badge>,r[3],mono(r[4])])}/>
  </div>;
}

function Settings(){
  const [flags,setFlags]=React.useState({'Repository input':true,'Archive upload':false,'Load generation':true,'Design questionnaire':true,'Readiness certificates':true});
  return <div>
    <AHead eyebrow="Governance" title="Settings" meta="platform-wide switches" actions={<Button size="sm">Save</Button>}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',alignItems:'start'}}>
      <Card padding={24} title="Feature switches">
        {Object.entries(flags).map(([k,v])=><div key={k} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
          <span style={{font:'var(--type-small)'}}>{k}</span>
          <button onClick={()=>setFlags(f=>({...f,[k]:!v}))} aria-label={k} style={{marginLeft:'auto',width:'36px',height:'20px',borderRadius:'var(--radius-pill)',border:0,background:v?'var(--accent)':'var(--border-default)',position:'relative',cursor:'pointer',transition:'var(--transition-color)'}}>
            <span style={{position:'absolute',top:'2px',left:v?'18px':'2px',width:'16px',height:'16px',borderRadius:'var(--radius-pill)',background:'#fff',transition:'left 150ms var(--easing)'}}/></button>
        </div>)}
        <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'14px'}}>Archive upload stays off until the sandbox runner is deployed. It returns 503 rather than falling back.</p>
      </Card>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={24} title="Limits">
          {[['Scan timeout','20 min'],['Level 1 probe rate','4 req/s'],['Archive size ceiling','200 MB'],['Sandbox wall clock','30 s'],['Sandbox memory','512 MB']].map(([a,b])=>
            <div key={a} style={{display:'flex',padding:'10px 0',borderTop:'var(--border-width) solid var(--border-default)',font:'var(--type-small)'}}>
              <span>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)'}}>{b}</span></div>)}
        </Card>
        <Card padding={24} title="Retention">
          {[['Free','7 days'],['Starter','30 days'],['Pro','12 months'],['Business','24 months']].map(([a,b])=>
            <div key={a} style={{display:'flex',padding:'10px 0',borderTop:'var(--border-width) solid var(--border-default)',font:'var(--type-small)'}}>
              <span>{a}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)'}}>{b}</span></div>)}
          <p style={{font:'var(--type-small)',color:'var(--text-muted)',marginTop:'12px'}}>Users are warned before anything is removed, and every export is self-contained.</p>
        </Card>
      </div>
    </div>
  </div>;
}
Object.assign(window,{Overview,Queue,Scans,Capabilities,Providers,Users,Plans,Margin,Log,Settings});
