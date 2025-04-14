# eventkit

## 0.3.0

### Minor Changes

- [#6](https://github.com/hntrl/eventkit/pull/6) [`03fb5d1`](https://github.com/hntrl/eventkit/commit/03fb5d13a3370d5164cf81527710c25c4e67e3e5) Thanks [@hntrl](https://github.com/hntrl)! - Introduces **10** new operators into eventkit: `find`, `findIndex`, `first`, `isEmpty`, `last`, `max`, `min`, `pairwise`, `skip`, and `every`. See the [docs](https://hntrl.github.io/eventkit/guide/concepts/transforming-data#available-operators) for a complete reference.

### Patch Changes

- [#6](https://github.com/hntrl/eventkit/pull/6) [`7b6dbb1`](https://github.com/hntrl/eventkit/commit/7b6dbb1a1d96478fcc25c8325648c31d08e78467) Thanks [@hntrl](https://github.com/hntrl)! - Fixed some invariant behavior with the `reduce` operator where the chain of accumulator calls depending on the seed value wasn't consistent with the native array method

- Updated dependencies []:
  - @eventkit/async-observable@0.3.0

## 0.2.0

### Minor Changes

- [#4](https://github.com/hntrl/eventkit/pull/4) [`1371b77`](https://github.com/hntrl/eventkit/commit/1371b774b5409b5aa45e56fb215b27ab7233bd9b) Thanks [@hntrl](https://github.com/hntrl)! - Introduces `SingletonAsyncObservable`; a utility class for observables that lets you access the value emitted by observables that emit one (and only one) value (like the observables returned from `reduce()`, `count()`, etc.) using native await syntax.

  This makes the consumption of these single value operators a little bit more readable. For instance:

  ```ts
  const obs = AsyncObservable.from([1, 2, 3]);
  const singleton = obs.pipe(first());

  // instead of this:
  let firstValue: number | undefined;
  await obs.subscribe((value) => {
    firstValue = value;
  });
  console.log(firstValue); // 1

  // you can just do this:
  console.log(await singleton); // 1
  ```

### Patch Changes

- Updated dependencies [[`fa3aa52`](https://github.com/hntrl/eventkit/commit/fa3aa52410d95dbe79f093f6bd992b800d4768f2)]:
  - @eventkit/async-observable@0.2.0

## 0.1.1

### Patch Changes

- [`a84a6cd`](https://github.com/hntrl/eventkit/commit/a84a6cdbf8f9ed93bfcc97d239e0c0b5376038d1) - Fixed an issue where some operators can become permanently blocked in some runtimes

- [`35f0ed7`](https://github.com/hntrl/eventkit/commit/35f0ed7feca076852c835defbede22a17210466e) - Fixed an issue where an error would be thrown if multiple eventkit packages were used in the same file

- [`2c27d80`](https://github.com/hntrl/eventkit/commit/2c27d8064695e5d33039843826b147b09d6b9750) - Fixed some invariant behavior where the merge operator would wait for the scheduler promise instead of completion

- Updated dependencies [[`35f0ed7`](https://github.com/hntrl/eventkit/commit/35f0ed7feca076852c835defbede22a17210466e)]:
  - @eventkit/async-observable@0.1.1

## 0.1.0

### Minor Changes

- [`78687a5`](https://github.com/hntrl/eventkit/commit/78687a55a2d53bad9e7011c8ba3ec32625774a89) - v0.1.0 is the first official release of eventkit 🎉! Refer to the [docs](https://hntrl.github.io/eventkit) to get started.

### Patch Changes

- Updated dependencies [[`78687a5`](https://github.com/hntrl/eventkit/commit/78687a55a2d53bad9e7011c8ba3ec32625774a89)]:
  - @eventkit/async-observable@0.1.0
