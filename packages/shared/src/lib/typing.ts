export const unreachable = (x: never): never => {
  throw new Error("Shouldn't get here");
};
