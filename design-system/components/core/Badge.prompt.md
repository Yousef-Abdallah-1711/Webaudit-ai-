Use `Badge` for metadata: plan tier, credit counts, "measured" style flags, discount codes.

```jsx
<Badge tone="accent">Pro</Badge>
<Badge mono pill={false}>LAUNCH40</Badge>
```

Never use `tone="accent"` on anything that isn't clickable-adjacent, and never use a Badge to express severity.
