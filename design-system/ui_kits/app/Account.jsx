const { Button, Badge, Input, Card, Eyebrow, StatRow } = window.WebAuditAIDesignSystem_fa5933;
const { PageHead, Ico, I } = window;

/* ---- Usage ---- */
const DAYS=[38,0,80,12,3,83,0,20,60,80,3,0,143,80,6,20,0,83,3,80,60,0,20,83];
function UsageScreen(){
  const max=Math.max(...DAYS);
  return <div>
    <PageHead eyebrow="Usage" title="Credit usage" meta="current period · 12 Aug – 12 Sep 2026" actions={<Button variant="secondary" size="sm">Export CSV</Button>}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'20px'}}>
      {[['Spent this period','980','of 1,200 plan credits'],['Remaining','1,120','920 plan · 200 purchased'],['Audits run','11','9 full · 2 partial'],['Re-checks','24','72 credits · 7% of spend']].map(([k,v,s])=>
        <Card key={k} padding={20} eyebrow={k}>
          <div style={{font:'var(--type-h3)',fontVariantNumeric:'tabular-nums',color:'var(--text-strong)'}}>{v}</div>
          <div style={{font:'var(--type-small)',color:'var(--text-secondary)',marginTop:'6px'}}>{s}</div>
        </Card>)}
    </div>
    <Card padding={24} title="Daily spend">
      <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'150px',marginTop:'8px'}}>
        {DAYS.map((d,i)=><div key={i} title={d+' credits'} style={{flex:1,height:Math.max(2,d/max*100)+'%',background:d?'var(--accent)':'var(--border-default)',minHeight:'2px'}}/>)}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:'10px',fontFamily:'var(--font-mono)',fontSize:'11px',color:'var(--text-muted)'}}>
        <span>12 Aug</span><span>peak 143 cr</span><span>23 Aug</span>
      </div>
    </Card>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:'16px'}}>
      <Card padding={22} title="By area">
        {[['Security',280,'var(--sev-critical)'],['Performance',220,'var(--sev-high)'],['Design',180,'var(--sev-medium)'],['Testing',180,'var(--sev-low)'],['Search visibility',120,'var(--sev-info)']].map(([n,v,c])=>
          <div key={n} style={{padding:'9px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
            <div style={{display:'flex',font:'var(--type-small)'}}><span>{n}</span><span style={{marginLeft:'auto',fontFamily:'var(--font-mono)'}}>{v} cr</span></div>
            <div style={{height:'4px',background:'var(--surface-sunken)',marginTop:'6px'}}><div style={{width:(v/280*100)+'%',height:'100%',background:c}}/></div>
          </div>)}
      </Card>
      <Card padding={22} title="Refunds and adjustments">
        {[['23 Aug','Provider outage — design area','+20'],['19 Aug','Worker timeout — testing area','+20'],['14 Aug','Archive rejected before extraction','+80']].map(([d,r,v])=>
          <div key={d+r} style={{display:'flex',gap:'12px',padding:'11px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--text-muted)',width:'56px'}}>{d}</span>
            <span style={{font:'var(--type-small)'}}>{r}</span>
            <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--sev-resolved)'}}>{v}</span>
          </div>)}
        <p style={{font:'var(--type-small)',color:'var(--text-muted)',margin:'14px 0 0'}}>You are never charged for our failures. These returned automatically.</p>
      </Card>
    </div>
  </div>;
}

/* ---- Profile ---- */
function Row({label,children,note}){
  return <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:'20px',padding:'18px 0',borderTop:'var(--border-width) solid var(--border-default)',alignItems:'start'}}>
    <div>
      <div style={{font:'var(--type-small)',fontWeight:600,color:'var(--text-strong)'}}>{label}</div>
      {note&&<div style={{font:'var(--type-small)',fontSize:'13px',color:'var(--text-muted)',marginTop:'4px',textWrap:'pretty'}}>{note}</div>}
    </div>
    <div>{children}</div>
  </div>;
}

