/* @ds-bundle: {"format":4,"namespace":"WebAuditAIDesignSystem_fa5933","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"PromoBar","sourcePath":"components/core/PromoBar.jsx"},{"name":"SeverityBadge","sourcePath":"components/core/SeverityBadge.jsx"},{"name":"StatRow","sourcePath":"components/core/StatRow.jsx"},{"name":"TwoToneHeading","sourcePath":"components/core/TwoToneHeading.jsx"},{"name":"AttributionMark","sourcePath":"components/report/AttributionMark.jsx"},{"name":"IssueCard","sourcePath":"components/report/IssueCard.jsx"},{"name":"ModuleStatus","sourcePath":"components/report/ModuleStatus.jsx"},{"name":"ProgressRow","sourcePath":"components/report/ProgressRow.jsx"},{"name":"ScoreArc","sourcePath":"components/report/ScoreArc.jsx"},{"name":"VerdictPanel","sourcePath":"components/report/VerdictPanel.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"e9001106dd46","components/core/Button.jsx":"b9d341183ce6","components/core/Card.jsx":"db62f1b96e57","components/core/Eyebrow.jsx":"15de38d281c7","components/core/Input.jsx":"f78209619b97","components/core/PromoBar.jsx":"58542ec16017","components/core/SeverityBadge.jsx":"f9a093091157","components/core/StatRow.jsx":"c112087e3cd3","components/core/TwoToneHeading.jsx":"3f5820bafb38","components/report/AttributionMark.jsx":"d1dc4cd75146","components/report/IssueCard.jsx":"246f8408a93e","components/report/ModuleStatus.jsx":"d8fb446f747b","components/report/ProgressRow.jsx":"14f6c90cf230","components/report/ScoreArc.jsx":"8de872a38190","components/report/VerdictPanel.jsx":"7d3d7ebb6b52","ui_kits/admin/AdminScreens.jsx":"c36f88e63a46","ui_kits/admin/AdminShell.jsx":"e36374fbda4a","ui_kits/app/Account.jsx":"d7ba3e397cec","ui_kits/app/Screens.jsx":"903e2881fbed","ui_kits/app/Sidebar.jsx":"9e8393591069","ui_kits/marketing/AuthPages.jsx":"89e148db57af","ui_kits/marketing/Landing.jsx":"708d0eb18a01","ui_kits/marketing/Pricing.jsx":"a828495fc5b9","ui_kits/marketing/Public.jsx":"297821ba921e","ui_kits/strings.jsx":"1bc53a8a8b2c","ui_kits/theme.jsx":"cdc9ac2c121e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WebAuditAIDesignSystem_fa5933 = window.WebAuditAIDesignSystem_fa5933 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const tones = {
  neutral: ['var(--surface-raised)', 'var(--text-secondary)', 'var(--border-default)'],
  accent: ['#fff3ec', 'var(--accent)', '#ffd9c2'],
  success: ['var(--sev-resolved-bg)', 'var(--sev-resolved)', '#a7f3d0'],
  inverse: ['var(--surface-inverse)', 'var(--text-on-accent)', 'transparent']
};
function Badge({
  tone = 'neutral',
  pill = true,
  mono = false,
  icon = null,
  children
}) {
  const [bg, fg, bd] = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: bg,
      color: fg,
      border: 'var(--border-width) solid ' + bd,
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-none)',
      padding: '4px 10px',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: '16px',
      whiteSpace: 'nowrap'
    }
  }, icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  height: '48px',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '0 32px',
  borderRadius: 'var(--radius-control)',
  fontFamily: 'var(--font-sans)',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'var(--border-width) solid transparent',
  transition: 'var(--transition-color)',
  textDecoration: 'none',
  whiteSpace: 'nowrap'
};
const variants = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--text-on-accent)'
  },
  secondary: {
    background: 'var(--surface-page)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-default)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)'
  },
  inverse: {
    background: 'var(--surface-page)',
    color: 'var(--text-primary)'
  }
};
const sizes = {
  sm: {
    height: '36px',
    padding: '0 16px',
    fontSize: '14px'
  },
  md: {},
  lg: {
    height: '56px',
    padding: '0 40px',
    fontSize: '16px'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  icon = null,
  onClick,
  href,
  children,
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const v = variants[variant] || variants.primary;
  const style = {
    ...base,
    ...v,
    ...(sizes[size] || {}),
    ...(fullWidth ? {
      width: '100%'
    } : {}),
    ...(h && !disabled ? {
      background: variant === 'primary' ? 'var(--accent-hover)' : variant === 'ghost' ? 'var(--surface-raised)' : 'var(--surface-raised)',
      color: variant === 'ghost' ? 'var(--text-strong)' : v.color
    } : {}),
    ...(disabled ? {
      opacity: .45,
      cursor: 'not-allowed'
    } : {})
  };
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    style: style,
    disabled: href ? undefined : disabled,
    onClick: disabled ? undefined : onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false)
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  title,
  eyebrow,
  footer,
  padding = 24,
  accentRule = null,
  elevated = false,
  children,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--surface-card)',
      border: 'var(--border-width) solid var(--border-card)',
      borderRadius: 'var(--radius-card)',
      borderInlineStart: accentRule ? '3px solid ' + accentRule : undefined,
      boxShadow: elevated ? 'var(--shadow-card)' : 'none',
      padding: padding + 'px',
      ...style
    }
  }, rest), eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '12px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)',
      marginBottom: '12px'
    }
  }, title), children, footer && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: 'var(--border-width) solid var(--border-default)',
      font: 'var(--type-small)',
      color: 'var(--text-secondary)'
    }
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function Eyebrow({
  tone = 'muted',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '12px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: tone === 'accent' ? 'var(--accent)' : 'var(--text-muted)'
    }
  }, children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  prefix,
  placeholder,
  value,
  onChange,
  type = 'text',
  fullWidth = true,
  invalid = false,
  mono = false,
  ...rest
}) {
  const [f, setF] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: fullWidth ? '100%' : 'auto'
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: '12px',
      top: 0,
      height: '48px',
      display: 'flex',
      alignItems: 'center',
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      pointerEvents: 'none'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    onFocus: () => setF(true),
    onBlur: () => setF(false),
    style: {
      height: '48px',
      width: '100%',
      boxSizing: 'border-box',
      border: 'var(--border-width) solid ' + (invalid ? 'var(--sev-critical)' : 'var(--border-subtle)'),
      borderRadius: 'var(--radius-control)',
      padding: prefix ? '4px 12px 4px 64px' : '4px 12px',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: '14px',
      color: 'var(--text-primary)',
      background: 'var(--surface-field)',
      outline: 'none',
      boxShadow: f ? 'var(--shadow-focus)' : 'none',
      transition: 'var(--transition-color)'
    }
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/PromoBar.jsx
try { (() => {
function PromoBar({
  message,
  code,
  dark = false,
  onDismiss
}) {
  const [gone, setGone] = React.useState(false);
  if (gone) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: dark ? 'var(--promo-bg-dark)' : 'var(--promo-bg)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '10px 16px',
      fontFamily: 'var(--font-sans)',
      fontSize: '13px',
      fontWeight: 500,
      letterSpacing: '.6px',
      textTransform: 'uppercase',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", null, message), code && /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-mono)',
      background: 'rgba(0,0,0,.22)',
      padding: '3px 8px',
      borderRadius: 'var(--radius-control)',
      letterSpacing: 'normal',
      textTransform: 'none'
    }
  }, code), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setGone(true);
      onDismiss && onDismiss();
    },
    "aria-label": "Dismiss",
    style: {
      position: 'absolute',
      right: '14px',
      background: 'none',
      border: 0,
      color: '#fff',
      cursor: 'pointer',
      fontSize: '16px',
      lineHeight: 1,
      opacity: .8
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { PromoBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/PromoBar.jsx", error: String((e && e.message) || e) }); }

// components/core/SeverityBadge.jsx
try { (() => {
const map = {
  critical: ['var(--sev-critical)', 'var(--sev-critical-bg)', 'Critical', 'M12 2 1 21h22L12 2Zm0 6v6m0 3v.5'],
  high: ['var(--sev-high)', 'var(--sev-high-bg)', 'High', 'M12 3v12m0 4v.5M4 20h16'],
  medium: ['var(--sev-medium)', 'var(--sev-medium-bg)', 'Medium', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3v.5'],
  low: ['var(--sev-low)', 'var(--sev-low-bg)', 'Low', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6'],
  info: ['var(--sev-info)', 'var(--sev-info-bg)', 'Info', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.5m0 3v5'],
  resolved: ['var(--sev-resolved)', 'var(--sev-resolved-bg)', 'Resolved', 'm4 12 5 5L20 6']
};
function SeverityBadge({
  level = 'medium',
  label,
  count
}) {
  const [fg, bg, text, d] = map[level] || map.medium;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: bg,
      color: fg,
      border: 'var(--border-width) solid currentColor',
      borderRadius: 'var(--radius-pill)',
      padding: '3px 10px',
      fontFamily: 'var(--font-sans)',
      fontSize: '12px',
      fontWeight: 700,
      lineHeight: '16px'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: d
  })), label || text, count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      opacity: .75
    }
  }, count));
}
Object.assign(__ds_scope, { SeverityBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SeverityBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/StatRow.jsx
try { (() => {
function StatRow({
  items = [],
  align = 'left'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '10px',
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      font: 'var(--type-small)',
      color: 'var(--text-secondary)'
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--border-default)'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-strong)',
      fontWeight: 700
    }
  }, it.value), " ", it.label))));
}
Object.assign(__ds_scope, { StatRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatRow.jsx", error: String((e && e.message) || e) }); }

// components/core/TwoToneHeading.jsx
try { (() => {
function TwoToneHeading({
  lead,
  accent,
  level = 'display',
  align = 'center',
  as = 'h1'
}) {
  const Tag = as;
  const isD = level === 'display';
  return /*#__PURE__*/React.createElement(Tag, {
    style: {
      font: isD ? 'var(--type-display)' : 'var(--type-h2)',
      letterSpacing: isD ? 'var(--track-display)' : 'var(--track-h2)',
      color: 'var(--text-primary)',
      textAlign: align,
      margin: 0,
      textWrap: 'pretty'
    }
  }, lead, ' ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, accent));
}
Object.assign(__ds_scope, { TwoToneHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/TwoToneHeading.jsx", error: String((e && e.message) || e) }); }

// components/report/AttributionMark.jsx
try { (() => {
function AttributionMark({
  kind = 'measured'
}) {
  const m = kind === 'measured' ? ['var(--sev-info)', 'Measured', 'M4 20V10m5 10V4m5 16v-7m5 7V8'] : ['var(--text-muted)', 'AI judgment', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 7a2 2 0 1 1 4 0c0 1.5-2 1.8-2 3m0 3v.5'];
  return /*#__PURE__*/React.createElement("span", {
    title: kind === 'measured' ? 'Observed directly by a check' : 'Concluded by a model from measured input',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      letterSpacing: '.3px',
      color: m[0],
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: m[2]
  })), m[1]);
}
Object.assign(__ds_scope, { AttributionMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/AttributionMark.jsx", error: String((e && e.message) || e) }); }

// components/report/IssueCard.jsx
try { (() => {
const sev = {
  critical: 'var(--sev-critical)',
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
  resolved: 'var(--sev-resolved)'
};
function IssueCard({
  severity = 'high',
  title,
  location,
  description,
  attribution = 'measured',
  prompt,
  area,
  onCopy
}) {
  const [copied, setCopied] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: 'var(--border-width) solid var(--border-default)',
      borderInlineStart: '3px solid ' + (sev[severity] || sev.high),
      borderRadius: 'var(--radius-card)',
      padding: '18px 20px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '10px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.SeverityBadge, {
    level: severity
  }), area && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, area), /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.AttributionMark, {
    kind: attribution
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '17px',
      fontWeight: 600,
      color: 'var(--text-strong)',
      marginBottom: '6px'
    }
  }, title), location && /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-zinc)',
      marginBottom: '10px',
      wordBreak: 'break-all'
    }
  }, location), description && /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '0 0 14px',
      maxWidth: '62ch',
      textWrap: 'pretty'
    }
  }, description), prompt && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setCopied(true);
      onCopy && onCopy(prompt);
      setTimeout(() => setCopied(false), 1600);
    },
    style: {
      height: '36px',
      padding: '0 16px',
      borderRadius: 'var(--radius-control)',
      border: 'var(--border-width) solid var(--border-default)',
      background: copied ? 'var(--sev-resolved-bg)' : 'var(--surface-page)',
      color: copied ? 'var(--sev-resolved)' : 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'var(--transition-color)'
    }
  }, copied ? 'Copied' : 'Copy fix prompt'));
}
Object.assign(__ds_scope, { IssueCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/IssueCard.jsx", error: String((e && e.message) || e) }); }

// components/report/ModuleStatus.jsx
try { (() => {
const S = {
  waiting: {
    fg: 'var(--text-muted)',
    bg: 'var(--surface-raised)',
    word: 'Waiting',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2'
  },
  running: {
    fg: 'var(--accent)',
    bg: '#fff3ec',
    word: 'Running',
    d: 'M12 3a9 9 0 1 0 9 9'
  },
  complete: {
    fg: 'var(--sev-resolved)',
    bg: 'var(--sev-resolved-bg)',
    word: 'Complete',
    d: 'm4 12 5 5L20 6'
  },
  degraded: {
    fg: 'var(--sev-medium)',
    bg: 'var(--sev-medium-bg)',
    word: 'Degraded',
    d: 'M12 2 1 21h22L12 2Zm0 7v5m0 3v.5'
  },
  'not-applicable': {
    fg: 'var(--text-muted)',
    bg: 'var(--surface-sunken)',
    word: 'Not applicable',
    d: 'M5 12h14'
  }
};
const ell = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0
};
function ModuleStatus({
  area,
  state = 'waiting',
  detail,
  issues = null,
  compact = false
}) {
  const s = S[state] || S.waiting;
  const icon = /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexShrink: 0,
      color: s.fg,
      animation: state === 'running' ? 'wa-spin 1s linear infinite' : 'none'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: compact ? 15 : 18,
    height: compact ? 15 : 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: s.d
  })));
  const box = {
    background: s.bg,
    border: 'var(--border-width) solid var(--border-default)',
    borderInlineStart: state === 'degraded' ? '3px solid var(--sev-medium)' : undefined,
    fontFamily: 'var(--font-sans)',
    minWidth: 0,
    overflow: 'hidden'
  };
  if (compact) return /*#__PURE__*/React.createElement("div", {
    style: {
      ...box,
      padding: '10px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: 0
    }
  }, icon, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--text-strong)',
      ...ell
    }
  }, area), issues != null && /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      marginInlineStart: 'auto',
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--text-secondary)'
    }
  }, issues)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '6px',
      marginTop: '3px',
      paddingInlineStart: '23px',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      fontWeight: 700,
      color: s.fg,
      flexShrink: 0
    }
  }, s.word), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: 'var(--text-secondary)',
      ...ell
    }
  }, detail)));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...box,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px'
    }
  }, icon, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      fontWeight: 600,
      color: 'var(--text-strong)',
      flex: '0 1 auto',
      ...ell
    }
  }, area), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      fontWeight: 700,
      color: s.fg,
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }
  }, s.word), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: 'var(--text-secondary)',
      flex: '1 1 auto',
      ...ell
    }
  }, detail), issues != null && /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      marginInlineStart: 'auto',
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)'
    }
  }, issues));
}
Object.assign(__ds_scope, { ModuleStatus });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/ModuleStatus.jsx", error: String((e && e.message) || e) }); }

