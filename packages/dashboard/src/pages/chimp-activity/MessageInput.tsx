import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageInput({ chimpId }: { chimpId: string }) {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    if (!prompt.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chimp/${chimpId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) setPrompt("");
    } finally {
      setSending(false);
    }
  }

  return (
    <footer className="sticky bottom-0 border-t border-border bg-card/80 backdrop-blur-sm p-4">
      <div className="container mx-auto flex gap-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Send a message..."
          className="min-h-10 max-h-40 resize-none"
          disabled={sending}
        />
        <Button
          onClick={sendMessage}
          disabled={sending || !prompt.trim()}
          size="icon"
          className="shrink-0 self-end"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </footer>
  );
}
