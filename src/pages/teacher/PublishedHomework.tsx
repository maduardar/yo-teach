import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useHomeworkStore } from "@/context/HomeworkContext";
import { getExerciseTypeLabel } from "@/lib/homework";

function getMultipleChoiceQuestion(
  homework: ReturnType<typeof useHomeworkStore>["homeworks"][number],
  answer: NonNullable<ReturnType<typeof useHomeworkStore>["homeworks"][number]["studentSubmissions"]>[number]["answers"][number],
) {
  const exercise = homework.exercises.find((entry) => entry.id === answer.exerciseId);
  if (!exercise || exercise.type !== "multiple-choice") {
    return null;
  }

  return exercise.questions.find((question) => question.id === answer.questionKey) ?? null;
}

function formatTeacherAnswerValue(
  homework: ReturnType<typeof useHomeworkStore>["homeworks"][number],
  answer: NonNullable<ReturnType<typeof useHomeworkStore>["homeworks"][number]["studentSubmissions"]>[number]["answers"][number],
) {
  if (answer.exerciseType !== "multiple-choice") {
    return Array.isArray(answer.answerValue) ? answer.answerValue.join(", ") : String(answer.answerValue ?? "—");
  }

  const question = getMultipleChoiceQuestion(homework, answer);
  const selectedIndex =
    typeof answer.answerValue === "number"
      ? answer.answerValue
      : typeof answer.answerValue === "string" && answer.answerValue.trim() !== ""
        ? Number(answer.answerValue)
        : -1;

  if (!question || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
    return "No option selected";
  }

  return question.options?.[selectedIndex] ?? `Option ${selectedIndex + 1}`;
}

function formatTeacherExpectedValue(
  homework: ReturnType<typeof useHomeworkStore>["homeworks"][number],
  answer: NonNullable<ReturnType<typeof useHomeworkStore>["homeworks"][number]["studentSubmissions"]>[number]["answers"][number],
) {
  if (answer.exerciseType !== "multiple-choice") {
    return Array.isArray(answer.correctValue) ? answer.correctValue.join(", ") : String(answer.correctValue);
  }

  const question = getMultipleChoiceQuestion(homework, answer);
  const correctIndex =
    typeof answer.correctValue === "number"
      ? answer.correctValue
      : typeof answer.correctValue === "string" && answer.correctValue.trim() !== ""
        ? Number(answer.correctValue)
        : -1;

  if (!question || !Number.isInteger(correctIndex) || correctIndex < 0) {
    return String(answer.correctValue ?? "—");
  }

  return question.options?.[correctIndex] ?? `Option ${correctIndex + 1}`;
}

export default function PublishedHomework() {
  const { homeworks, groups, students } = useHomeworkStore();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  const publishedHomeworks = homeworks.filter((homework) => homework.status === "published");
  const filtered = selectedGroupId === "all"
    ? publishedHomeworks
    : publishedHomeworks.filter((homework) => homework.groupId === selectedGroupId);

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Homework link copied to clipboard!");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Homework</h1>
          <p className="text-sm text-muted-foreground">Manage published homework</p>
        </div>
        <div className="text-sm text-muted-foreground">
          Open a lesson to generate or edit homework for that lesson.
        </div>
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

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No homework for this group yet.</div>
      )}

      {filtered.map(hw => {
        const group = groups.find(g => g.id === hw.groupId);
        return (
          <Card key={hw.id} className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{hw.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{group?.name} · Due {hw.dueDate}</p>
                </div>
                <Badge variant={hw.status === "published" ? "default" : "secondary"}>{hw.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate text-muted-foreground">{hw.shareLink}</span>
                <Button variant="outline" size="sm" onClick={() => copyLink(hw.shareLink)} className="gap-1 shrink-0">
                  <Copy className="w-3.5 h-3.5" />Copy
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Lesson</div>
                  <div className="font-bold text-primary">{hw.composition.latestLesson}%</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Revision</div>
                  <div className="font-bold">{hw.composition.revision}%</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Weak pts</div>
                  <div className="font-bold text-accent">{hw.composition.weakPoints}%</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-3">Student Completion</div>
                <div className="space-y-2">
                  {Object.entries(hw.studentProgress).map(([sid, prog]) => {
                    const student = students.find(s => s.id === sid);
                    const submission = hw.studentSubmissions?.find((entry) => entry.studentId === sid);
                    return (
                      <div key={sid} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                              {student?.avatar}
                            </div>
                            <span className="text-sm font-medium">{student?.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={prog.status === "completed" ? "default" : "secondary"} className="text-xs">
                              {prog.status === "completed" ? `${prog.score}%` : prog.status}
                            </Badge>
                            {prog.status === "completed" && (
                              <Progress value={prog.score} className="w-16 h-1.5" />
                            )}
                          </div>
                        </div>
                        {submission && submission.answers.length > 0 && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            {submission.answers.map((answer, index) => (
                              <div key={`${submission.studentId}-${answer.exerciseId}-${answer.questionKey}-${index}`} className="rounded-md bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Badge variant="outline" className="text-xs">
                                    {getExerciseTypeLabel(answer.exerciseType)}
                                  </Badge>
                                  {answer.isCorrect === null ? (
                                    <Badge variant="secondary" className="text-xs">AI review unavailable</Badge>
                                  ) : answer.isCorrect ? (
                                    <Badge className="text-xs">Correct</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Incorrect</Badge>
                                  )}
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">{answer.instruction}</div>
                                {answer.questionPrompt && (
                                  <div className="mt-1 text-xs text-muted-foreground">{answer.questionPrompt}</div>
                                )}
                                <div className="mt-2 text-sm">
                                  <span className="font-medium">Student answer:</span>{" "}
                                  {formatTeacherAnswerValue(hw, answer)}
                                </div>
                                {answer.correctValue !== null && (
                                  <div className="mt-1 text-sm text-primary">
                                    <span className="font-medium">Expected:</span>{" "}
                                    {formatTeacherExpectedValue(hw, answer)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Exercises ({hw.exercises.length})</div>
                <div className="flex gap-1.5 flex-wrap">
                  {hw.exercises.map((ex) => (
                    <Badge key={ex.id} variant="outline" className="text-xs">
                      {getExerciseTypeLabel(ex.type)}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
