Use `VerdictPanel` on the readiness result screen only.

```jsx
<VerdictPanel verdict="go" score={91} baseline={68} areas={[{name:'Security',score:94,threshold:80,pass:true}]} />
```

A no-go always names its blockers. Regressions are reported as named regressions, not merely as a lower score.
