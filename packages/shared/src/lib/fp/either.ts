export type Left<E> = { type: "left"; value: E };
export type Right<A> = { type: "right"; value: A };
type _Either<E, A> = Left<E> | Right<A>;

export class Either<E, A> {
  private readonly _value: _Either<E, A>;

  constructor(value: _Either<E, A>) {
    this._value = value;
  }

  get value(): _Either<E, A> {
    return this._value;
  }

  map<B>(f: (a: A) => B): Either<E, B> {
    if (this._value.type === "left") {
      return new Either<E, B>(this._value);
    } else {
      return new Either<E, B>({ type: "right", value: f(this._value.value) });
    }
  }

  flatMap<B>(f: (a: A) => Either<E, B>): Either<E, B> {
    if (this._value.type === "left") {
      return new Either<E, B>(this._value);
    }
    return f(this._value.value);
  }

  ap<B>(eitherF: Either<E, (a: A) => B>): Either<E, B> {
    if (eitherF._value.type === "left") {
      return new Either<E, B>(eitherF._value);
    }
    if (this._value.type === "left") {
      return new Either<E, B>(this._value);
    }
    return new Either<E, B>({
      type: "right",
      value: eitherF._value.value(this._value.value),
    });
  }

  mapLeft<F>(f: (e: E) => F): Either<F, A> {
    if (this._value.type === "left") {
      return new Either<F, A>({ type: "left", value: f(this._value.value) });
    } else {
      return new Either<F, A>(this._value);
    }
  }

  fromRight(a: A): Either<E, A> {
    if (this._value.type === "left") {
      return new Either<E, A>({ type: "right", value: a });
    } else {
      return new Either<E, A>(this._value);
    }
  }

  unwrap(): E | A {
    return this._value.value;
  }

  unwrapOr<B>(defaultValue: B): A | B {
    if (this._value.type === "left") {
      return defaultValue;
    } else {
      return this._value.value;
    }
  }

  isLeft(): this is Either<E, never> {
    return this._value.type === "left";
  }

  isRight(): this is Either<never, A> {
    return this._value.type === "right";
  }
}

export function left<E, A>(error: E): Either<E, A> {
  return new Either<E, A>({ type: "left", value: error });
}

export function right<E, A>(value: A): Either<E, A> {
  return new Either<E, A>({ type: "right", value: value });
}

export function sequenceRecord<E, T extends Record<string, Either<E, unknown>>>(
  record: T,
): Either<E, { [K in keyof T]: T[K] extends Either<E, infer A> ? A : never }> {
  const result: Record<string, unknown> = {};
  for (const [key, eitherValue] of Object.entries(record)) {
    if (eitherValue.value.type === "left") {
      return new Either<
        E,
        { [K in keyof T]: T[K] extends Either<E, infer A> ? A : never }
      >(eitherValue.value);
    }
    result[key] = eitherValue.value.value;
  }
  return new Either<
    E,
    { [K in keyof T]: T[K] extends Either<E, infer A> ? A : never }
  >({
    type: "right",
    value: result as {
      [K in keyof T]: T[K] extends Either<E, infer A> ? A : never;
    },
  });
}
export function isLeft<E, A>(x: Left<E> | Right<A>): x is Left<E> {
  return x.type === "left";
}

export function isRight<E, A>(x: Left<E> | Right<A>): x is Right<A> {
  return x.type === "right";
}

export function partition<E, A>(
  eithers: Either<E, A>[],
): { lefts: E[]; rights: A[] } {
  const lefts: E[] = [];
  const rights: A[] = [];
  for (const either of eithers) {
    if (either.value.type === "left") {
      lefts.push(either.value.value);
    } else {
      rights.push(either.value.value);
    }
  }
  return { lefts, rights };
}
