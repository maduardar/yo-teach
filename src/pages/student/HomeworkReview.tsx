import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, HelpCircle, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHomeworkStore } from "@/context/HomeworkContext";

function formatDisplayValue(value: string | number | string[] | null): string {
  if (value === null || value === undefined) return "\u2014";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function exerciseTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "gap-fill": "Gap Fill",
    "multiple-choice": "Multiple Choice",
    "phrase-explanation": "Phrase Recall",
    matching: "Matching",
    "open-answer": "Open Answer",
    "error-correction": "Error Correction",
    "sentence-building": "Sentence Building",
  };
  return labels[type] ?? type;
}

export default function HomeworkReview() {
  const [searchParams] = useSearchParams();
  const homeworkId = searchParams.get("homeworkId");
  const { currentStudent, getAssignedHomeworks } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();
  const homework = assignedHomeworks.find((hw) => hw.id === homeworkId);
  const studentId = currentStudent?.id ?? "";

  if (!homework) {
    return (
      <div className="space-y-5 animate-fade-in">
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Homework not found.
          </CardContent>
        </Card>
        <Link to="/student/homework">
          <Button variant="outline" className="w-full">Back to Homework</Button>
        </Link>
      </div>
    );
  }

  const submission = homework.studentSubmissions?.find((s) => s.studentId === studentId);
  const progress = homework.studentProgress[studentId];

  if (!submission) {
    return (
      <div className="space-y-5 animate-fade-in">
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No submission found for this homework.
          </CardContent>
        </Card>
        <Link to="/student/homework">
          <Button variant="outline" className="w-full">Back to Homework</Button>
        </Link>
      </div>
    );
  }

  const correctCount = submission.answers.filter((a) => a.isCorrect === true).length;
  const incorrectCount = submission.answers.filter((a) => a.isCorrect === false).length;
  const pendingCount = submission.answers.filter((a) => a.isCorrect === null).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/student/homework">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-bold">{homework.title}</h1>
          <p className="text-xs text-muted-foreground">
            Submitted {submission.completedAt ? new Date(submission.completedAt).toLocaleDateString() : ""}
          </p>
        </div>
      </div>

      <Card className="shadow-card text-center">
        <CardContent className="p-5">
          <Badge className="mb-3" variant={progress?.status === "pending-review" ? "secondary" : "default"}>
            {progress?.status === "pending-review" ? "Pending review" : "Completed"}
          </Badge>
          <div className="text-4xl font-bold text-primary mb-1">{progress?.score ?? 0}%</div>
          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="text-green-600 font-medium">{correctCount} correct</span>
            <span className="text-red-600 font-medium">{incorrectCount} incorrect</span>
            {pendingCount > 0 && <span className="text-muted-foreground font-medium">{pendingCount} pending</span>}
          </div>
        </CardContent>
      </Card>

      {submission.answers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Your Answers</h2>
          {submission.answers.map((answer, index) => {
            const isCorrect = answer.isCorrect;
            const borderClass =
              isCorrect === true
                ? "border-green-200 bg-green-50/50"
                : isCorrect === false
                  ? "border-red-200 bg-red-50/50"
                  : "border-muted";

            return (
              <div key={`${answer.exerciseId}-${answer.questionKey}-${index}`} className={`rounded-lg border p-4 space-y-2 ${borderClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">
                    {exerciseTypeLabel(answer.exerciseType)}
                  </Badge>
                  {isCorrect === true && (
                    <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle className="h-3.5 w-3.5" /> Correct
                    </div>
                  )}
                  {isCorrect === false && (
                    <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
                      <XCircle className="h-3.5 w-3.5" /> Incorrect
                    </div>
                  )}
                  {isCorrect === null && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs font-medium">
                      <HelpCircle className="h-3.5 w-3.5" /> Pending review
                    </div>
                  )}
                </div>

                {answer.questionPrompt && (
                  <p className="text-sm text-muted-foreground">{answer.questionPrompt}</p>
                )}

                <div className="text-sm">
                  <span className="font-medium">Your answer:</span>{" "}
                  <span className={isCorrect === false ? "text-red-600" : ""}>
                    {formatDisplayValue(answer.answerValue)}
                  </span>
                </div>

                {isCorrect === false && answer.correctValue !== null && (
                  <div className="text-sm">
                    <span className="font-medium">Correct answer:</span>{" "}
                    <span className="text-green-600">{formatDisplayValue(answer.correctValue)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link to="/student/homework">
        <Button variant="outline" className="w-full">Back to Homework</Button>
      </Link>
    </div>
  );
}
