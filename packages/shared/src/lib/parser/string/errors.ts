type ParseErrorEOF = { type: "eof" };
type ParseErrorMismatch = { type: "mismatch"; desc: string };
type ParseErrorCustom = { type: "custom"; message: string };

export type ParseError = ParseErrorEOF | ParseErrorMismatch | ParseErrorCustom;

export const eofError = (): ParseError => ({ type: "eof" });

export const mismatchError = (desc: string): ParseError => ({
  type: "mismatch",
  desc,
});

export const customError = (message: string): ParseError => ({
  type: "custom",
  message,
});
