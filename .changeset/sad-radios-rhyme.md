---
"@eventkit/base": patch
---

Fixed some invariant behavior with the `reduce` operator where the chain of accumulator calls depending on the seed value wasn't consistent with the native array method
