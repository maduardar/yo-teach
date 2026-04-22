import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";

type SentenceBuildingBoardProps = {
  tokens: string[];
  value: string;
  onChange: (nextValue: string) => void;
};

type DragSource =
  | { area: "available"; token: string }
  | { area: "placed"; index: number; token: string };

export function SentenceBuildingBoard({ tokens, value, onChange }: SentenceBuildingBoardProps) {
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const sentenceRef = useRef<HTMLDivElement>(null);

  const placed = value ? value.split(" ") : [];
  const available = [...tokens];
  for (const word of placed) {
    const idx = available.indexOf(word);
    if (idx !== -1) available.splice(idx, 1);
  }

  const placeToken = (token: string) => {
    onChange([...placed, token].join(" "));
  };

  const removeToken = (index: number) => {
    const next = [...placed];
    next.splice(index, 1);
    onChange(next.join(" "));
  };

  const insertToken = (token: string, targetIndex: number) => {
    const next = [...placed];
    next.splice(targetIndex, 0, token);
    onChange(next.join(" "));
  };

  const moveToken = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...placed];
    const [moved] = next.splice(fromIndex, 1);
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    next.splice(adjustedTo, 0, moved);
    onChange(next.join(" "));
  };

  const handleDrop = (targetIndex: number) => {
    if (!dragSource) return;
    if (dragSource.area === "available") {
      insertToken(dragSource.token, targetIndex);
    } else {
      moveToken(dragSource.index, targetIndex);
    }
    setDragSource(null);
    setDropTarget(null);
  };

  const handleSentenceAreaDrop = () => {
    if (!dragSource) return;
    if (dragSource.area === "available") {
      placeToken(dragSource.token);
    } else if (dragSource.area === "placed") {
      // Dropping on the general area (not a specific slot) — move to end
      const next = [...placed];
      const [moved] = next.splice(dragSource.index, 1);
      next.push(moved);
      onChange(next.join(" "));
    }
    setDragSource(null);
    setDropTarget(null);
  };

  const handleAvailableAreaDrop = () => {
    if (!dragSource) return;
    if (dragSource.area === "placed") {
      removeToken(dragSource.index);
    }
    setDragSource(null);
    setDropTarget(null);
  };

  const dropIndicator = (index: number) => {
    const isActive = dropTarget === index;
    return (
      <div
        className={`flex w-1 shrink-0 items-stretch self-stretch rounded transition-all ${isActive ? "w-1.5 bg-primary" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(index);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDrop(index);
        }}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Available words</p>
        <div
          className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-dashed p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleAvailableAreaDrop();
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
              onDragStart={() => setDragSource({ area: "available", token })}
              onDragEnd={() => { setDragSource(null); setDropTarget(null); }}
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
          ref={sentenceRef}
          className="flex min-h-12 flex-wrap items-center gap-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleSentenceAreaDrop();
          }}
        >
          {placed.length === 0 && (
            <span className="text-xs text-muted-foreground">Tap words above to build your sentence</span>
          )}
          {placed.map((token, i) => (
            <span key={`placed-${token}-${i}`} className="flex items-center">
              {dropIndicator(i)}
              <Badge
                variant="default"
                className={`cursor-grab select-none text-sm active:cursor-grabbing ${
                  dragSource?.area === "placed" && dragSource.index === i ? "opacity-40" : ""
                }`}
                draggable
                onDragStart={() => setDragSource({ area: "placed", index: i, token })}
                onDragEnd={() => { setDragSource(null); setDropTarget(null); }}
                onClick={() => removeToken(i)}
              >
                {token}
              </Badge>
              {i === placed.length - 1 && dropIndicator(placed.length)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