// components/report/ProgressRow.jsx
try { (() => {
function ProgressRow({
  elapsed = '0:00',
  phase,
  done = 0,
  total = 5,
  safeToClose = true
}) {
  const pct = Math.round(done / total * 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)',
      background: 'var(--surface-page)',
      padding: '16px 18px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '12px',
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, phase), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)'
    }
  }, done, " of ", total, " areas"), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, elapsed)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '6px',
      background: 'var(--surface-sunken)',
      border: 'var(--border-width) solid var(--border-default)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct + '%',
      height: '100%',
      background: 'var(--accent)',
      transition: 'width var(--duration-land) var(--easing-reveal)'
    }
  })), safeToClose && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '10px'
    }
  }, "You can close this tab. The audit keeps running and the report will be waiting."));
}
Object.assign(__ds_scope, { ProgressRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/ProgressRow.jsx", error: String((e && e.message) || e) }); }

// components/report/ScoreArc.jsx
try { (() => {
function band(s) {
  return s >= 85 ? 'var(--sev-resolved)' : s >= 70 ? 'var(--sev-low)' : s >= 50 ? 'var(--sev-medium)' : s >= 30 ? 'var(--sev-high)' : 'var(--sev-critical)';
}
function ScoreArc({
  score = 0,
  delta = null,
  size = 180,
  label = 'Health score'
}) {
  // The measured score is what renders. The count-up is an enhancement layered on top, so a
  // throttled or never-firing rAF can only cost the animation — never the number.
  const [v, setV] = React.useState(score);
  React.useEffect(() => {
    setV(score);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof requestAnimationFrame !== 'function') return;
    const t0 = performance.now(),
      d = 600;
    let raf,
      done = false;
    const step = t => {
      const p = Math.min(1, (t - t0) / d);
      setV(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && !done) raf = requestAnimationFrame(step);else setV(score);
    };
    raf = requestAnimationFrame(step);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [score]);
  const r = (size - 16) / 2,
    c = Math.PI * r * 1.5,
    off = c * (1 - v / 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      textAlign: 'center',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size * 0.78,
    viewBox: `0 0 ${size} ${size * 0.78}`
  }, /*#__PURE__*/React.createElement("g", {
    transform: `rotate(135 ${size / 2} ${size / 2})`
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--border-default)",
    strokeWidth: "8",
    strokeDasharray: `${c} 999`,
    strokeLinecap: "butt"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: band(score),
    strokeWidth: "8",
    strokeDasharray: `${c} 999`,
    strokeDashoffset: off,
    strokeLinecap: "butt"
  })), /*#__PURE__*/React.createElement("text", {
    x: size / 2,
    y: size * 0.46,
    textAnchor: "middle",
    fontFamily: "var(--font-sans)",
    fontSize: size * 0.3,
    fontWeight: "700",
    fill: "var(--text-strong)",
    style: {
      fontVariantNumeric: 'tabular-nums'
    }
  }, v), delta != null && /*#__PURE__*/React.createElement("text", {
    x: size / 2,
    y: size * 0.62,
    textAnchor: "middle",
    fontFamily: "var(--font-mono)",
    fontSize: "13",
    fill: delta >= 0 ? 'var(--sev-resolved)' : 'var(--sev-critical)'
  }, delta >= 0 ? '+' : '', delta, " vs baseline")), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '-4px'
    }
  }, label));
}
Object.assign(__ds_scope, { ScoreArc });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/ScoreArc.jsx", error: String((e && e.message) || e) }); }

