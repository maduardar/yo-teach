import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type MatchingPair } from "@/lib/homework-types";

type MatchingPairsBoardProps = {
  pairs: MatchingPair[];
  rightOrder: string[];
  onChange?: (nextOrder: string[]) => void;
  interactive?: boolean;
};

function reorderItems(items: string[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

export function MatchingPairsBoard({
  pairs,
  rightOrder,
  onChange,
  interactive = false,
}: MatchingPairsBoardProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (!interactive || !onChange) {
      return;
    }

    onChange(reorderItems(rightOrder, fromIndex, toIndex));
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Phrases</div>
        {pairs.map((pair, index) => (
          <div
            key={pair.left}
            className={`flex min-h-12 items-center rounded-xl border px-4 py-3 text-sm font-medium ${
              index % 2 === 0 ? "bg-muted/20" : "bg-muted/40"
            }`}
          >
            <span>{pair.left}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Meanings</div>
        {rightOrder.map((meaning, index) => (
          <div
            key={`${meaning}-${index}`}
            draggable={interactive}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => {
              if (interactive) {
                event.preventDefault();
              }
            }}
            onDrop={() => {
              if (draggedIndex === null) {
                return;
              }

              moveItem(draggedIndex, index);
              setDraggedIndex(null);
            }}
            onDragEnd={() => setDraggedIndex(null)}
            className={`flex min-h-12 items-center rounded-xl border px-3 py-2 text-sm transition-colors ${
              interactive
                ? "cursor-grab bg-background hover:border-primary/40 hover:bg-primary/5"
                : index % 2 === 0 ? "bg-muted/20" : "bg-muted/40"
            } ${draggedIndex === index ? "border-primary/60 bg-primary/10" : ""}`}
          >
            {interactive && <GripVertical className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="flex-1">{meaning}</span>
            {interactive && onChange && (
              <div className="ml-2 flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveItem(index, index - 1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveItem(index, index + 1)}
                  disabled={index === rightOrder.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
