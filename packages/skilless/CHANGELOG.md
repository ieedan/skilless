# skilless

## 0.1.0

### Minor Changes

- [#11](https://github.com/ieedan/skilless/pull/11) [`426b393`](https://github.com/ieedan/skilless/commit/426b39326f229a38e25e2e1e4668c47cd824c4b7) Thanks [@ieedan](https://github.com/ieedan)! - `skilless list` now lists the current project's skills by default, including ones in the project's own skill folders (⌂), marks global skills with ⊕, and drops the date. Pass `--lib` to list your whole library. It now reads only what is on this machine, so it's instant; pass `--sync` to check skilless.dev first.

- [#11](https://github.com/ieedan/skilless/pull/11) [`426b393`](https://github.com/ieedan/skilless/commit/426b39326f229a38e25e2e1e4668c47cd824c4b7) Thanks [@ieedan](https://github.com/ieedan)! - Commands now work from what is on this machine and send their changes to skilless.dev in a background process, so they finish right away. Pass `--sync` to read the latest from skilless.dev first. The background process also checks for changes made elsewhere and the next command tells you to run `skilless sync`. skilless now tells you when a new version is out.

## 0.0.10

### Patch Changes

- [`9b399c5`](https://github.com/ieedan/skilless/commit/9b399c5b7289c1243634fbf064f73a07bfcc6289) Thanks [@ieedan](https://github.com/ieedan)! - chore: setup trusted publishing
