import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronLeft, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHomeworkStore } from "@/context/HomeworkContext";
import { apiRequest } from "@/lib/api";
import type { RevisionItemRecord } from "@/lib/app-types";

export default function StudentVocab() {
  const { currentStudent, lessons, revisionItems, groups } = useHomeworkStore();
  const studentId = currentStudent?.id ?? "";

  // Find groups this student belongs to
  const studentGroups = groups.filter((g) => g.students.includes(studentId));
  const studentGroupIds = new Set(studentGroups.map((g) => g.id));

  // Get lessons from student's groups, sorted most recent first
  const studentLessons = lessons
    .filter((lesson) => studentGroupIds.has(lesson.groupId))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Build a set of phrases already in revision
  const revisionPhrases = new Set(
    revisionItems
      .filter((ri) => ri.studentId === studentId)
      .map((ri) => ri.phrase?.toLowerCase().trim())
      .filter(Boolean),
  );

  const [addingPhrases, setAddingPhrases] = useState<Set<string>>(new Set());
  const [addedPhrases, setAddedPhrases] = useState<Set<string>>(new Set());

  const handleAddToRevision = async (phrase: string, context: string, lessonId: string) => {
    const key = `${lessonId}:${phrase}`;
    setAddingPhrases((prev) => new Set(prev).add(key));
    try {
      await apiRequest<{ revisionItem: RevisionItemRecord }>("/api/revision", {
        method: "POST",
        body: { phrase, context, lessonId },
      });
      setAddedPhrases((prev) => new Set(prev).add(key));
      toast.success(`"${phrase}" added to revision`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add phrase");
    } finally {
      setAddingPhrases((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const lessonsWithVocab = studentLessons.filter((lesson) => lesson.vocabulary.length > 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/student">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Vocabulary</h1>
          <p className="text-xs text-muted-foreground">
            {revisionItems.filter((ri) => ri.studentId === studentId && ri.consecutiveCorrect >= 1).length} phrases learned
          </p>
        </div>
      </div>

      {lessonsWithVocab.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="p-5 text-sm text-muted-foreground">
            No vocabulary has been covered in your lessons yet.
          </CardContent>
        </Card>
      ) : (
        lessonsWithVocab.map((lesson) => (
          <Card key={lesson.id} className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{lesson.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{lesson.date}</p>
            </CardHeader>
            <CardContent className="space-y-1">
              {lesson.vocabulary.map((vocab) => {
                const phraseKey = `${lesson.id}:${vocab.phrase}`;
                const inRevision =
                  revisionPhrases.has(vocab.phrase.toLowerCase().trim()) || addedPhrases.has(phraseKey);
                const isAdding = addingPhrases.has(phraseKey);

                return (
                  <div
                    key={vocab.phrase}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{vocab.phrase}</div>
                      <div className="text-xs text-muted-foreground truncate">{vocab.context}</div>
                    </div>
                    {inRevision ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 shrink-0 ml-2">
                        <Check className="h-3.5 w-3.5" />
                        In revision
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 ml-2 gap-1 text-xs"
                        disabled={isAdding}
                        onClick={() => handleAddToRevision(vocab.phrase, vocab.context, lesson.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add to revision
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
