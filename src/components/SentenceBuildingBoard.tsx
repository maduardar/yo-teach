import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type SentenceBuildingBoardProps = {
  tokens: string[];
  value: string;
  onChange: (nextValue: string) => void;
};

export function SentenceBuildingBoard({ tokens, value, onChange }: SentenceBuildingBoardProps) {
  const [draggedToken, setDraggedToken] = useState<string | null>(null);

  const placed = value ? value.split(" ") : [];
  const available = [...tokens];
  for (const word of placed) {
    const idx = available.indexOf(word);
    if (idx !== -1) available.splice(idx, 1);
  }

  const placeToken = (token: string) => {
    const next = [...placed, token];
    onChange(next.join(" "));
  };

  const removeToken = (index: number) => {
    const next = [...placed];
    next.splice(index, 1);
    onChange(next.join(" "));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Available words</p>
        <div
          className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-dashed p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedToken === null) return;
            const idx = placed.indexOf(draggedToken);
            if (idx !== -1) removeToken(idx);
            setDraggedToken(null);
          }}
        >
          {available.length === 0 && (
            <span className="text-xs text-muted-foreground">All words placed</span>
          )}
          {available.map((token, i) => (
            <Badge
              key={`${token}-${i}`}
              variant="outline"
              className="cursor-pointer select-none text-sm transition-colors hover:bg-primary/10 hover:border-primary/40"
              draggable
              onDragStart={() => setDraggedToken(token)}
              onDragEnd={() => setDraggedToken(null)}
              onClick={() => placeToken(token)}
            >
              {token}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your sentence</p>
        <div
          className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedToken === null) return;
            const availIdx = available.indexOf(draggedToken);
            if (availIdx !== -1) {
              placeToken(draggedToken);
            }
            setDraggedToken(null);
          }}
        >
          {placed.length === 0 && (
            <span className="text-xs text-muted-foreground">Tap words above to build your sentence</span>
          )}
          {placed.map((token, i) => (
            <Badge
              key={`placed-${token}-${i}`}
              variant="default"
              className="cursor-pointer select-none text-sm"
              draggable
              onDragStart={() => setDraggedToken(token)}
              onDragEnd={() => setDraggedToken(null)}
              onClick={() => removeToken(i)}
            >
              {token}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
