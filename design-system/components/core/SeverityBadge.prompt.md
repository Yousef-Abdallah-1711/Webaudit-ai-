Use `SeverityBadge` wherever a finding's severity is shown — issue cards, fixes board rows, counter rows.

```jsx
<SeverityBadge level="critical" />
<SeverityBadge level="resolved" count={2} />
```

Never restyle it toward the brand accent: the accent means "clickable", and a severity that looks like a CTA breaks the scale. `resolved` and `low` are deliberately different greens.
