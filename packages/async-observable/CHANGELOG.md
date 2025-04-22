# @eventkit/async-observable

## 0.3.1

### Patch Changes

- [#10](https://github.com/hntrl/eventkit/pull/10) [`d1d5dca`](https://github.com/hntrl/eventkit/commit/d1d5dcace45730de1feabfbc81216a7fd034b29f) Thanks [@hntrl](https://github.com/hntrl)! - Gave some TLC to the bundling process for each package. Each package bundle now contains sourcemaps for both cjs & esm builds, as well as a new `index.global.js` and `index.global.min.js` that is intended to be used with browser targets.

## 0.3.0

Version bumped to match the version of `@eventkit/base`

## 0.2.0

### Patch Changes

- [`fa3aa52`](https://github.com/hntrl/eventkit/commit/fa3aa52410d95dbe79f093f6bd992b800d4768f2) - Fixes an issue where subscribers wouldn't be tracked by the observable when using constructor syntax

## 0.1.1

### Patch Changes

- [`35f0ed7`](https://github.com/hntrl/eventkit/commit/35f0ed7feca076852c835defbede22a17210466e) - Fixed an issue where an error would be thrown if multiple eventkit packages were used in the same file

## 0.1.0

### Minor Changes

- [`78687a5`](https://github.com/hntrl/eventkit/commit/78687a55a2d53bad9e7011c8ba3ec32625774a89) - v0.1.0 is the first official release of eventkit 🎉! Refer to the [docs](https://hntrl.github.io/eventkit) to get started.
