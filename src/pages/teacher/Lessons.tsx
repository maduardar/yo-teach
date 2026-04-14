import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowRight } from "lucide-react";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function TeacherLessons() {
  const { groups, lessons } = useHomeworkStore();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  const filtered = selectedGroupId === "all"
    ? lessons
    : lessons.filter(l => l.groupId === selectedGroupId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lessons</h1>
          <p className="text-sm text-muted-foreground">Your lesson history</p>
        </div>
        <Link to="/teacher/lessons/new">
          <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Log lesson</Button>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Group:</span>
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {groups.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map((l) => {
          const group = groups.find(g => g.id === l.groupId);
          return (
            <Link key={l.id} to={`/teacher/lessons/${l.id}`}>
              <Card className="shadow-card transition-shadow hover:shadow-card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold">{l.title}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{l.date} · {group?.name}</div>
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {l.grammar.map(g => <Badge key={g} className="text-xs">{g}</Badge>)}
                      {l.vocabulary.map(v => <Badge key={v.phrase} variant="outline" className="text-xs font-normal">{v.phrase}</Badge>)}
                    </div>
                    {l.studentMistakes.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        {l.studentMistakes.length} student mistakes recorded
                      </div>
                    )}
                  </div>
                    <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No lessons for this group yet.</div>
        )}
      </div>
    </div>
  );
}
