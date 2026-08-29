Use `Input` for any single-line field; it is the URL field on the hero and every form field in the app.

```jsx
<Input prefix="https://" placeholder="yoursite.com" value={url} onChange={e=>setUrl(e.target.value)} />
```

Focus is a 1px `#fa7014` ring and nothing else. Set `mono` when the value is something we observed rather than something the user prose-wrote.
