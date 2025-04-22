# @eventkit/http

## 0.3.1

### Patch Changes

- [#9](https://github.com/hntrl/eventkit/pull/9) [`107dfd4`](https://github.com/hntrl/eventkit/commit/107dfd470a195c854d96436ba5c5d81236cb8898) Thanks [@hntrl](https://github.com/hntrl)! - Makes the `@eventkit/base` peer dep optional which silences errors in package managers if it's not being used.

- [#10](https://github.com/hntrl/eventkit/pull/10) [`d1d5dca`](https://github.com/hntrl/eventkit/commit/d1d5dcace45730de1feabfbc81216a7fd034b29f) Thanks [@hntrl](https://github.com/hntrl)! - Gave some TLC to the bundling process for each package. Each package bundle now contains sourcemaps for both cjs & esm builds, as well as a new `index.global.js` and `index.global.min.js` that is intended to be used with browser targets.

- Updated dependencies [[`3ea1105`](https://github.com/hntrl/eventkit/commit/3ea1105c73b96a5e26aa80f0795b6dbf55941fef), [`d1d5dca`](https://github.com/hntrl/eventkit/commit/d1d5dcace45730de1feabfbc81216a7fd034b29f)]:
  - @eventkit/base@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`03fb5d1`](https://github.com/hntrl/eventkit/commit/03fb5d13a3370d5164cf81527710c25c4e67e3e5), [`7b6dbb1`](https://github.com/hntrl/eventkit/commit/7b6dbb1a1d96478fcc25c8325648c31d08e78467)]:
  - @eventkit/base@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`1371b77`](https://github.com/hntrl/eventkit/commit/1371b774b5409b5aa45e56fb215b27ab7233bd9b)]:
  - @eventkit/base@0.2.0

## 0.1.1

### Patch Changes

- [`0140fce`](https://github.com/hntrl/eventkit/commit/0140fce4ffeb8d880865a5363296f3e966b5d4a6) - Make the `init` arg in EventSourceResponse optional

- [`b3854b5`](https://github.com/hntrl/eventkit/commit/b3854b5b5603d080fbd1503e5e279a9436a8791d) - Fixed an issue where the bundled version of @eventkit/http used its own imports of eventkit primitives

- Updated dependencies [[`a84a6cd`](https://github.com/hntrl/eventkit/commit/a84a6cdbf8f9ed93bfcc97d239e0c0b5376038d1), [`35f0ed7`](https://github.com/hntrl/eventkit/commit/35f0ed7feca076852c835defbede22a17210466e), [`2c27d80`](https://github.com/hntrl/eventkit/commit/2c27d8064695e5d33039843826b147b09d6b9750)]:
  - @eventkit/base@0.1.1

## 0.1.0

### Minor Changes

- [`78687a5`](https://github.com/hntrl/eventkit/commit/78687a55a2d53bad9e7011c8ba3ec32625774a89) - v0.1.0 is the first official release of eventkit 🎉! Refer to the [docs](https://hntrl.github.io/eventkit) to get started.

### Patch Changes

- Updated dependencies [[`78687a5`](https://github.com/hntrl/eventkit/commit/78687a55a2d53bad9e7011c8ba3ec32625774a89)]:
  - eventkit@0.1.0