function ProfileScreen(){
  const [theme,setTheme]=useTheme();
  const dark=theme==='dark';
  const setDark=v=>setTheme(v?'dark':'light');
  return <div>
    <PageHead eyebrow="Profile" title="Khalid Ahmed" meta="you@company.com · Pro plan · member since 14 Feb 2026" actions={<Button size="sm">Save changes</Button>}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'20px',alignItems:'start'}}>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={26} title="Account">
          <Row label="Name"><div style={{maxWidth:'360px'}}><Input defaultValue="Khalid Ahmed"/></div></Row>
          <Row label="Email" note="Changing this sends a new verification link."><div style={{maxWidth:'360px'}}><Input defaultValue="you@company.com" type="email"/></div></Row>
          <Row label="Password" note="At least 12 characters."><Button variant="secondary" size="sm">Change password</Button></Row>
          <Row label="Appearance" note="Dark-mode severity values are not contrast-verified yet.">
            <button onClick={()=>setDark(!dark)} style={{display:'flex',alignItems:'center',gap:'10px',height:'36px',padding:'0 14px',border:'var(--border-width) solid var(--border-default)',borderRadius:'var(--radius-control)',background:'var(--surface-page)',fontFamily:'var(--font-sans)',fontSize:'14px',cursor:'pointer',color:'var(--text-primary)'}}>
              <span style={{width:'32px',height:'18px',borderRadius:'var(--radius-pill)',background:dark?'var(--accent)':'var(--border-default)',position:'relative',transition:'var(--transition-color)'}}>
                <span style={{position:'absolute',top:'2px',left:dark?'16px':'2px',width:'14px',height:'14px',borderRadius:'var(--radius-pill)',background:'#fff',transition:'left 150ms var(--easing)'}}/></span>
              {dark?'Dark':'Light'}
            </button>
          </Row>
        </Card>
        <Card padding={26} title="Connected accounts">
          <Row label="GitHub" note="Grants repository input. Revoking it refunds any scan that then fails.">
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}><Badge tone="success">Connected</Badge><span style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-secondary)'}}>khalid-a</span><Button variant="ghost" size="sm">Disconnect</Button></div>
          </Row>
          <Row label="Tokens" note="Stored encrypted. There is no plaintext column.">
            <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-muted)'}}>3 tokens · last used 23 Aug 14:02</span>
          </Row>
        </Card>
        <Card padding={26} title="Sessions">
          {[['macOS · Chrome','Riyadh · now',true],['iOS · Safari','Riyadh · 2 days ago',false],['Linux · Firefox','Frankfurt · 11 days ago',false]].map(([d,w,cur])=>
            <div key={d} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 0',borderTop:'var(--border-width) solid var(--border-default)'}}>
              <span style={{font:'var(--type-small)',fontWeight:500}}>{d}</span>
              <span style={{font:'var(--type-small)',color:'var(--text-muted)'}}>{w}</span>
              {cur?<Badge tone="success">This device</Badge>:<Button variant="ghost" size="sm">Revoke</Button>}
            </div>)}
        </Card>
        <Card padding={26} title="Delete account" accentRule="var(--sev-critical)">
          <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'0 0 16px',maxWidth:'62ch',textWrap:'pretty'}}>
            Deletion cascades: every scan, report, issue, verification attempt and stored artifact is removed. Purchased credits are forfeited. This cannot be undone.
          </p>
          <Button variant="secondary" size="sm">Delete my account</Button>
        </Card>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <Card padding={22} title="Plan">
          <div style={{font:'var(--type-h3)',color:'var(--text-strong)'}}>Pro</div>
          <div style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'6px 0 14px'}}>1,200 credits a month · renews 12 September</div>
          <Button variant="secondary" fullWidth size="sm">Manage plan</Button>
        </Card>
        <Card padding={22} title="Retention">
          <p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:0}}>Reports are kept 12 months on Pro. We warn you before anything is removed, and an export is always self-contained.</p>
        </Card>
      </div>
    </div>
  </div>;
}
Object.assign(window,{UsageScreen,ProfileScreen});
