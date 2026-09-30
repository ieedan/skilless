<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <img alt="skilless" src="assets/logo.svg" width="320" />
  </picture>
</p>

```sh
npx skilless init
```

skilless is a new way to manage your skills. Instead of copying the same skill into every one of the projects that uses it or forcing it to be applied at the user level skilless allows you to invisibly add skills to specific projects with one source of truth for each skill.

## The problem

You work across multiple different projects, some owned by you, some owned by others. You have skills that you want to use in some projects but not others and you don't want to have to maintain a bunch of unversioned, duplicated markdown files across those projects. You could put skills at the user level but this means every single project has those skills even when it doesn't them.

## The solution

skilless allows you to invisibly add skills to only specific projects and symlinks those skills so that the same skill has one source of truth across multiple projects.

> What does invisibly mean?

Invisibly means that skills won't show up in your git history, no more /skills folder in your git repositories.

## Getting started

To get started simply run:

```sh
npx skilless init
# migrate you existing skills
npx skilless migrate
```

Then you can start adding skills to your projects just like the `skills` cli:

```sh
npx skilless add mattpocock/skills
# list your skills
npx skilless list
```

### Sync your skills with skilless.dev (optional)

If you'd like you can also sync your skills so that every machine and cloud environment uses the same skills. 

1. Run 

```sh
npx skilless auth
```

2. Push your local skills to skilless.dev

```sh
npx skilless sync
```

Once you've synced your skills you can manage them from [skilless.dev](https://skilless.dev) or using the CLI.

In cloud environments all you need to do is run:

```sh
SKILLESS_TOKEN=<your-token> npx skilless install
```

This will automatically detect the git remote and install the skills assigned to that specific repository, as well as any global skills.

