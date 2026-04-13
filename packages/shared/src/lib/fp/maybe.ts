export type Nothing = { type: "nothing" };
export type Just<A> = { type: "just"; value: A };

const nothing: Nothing = { type: "nothing" };

class Maybe<A> {
  private _value: Nothing | Just<A>;

  constructor(value: Nothing | Just<A>) {
    this._value = value;
  }

  get value(): Nothing | Just<A> {
    return this._value;
  }

  map<B>(f: (b: A) => B): Maybe<B> {
    if (this._value.type === "nothing") {
      return new Maybe(nothing);
    } else {
      return new Maybe({ type: "just", value: f(this._value.value) });
    }
  }

  flatMap<B>(f: (b: A) => Maybe<B>): Maybe<B> {
    if (this._value.type === "nothing") {
      return new Maybe(nothing);
    }
    return f(this._value.value);
  }

  ap<B>(maybeF: Maybe<(a: A) => B>): Maybe<B> {
    if (maybeF.value.type === "nothing") {
      return new Maybe(nothing);
    }
    if (this._value.type === "nothing") {
      return new Maybe(nothing);
    }
    return new Maybe({
      type: "just",
      value: maybeF.value.value(this._value.value),
    });
  }

  unwrapOrNull(): A | null {
    if (this._value.type === "nothing") {
      return null;
    } else {
      return this._value.value;
    }
  }
}

export function fromNullish<T>(x: null | undefined | T): Maybe<T> {
  if (x == null) {
    return new Maybe({ type: "nothing" });
  } else {
    return new Maybe({ type: "just", value: x });
  }
}

export function just<A>(x: A): Maybe<A> {
  return new Maybe({ type: "just", value: x });
}

export function sequenceRecord<T extends Record<string, Maybe<unknown>>>(
  record: T,
): Maybe<{ [K in keyof T]: T[K] extends Maybe<infer A> ? A : never }> {
  const result: Record<string, unknown> = {};
  for (const [key, maybeValue] of Object.entries(record)) {
    if (maybeValue.value.type === "nothing") {
      return new Maybe(nothing);
    }
    result[key] = maybeValue.value.value;
  }
  return new Maybe({
    type: "just",
    value: result as {
      [K in keyof T]: T[K] extends Maybe<infer A> ? A : never;
    },
  });
}
