---
'skilless': minor
---

Sync binary files. A skill can now hold images, fonts and other files that are not text: they are read and written as bytes, and hashed by their bytes, so text files hash exactly as before. Skills are limited to 3MB, up from 1MB. A file that is not valid UTF-8 is now carried as bytes rather than being mangled into text.