// components/report/VerdictPanel.jsx
try { (() => {
function VerdictPanel({
  verdict = 'go',
  score,
  baseline,
  blockers = [],
  areas = []
}) {
  const go = verdict === 'go';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid ' + (go ? 'var(--sev-resolved)' : 'var(--sev-critical)'),
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: go ? 'var(--sev-resolved-bg)' : 'var(--sev-critical-bg)',
      padding: '22px 24px',
      borderBottom: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '12px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: go ? 'var(--sev-resolved)' : 'var(--sev-critical)',
      marginBottom: '8px'
    }
  }, "Production readiness"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h3)',
      color: 'var(--text-strong)'
    }
  }, go ? 'Ready to ship' : 'Not ready to ship'), score != null && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px',
      fontFamily: 'var(--font-mono)'
    }
  }, "Score ", score, baseline != null && ' · baseline ' + baseline + ' · ' + (score - baseline >= 0 ? '+' : '') + (score - baseline))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 24px',
      background: 'var(--surface-page)'
    }
  }, areas.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 0',
      borderBottom: i < areas.length - 1 ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: a.pass ? 'var(--sev-resolved)' : 'var(--sev-critical)',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: a.pass ? 'm4 12 5 5L20 6' : 'M6 6l12 12M18 6 6 18'
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      color: 'var(--text-primary)'
    }
  }, a.name), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)'
    }
  }, a.score, " / ", a.threshold))), blockers.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 700,
      color: 'var(--sev-critical)',
      marginBottom: '8px'
    }
  }, "Blockers"), blockers.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-primary)',
      padding: '4px 0'
    }
  }, "\u2014 ", b)))));
}
Object.assign(__ds_scope, { VerdictPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/report/VerdictPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/AdminScreens.jsx
try { (() => {
const {
  Button,
  Badge,
  Input,
  Card,
  Eyebrow,
  SeverityBadge,
  StatRow,
  ModuleStatus
} = window.WebAuditAIDesignSystem_fa5933;
const {
  AHead,
  Table,
  Stat,
  AIco,
  AI
} = window;
const mono = s => /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px'
  }
}, s);
const num = s => /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums'
  }
}, s);
function Overview({
  go
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Platform",
    title: "Overview",
    meta: "all figures last 24 hours"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '16px',
      marginBottom: '18px'
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Audits completed",
    value: "248",
    sub: "9 degraded \xB7 2 failed"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Credits recognised",
    value: "4,180",
    sub: "112 refunded"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Provider cost",
    value: "$41.22",
    sub: "gross margin 78%"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Queue depth",
    value: "3",
    sub: "longest wait 41s"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Needs attention"
  }, [['openai adapter degraded', 'Chain still spans two vendors — no action required', 'medium'], ['playwright-runner disabled', 'Testing area reports 2 of 5 checks unavailable', 'high'], ['sandbox-runner unavailable', 'Capability upload returns 503 with no fallback', 'info']].map(([t, d, s]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
      padding: '13px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement(SeverityBadge, {
    level: s
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontSize: '13px',
      color: 'var(--text-secondary)',
      marginTop: '3px'
    }
  }, d))))), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Area health"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Security",
    state: "complete",
    issues: 412
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Performance",
    state: "complete",
    issues: 301
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Design",
    state: "complete",
    issues: 188
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Search visibility",
    state: "complete",
    issues: 140
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Testing",
    state: "degraded",
    detail: "playwright-runner disabled by operator"
  })))));
}
function Queue() {
  const rows = [['4f21a8c9', 'acme.com', 'running', 'security', 'p2 — Pro', '41s'], ['9c02de11', 'shopfront.io', 'waiting', '—', 'p3 — Starter', '12s'], ['70bb14aa', 'docs.internal', 'waiting', '—', 'p5 — Free', '6s'], ['b1994f02', 'legacy.co', 'stalled', 'testing', 'p2 — Pro', '9m 12s']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Platform",
    title: "Queue",
    meta: "six plan-derived priority levels \xB7 BullMQ",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Pause intake"), /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Retry stalled"))
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['Scan', '120px'], ['Target', '1fr'], ['State', '110px'], ['Phase', '120px'], ['Priority', '130px'], ['Waiting', '90px'], ['', '150px']],
    rows: rows.map(r => [mono(r[0]), r[1], /*#__PURE__*/React.createElement(Badge, {
      tone: r[2] === 'running' ? 'accent' : r[2] === 'stalled' ? 'neutral' : 'neutral'
    }, r[2]), mono(r[3]), r[4], num(r[5]), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        gap: '6px'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Retry"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Cancel"))])
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '12px'
    }
  }, "A questionnaire pause holds no worker slot. Stalled jobs are terminated by the timeout sweep and only delivered areas are charged."));
}
function Scans() {
  const rows = [['4f21a8c9', 'acme.com', 'running', '5', '80', '—'], ['3ac09b41', 'shopfront.io', 'complete', '5', '80', '62'], ['22de71f0', 'legacy.co', 'degraded', '4', '60', '48'], ['81aa0cc2', 'docs.internal', 'failed', '0', '0', '—'], ['5f31b7d9', 'store.example', 'complete', '2', '35', '71']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Platform",
    title: "Scans",
    meta: "248 in the last 24 hours",
    actions: /*#__PURE__*/React.createElement("div", {
      style: {
        width: '240px'
      }
    }, /*#__PURE__*/React.createElement(Input, {
      placeholder: "Search by scan id or target"
    }))
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['Scan', '120px'], ['Target', '1fr'], ['State', '110px'], ['Areas', '70px'], ['Charged', '90px'], ['Score', '70px'], ['', '110px']],
    rows: rows.map(r => [mono(r[0]), r[1], /*#__PURE__*/React.createElement(Badge, {
      tone: r[2] === 'complete' ? 'success' : r[2] === 'running' ? 'accent' : 'neutral'
    }, r[2]), num(r[3]), num(r[4] + ' cr'), num(r[5]), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Inspect")])
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '12px'
    }
  }, "The failed scan was a platform fault; its 80 credits were returned to the originating lot automatically."));
}
function Capabilities() {
  const init = {
    'headers-checker': ['Security', 'trusted', true, '0.000'],
    'ssl-analyzer': ['Security', 'trusted', true, '0.000'],
    'data-leak-scanner': ['Security', 'trusted', true, '0.004'],
    'owasp-checker': ['Security', 'trusted', true, '0.002'],
    'dependency-scanner': ['Security', 'trusted', true, '0.001'],
    'lighthouse-analyzer': ['Performance', 'trusted', true, '0.000'],
    'cwv-analyzer': ['Performance', 'trusted', true, '0.000'],
    'bundle-analyzer': ['Performance', 'trusted', true, '0.001'],
    'impeccable': ['Design', 'trusted', true, '0.031'],
    'screenshot-capture': ['Design', 'trusted', true, '0.000'],
    'playwright-runner': ['Testing', 'trusted', false, '0.006'],
    'meta-checker': ['Search visibility', 'trusted', true, '0.000'],
    'contradiction-detector': ['Search visibility', 'untrusted', false, '0.009']
  };
  const [caps, setCaps] = React.useState(init);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Catalogue",
    title: "Capabilities",
    meta: "13 discovered \xB7 11 enabled \xB7 trust derives from discovery root",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Run conformance suite"), /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Upload capability"))
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['Capability', '1fr'], ['Area', '150px'], ['Trust', '110px'], ['Cost / run', '100px'], ['State', '110px'], ['', '110px']],
    rows: Object.entries(caps).map(([n, [area, trust, on, cost]]) => [mono(n), area, /*#__PURE__*/React.createElement(Badge, {
      tone: trust === 'trusted' ? 'success' : 'neutral'
    }, trust), num('$' + cost), /*#__PURE__*/React.createElement(Badge, {
      tone: on ? 'success' : 'neutral'
    }, on ? 'enabled' : 'disabled'), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setCaps(c => ({
        ...c,
        [n]: [area, trust, !on, cost]
      }))
    }, on ? 'Disable' : 'Enable')])
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Disabling is safe",
    accentRule: "var(--sev-resolved)"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "Disabling any single capability still lets every audit complete. Its area reports the check unavailable and the customer is not charged for it.")), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Uploads are sandboxed or refused",
    accentRule: "var(--sev-high)"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "Until the sandbox runner is deployed, upload returns ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, "503 SANDBOX_UNAVAILABLE"), ". There is no unsandboxed fallback path."))));
}
function Providers() {
  const [chain, setChain] = React.useState([['claude', 'Anthropic', 'healthy', '1,204', '$28.10'], ['openai', 'OpenAI', 'degraded', '168', '$9.02'], ['gemini', 'Google', 'healthy', '41', '$4.10']]);
  const vendors = new Set(chain.map(c => c[1])).size;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Catalogue",
    title: "AI providers",
    meta: 'ordered fallback chain · ' + vendors + ' vendors',
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Add provider")
  }), vendors < 2 && /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--sev-critical)',
      background: 'var(--sev-critical-bg)',
      padding: '14px 18px',
      marginBottom: '16px',
      font: 'var(--type-small)',
      color: 'var(--sev-critical)'
    }
  }, "A chain spanning fewer than two vendors is refused at startup."), /*#__PURE__*/React.createElement(Table, {
    cols: [['#', '40px'], ['Provider', '1fr'], ['Vendor', '150px'], ['Health', '110px'], ['Invocations', '120px'], ['Cost 24h', '100px'], ['', '160px']],
    rows: chain.map((c, i) => [num(i + 1), mono(c[0]), c[1], /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-small)',
        fontWeight: 700,
        color: c[2] === 'healthy' ? 'var(--sev-resolved)' : 'var(--sev-medium)'
      }
    }, c[2]), num(c[3]), num(c[4]), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        gap: '6px'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setChain(ch => {
        if (!i) return ch;
        const n = [...ch];
        [n[i - 1], n[i]] = [n[i], n[i - 1]];
        return n;
      })
    }, "Up"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setChain(ch => {
        if (i === ch.length - 1) return ch;
        const n = [...ch];
        [n[i + 1], n[i]] = [n[i], n[i + 1]];
        return n;
      })
    }, "Down"))])
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Schema failures advance the chain"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "A schema-invalid response is treated as a provider failure. Nothing is partially accepted.")), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Exhaustion degrades, never collapses"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "With every provider unavailable, measured findings are still delivered and the area is marked degraded."))));
}
function Users() {
  const rows = [['khalid@company.com', 'Pro', '1,120', '11', '12 Sep', 'active'], ['dev@shopfront.io', 'Starter', '204', '4', '01 Sep', 'active'], ['agency@studio.co', 'Business', '3,880', '62', '19 Sep', 'active'], ['test@example.com', 'Free', '0', '2', '—', 'exhausted'], ['old@legacy.co', 'Starter', '60', '1', '—', 'unverified']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Commerce",
    title: "Users",
    meta: "1,284 accounts \xB7 212 paying",
    actions: /*#__PURE__*/React.createElement("div", {
      style: {
        width: '260px'
      }
    }, /*#__PURE__*/React.createElement(Input, {
      placeholder: "Search by email"
    }))
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['Email', '1fr'], ['Plan', '110px'], ['Credits', '90px'], ['Audits', '80px'], ['Renews', '100px'], ['State', '110px'], ['', '180px']],
    rows: rows.map(r => [mono(r[0]), /*#__PURE__*/React.createElement(Badge, {
      tone: r[1] === 'Free' ? 'neutral' : 'accent'
    }, r[1]), num(r[2]), num(r[3]), num(r[4]), /*#__PURE__*/React.createElement(Badge, {
      tone: r[5] === 'active' ? 'success' : 'neutral'
    }, r[5]), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        gap: '6px'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Grant credits"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Change plan"))])
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '12px'
    }
  }, "Granting credits creates a non-expiring lot and is recorded in the audit log against your operator account."));
}
function Plans() {
  const rows = [['Free', '50, once', '—', '1', '7d', '$0'], ['Starter', '300 / mo', 'Readiness pass', '1', '30d', '$29'], ['Pro', '1,200 / mo', 'Repository, load generation', '3', '12mo', '$99'], ['Business', '4,000 / mo', 'Everything in Pro', '6', '24mo', '$299']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Commerce",
    title: "Plans",
    meta: "entitlements are enforced server-side before any charge",
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "New plan")
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['Plan', '130px'], ['Credits', '130px'], ['Entitlements', '1fr'], ['Concurrent', '110px'], ['Retention', '100px'], ['Price', '90px'], ['', '90px']],
    rows: rows.map(r => [/*#__PURE__*/React.createElement("strong", null, r[0]), mono(r[1]), r[2], num(r[3]), num(r[4]), num(r[5]), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Edit")])
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: '16px',
      marginTop: '18px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Credit schedule"
  }, [['One area', '10–25'], ['Full audit bundled', '80'], ['Re-check', '3'], ['Readiness pass', '60']].map(([a, b]) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '8px 0',
      borderTop: 'var(--border-width) solid var(--border-default)',
      font: 'var(--type-small)'
    }
  }, /*#__PURE__*/React.createElement("span", null, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)'
    }
  }, b)))), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Two credit lifetimes"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "Plan credits expire at renewal. Purchased top-ups never expire. Expiring lots are always drawn first, so nothing paid for is quietly destroyed.")), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Top-ups"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "Refused on the free tier, so it stays an evaluation rather than a route around subscribing."))));
}
function Margin() {
  const rows = [['impeccable', 'Design', '188', '$5.83', '$0.031', '61%'], ['contradiction-detector', 'Search visibility', '44', '$0.40', '$0.009', '74%'], ['playwright-runner', 'Testing', '96', '$0.58', '$0.006', '80%'], ['data-leak-scanner', 'Security', '412', '$1.65', '$0.004', '88%'], ['owasp-checker', 'Security', '412', '$0.82', '$0.002', '92%'], ['headers-checker', 'Security', '412', '$0.00', '$0.000', '100%']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Commerce",
    title: "Margin",
    meta: "attributable to the individual capability that caused the cost",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Export")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '16px',
      marginBottom: '18px'
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Credits recognised",
    value: "4,180"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Provider cost",
    value: "$41.22"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Gross margin",
    value: "78%",
    tone: "var(--sev-resolved)"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Refunded",
    value: "112 cr",
    sub: "platform faults only"
  })), /*#__PURE__*/React.createElement(Table, {
    cols: [['Capability', '1fr'], ['Area', '150px'], ['Runs', '80px'], ['Cost 24h', '100px'], ['Per run', '90px'], ['Margin', '90px']],
    rows: rows.map(r => [mono(r[0]), r[1], num(r[2]), num(r[3]), num(r[4]), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: parseInt(r[5]) < 70 ? 'var(--sev-medium)' : 'var(--sev-resolved)'
      }
    }, r[5])])
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '12px'
    }
  }, "Cost is recorded per attempt in integer micros against the invocation that produced it, so a low-margin area is always traceable to one capability."));
}
function Log() {
  const rows = [['23 Aug 14:41', 'khalid@webaudit.ai', 'capability.disable', 'playwright-runner', '203.0.113.4'], ['23 Aug 14:22', 'khalid@webaudit.ai', 'credits.grant', 'user 4f21 · +200', '203.0.113.4'], ['23 Aug 11:07', 'ops@webaudit.ai', 'provider.reorder', 'gemini → position 3', '198.51.100.9'], ['22 Aug 19:50', 'ops@webaudit.ai', 'plan.update', 'Pro concurrent 2 → 3', '198.51.100.9'], ['22 Aug 09:14', 'khalid@webaudit.ai', 'scan.cancel', 'b1994f02', '203.0.113.4']];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Governance",
    title: "Audit log",
    meta: "every operator action is recorded \xB7 append only",
    actions: /*#__PURE__*/React.createElement("div", {
      style: {
        width: '240px'
      }
    }, /*#__PURE__*/React.createElement(Input, {
      placeholder: "Filter by actor or action"
    }))
  }), /*#__PURE__*/React.createElement(Table, {
    cols: [['When', '150px'], ['Actor', '230px'], ['Action', '180px'], ['Subject', '1fr'], ['Source', '130px']],
    rows: rows.map(r => [mono(r[0]), mono(r[1]), /*#__PURE__*/React.createElement(Badge, {
      mono: true,
      pill: false
    }, r[2]), r[3], mono(r[4])])
  }));
}
function Settings() {
  const [flags, setFlags] = React.useState({
    'Repository input': true,
    'Archive upload': false,
    'Load generation': true,
    'Design questionnaire': true,
    'Readiness certificates': true
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AHead, {
    eyebrow: "Governance",
    title: "Settings",
    meta: "platform-wide switches",
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Save")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: "Feature switches"
  }, Object.entries(flags).map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)'
    }
  }, k), /*#__PURE__*/React.createElement("button", {
    onClick: () => setFlags(f => ({
      ...f,
      [k]: !v
    })),
    "aria-label": k,
    style: {
      marginLeft: 'auto',
      width: '36px',
      height: '20px',
      borderRadius: 'var(--radius-pill)',
      border: 0,
      background: v ? 'var(--accent)' : 'var(--border-default)',
      position: 'relative',
      cursor: 'pointer',
      transition: 'var(--transition-color)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '2px',
      left: v ? '18px' : '2px',
      width: '16px',
      height: '16px',
      borderRadius: 'var(--radius-pill)',
      background: '#fff',
      transition: 'left 150ms var(--easing)'
    }
  })))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '14px'
    }
  }, "Archive upload stays off until the sandbox runner is deployed. It returns 503 rather than falling back.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: "Limits"
  }, [['Scan timeout', '20 min'], ['Level 1 probe rate', '4 req/s'], ['Archive size ceiling', '200 MB'], ['Sandbox wall clock', '30 s'], ['Sandbox memory', '512 MB']].map(([a, b]) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '10px 0',
      borderTop: 'var(--border-width) solid var(--border-default)',
      font: 'var(--type-small)'
    }
  }, /*#__PURE__*/React.createElement("span", null, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)'
    }
  }, b)))), /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: "Retention"
  }, [['Free', '7 days'], ['Starter', '30 days'], ['Pro', '12 months'], ['Business', '24 months']].map(([a, b]) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '10px 0',
      borderTop: 'var(--border-width) solid var(--border-default)',
      font: 'var(--type-small)'
    }
  }, /*#__PURE__*/React.createElement("span", null, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)'
    }
  }, b))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '12px'
    }
  }, "Users are warned before anything is removed, and every export is self-contained.")))));
}
Object.assign(window, {
  Overview,
  Queue,
  Scans,
  Capabilities,
  Providers,
  Users,
  Plans,
  Margin,
  Log,
  Settings
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/AdminScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/AdminShell.jsx
try { (() => {
const {
  Button,
  Badge,
  Input,
  Card,
  Eyebrow
} = window.WebAuditAIDesignSystem_fa5933;
const AI = {
  overview: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  users: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  plans: 'M3 7h18v12H3Zm0 4h18M7 15h4',
  caps: 'M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z',
  providers: 'M12 3v6m0 6v6M5 8l7 4 7-4M5 16l7-4 7 4',
  queue: 'M4 6h16M4 12h16M4 18h10',
  margin: 'M4 18 10 12l4 4 6-8m0 0h-5m5 0v5',
  scans: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5.5 12.5L21 21',
  log: 'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-1.4 3.4 1 2-2 2-2-1L12 20l-1.4-1.6-2 1-2-2 1-2L4 12l1.6-1.4-1-2 2-2 2 1L12 4l1.4 1.6 2-1 2 2-1 2Z',
  toggle: 'M4 6h16M4 12h16M4 18h16',
  exit: 'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9'
};
function AIco({
  d,
  size = 17
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d
  }));
}
const AGROUPS = [['Platform', [['overview', 'Overview', AI.overview], ['queue', 'Queue', AI.queue], ['scans', 'Scans', AI.scans]]], ['Catalogue', [['caps', 'Capabilities', AI.caps], ['providers', 'AI providers', AI.providers]]], ['Commerce', [['users', 'Users', AI.users], ['plans', 'Plans', AI.plans], ['margin', 'Margin', AI.margin]]], ['Governance', [['log', 'Audit log', AI.log], ['settings', 'Settings', AI.settings]]]];
function ANavItem({
  open,
  active,
  label,
  icon,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    title: open ? undefined : label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '11px',
      width: '100%',
      border: 0,
      cursor: 'pointer',
      textAlign: 'left',
      padding: open ? '0 12px' : '0',
      height: '38px',
      justifyContent: open ? 'flex-start' : 'center',
      borderRadius: 'var(--radius-control)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      fontWeight: active ? 600 : 400,
      transition: 'var(--transition-color)',
      background: active ? 'rgba(255,255,255,.10)' : h ? 'rgba(255,255,255,.05)' : 'transparent',
      color: active ? '#fafafa' : '#9ca3af',
      boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(AIco, {
    d: icon
  }), open && /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    }
  }, label));
}
function AdminSidebar({
  view,
  setView,
  open,
  setOpen
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: open ? 248 : 60,
      flexShrink: 0,
      background: '#1f2937',
      borderInlineEnd: 'var(--border-width) solid #374151',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 150ms var(--easing)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: open ? '0 12px' : '0',
      justifyContent: open ? 'flex-start' : 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    "aria-label": open ? 'Collapse sidebar' : 'Expand sidebar',
    title: open ? 'Collapse sidebar' : 'Expand sidebar',
    style: {
      width: '34px',
      height: '34px',
      display: 'grid',
      placeItems: 'center',
      border: 0,
      background: 'transparent',
      borderRadius: 'var(--radius-control)',
      color: '#9ca3af',
      cursor: 'pointer',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(AIco, {
    d: AI.toggle,
    size: 19
  })), open && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      fontWeight: 700,
      letterSpacing: '-0.3px',
      color: '#fafafa'
    }
  }, "Web", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, "Audit")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      letterSpacing: '1px',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      border: 'var(--border-width) solid var(--accent)',
      padding: '1px 5px'
    }
  }, "operator"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: open ? '6px 10px' : '6px 8px'
    }
  }, AGROUPS.map(([g, items]) => /*#__PURE__*/React.createElement("div", {
    key: g,
    style: {
      marginBottom: '16px'
    }
  }, open && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: '10px',
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      color: '#6b7280',
      padding: '0 12px 6px'
    }
  }, g), !open && /*#__PURE__*/React.createElement("div", {
    style: {
      height: '1px',
      background: '#374151',
      margin: '0 6px 8px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    }
  }, items.map(([k, l, ic]) => /*#__PURE__*/React.createElement(ANavItem, {
    key: k,
    open: open,
    active: view === k,
    label: l,
    icon: ic,
    onClick: () => setView(k)
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: 'var(--border-width) solid #374151',
      padding: open ? '12px' : '12px 8px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, open && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: '#6b7280'
    }
  }, "every action here is recorded"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      justifyContent: open ? 'flex-start' : 'center'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "../app/index.html",
    title: "Back to dashboard",
    style: {
      width: '34px',
      height: '34px',
      display: 'grid',
      placeItems: 'center',
      border: 'var(--border-width) solid #374151',
      borderRadius: 'var(--radius-control)',
      color: '#9ca3af'
    }
  }, /*#__PURE__*/React.createElement(AIco, {
    d: AI.exit,
    size: 16
  })), open && /*#__PURE__*/React.createElement("a", {
    href: "../marketing/index.html",
    style: {
      font: 'var(--type-small)',
      color: '#9ca3af'
    }
  }, "Public site"))));
}
function AdminShell({
  view,
  setView,
  children
}) {
  const [open, setOpen] = React.useState(true);
  const [theme, setTheme] = useTheme();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--surface-sunken)'
    }
  }, /*#__PURE__*/React.createElement(AdminSidebar, {
    view: view,
    setView: setView,
    open: open,
    setOpen: setOpen
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '52px',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      background: 'var(--surface-page)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--text-muted)'
    }
  }, "operator \xB7 khalid@webaudit.ai"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "7 workers"), /*#__PURE__*/React.createElement(Badge, null, "3 queued"), /*#__PURE__*/React.createElement(ThemeToggle, null))), /*#__PURE__*/React.createElement("main", {
    dir: "ltr",
    style: {
      padding: '28px 24px 64px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1280px',
      margin: '0 auto'
    }
  }, children))));
}
function AHead({
  eyebrow,
  title,
  meta,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '16px',
      marginBottom: '22px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-h3)',
      margin: '8px 0 0',
      color: 'var(--text-strong)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      gap: '10px'
    }
  }, actions));
}
function Table({
  cols,
  rows
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-card)',
      background: 'var(--surface-page)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: cols.map(c => c[1]).join(' '),
      gap: '16px',
      padding: '12px 20px',
      background: 'var(--surface-raised)',
      borderBottom: 'var(--border-width) solid var(--border-default)'
    }
  }, cols.map(c => /*#__PURE__*/React.createElement("span", {
    key: c[0],
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: '11px',
      letterSpacing: '.8px',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, c[0]))), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: cols.map(c => c[1]).join(' '),
      gap: '16px',
      padding: '13px 20px',
      alignItems: 'center',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, r.map((cell, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      font: 'var(--type-small)',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, cell)))));
}
function Stat({
  label,
  value,
  sub,
  tone
}) {
  return /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    eyebrow: label
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h3)',
      fontVariantNumeric: 'tabular-nums',
      color: tone || 'var(--text-strong)'
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, sub));
}
Object.assign(window, {
  AdminShell,
  AdminSidebar,
  AHead,
  Table,
  Stat,
  AIco,
  AI
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/AdminShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Account.jsx
try { (() => {
const {
  Button,
  Badge,
  Input,
  Card,
  Eyebrow,
  StatRow
} = window.WebAuditAIDesignSystem_fa5933;
const {
  PageHead,
  Ico,
  I
} = window;

/* ---- Usage ---- */
const DAYS = [38, 0, 80, 12, 3, 83, 0, 20, 60, 80, 3, 0, 143, 80, 6, 20, 0, 83, 3, 80, 60, 0, 20, 83];
function UsageScreen() {
  const max = Math.max(...DAYS);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Usage",
    title: "Credit usage",
    meta: "current period \xB7 12 Aug \u2013 12 Sep 2026",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Export CSV")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '16px',
      marginBottom: '20px'
    }
  }, [['Spent this period', '980', 'of 1,200 plan credits'], ['Remaining', '1,120', '920 plan · 200 purchased'], ['Audits run', '11', '9 full · 2 partial'], ['Re-checks', '24', '72 credits · 7% of spend']].map(([k, v, s]) => /*#__PURE__*/React.createElement(Card, {
    key: k,
    padding: 20,
    eyebrow: k
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h3)',
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--text-strong)'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, s)))), /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: "Daily spend"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '4px',
      height: '150px',
      marginTop: '8px'
    }
  }, DAYS.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    title: d + ' credits',
    style: {
      flex: 1,
      height: Math.max(2, d / max * 100) + '%',
      background: d ? 'var(--accent)' : 'var(--border-default)',
      minHeight: '2px'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: '10px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "12 Aug"), /*#__PURE__*/React.createElement("span", null, "peak 143 cr"), /*#__PURE__*/React.createElement("span", null, "23 Aug"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "By area"
  }, [['Security', 280, 'var(--sev-critical)'], ['Performance', 220, 'var(--sev-high)'], ['Design', 180, 'var(--sev-medium)'], ['Testing', 180, 'var(--sev-low)'], ['Search visibility', 120, 'var(--sev-info)']].map(([n, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      padding: '9px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      font: 'var(--type-small)'
    }
  }, /*#__PURE__*/React.createElement("span", null, n), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)'
    }
  }, v, " cr")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '4px',
      background: 'var(--surface-sunken)',
      marginTop: '6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: v / 280 * 100 + '%',
      height: '100%',
      background: c
    }
  }))))), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Refunds and adjustments"
  }, [['23 Aug', 'Provider outage — design area', '+20'], ['19 Aug', 'Worker timeout — testing area', '+20'], ['14 Aug', 'Archive rejected before extraction', '+80']].map(([d, r, v]) => /*#__PURE__*/React.createElement("div", {
    key: d + r,
    style: {
      display: 'flex',
      gap: '12px',
      padding: '11px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--text-muted)',
      width: '56px'
    }
  }, d), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)'
    }
  }, r), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--sev-resolved)'
    }
  }, v))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      margin: '14px 0 0'
    }
  }, "You are never charged for our failures. These returned automatically."))));
}

