Use `ModuleStatus` in the live progress view and at the top of a report.

```jsx
<ModuleStatus area="Security" state="complete" issues={7} />
<ModuleStatus area="Testing" state="degraded" detail="Playwright runner unavailable — 2 of 5 checks skipped" />
```

Always pass `detail` for `degraded` and `not-applicable`: the user must be told exactly what is missing, in words. The shimmer/spin runs only while work is genuinely happening.

In a column narrower than about 300px pass `compact` — the default row needs ~270px before the state word and issue count start spilling.

```jsx
<ModuleStatus compact area="Testing" state="degraded" detail="2 of 5 checks skipped" />
```
