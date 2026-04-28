import { cors } from "@elysiajs/cors";

export const corsPlugin = (origin: string) =>
  cors({
    origin,
    credentials: false,
  });
