import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHomeworkStore } from "@/context/HomeworkContext";
import {
  DEFAULT_HOMEWORK_GENERATION_MODEL,
  HOMEWORK_GENERATION_MODEL_LABELS,
  type HomeworkGenerationModel,
} from "@/lib/homework-generation-models";

type MistakeEntry = {
  id: string;
  studentId: string;
  text: string;
};

function buildVocabBulk(
  vocabulary: {
    phrase: string;
    context: string;
  }[],
) {
  return vocabulary.map((item) => (item.context ? `${item.phrase} (${item.context})` : item.phrase)).join("\n");
}

function buildMistakeEntries(
  studentMistakes: {
    studentId: string;
    mistake: string;
    correction: string;
    category: string;
  }[],
): MistakeEntry[] {
  if (studentMistakes.length === 0) {
    return [{ id: "me-1", studentId: "", text: "" }];
  }

  return studentMistakes.map((mistake, index) => ({
    id: `me-${index + 1}`,
    studentId: mistake.studentId,
    text: [mistake.mistake, mistake.correction || mistake.category].filter(Boolean).join("\n"),
  }));
}

export default function TeacherLessonDetail() {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  const { lessons, groups, students, homeworks, updateLesson, deleteLesson, deleteHomework } = useHomeworkStore();
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? null;

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [date, setDate] = useState(lesson?.date ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState(lesson?.groupId ?? "");
  const [grammar, setGrammar] = useState<string[]>(lesson?.grammar ?? []);
  const [grammarInput, setGrammarInput] = useState("");
  const [vocabBulk, setVocabBulk] = useState(buildVocabBulk(lesson?.vocabulary ?? []));
  const [notes, setNotes] = useState(lesson?.notes ?? "");
  const [mistakeEntries, setMistakeEntries] = useState<MistakeEntry[]>(buildMistakeEntries(lesson?.studentMistakes ?? []));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingHomeworkId, setDeletingHomeworkId] = useState<string | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generationModel, setGenerationModel] = useState<HomeworkGenerationModel>(DEFAULT_HOMEWORK_GENERATION_MODEL);

  useEffect(() => {
    if (!lesson) {
      return;
    }

    setTitle(lesson.title);
    setDate(lesson.date);
    setSelectedGroupId(lesson.groupId);
    setGrammar(lesson.grammar);
    setVocabBulk(buildVocabBulk(lesson.vocabulary));
    setNotes(lesson.notes);
    setMistakeEntries(buildMistakeEntries(lesson.studentMistakes));
  }, [lesson]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const groupStudents = selectedGroup ? students.filter((student) => selectedGroup.students.includes(student.id)) : [];
  const lessonHomeworks = useMemo(
    () => (lesson ? homeworks.filter((homework) => homework.lessonId === lesson.id) : []),
    [homeworks, lesson],
  );

  const parsedVocab = vocabBulk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*\((.+)\)\s*$/);
      if (match) {
        return { phrase: match[1].trim(), context: match[2].trim() };
      }

      return { phrase: line, context: "" };
    });

  const addGrammar = () => {
    if (!grammarInput.trim()) {
      return;
    }

    setGrammar((current) => [...current, grammarInput.trim()]);
    setGrammarInput("");
  };

  const addMistakeEntry = () => {
    setMistakeEntries((current) => [...current, { id: `me-${Date.now()}`, studentId: "", text: "" }]);
  };

  const updateMistakeEntry = (id: string, field: "studentId" | "text", value: string) => {
    setMistakeEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)));
  };

  const removeMistakeEntry = (id: string) => {
    setMistakeEntries((current) => current.filter((entry) => entry.id !== id));
  };

  if (!lesson) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Lesson not found</h1>
          <p className="text-sm text-muted-foreground">Open a lesson from the lessons page.</p>
        </div>
        <Link to="/teacher/lessons">
          <Button variant="outline">Back to lessons</Button>
        </Link>
      </div>
    );
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Lesson title is required.");
      return;
    }

    if (!selectedGroupId) {
      toast.error("Select a group.");
      return;
    }

    setSaving(true);

    try {
      await updateLesson(lesson.id, {
        groupId: selectedGroupId,
        title,
        date,
        grammar,
        vocabulary: parsedVocab,
        notes,
        studentMistakes: mistakeEntries
          .map((entry) => {
            const [firstLine = "", secondLine = ""] = entry.text
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);

            const arrowParts = firstLine.split("→").map((part) => part.trim()).filter(Boolean);
            const mistake = arrowParts[0] ?? firstLine;
            const correction = arrowParts[1] ?? secondLine;

            return {
              studentId: entry.studentId,
              mistake,
              correction: correction ?? "",
              category: secondLine && secondLine !== correction ? secondLine : "lesson note",
            };
          })
          .filter((entry) => entry.studentId && entry.mistake),
      });

      toast.success("Lesson updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update lesson.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this lesson? Homeworks linked to it will also be removed.")) {
      return;
    }

    setDeleting(true);

    try {
      await deleteLesson(lesson.id);
      toast.success("Lesson deleted.");
      navigate("/teacher/lessons");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete lesson.");
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenGenerator = () => {
    navigate(`/teacher/homework/generate?lessonId=${lesson.id}&model=${generationModel}`);
    setGenerateDialogOpen(false);
  };

  const handleDeleteHomework = async (homeworkId: string) => {
    if (!window.confirm("Delete this draft homework?")) {
      return;
    }

    setDeletingHomeworkId(homeworkId);
    try {
      await deleteHomework(homeworkId);
      toast.success("Draft homework deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete draft homework.");
    } finally {
      setDeletingHomeworkId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to="/teacher/lessons"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to lessons
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          <p className="text-sm text-muted-foreground">
            {groups.find((group) => group.id === lesson.groupId)?.name ?? "Group"} · {lessonHomeworks.length} homework
            {lessonHomeworks.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setGenerateDialogOpen(true)}
          >
              <Sparkles className="h-3.5 w-3.5" />
              Generate homework
          </Button>
          <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "Deleting..." : "Delete lesson"}
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lesson Homework</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lessonHomeworks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No homework is linked to this lesson yet.
            </div>
          ) : (
            lessonHomeworks.map((homework) => (
              <div key={homework.id} className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/teacher/homework/generate?lessonId=${lesson.id}&homeworkId=${homework.id}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="text-sm font-medium">{homework.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Due {homework.dueDate}</div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant={homework.status === "published" ? "default" : "secondary"}>{homework.status}</Badge>
                    {homework.status === "draft" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deletingHomeworkId === homework.id}
                        onClick={() => void handleDeleteHomework(homework.id)}
                        aria-label="Delete draft homework"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose generation model</DialogTitle>
            <DialogDescription>
              Select which model should generate the draft homework for this lesson.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Label>Model</Label>
            <Select value={generationModel} onValueChange={(value) => setGenerationModel(value as HomeworkGenerationModel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{HOMEWORK_GENERATION_MODEL_LABELS.auto} (GPT-5 mini, then Gemini)</SelectItem>
                <SelectItem value="gemini">{HOMEWORK_GENERATION_MODEL_LABELS.gemini}</SelectItem>
                <SelectItem value="openai">{HOMEWORK_GENERATION_MODEL_LABELS.openai}</SelectItem>
                <SelectItem value="stub">{HOMEWORK_GENERATION_MODEL_LABELS.stub}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-1.5" onClick={handleOpenGenerator}>
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-2xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Lesson Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Grammar Points</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {grammar.map((item, index) => (
                <Badge key={`${item}-${index}`} className="gap-1">
                  {item}
                  <button type="button" onClick={() => setGrammar((current) => current.filter((_, i) => i !== index))}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add grammar point..."
                value={grammarInput}
                onChange={(event) => setGrammarInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addGrammar()}
              />
              <Button variant="outline" size="sm" onClick={addGrammar}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vocabulary Phrases</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              One phrase per line. Put example sentences in brackets.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={vocabBulk} onChange={(event) => setVocabBulk(event.target.value)} rows={5} className="font-mono text-sm" />
            {parsedVocab.length > 0 && (
              <div className="space-y-1.5">
                {parsedVocab.map((item, index) => (
                  <div key={`${item.phrase}-${index}`} className="rounded-lg bg-muted/50 p-2.5 text-sm">
                    <span className="font-medium">{item.phrase}</span>
                    {item.context && <span className="ml-2 italic text-muted-foreground">&quot;{item.context}&quot;</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label>Lesson Notes</Label>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </div>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Student Mistakes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mistakeEntries.map((entry) => (
              <div key={entry.id} className="space-y-2 rounded-lg border border-destructive/10 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select value={entry.studentId} onValueChange={(value) => updateMistakeEntry(entry.id, "studentId", value)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupStudents.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button type="button" onClick={() => removeMistakeEntry(entry.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Textarea
                  value={entry.text}
                  onChange={(event) => updateMistakeEntry(entry.id, "text", event.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addMistakeEntry} className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              Add student mistakes
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
