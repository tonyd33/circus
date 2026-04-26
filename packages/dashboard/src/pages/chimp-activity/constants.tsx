import {
  AlertTriangle,
  BookOpen,
  Brain,
  Cog,
  FileBox,
  GitBranch,
  GitPullRequestArrow,
  Hash,
  Loader2,
  MessageCircle,
  MessageSquare,
  OctagonX,
  Radio,
  RefreshCw,
  ScrollText,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { ActivityEvent } from "@/lib/chimp";

export type ActivityMessage = ActivityEvent;

export function getMessageType(msg: ActivityMessage): string {
  switch (msg.type) {
    case "event":
      return msg.data.command;
    case "output":
      return msg.data.type;
    case "meta":
      return msg.data.type;
    case "unknown":
      return "unknown";
  }
}

export const messageTypeIcons: Record<string, React.ReactNode> = {
  "agent-message-response": <Brain className="h-3.5 w-3.5" />,
  "send-agent-message": <MessageSquare className="h-3.5 w-3.5" />,
  "command-received": <ScrollText className="h-3.5 w-3.5" />,
  error: <AlertTriangle className="h-3.5 w-3.5" />,
  progress: <Loader2 className="h-3.5 w-3.5" />,
  artifact: <FileBox className="h-3.5 w-3.5" />,
  stop: <OctagonX className="h-3.5 w-3.5" />,
  "new-session": <RefreshCw className="h-3.5 w-3.5" />,
  "clone-repo": <GitBranch className="h-3.5 w-3.5" />,
  "gh-clone-repo": <GitBranch className="h-3.5 w-3.5" />,
  "set-working-dir": <RefreshCw className="h-3.5 w-3.5" />,
  "set-system-prompt": <BookOpen className="h-3.5 w-3.5" />,
  "append-system-prompt": <BookOpen className="h-3.5 w-3.5" />,
  "set-allowed-tools": <Cog className="h-3.5 w-3.5" />,
  "setup-github-auth": <Terminal className="h-3.5 w-3.5" />,
  "subscribe-topic": <Sparkles className="h-3.5 w-3.5" />,
  "add-event-context": <Sparkles className="h-3.5 w-3.5" />,
  "chimp-request": <MessageCircle className="h-3.5 w-3.5" />,
  "discord-response": <Hash className="h-3.5 w-3.5" />,
  "github-comment": <GitPullRequestArrow className="h-3.5 w-3.5" />,
  thought: <Brain className="h-3.5 w-3.5" />,
};

export const typeIcons: Record<string, React.ReactNode> = {
  event: <Radio className="h-3 w-3" />,
  output: <Sparkles className="h-3 w-3" />,
};

export const sortByTimestamp = (a: ActivityMessage, b: ActivityMessage) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
