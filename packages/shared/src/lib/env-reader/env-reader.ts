import { Either as E } from "../fp";
import {
  customError,
  joinErrors,
  notFoundError,
  type ReadError,
  validationError,
} from "./errors";

export type ReadResult<A> = E.Either<ReadError, A>;
type Env = Record<string, string | undefined>;

export class EnvReader<A> {
  constructor(
    private readonly key: string,
    private readonly run: (env: Env) => ReadResult<A>,
  ) {}

  read(env: Env): ReadResult<A> {
    return this.run(env);
  }

  fallback(a: A): EnvReader<A> {
    return new EnvReader(this.key, (env) => this.run(env).fromRight(a));
  }

  predicate(f: (a: A) => boolean, why: string): EnvReader<A> {
    return new EnvReader(this.key, (env) =>
      this.run(env).flatMap((a: A) =>
        f(a) ? E.right(a) : E.left(validationError(this.key, why)),
      ),
    );
  }
}

export function fail(msg: string): EnvReader<never> {
  return new EnvReader("", (_) => E.left(customError(msg)));
}

export function str(key: string): EnvReader<string> {
  return new EnvReader(key, (env: Env) => {
    const value = env[key];
    if (value == null) {
      return E.left(notFoundError(key));
    } else {
      return E.right(value);
    }
  });
}

export function int(key: string): EnvReader<number> {
  return new EnvReader(key, (env: Env) => {
    const value = env[key];
    if (value == null) {
      return E.left(notFoundError(key));
    }
    const num = Number.parseInt(value, 10);
    return Number.isNaN(num)
      ? E.left(validationError(key, "Not a number"))
      : E.right(num);
  });
}

export function record<T extends Record<string, EnvReader<unknown>>>(
  readers: T,
): EnvReader<{
  [K in keyof T]: T[K] extends EnvReader<infer A> ? A : never;
}> {
  return new EnvReader("record", (env: Env) => {
    const entries = Object.entries(readers);
    const results = entries.map(([key, reader]) => ({
      key,
      result: reader.read(env),
    }));

    const { lefts, rights } = E.partition(results.map((r) => r.result));

    if (lefts.length > 0) {
      return E.left(joinErrors(lefts));
    }

    const result = Object.fromEntries(
      entries.map(([key], i) => [key, rights[i]]),
    );

    return E.right(
      result as {
        [K in keyof T]: T[K] extends EnvReader<infer A> ? A : never;
      },
    );
  });
}
