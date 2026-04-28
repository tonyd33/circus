import { treaty } from "@elysiajs/eden";
import type { App } from "@mnke/circus-api/app";

export const API_URL = "http://localhost:4773";
export const api = treaty<App>(API_URL);