/* ---- Profile ---- */
function Row({
  label,
  children,
  note
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      gap: '20px',
      padding: '18px 0',
      borderTop: 'var(--border-width) solid var(--border-default)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, label), note && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontSize: '13px',
      color: 'var(--text-muted)',
      marginTop: '4px',
      textWrap: 'pretty'
    }
  }, note)), /*#__PURE__*/React.createElement("div", null, children));
}
function ProfileScreen() {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const setDark = v => setTheme(v ? 'dark' : 'light');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Profile",
    title: "Khalid Ahmed",
    meta: "you@company.com \xB7 Pro plan \xB7 member since 14 Feb 2026",
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Save changes")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: '20px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 26,
    title: "Account"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Name"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '360px'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: "Khalid Ahmed"
  }))), /*#__PURE__*/React.createElement(Row, {
    label: "Email",
    note: "Changing this sends a new verification link."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '360px'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: "you@company.com",
    type: "email"
  }))), /*#__PURE__*/React.createElement(Row, {
    label: "Password",
    note: "At least 12 characters."
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "Change password")), /*#__PURE__*/React.createElement(Row, {
    label: "Appearance",
    note: "Dark-mode severity values are not contrast-verified yet."
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDark(!dark),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      height: '36px',
      padding: '0 14px',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-control)',
      background: 'var(--surface-page)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      cursor: 'pointer',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '32px',
      height: '18px',
      borderRadius: 'var(--radius-pill)',
      background: dark ? 'var(--accent)' : 'var(--border-default)',
      position: 'relative',
      transition: 'var(--transition-color)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '2px',
      left: dark ? '16px' : '2px',
      width: '14px',
      height: '14px',
      borderRadius: 'var(--radius-pill)',
      background: '#fff',
      transition: 'left 150ms var(--easing)'
    }
  })), dark ? 'Dark' : 'Light'))), /*#__PURE__*/React.createElement(Card, {
    padding: 26,
    title: "Connected accounts"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "GitHub",
    note: "Grants repository input. Revoking it refunds any scan that then fails."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "Connected"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)'
    }
  }, "khalid-a"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Disconnect"))), /*#__PURE__*/React.createElement(Row, {
    label: "Tokens",
    note: "Stored encrypted. There is no plaintext column."
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-muted)'
    }
  }, "3 tokens \xB7 last used 23 Aug 14:02"))), /*#__PURE__*/React.createElement(Card, {
    padding: 26,
    title: "Sessions"
  }, [['macOS · Chrome', 'Riyadh · now', true], ['iOS · Safari', 'Riyadh · 2 days ago', false], ['Linux · Firefox', 'Frankfurt · 11 days ago', false]].map(([d, w, cur]) => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '13px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 500
    }
  }, d), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, w), cur ? /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "This device") : /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Revoke")))), /*#__PURE__*/React.createElement(Card, {
    padding: 26,
    title: "Delete account",
    accentRule: "var(--sev-critical)"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '0 0 16px',
      maxWidth: '62ch',
      textWrap: 'pretty'
    }
  }, "Deletion cascades: every scan, report, issue, verification attempt and stored artifact is removed. Purchased credits are forfeited. This cannot be undone."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "Delete my account"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Plan"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h3)',
      color: 'var(--text-strong)'
    }
  }, "Pro"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '6px 0 14px'
    }
  }, "1,200 credits a month \xB7 renews 12 September"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    size: "sm"
  }, "Manage plan")), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Retention"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0
    }
  }, "Reports are kept 12 months on Pro. We warn you before anything is removed, and an export is always self-contained.")))));
}
Object.assign(window, {
  UsageScreen,
  ProfileScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Account.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Screens.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Badge,
  Input,
  Card,
  Eyebrow,
  SeverityBadge,
  StatRow,
  ScoreArc,
  ModuleStatus,
  IssueCard,
  ProgressRow,
  VerdictPanel,
  AttributionMark
} = window.WebAuditAIDesignSystem_fa5933;
const {
  PageHead
} = window;
const AREAS = [['Performance', 20], ['Security', 25], ['Design', 20], ['Testing', 20], ['Search visibility', 10]];
const AREA_KEY = {
  'Performance': 'a_perf',
  'Security': 'a_sec',
  'Design': 'a_des',
  'Testing': 'a_test',
  'Search visibility': 'a_seo'
};

/* ---- New scan ---- */
function ScanScreen({
  onStart
}) {
  const [t] = useT();
  const [tab, setTab] = React.useState('url');
  const [sel, setSel] = React.useState(AREAS.map(a => a[0]));
  const all = sel.length === 5;
  const cost = all ? 80 : AREAS.filter(a => sel.includes(a[0])).reduce((s, a) => s + a[1], 0);
  const toggle = n => setSel(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);
  const tabs = [['url', t('tab_url')], ['repo', t('tab_repo')], ['archive', t('tab_archive')]];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: t('scan_eyebrow'),
    title: t('scan_title')
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: '20px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 24
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      marginBottom: '20px'
    }
  }, tabs.map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      background: 'none',
      border: 0,
      borderBottom: '2px solid ' + (tab === k ? 'var(--accent)' : 'transparent'),
      marginBottom: '-1px',
      padding: '10px 16px',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      fontWeight: tab === k ? 600 : 400,
      color: tab === k ? 'var(--text-strong)' : 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, l))), tab === 'url' && /*#__PURE__*/React.createElement(Input, {
    prefix: "https://",
    placeholder: t('url_ph')
  }), tab === 'repo' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }
  }, ['acme/storefront', 'acme/marketing-site', 'acme/checkout'].map((r, i) => /*#__PURE__*/React.createElement("label", {
    key: r,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-control)',
      padding: '12px 14px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "repo",
    defaultChecked: !i
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '14px'
    }
  }, r), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, "main")))), tab === 'archive' && /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) dashed var(--border-default)',
      borderRadius: 'var(--radius-card)',
      padding: '36px',
      textAlign: 'center',
      background: 'var(--surface-raised)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '15px',
      fontWeight: 600
    }
  }, t('drop_archive')), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, t('drop_note'))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '28px'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, t('areas_label')), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '12px',
      border: 'var(--border-width) solid var(--border-default)'
    }
  }, AREAS.map(([n, c], i) => /*#__PURE__*/React.createElement("label", {
    key: n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: sel.includes(n),
    onChange: () => toggle(n)
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      fontWeight: 500
    }
  }, t(AREA_KEY[n])), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-muted)'
    }
  }, c, " cr")))))), /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: t('quote')
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, cost), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)'
    }
  }, t('credits'))), all && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--sev-resolved)',
      marginTop: '6px'
    }
  }, t('quote_bundled')), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '16px 0',
      textWrap: 'pretty'
    }
  }, t('quote_note')), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    disabled: !sel.length,
    onClick: onStart
  }, t('accept_run')))));
}

