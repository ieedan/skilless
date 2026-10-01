# skilless

## 0.2.0

### Minor Changes

- [#13](https://github.com/ieedan/skilless/pull/13) [`00ba93e`](https://github.com/ieedan/skilless/commit/00ba93ed1b31b50bf2623b0afde13f4816fd2d0b) Thanks [@ieedan](https://github.com/ieedan)! - Sync binary files. A skill can now hold images, fonts and other files that are not text: they are read and written as bytes, and hashed by their bytes, so text files hash exactly as before. Skills are limited to 3MB, up from 1MB. A file that is not valid UTF-8 is now carried as bytes rather than being mangled into text.

- [#13](https://github.com/ieedan/skilless/pull/13) [`6f6c70b`](https://github.com/ieedan/skilless/commit/6f6c70b324807ae6a9f3afbd5eaaf43df519ad7b) Thanks [@ieedan](https://github.com/ieedan)! - Add skill packs. `skilless add <pack>` adds every skill a pack lists — a pack on skilless (`@user/pack/<name>`, or `skilless.dev/packs/<user>/<name>`), any URL serving a pack, or a pack file — and `skilless update` brings in skills the packs you follow gain, and asks about ones they drop. `skilless add` also takes a skill on skilless by its owner's username, `@user/skill` or `skilless.dev/skills/<user>/<skill>`, and `github.com/owner/repo/path` now reads as a path in the repo. `skilless packs list|create|delete` manages your packs on skilless.dev. A pack can include other packs; a pack that leads back into itself is refused.

### Patch Changes

- [#13](https://github.com/ieedan/skilless/pull/13) [`00ba93e`](https://github.com/ieedan/skilless/commit/00ba93ed1b31b50bf2623b0afde13f4816fd2d0b) Thanks [@ieedan](https://github.com/ieedan)! - `skilless add` refuses to add your own skill from its address, since it is in your library already, and skips your own skills inside a pack rather than making them their own source. It also tells skilless.dev when it fetches a skill or pack to add it, so adds count towards how often it has been installed; `skilless update` does not count.

- [#13](https://github.com/ieedan/skilless/pull/13) [`6f6c70b`](https://github.com/ieedan/skilless/commit/6f6c70b324807ae6a9f3afbd5eaaf43df519ad7b) Thanks [@ieedan](https://github.com/ieedan)! - Point `skilless delete`'s restore hint at skilless.dev/my-skills, where the library now lives.

## 0.1.0

### Minor Changes

- [#11](https://github.com/ieedan/skilless/pull/11) [`426b393`](https://github.com/ieedan/skilless/commit/426b39326f229a38e25e2e1e4668c47cd824c4b7) Thanks [@ieedan](https://github.com/ieedan)! - `skilless list` now lists the current project's skills by default, including ones in the project's own skill folders (⌂), marks global skills with ⊕, and drops the date. Pass `--lib` to list your whole library. It now reads only what is on this machine, so it's instant; pass `--sync` to check skilless.dev first.

- [#11](https://github.com/ieedan/skilless/pull/11) [`426b393`](https://github.com/ieedan/skilless/commit/426b39326f229a38e25e2e1e4668c47cd824c4b7) Thanks [@ieedan](https://github.com/ieedan)! - Commands now work from what is on this machine and send their changes to skilless.dev in a background process, so they finish right away. Pass `--sync` to read the latest from skilless.dev first. The background process also checks for changes made elsewhere and the next command tells you to run `skilless sync`. skilless now tells you when a new version is out.

## 0.0.10

### Patch Changes

- [`9b399c5`](https://github.com/ieedan/skilless/commit/9b399c5b7289c1243634fbf064f73a07bfcc6289) Thanks [@ieedan](https://github.com/ieedan)! - chore: setup trusted publishing
