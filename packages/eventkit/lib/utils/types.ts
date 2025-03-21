import { type AsyncObservableInput } from "@eventkit/async-observable";

/**
 * A simple type to represent a gamut of "falsy" values... with a notable exception:
 * `NaN` is "falsy" however, it is not and cannot be typed via TypeScript. See
 * comments here: https://github.com/microsoft/TypeScript/issues/28682#issuecomment-707142417
 */
export type Falsy = null | undefined | false | 0 | -0 | 0n | "";

export type TruthyTypesOf<T> = T extends Falsy ? never : T;

export type AsyncObservableInputTuple<T> = {
  [K in keyof T]: AsyncObservableInput<T[K]>;
};