/* ---- Live progress ---- */
function ProgressScreen({
  onDone
}) {
  const [t, setT] = React.useState(102);
  React.useEffect(() => {
    const i = setInterval(() => setT(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const mm = Math.floor(t / 60),
    ss = String(t % 60).padStart(2, '0');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Live scan",
    title: "acme.com",
    meta: "scan 4f21a8c9 \xB7 started 1 minute ago",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Cancel scan")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '896px'
    }
  }, /*#__PURE__*/React.createElement(ProgressRow, {
    phase: "Running security checks",
    elapsed: mm + ':' + ss,
    done: 2,
    total: 5
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Search visibility",
    state: "complete",
    issues: 3
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Performance",
    state: "complete",
    issues: 4
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Security",
    state: "running",
    detail: "Inspecting response headers"
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Design",
    state: "waiting"
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: "Testing",
    state: "waiting"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '12px'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    onClick: onDone
  }, "Open report"))));
}
const ISSUES = [{
  severity: 'critical',
  area: 'Security',
  title: 'No Strict-Transport-Security header on the primary host',
  location: 'strict-transport-security',
  attribution: 'measured',
  description: 'The response carries no HSTS header, so a first visit over http is downgradeable before any redirect fires.',
  prompt: 'Add a Strict-Transport-Security header with max-age=31536000; includeSubDomains to all responses from acme.com.'
}, {
  severity: 'critical',
  area: 'Security',
  title: 'Dependency with a known remote-code-execution advisory',
  location: 'package-lock.json · serialize-javascript@3.1.0',
  attribution: 'measured',
  description: 'GHSA-hxcc-f52p-wc94. A fixed version is available and the upgrade is semver-minor.',
  prompt: 'Upgrade serialize-javascript to ^6.0.2 and re-run the lockfile.'
}, {
  severity: 'high',
  area: 'Performance',
  title: 'Largest Contentful Paint is 4.1s on a throttled 4G profile',
  location: '/ · hero image',
  attribution: 'measured',
  description: 'The hero image is 1.4MB and is not preloaded. LCP threshold for a pass is 2.5s.',
  prompt: 'Compress the hero image to webp under 200KB and add a preload link for it.'
}, {
  severity: 'high',
  area: 'Design',
  title: 'Primary CTA and severity chips are the same hue',
  location: '.btn-primary, .chip-high',
  attribution: 'ai-judgment',
  description: 'Two different meanings share one colour, so a badge and an action are hard to tell apart at a glance.',
  prompt: 'Give severity chips a distinct hue from the CTA accent.'
}, {
  severity: 'medium',
  area: 'Search visibility',
  title: 'Meta description missing on three routes',
  location: '/pricing, /docs, /changelog',
  attribution: 'measured',
  description: 'Search engines will synthesise a description from body copy.',
  prompt: 'Add a unique meta description to /pricing, /docs and /changelog.'
}, {
  severity: 'low',
  area: 'Search visibility',
  title: 'Heading order skips from h1 to h3',
  location: 'main > section:nth-of-type(2)',
  attribution: 'measured',
  description: 'Assistive technology reports a gap in the document outline.',
  prompt: 'Change the section heading from h3 to h2.'
}];

/* ---- Report ---- */
function ReportScreen() {
  const [area, setArea] = React.useState('All');
  const tabs = ['All', 'Security', 'Performance', 'Design', 'Testing', 'Search visibility'];
  const list = area === 'All' ? ISSUES : ISSUES.filter(i => i.area === area);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Report",
    title: "acme.com",
    meta: "scan 4f21a8c9 \xB7 completed 23 Aug 2026, 14:02 \xB7 3m 41s",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Export"), /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Re-audit"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      gap: '20px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(ScoreArc, {
    score: 62,
    delta: null
  }))), /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    title: "Areas"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement(ModuleStatus, {
    compact: true,
    area: "Security",
    state: "complete",
    issues: 2
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    compact: true,
    area: "Performance",
    state: "complete",
    issues: 1
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    compact: true,
    area: "Design",
    state: "complete",
    issues: 1
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    compact: true,
    area: "Search visibility",
    state: "complete",
    issues: 2
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    compact: true,
    area: "Testing",
    state: "degraded",
    detail: "2 of 5 checks skipped"
  })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, {
    padding: 24,
    title: "Executive summary",
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-primary)',
      margin: 0,
      maxWidth: '70ch',
      textWrap: 'pretty'
    }
  }, "Two critical security findings block a launch: the primary host serves no HSTS header, and a dependency carries a remote-code-execution advisory with a semver-minor fix available. Performance is close \u2014 LCP is 4.1s against a 2.5s threshold, driven almost entirely by an uncompressed hero image. Testing is degraded: the functional runner was unavailable, so 2 of 5 flows were not exercised and you were not charged for them."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement(StatRow, {
    items: [{
      value: 2,
      label: 'critical'
    }, {
      value: 2,
      label: 'high'
    }, {
      value: 1,
      label: 'medium'
    }, {
      value: 1,
      label: 'low'
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2px',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      marginBottom: '16px',
      flexWrap: 'wrap'
    }
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setArea(t),
    style: {
      background: 'none',
      border: 0,
      borderBottom: '2px solid ' + (area === t ? 'var(--accent)' : 'transparent'),
      marginBottom: '-1px',
      padding: '10px 14px',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      fontWeight: area === t ? 600 : 400,
      color: area === t ? 'var(--text-strong)' : 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }
  }, list.map((i, k) => /*#__PURE__*/React.createElement(IssueCard, _extends({
    key: k
  }, i)))))));
}

/* ---- Fixes board ---- */
function FixesScreen() {
  const [state, setState] = React.useState({
    0: 'open',
    1: 'open',
    2: 'resolved',
    3: 'open',
    4: 'failed',
    5: 'resolved'
  });
  const assert = k => setState(s => ({
    ...s,
    [k]: s[k] === 'open' ? k % 2 ? 'failed' : 'resolved' : s[k]
  }));
  const counts = Object.values(state);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Fixes",
    title: "acme.com",
    meta: "6 issues \xB7 last verified 2 minutes ago",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Re-check all \u2014 18 cr")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement(StatRow, {
    items: [{
      value: ISSUES.filter((i, k) => state[k] !== 'resolved' && i.severity === 'critical').length,
      label: 'critical'
    }, {
      value: ISSUES.filter((i, k) => state[k] !== 'resolved' && i.severity === 'high').length,
      label: 'high'
    }, {
      value: ISSUES.filter((i, k) => state[k] !== 'resolved' && ['medium', 'low'].includes(i.severity)).length,
      label: 'medium and low'
    }, {
      value: counts.filter(c => c === 'resolved').length,
      label: 'resolved'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)',
      background: 'var(--surface-page)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden'
    }
  }, ISSUES.map((i, k) => {
    const st = state[k];
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        padding: '16px 20px',
        borderTop: k ? 'var(--border-width) solid var(--border-default)' : 'none',
        borderLeft: '3px solid var(--sev-' + (st === 'resolved' ? 'resolved' : i.severity) + ')',
        background: st === 'resolved' ? 'var(--sev-resolved-bg)' : 'var(--surface-page)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(SeverityBadge, {
      level: st === 'resolved' ? 'resolved' : i.severity
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '15px',
        fontWeight: 600,
        color: 'var(--text-strong)'
      }
    }, i.title), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }
    }, st === 'resolved' && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-small)',
        color: 'var(--sev-resolved)',
        fontFamily: 'var(--font-mono)'
      }
    }, "verified 14:31"), /*#__PURE__*/React.createElement("button", {
      onClick: () => assert(k),
      disabled: st === 'resolved',
      style: {
        height: '36px',
        padding: '0 14px',
        borderRadius: 'var(--radius-control)',
        border: 'var(--border-width) solid var(--border-default)',
        background: 'var(--surface-page)',
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        cursor: st === 'resolved' ? 'default' : 'pointer',
        opacity: st === 'resolved' ? .4 : 1
      }
    }, st === 'resolved' ? 'Verified' : 'I fixed this — 3 cr'))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: 'var(--text-zinc)',
        marginTop: '8px'
      }
    }, i.location), st === 'failed' && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: '10px',
        background: 'var(--sev-critical-bg)',
        border: 'var(--border-width) solid var(--sev-critical)',
        borderRadius: 'var(--radius-control)',
        padding: '12px 14px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--type-small)',
        fontWeight: 700,
        color: 'var(--sev-critical)',
        marginBottom: '6px'
      }
    }, "Re-check failed at 14:29 \u2014 current evidence"), /*#__PURE__*/React.createElement("pre", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-zinc)',
        margin: 0,
        whiteSpace: 'pre-wrap'
      }
    }, "GET https://acme.com/", '\n', "strict-transport-security: (absent)", '\n', "expected: max-age >= 31536000")));
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '14px'
    }
  }, "Marking an issue fixed runs one narrow check. It turns green only when that check passes."));
}

/* ---- Readiness ---- */
function ReadinessScreen() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Readiness",
    title: "Production readiness pass",
    meta: "fresh full re-audit \xB7 baseline scan 4f21a8c9 \xB7 60 credits"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(VerdictPanel, {
    verdict: "go",
    score: 91,
    baseline: 62,
    areas: [{
      name: 'Security',
      score: 96,
      threshold: 80,
      pass: true
    }, {
      name: 'Performance',
      score: 88,
      threshold: 80,
      pass: true
    }, {
      name: 'Design',
      score: 84,
      threshold: 70,
      pass: true
    }, {
      name: 'Testing',
      score: 90,
      threshold: 80,
      pass: true
    }, {
      name: 'Search visibility',
      score: 95,
      threshold: 70,
      pass: true
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Against baseline"
  }, [['Resolved', '5 issues', 'var(--sev-resolved)'], ['Regressed', '0 areas', 'var(--text-secondary)'], ['New findings', '1 low', 'var(--sev-low)']].map(([a, b, c]) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '10px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)'
    }
  }, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: c
    }
  }, b)))), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Certificate"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '0 0 16px'
    }
  }, "A shareable artifact recording that acme.com passed every threshold on 23 August 2026."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true
  }, "Download certificate")))));
}

/* ---- Billing ---- */
function BillingScreen() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Billing and plans",
    title: "Pro \u2014 1,200 credits a month",
    meta: "renews 12 September 2026",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Cancel subscription")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '11px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '12px'
    }
  }, "Change plan"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '14px'
    }
  }, [["Free", "$0", "50, once", ["1 concurrent audit", "7-day retention"]], ["Starter", "$29", "300 / mo", ["1 concurrent audit", "30-day retention"]], ["Pro", "$99", "1,200 / mo", ["3 concurrent audits", "12-month retention", "Repository input"]], ["Business", "$299", "4,000 / mo", ["6 concurrent audits", "24-month retention"]]].map(([n, p, c, fe]) => {
    const now = n === 'Pro';
    return /*#__PURE__*/React.createElement("div", {
      key: n,
      style: {
        border: 'var(--border-width) solid ' + (now ? 'var(--accent)' : 'var(--border-default)'),
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface-page)',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '16px',
        fontWeight: 700
      }
    }, n), now && /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, "Current")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '22px',
        fontWeight: 700
      }
    }, p), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-small)',
        color: 'var(--text-muted)'
      }
    }, " / mo")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }
    }, c), /*#__PURE__*/React.createElement("div", {
      style: {
        borderTop: 'var(--border-width) solid var(--border-default)',
        paddingTop: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1
      }
    }, fe.map(x => /*#__PURE__*/React.createElement("span", {
      key: x,
      style: {
        font: 'var(--type-small)',
        fontSize: '13px',
        color: 'var(--text-secondary)'
      }
    }, x))), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      fullWidth: true,
      disabled: now
    }, now ? 'Current plan' : 'Switch'));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: '16px',
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    eyebrow: "Plan credits"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "920"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, "Expire at renewal. Spent first.")), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    eyebrow: "Purchased credits"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "200"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, "Never expire.")), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    eyebrow: "Top up"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      marginTop: '4px'
    }
  }, ['250', '1,000'].map(n => /*#__PURE__*/React.createElement(Button, {
    key: n,
    variant: "secondary",
    size: "sm"
  }, n, " cr"))), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '12px'
    }
  }, "Paid plans only."))), /*#__PURE__*/React.createElement(Card, {
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 22px',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      fontSize: '16px',
      fontWeight: 600
    }
  }, "Ledger"), [['23 Aug 14:02', 'Full audit — acme.com', '−80', 'plan'], ['23 Aug 14:31', 'Re-check — HSTS header', '−3', 'plan'], ['23 Aug 14:33', 'Refund — provider outage', '+20', 'plan'], ['21 Aug 09:10', 'Top-up purchase', '+200', 'purchased'], ['12 Aug 00:00', 'Monthly renewal', '+1,200', 'plan']].map(([d, a, c, k], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '14px 22px',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-muted)',
      width: '110px'
    }
  }, d), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)'
    }
  }, a), /*#__PURE__*/React.createElement(Badge, null, k), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '14px',
      color: c.startsWith('+') ? 'var(--sev-resolved)' : 'var(--text-primary)'
    }
  }, c)))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '14px'
    }
  }, "You are never charged for our failures. Platform faults, provider outages and internal errors refund or never debit."));
}

