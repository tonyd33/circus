import { StringParser as P } from "@mnke/circus-shared/lib";

export const parseKeyValueForKey = <T extends string>(
  key: T,
): P.Parser<{ key: T; value: string }> =>
  P.Do()
    .do(P.str(key))
    .do(P.grapheme("="))
    .bind("value", P.flat(P.many1(P.noneOf(","))))
    .return(({ value }) => ({ key, value }));

export const parseKeyValueObjectForKeys = <const T extends readonly string[]>(
  keys: T,
): P.Parser<Record<T[number], string>> =>
  P.Do()
    .bind(
      "kvs",
      P.sepBy(
        P.choice(keys.map((k) => parseKeyValueForKey(k))),
        P.grapheme(","),
      ),
    )
    .bindL("obj", (env) => {
      const obj = Object.fromEntries(
        env.kvs.map(({ key, value }) => [key, value]),
      );
      const missing = keys.filter((k) => !(k in obj));
      if (missing.length > 0) {
        return P.fail(`missing keys: ${missing.join(", ")}`);
      }
      return P.of(obj);
    })
    .return((env) => env.obj as Record<T[number], string>);
