/**
 * An error thrown when an element was queried at a certain index of an
 * observable, but no such index or position exists in that sequence.
 *
 * @see {@link elementAt}
 * @group Errors
 */
export class ArgumentOutOfRangeError extends Error {
  /** @internal */
  constructor() {
    super("argument out of range");
    this.name = "ArgumentOutOfRangeError";
  }
}

/**
 * An error thrown when an invalid concurrency limit is provided to an operator.
 *
 * @see {@link QueueScheduler}
 * @see {@link SubjectQueueScheduler}
 * @group Errors
 */
export class InvalidConcurrencyLimitError extends Error {
  /** @internal */
  constructor() {
    super("invalid concurrency limit");
    this.name = "InvalidConcurrencyLimitError";
  }
}

/**
 * An error thrown when an observable completes without emitting any valid values.
 *
 * @group Errors
 */
export class NoValuesError extends Error {
  /** @internal */
  constructor() {
    super("no values");
    this.name = "NoValuesError";
  }
}