/* ---- Admin ---- */
function AdminScreen() {
  const [caps, setCaps] = React.useState({
    'headers-checker': true,
    'ssl-analyzer': true,
    'lighthouse-analyzer': true,
    'playwright-runner': false,
    'dependency-scanner': true
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHead, {
    eyebrow: "Operator",
    title: "Platform",
    meta: "7 workers \xB7 3 queued \xB7 1 provider degraded"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 22px',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      fontSize: '16px',
      fontWeight: 600
    }
  }, "Capabilities"), Object.entries(caps).map(([n, on], i) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '13px 22px',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, n), /*#__PURE__*/React.createElement(Badge, {
    tone: on ? 'success' : 'neutral'
  }, on ? 'enabled' : 'disabled'), /*#__PURE__*/React.createElement("button", {
    onClick: () => setCaps(c => ({
      ...c,
      [n]: !c[n]
    })),
    style: {
      marginLeft: 'auto',
      height: '32px',
      padding: '0 12px',
      borderRadius: 'var(--radius-control)',
      border: 'var(--border-width) solid var(--border-default)',
      background: 'var(--surface-page)',
      fontFamily: 'var(--font-sans)',
      fontSize: '13px',
      cursor: 'pointer'
    }
  }, on ? 'Disable' : 'Enable'))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      borderTop: 'var(--border-width) solid var(--border-default)',
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, "Disabling any single capability still lets every audit complete \u2014 the area reports it unavailable.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Margin \u2014 last 24h"
  }, [['Revenue recognised', '4,180 cr'], ['Provider cost', '$41.22'], ['Highest-cost capability', 'impeccable · $0.031/run'], ['Gross margin', '78%']].map(([a, b]) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '10px 0',
      borderTop: 'var(--border-width) solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)'
    }
  }, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, b)))), /*#__PURE__*/React.createElement(Card, {
    padding: 22,
    title: "Provider chain"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, [['claude', 'healthy', 'var(--sev-resolved)'], ['openai', 'degraded', 'var(--sev-medium)'], ['gemini', 'healthy', 'var(--sev-resolved)']].map(([n, s, c]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      border: 'var(--border-width) solid var(--border-default)',
      padding: '10px 14px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      font: 'var(--type-small)',
      fontWeight: 700,
      color: c
    }
  }, s)))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      margin: '12px 0 0'
    }
  }, "A chain spanning fewer than two vendors is refused at startup.")))));
}
Object.assign(window, {
  ScanScreen,
  ProgressScreen,
  ReportScreen,
  FixesScreen,
  ReadinessScreen,
  BillingScreen,
  AdminScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Sidebar.jsx
try { (() => {
const {
  Button,
  Badge,
  Eyebrow
} = window.WebAuditAIDesignSystem_fa5933;
const I = {
  scan: 'M12 5v14M5 12h14',
  progress: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  report: 'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5',
  fixes: 'm4 12 5 5L20 6',
  readiness: 'M6 21V4h12l-2 4 2 4H6',
  usage: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  billing: 'M3 7h18v12H3Zm0 4h18M7 15h4',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  admin: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7Z',
  toggle: 'M4 6h16M4 12h16M4 18h16',
  chevron: 'm9 6 6 6-6 6'
};
function Ico({
  d,
  size = 17
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d
  }));
}
const GROUPS = [['g_audits', [['scan', 'n_scan', I.scan], ['progress', 'n_progress', I.progress], ['report', 'n_report', I.report], ['fixes', 'n_fixes', I.fixes], ['readiness', 'n_readiness', I.readiness]]], ['g_account', [['usage', 'n_usage', I.usage], ['billing', 'n_billing', I.billing], ['profile', 'n_profile', I.profile]]]];
function NavItem({
  open,
  active,
  label,
  icon,
  onClick,
  badge
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    title: open ? undefined : label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '11px',
      width: '100%',
      border: 0,
      cursor: 'pointer',
      textAlign: 'left',
      padding: open ? '0 12px' : '0',
      height: '38px',
      justifyContent: open ? 'flex-start' : 'center',
      borderRadius: 'var(--radius-control)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      fontWeight: active ? 600 : 400,
      transition: 'var(--transition-color)',
      background: active ? 'var(--surface-page)' : h ? 'rgba(255,255,255,.55)' : 'transparent',
      color: active ? 'var(--text-strong)' : 'var(--text-secondary)',
      boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    d: icon
  }), open && /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    }
  }, label), open && badge != null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--sev-critical)'
    }
  }, badge));
}
function Sidebar({
  view,
  setView,
  open,
  setOpen
}) {
  const [t] = useT();
  const W = open ? 248 : 60;
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: W,
      flexShrink: 0,
      background: 'var(--surface-raised)',
      borderInlineEnd: 'var(--border-width) solid var(--border-default)',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 150ms var(--easing)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: open ? '0 12px' : '0',
      justifyContent: open ? 'flex-start' : 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    "aria-label": open ? 'Collapse sidebar' : 'Expand sidebar',
    title: open ? 'Collapse sidebar' : 'Expand sidebar',
    style: {
      width: '34px',
      height: '34px',
      display: 'grid',
      placeItems: 'center',
      border: 0,
      background: 'transparent',
      borderRadius: 'var(--radius-control)',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      transition: 'var(--transition-color)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    d: I.toggle,
    size: 19
  })), open && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      fontWeight: 700,
      letterSpacing: '-0.3px',
      color: 'var(--text-strong)',
      whiteSpace: 'nowrap'
    }
  }, "Web", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, "Audit"), " AI")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: open ? '6px 10px' : '6px 8px'
    }
  }, GROUPS.map(([g, items]) => /*#__PURE__*/React.createElement("div", {
    key: g,
    style: {
      marginBottom: '16px'
    }
  }, open && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '10px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      padding: '0 12px 6px'
    }
  }, t(g)), !open && /*#__PURE__*/React.createElement("div", {
    style: {
      height: '1px',
      background: 'var(--border-default)',
      margin: '0 6px 8px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    }
  }, items.map(([k, l, ic]) => /*#__PURE__*/React.createElement(NavItem, {
    key: k,
    open: open,
    active: view === k,
    label: t(l),
    icon: ic,
    onClick: () => setView(k),
    badge: k === 'fixes' ? 4 : null
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: 'var(--border-width) solid var(--border-default)',
      padding: open ? '12px' : '12px 8px',
      flexShrink: 0
    }
  }, open && /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-card)',
      background: 'var(--surface-page)',
      padding: '12px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '15px',
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "1,120"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      fontSize: '12px',
      color: 'var(--text-secondary)'
    }
  }, t('credits_left'))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '4px',
      background: 'var(--surface-sunken)',
      marginTop: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '77%',
      height: '100%',
      background: 'var(--accent)'
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('billing'),
    style: {
      marginTop: '10px',
      width: '100%',
      height: '30px',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-control)',
      background: 'var(--surface-page)',
      fontFamily: 'var(--font-sans)',
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, t('top_up'))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(ThemeToggle, {
    label: true
  })), /*#__PURE__*/React.createElement(LangToggle, null), /*#__PURE__*/React.createElement("a", {
    href: "../admin/index.html",
    title: "Admin console",
    style: {
      width: '36px',
      height: '36px',
      display: 'grid',
      placeItems: 'center',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-control)',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    d: I.admin,
    size: 16
  }))), !open && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      placeItems: 'center',
      gap: '6px',
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement(ThemeToggle, {
    compact: true
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('profile'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      width: '100%',
      border: 0,
      background: 'transparent',
      cursor: 'pointer',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '30px',
      height: '30px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-inverse)',
      color: '#fafafa',
      display: 'grid',
      placeItems: 'center',
      fontSize: '12px',
      fontWeight: 600,
      flexShrink: 0
    }
  }, "KA"), open && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'left',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--text-strong)',
      whiteSpace: 'nowrap'
    }
  }, "Khalid Ahmed"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap'
    }
  }, "Pro plan")), open && /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    d: I.chevron,
    size: 14
  })))));
}

