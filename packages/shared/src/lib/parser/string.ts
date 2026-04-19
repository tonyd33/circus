import { Either as E } from "../fp";

type ParseErrorEOF = { type: "eof" };
type ParseErrorMismatch = { type: "mismatch"; desc: string };
type ParseErrorCustom = { type: "custom"; message: string };
type ParseError = ParseErrorEOF | ParseErrorMismatch | ParseErrorCustom;

const eofError = (): ParseError => ({ type: "eof" });

const mismatchError = (desc: string): ParseError => ({
  type: "mismatch",
  desc,
});

const customError = (message: string): ParseError => ({
  type: "custom",
  message,
});

export type ParseResult<A> = E.Either<ParseError, [string, A]>;

type Grapheme = string;
type Graphemes = string;

export class Parser<A> {
  constructor(readonly run: (s: string) => ParseResult<A>) {}

  parse(s: string): E.Either<ParseError, A> {
    return this.run(s).map(([_, a]) => a);
  }

  map<B>(f: (a: A) => B): Parser<B> {
    return new Parser((s) => this.run(s).map(([rest, a]) => [rest, f(a)]));
  }

  flatMap<B>(f: (a: A) => Parser<B>): Parser<B> {
    return new Parser<B>((s) =>
      this.run(s).flatMap(([rest, a]) => f(a).run(rest)),
    );
  }

  ap<B>(pf: Parser<(a: A) => B>): Parser<B> {
    return new Parser<B>((s) =>
      pf
        .run(s)
        .flatMap(([rest1, f]) =>
          this.run(rest1).map(([rest2, a]): [string, B] => [rest2, f(a)]),
        ),
    );
  }

  alt(that: Parser<A>): Parser<A> {
    return new Parser((s) => {
      const r = this.run(s);
      if (r.isRight()) return r;
      return that.run(s);
    });
  }
}

export function predicate(
  f: (s: Grapheme) => boolean,
  desc: string,
): Parser<Grapheme> {
  return new Parser<Grapheme>((s) => {
    if (s[0] == null) return E.left(eofError());
    else if (f(s[0])) return E.right([s.slice(1), s[0]]);
    else return E.left(mismatchError(desc));
  });
}

export function of<A>(a: A): Parser<A> {
  return new Parser((s) => E.right([s, a]));
}

export function fail(message: string): Parser<never> {
  return new Parser((_) => E.left(customError(message)));
}

export function grapheme(x: Grapheme): Parser<Grapheme> {
  return predicate((s) => s === x, `expected ${x}`);
}

export function oneOf(graphemes: Graphemes): Parser<Grapheme> {
  return predicate((s) => graphemes.includes(s), `one of ${graphemes}`);
}

export function noneOf(graphemes: Graphemes): Parser<Grapheme> {
  return predicate((s) => !graphemes.includes(s), `none of ${graphemes}`);
}

export function any() {
  return predicate((_) => true, "any");
}

export function str(x: string): Parser<string> {
  return new Parser((s) => {
    if (s.startsWith(x)) return E.right([s.slice(x.length), x]);
    else return E.left(mismatchError(`expected ${x}`));
  });
}

export function strLit<const T extends string>(x: T): Parser<T> {
  return new Parser((s) => {
    if (s.startsWith(x)) return E.right([s.slice(x.length), x]);
    else return E.left({ type: "mismatch", desc: `expected ${x}` });
  });
}

export function many<A>(parser: Parser<A>): Parser<A[]> {
  return new Parser((s) => {
    const xs: A[] = [];
    let rest = s;
    let e = parser.run(rest).value;

    while (!E.isLeft(e)) {
      const [next, a] = e.value;
      xs.push(a);
      rest = next;
      e = parser.run(rest).value;
    }

    return E.right([rest, xs]);
  });
}

export function many1<A>(parser: Parser<A>): Parser<A[]> {
  return parser.flatMap((first) =>
    many(parser).map((rest) => [first, ...rest]),
  );
}

/**
 * IMPROVE: accumulate errors
 */
export function choice<A>(parsers: Parser<A>[]): Parser<A> {
  return new Parser((s) => {
    for (const p of parsers) {
      const r = p.run(s);
      if (r.isRight()) return r;
    }
    return E.left({ type: "mismatch", desc: "choice" });
  });
}

export function sepBy1<A, B>(parser: Parser<A>, psep: Parser<B>): Parser<A[]> {
  return parser.flatMap((first) =>
    many(psep.flatMap(() => parser)).map((rest) => [first, ...rest]),
  );
}

export function sepBy<A, B>(parser: Parser<A>, psep: Parser<B>): Parser<A[]> {
  return sepBy1(parser, psep).alt(new Parser((s) => E.right([s, []])));
}

export function option<A>(a: A, parser: Parser<A>): Parser<A> {
  return parser.alt(new Parser((s) => E.right([s, a])));
}

export function optional<A>(parser: Parser<A>): Parser<void> {
  return parser
    .map(() => undefined as undefined)
    .alt(new Parser((s) => E.right([s, undefined as undefined])));
}

export function flat(parser: Parser<string[]>): Parser<string> {
  return parser.map((xs) => xs.join(""));
}

export function lift2<A, B, C>(
  f: (a: A, b: B) => C,
  pa: Parser<A>,
  pb: Parser<B>,
): Parser<C> {
  return new Parser((s) =>
    pa
      .run(s)
      .flatMap(([rest1, a]) =>
        pb.run(rest1).map(([rest2, b]): [string, C] => [rest2, f(a, b)]),
      ),
  );
}

export function between<A, B, C>(
  open: Parser<A>,
  content: Parser<B>,
  close: Parser<C>,
): Parser<B> {
  return open.flatMap(() => content.flatMap((b) => close.map(() => b)));
}

class DoBuilder<A extends Record<string, unknown>> {
  constructor(private parser: Parser<A>) {}

  do<B>(p: Parser<B>): DoBuilder<A> {
    return new DoBuilder(this.parser.flatMap((a) => p.map((_) => a)));
  }

  bind<const T extends string, B>(
    variable: T,
    p: Parser<B>,
  ): DoBuilder<A & { [key in T]: B }> {
    return new DoBuilder(
      this.parser.flatMap((a) =>
        p.map(
          (b) =>
            ({ ...a, [variable satisfies T]: b }) satisfies A & {
              [key in T]: B;
            },
        ),
      ),
    );
  }

  bindL<const T extends string, B>(
    variable: T,
    lp: (env: A) => Parser<B>,
  ): DoBuilder<A & { [key in T]: B }> {
    return new DoBuilder(
      this.parser.flatMap((a) =>
        lp(a).map(
          (b) =>
            ({ ...a, [variable satisfies T]: b }) satisfies A & {
              [key in T]: B;
            },
        ),
      ),
    );
  }

  return<B>(f: (env: A) => B): Parser<B> {
    return this.parser.map(f);
  }
}

export function Do(): DoBuilder<{}> {
  return new DoBuilder(of({}));
}
