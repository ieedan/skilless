# Changesets

`skilless` is the only package published from this repo — `web` and
`@skilless/platform` are private, so changesets skips them.

Add one alongside any change that should ship:

```bash
pnpm changeset
```

Pick `skilless`, pick a bump, and describe the change as a user would read it in
a changelog. Merging to `main` opens (or updates) a release pull request;
merging that one publishes to npm.