// Views whose copy is translated. Everything else is still English, so it is pinned to LTR
// rather than being mirrored by the global dir=rtl.
const TRANSLATED = ['scan'];
function AppShell({
  view,
  setView,
  children
}) {
  const [open, setOpen] = React.useState(true);
  const [, lang] = useT();
  const bodyDir = lang === 'ar' && !TRANSLATED.includes(view) ? 'ltr' : undefined;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--surface-sunken)'
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    view: view,
    setView: setView,
    open: open,
    setOpen: setOpen
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("main", {
    dir: bodyDir,
    style: {
      padding: '32px 32px 64px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1280px',
      margin: '0 auto'
    }
  }, children))));
}
function PageHead({
  eyebrow,
  title,
  meta,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '16px',
      marginBottom: '24px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-h3)',
      margin: '8px 0 0',
      color: 'var(--text-strong)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-secondary)',
      marginTop: '6px'
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      gap: '10px'
    }
  }, actions));
}
Object.assign(window, {
  AppShell,
  Sidebar,
  PageHead,
  Ico,
  I
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/AuthPages.jsx
try { (() => {
const {
  Button,
  Input,
  Card,
  Badge
} = window.WebAuditAIDesignSystem_fa5933;
const {
  PublicPage
} = window;
function AuthFrame({
  title,
  lead,
  children,
  foot
}) {
  const [, lang] = useT();
  return /*#__PURE__*/React.createElement(PublicPage, {
    tint: "var(--surface-raised)"
  }, /*#__PURE__*/React.createElement("div", {
    dir: lang === 'ar' ? 'ltr' : undefined,
    style: {
      display: 'grid',
      placeItems: 'center',
      padding: '72px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '420px',
      maxWidth: '100%'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 30
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)',
      margin: '0 0 8px'
    }
  }, title), lead && /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '0 0 22px',
      textWrap: 'pretty'
    }
  }, lead), children), foot && /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      textAlign: 'center',
      marginTop: '18px'
    }
  }, foot))));
}
function Field({
  label,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 500,
      color: 'var(--text-primary)',
      marginBottom: '6px'
    }
  }, label), /*#__PURE__*/React.createElement(Input, rest));
}
function Divider() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      margin: '20px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: '1px',
      background: 'var(--border-default)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, "or"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: '1px',
      background: 'var(--border-default)'
    }
  }));
}
function LoginPage() {
  return /*#__PURE__*/React.createElement(AuthFrame, {
    title: "Sign in",
    lead: "Your audits and fixes boards are where you left them.",
    foot: /*#__PURE__*/React.createElement("span", null, "No account? ", /*#__PURE__*/React.createElement("a", {
      href: "Register.html"
    }, "Start free"), " \u2014 50 credits, no card.")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    type: "email",
    placeholder: "you@company.com"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      fontWeight: 500
    }
  }, "Password"), /*#__PURE__*/React.createElement("a", {
    href: "Forgot.html",
    style: {
      marginLeft: 'auto',
      font: 'var(--type-small)'
    }
  }, "Forgot?")), /*#__PURE__*/React.createElement(Input, {
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  })), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    href: "../app/index.html"
  }, "Sign in")), /*#__PURE__*/React.createElement(Divider, null), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    href: "../app/index.html"
  }, "Continue with GitHub"));
}
function RegisterPage() {
  return /*#__PURE__*/React.createElement(AuthFrame, {
    title: "Create an account",
    lead: "Fifty credits, no card. Enough to audit two or three areas of your real site.",
    foot: /*#__PURE__*/React.createElement("span", null, "Already have an account? ", /*#__PURE__*/React.createElement("a", {
      href: "Login.html"
    }, "Sign in"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Name",
    placeholder: "Khalid Ahmed"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Work email",
    type: "email",
    placeholder: "you@company.com"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Password",
    type: "password",
    placeholder: "At least 12 characters"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, "We send one verification email. You cannot sign in until it is confirmed."), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    href: "Verify.html"
  }, "Create account")), /*#__PURE__*/React.createElement(Divider, null), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    href: "../app/index.html"
  }, "Continue with GitHub"));
}
function VerifyPage() {
  return /*#__PURE__*/React.createElement(AuthFrame, {
    title: "Check your email",
    lead: "We sent a verification link to you@company.com. It expires in 24 hours.",
    foot: /*#__PURE__*/React.createElement("span", null, "Wrong address? ", /*#__PURE__*/React.createElement("a", {
      href: "Register.html"
    }, "Start again"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-sunken)',
      border: 'var(--border-width) solid var(--border-default)',
      padding: '14px 16px',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-zinc)',
      marginBottom: '18px'
    }
  }, "you@company.com"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true
  }, "Resend the email"));
}
function ForgotPage() {
  return /*#__PURE__*/React.createElement(AuthFrame, {
    title: "Reset your password",
    lead: "Enter the address on your account and we will send a single-use link.",
    foot: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("a", {
      href: "Login.html"
    }, "Back to sign in"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    type: "email",
    placeholder: "you@company.com"
  }), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    href: "Reset.html"
  }, "Send reset link")));
}
function ResetPage() {
  const [pw, setPw] = React.useState('');
  const ok = pw.length >= 12;
  return /*#__PURE__*/React.createElement(AuthFrame, {
    title: "Choose a new password",
    lead: "This link is single-use. Signing in again revokes every other session.",
    foot: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("a", {
      href: "Login.html"
    }, "Back to sign in"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "New password",
    type: "password",
    placeholder: "At least 12 characters",
    value: pw,
    onChange: e => setPw(e.target.value)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Confirm new password",
    type: "password",
    placeholder: "Repeat it"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      font: 'var(--type-small)',
      color: ok ? 'var(--sev-resolved)' : 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: ok ? 'm4 12 5 5L20 6' : 'M5 12h14'
  })), "12 characters minimum"), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    disabled: !ok,
    href: ok ? 'Login.html' : undefined
  }, "Set password and sign in")));
}
Object.assign(window, {
  LoginPage,
  RegisterPage,
  VerifyPage,
  ForgotPage,
  ResetPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/AuthPages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Landing.jsx
try { (() => {
const {
  Button,
  Input,
  Badge,
  StatRow,
  Eyebrow,
  TwoToneHeading,
  PromoBar,
  Card,
  SeverityBadge,
  ScoreArc,
  ModuleStatus
} = window.WebAuditAIDesignSystem_fa5933;
const {
  PublicPage
} = window;
function Wrap({
  tint,
  children,
  pad = '88px 24px'
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: tint || 'var(--surface-page)',
      padding: pad
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '896px',
      margin: '0 auto'
    }
  }, children));
}
function Hero() {
  const [t] = useT();
  const [url, setUrl] = React.useState('');
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      padding: '88px 24px 96px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--wash-tl)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: '896px',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(TwoToneHeading, {
    lead: t('hero_lead'),
    accent: t('hero_accent')
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-secondary)',
      maxWidth: '62ch',
      margin: '20px auto 0',
      textWrap: 'pretty'
    }
  }, t('hero_sub')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      maxWidth: '620px',
      margin: '36px auto 0',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 320px'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    prefix: "https://",
    placeholder: t('url_ph'),
    value: url,
    onChange: e => setUrl(e.target.value)
  })), /*#__PURE__*/React.createElement(Button, {
    href: "Register.html"
  }, t('hero_cta'))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '20px',
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(StatRow, {
    align: "center",
    items: [{
      value: '50',
      label: t('stat_credits')
    }, {
      value: '5',
      label: t('stat_areas')
    }, {
      value: '3',
      label: t('stat_recheck')
    }]
  }))));
}
function Difference() {
  const [t] = useT();
  return /*#__PURE__*/React.createElement(Wrap, {
    tint: "var(--surface-raised)"
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, t('diff_eyebrow')), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      margin: '12px 0 0'
    }
  }, t('diff_h2')), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body-lg)',
      color: 'var(--text-secondary)',
      maxWidth: '60ch',
      marginTop: '16px',
      textWrap: 'pretty'
    }
  }, t('diff_lead')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: '16px',
      marginTop: '40px'
    }
  }, [['diff_1t', 'diff_1d'], ['diff_2t', 'diff_2d'], ['diff_3t', 'diff_3d']].map(([a, b]) => /*#__PURE__*/React.createElement(Card, {
    key: a,
    title: t(a),
    padding: 20
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: 0,
      textWrap: 'pretty'
    }
  }, t(b))))));
}
function Areas() {
  const [t] = useT();
  const rows = [['a_perf', 'a_perf_d', 20], ['a_sec', 'a_sec_d', 25], ['a_des', 'a_des_d', 20], ['a_test', 'a_test_d', 20], ['a_seo', 'a_seo_d', 10]];
  return /*#__PURE__*/React.createElement(Wrap, null, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, t('areas_eyebrow')), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      margin: '12px 0 24px'
    }
  }, t('areas_h2')), /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)'
    }
  }, rows.map(([n, d, c], i) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      gap: '16px',
      alignItems: 'baseline',
      padding: '18px 20px',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '170px',
      fontSize: '16px',
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, t(n)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      font: 'var(--type-small)',
      color: 'var(--text-secondary)'
    }
  }, t(d)), /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      color: 'var(--text-muted)'
    }
  }, c, " cr")))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '14px',
      textWrap: 'pretty'
    }
  }, t('areas_note')));
}
function Proof() {
  const [t] = useT();
  return /*#__PURE__*/React.createElement(Wrap, {
    tint: "var(--surface-sunken)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '40px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(ScoreArc, {
    score: 84,
    delta: 23
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 360px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement(ModuleStatus, {
    area: t('a_sec'),
    state: "complete",
    issues: 7
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: t('a_perf'),
    state: "complete",
    issues: 4
  }), /*#__PURE__*/React.createElement(ModuleStatus, {
    area: t('a_test'),
    state: "degraded",
    detail: "2 / 5"
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      marginTop: '24px',
      maxWidth: '62ch',
      textWrap: 'pretty'
    }
  }, t('proof_note')));
}
function Loop() {
  const [t] = useT();
  return /*#__PURE__*/React.createElement(Wrap, null, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, t('loop_eyebrow')), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      margin: '12px 0 28px'
    }
  }, t('loop_h2')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '12px'
    }
  }, [['01', 'loop_1t', 'loop_1d'], ['02', 'loop_2t', 'loop_2d'], ['03', 'loop_3t', 'loop_3d'], ['04', 'loop_4t', 'loop_4d']].map(([n, a, b]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      borderTop: '3px solid var(--accent)',
      paddingTop: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--accent)'
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '17px',
      fontWeight: 600,
      margin: '6px 0'
    }
  }, t(a)), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      textWrap: 'pretty'
    }
  }, t(b))))));
}
function FinalCta() {
  const [t] = useT();
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--surface-inverse)',
      padding: '80px 24px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--wash-br)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: '896px',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-h2)',
      letterSpacing: 'var(--track-h2)',
      color: '#fafafa',
      margin: 0
    }
  }, t('cta_h2')), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: '#9ca3af',
      margin: '14px 0 28px',
      textWrap: 'pretty'
    }
  }, t('cta_lead')), /*#__PURE__*/React.createElement(Button, {
    href: "Register.html"
  }, t('hero_cta'))));
}
function Landing() {
  const [t] = useT();
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PromoBar, {
    message: t('promo'),
    code: "START50"
  }), /*#__PURE__*/React.createElement(PublicPage, {
    active: "nav_product"
  }, /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(Difference, null), /*#__PURE__*/React.createElement(Proof, null), /*#__PURE__*/React.createElement(Areas, null), /*#__PURE__*/React.createElement(Loop, null), /*#__PURE__*/React.createElement(FinalCta, null)));
}
Object.assign(window, {
  Landing
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Landing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Pricing.jsx
try { (() => {
const {
  Button,
  Badge,
  Card,
  Eyebrow
} = window.WebAuditAIDesignSystem_fa5933;
const {
  PublicPage
} = window;
const tiers = [{
  name: 'Free',
  credits: '50, once',
  price: '$0',
  feat: ['1 concurrent audit', '7-day retention', 'URL input'],
  cta: 'Start free',
  pop: false
}, {
  name: 'Starter',
  credits: '300 / mo',
  price: '$29',
  feat: ['1 concurrent audit', '30-day retention', 'Readiness pass'],
  cta: 'Choose Starter',
  pop: false
}, {
  name: 'Pro',
  credits: '1,200 / mo',
  price: '$99',
  feat: ['3 concurrent audits', '12-month retention', 'Repository input', 'Load generation'],
  cta: 'Choose Pro',
  pop: true
}, {
  name: 'Business',
  credits: '4,000 / mo',
  price: '$299',
  feat: ['6 concurrent audits', '24-month retention', 'Everything in Pro'],
  cta: 'Choose Business',
  pop: false
}];
function TierGrid({
  onPick,
  current
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '16px'
    }
  }, tiers.map(t => {
    const isNow = current === t.name;
    return /*#__PURE__*/React.createElement("div", {
      key: t.name,
      style: {
        border: 'var(--border-width) solid ' + (t.pop || isNow ? 'var(--accent)' : 'var(--border-default)'),
        borderRadius: 'var(--radius-card)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        background: 'var(--surface-page)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '18px',
        fontWeight: 700
      }
    }, t.name), isNow ? /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, "Current") : t.pop && /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, "Most depth")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-h3)'
      }
    }, t.price), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-small)',
        color: 'var(--text-muted)'
      }
    }, " / mo")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: 'var(--text-secondary)'
      }
    }, t.credits), /*#__PURE__*/React.createElement("div", {
      style: {
        borderTop: 'var(--border-width) solid var(--border-default)',
        paddingTop: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flex: 1
      }
    }, t.feat.map(x => /*#__PURE__*/React.createElement("div", {
      key: x,
      style: {
        font: 'var(--type-small)',
        color: 'var(--text-primary)'
      }
    }, x))), /*#__PURE__*/React.createElement(Button, {
      variant: t.pop && !isNow ? 'primary' : 'secondary',
      fullWidth: true,
      disabled: isNow,
      onClick: () => onPick && onPick(t.name),
      href: onPick ? undefined : 'Register.html'
    }, isNow ? 'Current plan' : t.cta));
  }));
}
function CostTable() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "accent"
  }, "What things cost"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-width) solid var(--border-default)',
      marginTop: '12px'
    }
  }, [['One audit area', '10–25'], ['Full audit, all five, bundled', '80'], ['Targeted re-check of one issue', '3'], ['Production-readiness pass', '60']].map(([a, b], i) => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      display: 'flex',
      padding: '14px 18px',
      borderTop: i ? 'var(--border-width) solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)'
    }
  }, a), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '14px'
    }
  }, b, " cr")))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginTop: '14px'
    }
  }, "Top-ups are paid-plan only. Platform faults, provider outages and internal errors refund or never debit."));
}
function PricingPage() {
  const [, lang] = useT();
  return /*#__PURE__*/React.createElement(PublicPage, {
    active: "nav_pricing"
  }, /*#__PURE__*/React.createElement("section", {
    dir: lang === 'ar' ? 'ltr' : undefined,
    style: {
      padding: '72px 24px 44px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-display)',
      letterSpacing: 'var(--track-display)',
      margin: 0
    }
  }, "Credits, not seats."), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-secondary)',
      maxWidth: '56ch',
      margin: '18px auto 0'
    }
  }, "Plan credits expire at renewal. Purchased top-ups never expire, and expiring credits are always spent first.")), /*#__PURE__*/React.createElement("section", {
    dir: lang === 'ar' ? 'ltr' : undefined,
    style: {
      padding: '0 24px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1120px',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(TierGrid, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '896px',
      margin: '56px auto 0'
    }
  }, /*#__PURE__*/React.createElement(CostTable, null))));
}
Object.assign(window, {
  PricingPage,
  TierGrid,
  CostTable
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Pricing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Public.jsx
try { (() => {
const {
  Button,
  Badge,
  Input,
  Card,
  Eyebrow,
  StatRow,
  TwoToneHeading,
  PromoBar,
  SeverityBadge,
  ScoreArc,
  ModuleStatus
} = window.WebAuditAIDesignSystem_fa5933;
function Wordmark({
  size = 19
}) {
  return /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.4px',
      color: 'var(--text-strong)',
      whiteSpace: 'nowrap'
    }
  }, "Web", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, "Audit"), " AI");
}
function PublicHeader({
  active
}) {
  const [t] = useT();
  const nav = [['index.html', 'nav_product'], ['Pricing.html', 'nav_pricing'], ['#', 'nav_docs'], ['#', 'nav_changelog']];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      background: 'var(--surface-page)',
      borderBottom: 'var(--border-width) solid var(--border-default)',
      position: 'sticky',
      top: 0,
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1120px',
      margin: '0 auto',
      padding: '0 24px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      gap: '28px'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    style: {
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, null)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: '22px'
    }
  }, nav.map(([h, k]) => /*#__PURE__*/React.createElement("a", {
    key: k,
    href: h,
    style: {
      fontSize: '14px',
      fontWeight: active === k ? 600 : 400,
      color: active === k ? 'var(--text-strong)' : 'var(--text-secondary)',
      textDecoration: 'none',
      transition: 'var(--transition-color)'
    }
  }, t(k)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement(LangToggle, null), /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    href: "Login.html"
  }, t('signin')), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    href: "Register.html"
  }, t('start_free')))));
}
function PublicFooter() {
  const [t] = useT();
  const cols = [['foot_product', ['a_seo', 'loop_eyebrow', 'n_readiness']], ['foot_pricing', ['foot_pricing', 'credits', 'top_up']], ['foot_company', ['nav_docs', 'nav_changelog', 'foot_zero']]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: 'var(--border-width) solid var(--border-default)',
      background: 'var(--surface-raised)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1120px',
      margin: '0 auto',
      padding: '48px 24px 24px',
      display: 'grid',
      gridTemplateColumns: '1.6fr repeat(3,1fr)',
      gap: '32px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Wordmark, {
    size: 17
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      margin: '12px 0 0',
      maxWidth: '34ch',
      textWrap: 'pretty'
    }
  }, t('foot_tag'))), cols.map(([h, items]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-eyebrow)',
      fontSize: '11px',
      letterSpacing: 'var(--track-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '12px'
    }
  }, t(h)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-secondary)',
      textDecoration: 'none'
    }
  }, t(i))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1120px',
      margin: '0 auto',
      padding: '20px 24px 32px',
      borderTop: 'var(--border-width) solid var(--border-default)',
      display: 'flex',
      gap: '18px',
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)'
    }
  }, "\xA9 2026 WebAudit AI"), /*#__PURE__*/React.createElement("a", {
    href: "../app/index.html",
    style: {
      font: 'var(--type-small)'
    }
  }, t('foot_dashboard')), /*#__PURE__*/React.createElement("a", {
    href: "../admin/index.html",
    style: {
      font: 'var(--type-small)'
    }
  }, t('foot_admin')), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      font: 'var(--type-small)',
      color: 'var(--text-muted)',
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px'
    }
  }, t('foot_zero'))));
}
function PublicPage({
  active,
  children,
  tint
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: tint || 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(PublicHeader, {
    active: active
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1
    }
  }, children), /*#__PURE__*/React.createElement(PublicFooter, null));
}
Object.assign(window, {
  Wordmark,
  PublicHeader,
  PublicFooter,
  PublicPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Public.jsx", error: String((e && e.message) || e) }); }

// ui_kits/strings.jsx
try { (() => {
window.WA_STRINGS = {
  en: {
    promo: 'First audit free — 50 credits',
    nav_product: 'Product',
    nav_pricing: 'Pricing',
    nav_docs: 'Docs',
    nav_changelog: 'Changelog',
    signin: 'Sign in',
    start_free: 'Start free',
    hero_lead: 'Think your site is ready?',
    hero_accent: 'Prove it, then ship it.',
    hero_sub: 'We audit performance, security, design, testing and search visibility — measured first, then explained. Then we re-verify every fix until the board is green.',
    url_ph: 'yoursite.com',
    hero_cta: 'Audit my site',
    stat_credits: 'free credits, no card',
    stat_areas: 'areas',
    stat_recheck: 'credits per re-check',
    diff_eyebrow: 'The difference',
    diff_h2: 'Everyone else sells you a report.',
    diff_lead: 'We sell you the walk from red to green, and we verify each step. An issue turns green when a check passes, never when you say so.',
    diff_1t: 'Measured before inferred',
    diff_1d: 'Anything measurable is measured, not guessed. Every finding says which it is.',
    diff_2t: 'Green means verified',
    diff_2d: 'A narrow re-check costs 3 credits and seconds. It passes, or the issue stays red.',
    diff_3t: 'Degrade, never collapse',
    diff_3d: 'A failing capability degrades its area. You are told exactly what is missing.',
    proof_note: 'A degraded area never reads as a pass. If we could not run a check, the report says so and you are not charged for it.',
    areas_eyebrow: 'Five areas',
    areas_h2: 'Every area reports independently.',
    a_perf: 'Performance',
    a_perf_d: 'Core Web Vitals, bundle composition, request patterns',
    a_sec: 'Security',
    a_sec_d: 'Headers, TLS, OWASP checks, leaked credentials, dependency CVEs',
    a_des: 'Design',
    a_des_d: 'Layout, hierarchy and contrast, against your stated brand intent',
    a_test: 'Testing',
    a_test_d: 'Functional flows driven in a real browser',
    a_seo: 'Search visibility',
    a_seo_d: 'Metadata, crawlability, content structure',
    areas_note: 'Five areas cost 95 individually against 80 bundled. Complete coverage is always the cheapest route to complete coverage.',
    loop_eyebrow: 'The fix loop',
    loop_h2: 'Red to green, one check at a time.',
    loop_1t: 'Audit',
    loop_1d: 'Submit a URL, a repository, or an archive.',
    loop_2t: 'Fix',
    loop_2d: 'Copy the remediation prompt into your coding agent.',
    loop_3t: 'Re-check',
    loop_3d: '3 credits, seconds. It passes or it stays red.',
    loop_4t: 'Ship',
    loop_4d: 'A fresh full re-audit returns an explicit go or no-go.',
    cta_h2: 'Fifty credits. No card.',
    cta_lead: 'Enough to audit two or three areas of your real site and see real findings.',
    foot_tag: 'Measured before inferred. Green means verified. You are never charged for our failures.',
    foot_product: 'Product',
    foot_pricing: 'Pricing',
    foot_company: 'Company',
    foot_dashboard: 'Dashboard',
    foot_admin: 'Admin console',
    foot_zero: 'zero third-party runtime requests',
    g_audits: 'Audits',
    g_account: 'Account',
    n_scan: 'New scan',
    n_progress: 'Live scan',
    n_report: 'Report',
    n_fixes: 'Fixes',
    n_readiness: 'Readiness',
    n_usage: 'Usage',
    n_billing: 'Billing and plans',
    n_profile: 'Profile',
    credits_left: 'credits left',
    top_up: 'Top up',
    scan_eyebrow: 'New scan',
    scan_title: 'What should we audit?',
    tab_url: 'URL',
    tab_repo: 'Repository',
    tab_archive: 'Archive',
    areas_label: 'Areas',
    quote: 'Quote',
    credits: 'credits',
    quote_bundled: 'Bundled — 15 credits below the individual total.',
    quote_note: 'Nothing is charged until you accept this quote. If the platform fails mid-audit, the credits come back.',
    accept_run: 'Accept and run',
    drop_archive: 'Drop a .zip or .tar.gz',
    drop_note: 'Validated before extraction. Destroyed when the scan ends.',
    theme_dark: 'Dark',
    theme_light: 'Light'
  },
  ar: {
    promo: 'أول تدقيق مجاناً — ٥٠ رصيداً',
    nav_product: 'المنتج',
    nav_pricing: 'الأسعار',
    nav_docs: 'المستندات',
    nav_changelog: 'التحديثات',
    signin: 'تسجيل الدخول',
    start_free: 'ابدأ مجاناً',
    hero_lead: 'تظن أن موقعك جاهز؟',
    hero_accent: 'أثبت ذلك، ثم أطلقه.',
    hero_sub: 'ندقّق الأداء والأمن والتصميم والاختبار والظهور في البحث — نقيس أولاً، ثم نشرح. بعد ذلك نتحقق من كل إصلاح حتى تصبح اللوحة خضراء بالكامل.',
    url_ph: 'موقعك.com',
    hero_cta: 'دقّق موقعي',
    stat_credits: 'رصيد مجاني، بدون بطاقة',
    stat_areas: 'مجالات',
    stat_recheck: 'أرصدة لكل إعادة تحقق',
    diff_eyebrow: 'الفرق',
    diff_h2: 'غيرنا يبيعك تقريراً.',
    diff_lead: 'نحن نبيعك المسار من الأحمر إلى الأخضر، ونتحقق من كل خطوة. تتحول المشكلة إلى اللون الأخضر عندما ينجح الفحص، لا عندما تقول أنت ذلك.',
    diff_1t: 'القياس قبل الاستنتاج',
    diff_1d: 'كل ما يمكن قياسه نقيسه ولا نخمّنه. وكل نتيجة تُوضّح أيّهما كانت.',
    diff_2t: 'الأخضر يعني مُتحقَّقاً منه',
    diff_2d: 'إعادة التحقق المحدودة تكلّف ٣ أرصدة وثوانٍ. إما أن تنجح، أو تبقى المشكلة حمراء.',
    diff_3t: 'تدهور، لا انهيار',
    diff_3d: 'فشل أي قدرة يؤدي إلى تدهور مجالها فقط. ونخبرك بالضبط بما لم يُنفَّذ.',
    proof_note: 'المجال المتدهور لا يُقرأ أبداً كنجاح. وإن لم نتمكّن من تنفيذ فحص، يذكر التقرير ذلك ولا تُحاسب عليه.',
    areas_eyebrow: 'خمسة مجالات',
    areas_h2: 'كل مجال يقدّم نتيجته باستقلال.',
    a_perf: 'الأداء',
    a_perf_d: 'مؤشرات الويب الأساسية، تركيب الحِزم، أنماط الطلبات',
    a_sec: 'الأمن',
    a_sec_d: 'الترويسات، TLS، فحوص OWASP، بيانات الاعتماد المكشوفة، ثغرات التبعيات',
    a_des: 'التصميم',
    a_des_d: 'التخطيط والتسلسل البصري والتباين، مقارنةً بهوية علامتك المعلنة',
    a_test: 'الاختبار',
    a_test_d: 'مسارات وظيفية تُنفَّذ في متصفح حقيقي',
    a_seo: 'الظهور في البحث',
    a_seo_d: 'البيانات الوصفية، قابلية الزحف، بنية المحتوى',
    areas_note: 'المجالات الخمسة تكلّف ٩٥ منفردة مقابل ٨٠ مجتمعة. التغطية الكاملة هي دائماً أرخص طريق إلى التغطية الكاملة.',
    loop_eyebrow: 'حلقة الإصلاح',
    loop_h2: 'من الأحمر إلى الأخضر، فحصاً بعد فحص.',
    loop_1t: 'دقّق',
    loop_1d: 'أرسل رابطاً أو مستودعاً أو ملفاً مضغوطاً.',
    loop_2t: 'أصلِح',
    loop_2d: 'انسخ نصّ الإصلاح إلى مساعد البرمجة الذي تستخدمه.',
    loop_3t: 'أعد التحقق',
    loop_3d: '٣ أرصدة وثوانٍ. إما تنجح أو تبقى حمراء.',
    loop_4t: 'أطلِق',
    loop_4d: 'إعادة تدقيق كاملة وجديدة تعيد قراراً صريحاً بالموافقة أو الرفض.',
    cta_h2: 'خمسون رصيداً. بدون بطاقة.',
    cta_lead: 'تكفي لتدقيق مجالين أو ثلاثة من موقعك الحقيقي ورؤية نتائج حقيقية.',
    foot_tag: 'القياس قبل الاستنتاج. الأخضر يعني مُتحقَّقاً منه. ولا تُحاسب أبداً على أخطائنا.',
    foot_product: 'المنتج',
    foot_pricing: 'الأسعار',
    foot_company: 'الشركة',
    foot_dashboard: 'لوحة التحكم',
    foot_admin: 'وحدة المشغّل',
    foot_zero: 'صفر طلبات خارجية أثناء التشغيل',
    g_audits: 'التدقيقات',
    g_account: 'الحساب',
    n_scan: 'تدقيق جديد',
    n_progress: 'تدقيق مباشر',
    n_report: 'التقرير',
    n_fixes: 'الإصلاحات',
    n_readiness: 'الجهوزية',
    n_usage: 'الاستخدام',
    n_billing: 'الفواتير والخطط',
    n_profile: 'الملف الشخصي',
    credits_left: 'رصيد متبقٍ',
    top_up: 'إضافة رصيد',
    scan_eyebrow: 'تدقيق جديد',
    scan_title: 'ما الذي ندقّقه؟',
    tab_url: 'رابط',
    tab_repo: 'مستودع',
    tab_archive: 'ملف مضغوط',
    areas_label: 'المجالات',
    quote: 'التسعيرة',
    credits: 'رصيد',
    quote_bundled: 'مجتمعة — أقل بـ ١٥ رصيداً من المجموع المنفرد.',
    quote_note: 'لا يُخصم شيء حتى توافق على هذه التسعيرة. وإذا فشلت المنصّة في منتصف التدقيق، تعود الأرصدة.',
    accept_run: 'موافقة وتشغيل',
    drop_archive: 'أفلِت ملف .zip أو .tar.gz',
    drop_note: 'يُتحقَّق منه قبل الاستخراج، ويُحذف عند انتهاء التدقيق.',
    theme_dark: 'داكن',
    theme_light: 'فاتح'
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/strings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/theme.jsx
try { (() => {
function waRead(k, d) {
  try {
    return localStorage.getItem(k) || d;
  } catch (e) {
    return d;
  }
}
function waStore(key, initial, apply) {
  const s = {
    v: waRead(key, initial),
    subs: new Set(),
    set(nv) {
      s.v = nv;
      try {
        localStorage.setItem(key, nv);
      } catch (e) {}
      apply(nv);
      s.subs.forEach(f => f());
    }
  };
  apply(s.v);
  return s;
}
const waTheme = waStore('wa-theme', 'light', v => document.documentElement.setAttribute('data-theme', v));
const waLang = waStore('wa-lang', 'en', v => {
  const h = document.documentElement;
  h.lang = v;
  h.dir = v === 'ar' ? 'rtl' : 'ltr';
});
function waUse(store) {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    store.subs.add(force);
    return () => store.subs.delete(force);
  }, []);
  return [store.v, v => store.set(v)];
}
function useTheme() {
  return waUse(waTheme);
}
function useLang() {
  return waUse(waLang);
}
function useT() {
  const [lang, setLang] = useLang();
  const t = k => {
    const tb = window.WA_STRINGS || {};
    return (tb[lang] && tb[lang][k]) ?? (tb.en && tb.en[k]) ?? k;
  };
  return [t, lang, setLang];
}
const SUN = 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
const MOON = 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z';
function ThemeToggle({
  compact = false,
  label = false
}) {
  const [th, setT] = useTheme();
  const dark = th === 'dark';
  const [h, setH] = React.useState(false);
  const [t] = useT();
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => setT(dark ? 'light' : 'dark'),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    "aria-label": dark ? 'Switch to light mode' : 'Switch to dark mode',
    title: dark ? 'Light' : 'Dark',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      height: compact ? '30px' : '36px',
      width: label ? '100%' : compact ? '30px' : '36px',
      boxSizing: 'border-box',
      border: 'var(--border-width) solid ' + (label ? 'var(--border-default)' : 'transparent'),
      borderRadius: 'var(--radius-control)',
      background: h ? 'var(--surface-raised)' : 'transparent',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: '13px',
      transition: 'var(--transition-color)',
      padding: label ? '0 12px' : 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dark ? MOON : SUN
  })), label && /*#__PURE__*/React.createElement("span", null, dark ? t('theme_dark') : t('theme_light')));
}
function LangToggle({
  label = false
}) {
  const [lang, setLang] = useLang();
  const [h, setH] = React.useState(false);
  const next = lang === 'ar' ? 'en' : 'ar';
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => setLang(next),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    "aria-label": 'Switch to ' + (next === 'ar' ? 'Arabic' : 'English'),
    title: next === 'ar' ? 'العربية' : 'English',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '7px',
      height: '36px',
      width: label ? '100%' : 'auto',
      boxSizing: 'border-box',
      padding: '0 12px',
      border: 'var(--border-width) solid ' + (label ? 'var(--border-default)' : 'transparent'),
      borderRadius: 'var(--radius-control)',
      background: h ? 'var(--surface-raised)' : 'transparent',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: '13px',
      fontWeight: 500,
      transition: 'var(--transition-color)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3C9.5 5.4 9.5 18.6 12 21"
  })), /*#__PURE__*/React.createElement("span", null, lang === 'ar' ? 'EN' : 'ع'));
}
Object.assign(window, {
  useTheme,
  useLang,
  useT,
  ThemeToggle,
  LangToggle,
  waTheme,
  waLang
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/theme.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.PromoBar = __ds_scope.PromoBar;

__ds_ns.SeverityBadge = __ds_scope.SeverityBadge;

__ds_ns.StatRow = __ds_scope.StatRow;

__ds_ns.TwoToneHeading = __ds_scope.TwoToneHeading;

__ds_ns.AttributionMark = __ds_scope.AttributionMark;

__ds_ns.IssueCard = __ds_scope.IssueCard;

__ds_ns.ModuleStatus = __ds_scope.ModuleStatus;

__ds_ns.ProgressRow = __ds_scope.ProgressRow;

__ds_ns.ScoreArc = __ds_scope.ScoreArc;

__ds_ns.VerdictPanel = __ds_scope.VerdictPanel;

})();
