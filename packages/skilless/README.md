# skilless

Author skills once, sync them everywhere, install them per project.

```bash
npm install -g skilless
```

```bash
skilless init                  # create ~/.skilless
skilless create code-review    # new skill, added here, path printed to edit
skilless add svelte-testing    # add one you already have to this project
skilless auth                  # optional: sign in to sync with the cloud
skilless sync                  # two way, including deletions
skilless config editor         # open new skills in your editor
```

In a cloud agent's setup step:

```bash
SKILLESS_TOKEN=... npx skilless install
```

Documentation: [github.com/ieedan/skilless](https://github.com/ieedan/skilless)
