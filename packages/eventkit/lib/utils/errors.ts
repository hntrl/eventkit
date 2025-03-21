/**
 * An error thrown when an element was queried at a certain index of an
 * observable, but no such index or position exists in that sequence.
 *
 * @see {@link elementAt}
 * @see {@link take}
 * @see {@link takeLast}
 */
export class ArgumentOutOfRangeError extends Error {
  /** @internal */
  constructor() {
    super("argument out of range");
    this.name = "ArgumentOutOfRangeError";
  }
}
