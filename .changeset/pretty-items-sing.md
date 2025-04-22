---
"@eventkit/base": patch
---

The bundle now inlines all types associated with async-observable. This fixes an issue where types would be missing when installing with certain package managers. There may be some conflict for projects that use both `@eventkit/async-observable` and `@eventkit/base` in the same project with this change, but this pattern should be avoided anyways.
