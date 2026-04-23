import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ExpandableJSONProps {
  data: unknown;
  label?: string;
  className?: string;
}

export function ExpandableJSON({
  data,
  label = "Raw JSON",
  className = "",
}: ExpandableJSONProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-200"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <pre
          className={`text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto max-h-64 ${className}`}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
