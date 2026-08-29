const { Button, Input, Card, Badge } = window.WebAuditAIDesignSystem_fa5933;
const { PublicPage } = window;

function AuthFrame({title,lead,children,foot}){
  const [,lang]=useT();
  return <PublicPage tint="var(--surface-raised)">
    <div dir={lang==='ar'?'ltr':undefined} style={{display:'grid',placeItems:'center',padding:'72px 24px'}}>
      <div style={{width:'420px',maxWidth:'100%'}}>
        <Card padding={30}>
          <h1 style={{font:'var(--type-card-title)',color:'var(--text-strong)',margin:'0 0 8px'}}>{title}</h1>
          {lead&&<p style={{font:'var(--type-small)',color:'var(--text-secondary)',margin:'0 0 22px',textWrap:'pretty'}}>{lead}</p>}
          {children}
        </Card>
        {foot&&<div style={{font:'var(--type-small)',color:'var(--text-secondary)',textAlign:'center',marginTop:'18px'}}>{foot}</div>}
      </div>
    </div>
  </PublicPage>;
}

function Field({label,...rest}){
  return <label style={{display:'block'}}>
    <div style={{font:'var(--type-small)',fontWeight:500,color:'var(--text-primary)',marginBottom:'6px'}}>{label}</div>
    <Input {...rest}/>
  </label>;
}

function Divider(){return <div style={{display:'flex',alignItems:'center',gap:'12px',margin:'20px 0'}}><div style={{flex:1,height:'1px',background:'var(--border-default)'}}/><span style={{font:'var(--type-small)',color:'var(--text-muted)'}}>or</span><div style={{flex:1,height:'1px',background:'var(--border-default)'}}/></div>}

function LoginPage(){
  return <AuthFrame title="Sign in" lead="Your audits and fixes boards are where you left them."
    foot={<span>No account? <a href="Register.html">Start free</a> — 50 credits, no card.</span>}>
    <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
      <Field label="Email" type="email" placeholder="you@company.com"/>
      <div>
        <div style={{display:'flex',marginBottom:'6px'}}>
          <span style={{font:'var(--type-small)',fontWeight:500}}>Password</span>
          <a href="Forgot.html" style={{marginLeft:'auto',font:'var(--type-small)'}}>Forgot?</a>
        </div>
        <Input type="password" placeholder="••••••••"/>
      </div>
      <Button fullWidth href="../app/index.html">Sign in</Button>
    </div>
    <Divider/>
    <Button variant="secondary" fullWidth href="../app/index.html">Continue with GitHub</Button>
  </AuthFrame>;
}

function RegisterPage(){
  return <AuthFrame title="Create an account" lead="Fifty credits, no card. Enough to audit two or three areas of your real site."
    foot={<span>Already have an account? <a href="Login.html">Sign in</a></span>}>
    <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
      <Field label="Name" placeholder="Khalid Ahmed"/>
      <Field label="Work email" type="email" placeholder="you@company.com"/>
      <Field label="Password" type="password" placeholder="At least 12 characters"/>
      <div style={{font:'var(--type-small)',color:'var(--text-muted)'}}>We send one verification email. You cannot sign in until it is confirmed.</div>
      <Button fullWidth href="Verify.html">Create account</Button>
    </div>
    <Divider/>
    <Button variant="secondary" fullWidth href="../app/index.html">Continue with GitHub</Button>
  </AuthFrame>;
}

function VerifyPage(){
  return <AuthFrame title="Check your email" lead="We sent a verification link to you@company.com. It expires in 24 hours."
    foot={<span>Wrong address? <a href="Register.html">Start again</a></span>}>
    <div style={{background:'var(--surface-sunken)',border:'var(--border-width) solid var(--border-default)',padding:'14px 16px',fontFamily:'var(--font-mono)',fontSize:'13px',color:'var(--text-zinc)',marginBottom:'18px'}}>you@company.com</div>
    <Button variant="secondary" fullWidth>Resend the email</Button>
  </AuthFrame>;
}

function ForgotPage(){
  return <AuthFrame title="Reset your password" lead="Enter the address on your account and we will send a single-use link."
    foot={<span><a href="Login.html">Back to sign in</a></span>}>
    <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
      <Field label="Email" type="email" placeholder="you@company.com"/>
      <Button fullWidth href="Reset.html">Send reset link</Button>
    </div>
  </AuthFrame>;
}

function ResetPage(){
  const [pw,setPw]=React.useState('');
  const ok=pw.length>=12;
  return <AuthFrame title="Choose a new password" lead="This link is single-use. Signing in again revokes every other session."
    foot={<span><a href="Login.html">Back to sign in</a></span>}>
    <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
      <Field label="New password" type="password" placeholder="At least 12 characters" value={pw} onChange={e=>setPw(e.target.value)}/>
      <Field label="Confirm new password" type="password" placeholder="Repeat it"/>
      <div style={{display:'flex',alignItems:'center',gap:'8px',font:'var(--type-small)',color:ok?'var(--sev-resolved)':'var(--text-muted)'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={ok?'m4 12 5 5L20 6':'M5 12h14'}/></svg>
        12 characters minimum
      </div>
      <Button fullWidth disabled={!ok} href={ok?'Login.html':undefined}>Set password and sign in</Button>
    </div>
  </AuthFrame>;
}
Object.assign(window,{LoginPage,RegisterPage,VerifyPage,ForgotPage,ResetPage});
