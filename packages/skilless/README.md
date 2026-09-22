# skilless

Author skills once, sync them everywhere, install them per project.

```bash
npm install -g skilless
```

```bash
skilless init                  # create ~/.skilless and sign in
skilless create code-review    # new skill, added here, path printed to edit
skilless add svelte-testing    # add one you already have to this project
skilless sync                  # two way, including deletions
```

In a cloud agent's setup step:

```bash
SKILLESS_TOKEN=... npx skilless install
```

Documentation: [github.com/ieedan/skilless](https://github.com/ieedan/skilless)
