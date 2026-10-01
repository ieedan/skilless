---
'skilless': minor
---

Add skill packs. `skilless add <pack>` adds every skill a pack lists — a pack on skilless (`@user/pack/<name>`, or `skilless.dev/packs/<user>/<name>`), any URL serving a pack, or a pack file — and `skilless update` brings in skills the packs you follow gain, and asks about ones they drop. `skilless add` also takes a skill on skilless by its owner's username, `@user/skill` or `skilless.dev/skills/<user>/<skill>`, and `github.com/owner/repo/path` now reads as a path in the repo. `skilless packs list|create|delete` manages your packs on skilless.dev. A pack can include other packs; a pack that leads back into itself is refused.
