Use `IssueCard` for every finding in a report.

```jsx
<IssueCard severity="critical" area="Security" title="No HSTS header on the primary host"
  location="strict-transport-security" attribution="measured"
  description="…" prompt="Add a Strict-Transport-Security header…" />
```

Copy-the-fix-prompt is a real, always-visible button — it is the most-used control in the product and must never be a hover-revealed icon.
