export const unreachable = (_x: never): never => {
  throw new Error("Shouldn't get here");
};
