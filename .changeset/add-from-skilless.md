---
'skilless': patch
---

`skilless add` refuses to add your own skill from its address, since it is in your library already, and skips your own skills inside a pack rather than making them their own source. It also tells skilless.dev when it fetches a skill or pack to add it, so adds count towards how often it has been installed; `skilless update` does not count.
