import { Standards } from "@mnke/circus-shared";
import { ArrowLeft, CircleDot, Loader2, Plus, X } from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Header = memo(function Header({
  chimpId,
  topics,
  connected,
  error,
}: {
  chimpId: string;
  topics: Standards.Topic.Topic[];
  connected: boolean;
  error: string | null;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTopic, setNewTopic] = useState({
    owner: "",
    repo: "",
    type: "pr" as "pr" | "issue",
    number: "",
  });

  const addTopic = async () => {
    const parsed = Standards.Topic.TopicSchema.safeParse({
      platform: "github",
      owner: newTopic.owner,
      repo: newTopic.repo,
      type: newTopic.type,
      number: parseInt(newTopic.number, 10),
    });
    if (!parsed.success) return;

    const res = await fetch(`/api/chimp/${chimpId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (res.ok) {
      window.location.reload();
    }
  };

  const isValid =
    newTopic.owner.trim() !== "" &&
    newTopic.repo.trim() !== "" &&
    newTopic.number !== "" &&
    !Number.isNaN(parseInt(newTopic.number, 10));

  const removeTopic = async (topic: Standards.Topic.Topic) => {
    const res = await fetch(`/api/chimp/${chimpId}/topics`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topic),
    });
    if (res.ok) {
      window.location.reload();
    }
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-bold text-circus-crimson">
              🐒 {chimpId}
            </h1>
            <div className="flex items-center gap-1.5 ml-2">
              {topics.map((t) => {
                const key = Standards.Topic.serializeTopic(t);
                return (
                  <Badge
                    key={key}
                    variant="outline"
                    className="text-xs font-mono cursor-pointer hover:bg-destructive/20 hover:border-destructive/50 hover:text-destructive transition-colors"
                    onClick={() => removeTopic(t)}
                  >
                    {t.platform === "github"
                      ? `${t.owner}/${t.repo}#${t.number}`
                      : key}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                );
              })}
              <Popover open={showAddForm} onOpenChange={setShowAddForm}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="ml-1 h-6 px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96">
                  <div className="space-y-4">
                    <h3 className="font-medium">Add Topic Subscription</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Owner (e.g. tonyd33)"
                        value={newTopic.owner}
                        onChange={(e) =>
                          setNewTopic((prev) => ({
                            ...prev,
                            owner: e.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Repo (e.g. circus)"
                        value={newTopic.repo}
                        onChange={(e) =>
                          setNewTopic((prev) => ({
                            ...prev,
                            repo: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={newTopic.type}
                        onValueChange={(v) =>
                          setNewTopic((prev) => ({
                            ...prev,
                            type: v as "pr" | "issue",
                          }))
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pr">PR</SelectItem>
                          <SelectItem value="issue">Issue</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Number"
                        value={newTopic.number}
                        onChange={(e) =>
                          setNewTopic((prev) => ({
                            ...prev,
                            number: e.target.value,
                          }))
                        }
                        className="flex-1"
                      />
                    </div>
                    <Button onClick={addTopic} disabled={!isValid}>
                      Subscribe
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
            ) : (
              <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
            )}
            <span className="text-sm text-muted-foreground">
              {connected ? "Live" : error || "Connecting..."}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
});
