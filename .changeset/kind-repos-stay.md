---
'skilless': minor
---

feat: `migrate` no longer just skips skills committed to the repo. It asks whether to leave each one, copy it into your library while keeping it committed, or move it out of git (staged, not committed). `--include-committed` moves them without asking
