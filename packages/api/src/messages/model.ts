import { z } from "zod";

export const SendMessageBody = z.object({
  prompt: z.string().min(1),
});
