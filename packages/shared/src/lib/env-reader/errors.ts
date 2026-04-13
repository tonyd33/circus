import * as Typing from "../typing";

type NotFoundError = { type: "not_found"; key: string };
type ValidationError = { type: "invalid"; key: string; why: string };
type MultipleErrors = { type: "multiple"; errors: ReadError[] };
type CustomError = { type: "custom"; message: string };

export type ReadError =
  | NotFoundError
  | ValidationError
  | MultipleErrors
  | CustomError;

export const notFoundError = (key: string): ReadError => ({
  type: "not_found",
  key,
});
export const validationError = (key: string, why: string): ReadError => ({
  type: "invalid",
  key,
  why,
});
export const joinErrors = (errors: ReadError[]): ReadError => ({
  type: "multiple",
  errors,
});
export const customError = (message: string): ReadError => ({
  type: "custom",
  message,
});

export function formatReadError(error: ReadError): string {
  switch (error.type) {
    case "not_found":
      return `${error.key}: not found`;
    case "invalid":
      return `${error.key}: ${error.why}`;
    case "multiple":
      return error.errors.map((e) => formatReadError(e)).join("\n");
    case "custom":
      return error.message;
    default:
      return Typing.unreachable(error);
  }
}
