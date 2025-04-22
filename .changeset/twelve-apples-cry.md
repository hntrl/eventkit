---
"@eventkit/async-observable": patch
"@eventkit/http": patch
"@eventkit/base": patch
---

Gave some TLC to the bundling process for each package. Each package bundle now contains sourcemaps for both cjs & esm builds, as well as a new `index.global.js` and `index.global.min.js` that is intended to be used with browser targets.
