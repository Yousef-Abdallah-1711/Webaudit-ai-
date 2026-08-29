Use `Button` for every action; primary carries the accent and there is only ever one primary per view.

```jsx
<Button variant="primary" onClick={run}>Run audit — 80 credits</Button>
<Button variant="secondary" size="sm">Cancel</Button>
```

Variants: `primary` (accent #fe5a01), `secondary` (white, hairline border), `ghost`, `inverse` (on dark bands). Hover is a colour step only — never a transform or shadow change. Default height is 48px; `fullWidth` stacks it under the input on mobile.
