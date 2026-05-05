import { treaty } from "@elysiajs/eden";
import type { App } from "@mnke/circus-api/app";

declare global {
  interface Window {
    __API_URL__: string;
  }
}

export const API_URL = window.__API_URL__ ?? "";
export const api = treaty<App>(API_URL || window.location.origin);
