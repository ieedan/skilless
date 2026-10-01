---
'skilless': minor
---

Commands now work from what is on this machine and send their changes to skilless.dev in a background process, so they finish right away. Pass `--sync` to read the latest from skilless.dev first. The background process also checks for changes made elsewhere and the next command tells you to run `skilless sync`. skilless now tells you when a new version is out.
