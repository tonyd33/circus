import { Filter } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const FilterPopover = memo(function FilterPopover({
  selectedTypes,
  groupedTypes,
  onToggle,
  onClear,
  messageCount,
  totalCount,
}: {
  selectedTypes: Set<string>;
  groupedTypes: { event: string[]; output: string[] };
  onToggle: (type: string) => void;
  onClear: () => void;
  messageCount: number;
  totalCount: number;
}) {
  const isFiltering = selectedTypes.size > 0;

  return (
    <div className="flex items-center gap-3 mb-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filter types
            {isFiltering && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {selectedTypes.size}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 sm:w-56 p-3">
          {isFiltering && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              Clear all
            </button>
          )}
          {(
            [
              {
                label: "Events",
                color: "text-amber-500",
                items: groupedTypes.event,
              },
              {
                label: "Output",
                color: "text-ring",
                items: groupedTypes.output,
              },
            ] as const
          ).map(
            ({ label, color, items }) =>
              items.length > 0 && (
                <div key={label} className="mb-2">
                  <p className={`text-xs font-medium ${color} mb-1.5`}>
                    {label}
                  </p>
                  <div className="space-y-1.5">
                    {items.map((mt) => (
                      <label
                        key={mt}
                        htmlFor={`filter-${mt}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          id={`filter-${mt}`}
                          checked={selectedTypes.has(mt)}
                          onCheckedChange={() => onToggle(mt)}
                        />
                        <span className="text-sm font-mono">{mt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ),
          )}
        </PopoverContent>
      </Popover>
      {isFiltering && (
        <span className="text-xs text-muted-foreground">
          {messageCount} of {totalCount}
        </span>
      )}
    </div>
  );
});
