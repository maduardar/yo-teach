import { Link } from "react-router-dom";
import { CheckCircle, XCircle, RotateCcw, HelpCircle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHomeworkStore } from "@/context/HomeworkContext";
import type { AnswerFeedback } from "@/lib/app-types";

function formatDisplayValue(value: string | number | string[] | null): string {
  if (value === null || value === undefined) return "—";
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

function AnswerCard({ answer }: { answer: AnswerFeedback }) {
  const isCorrect = answer.isCorrect;
  const borderClass =
    isCorrect === true ? "border-green-200 bg-green-50/50" : isCorrect === false ? "border-red-200 bg-red-50/50" : "border-muted";

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${borderClass}`}>
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

      <p className="text-sm text-muted-foreground">{answer.questionText}</p>

      <div className="text-sm">
        <span className="font-medium">Your answer:</span>{" "}
        <span className={isCorrect === false ? "text-red-600" : ""}>{formatDisplayValue(answer.answerValue)}</span>
      </div>

      {isCorrect === false && answer.correctValue !== null && (
        <div className="text-sm">
          <span className="font-medium">Correct answer:</span>{" "}
          <span className="text-green-600">{formatDisplayValue(answer.correctValue)}</span>
        </div>
      )}

      {answer.explanation && (
        <div className="text-sm text-muted-foreground bg-muted/60 rounded-md p-2 mt-1">
          {answer.explanation}
        </div>
      )}
    </div>
  );
}

export default function HomeworkResults() {
  const { lastHomeworkResult } = useHomeworkStore();

  if (!lastHomeworkResult) {
    return (
      <div className="space-y-5 animate-fade-in">
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No recent homework submission was found.
          </CardContent>
        </Card>
        <Link to="/student/homework">
          <Button className="w-full">Back to Homework</Button>
        </Link>
      </div>
    );
  }

  const correctCount = lastHomeworkResult.answers.filter((a) => a.isCorrect === true).length;
  const incorrectCount = lastHomeworkResult.answers.filter((a) => a.isCorrect === false).length;
  const pendingCount = lastHomeworkResult.answers.filter((a) => a.isCorrect === null).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <Card className="shadow-card text-center">
        <CardContent className="p-6">
          <Badge className="mb-4" variant={lastHomeworkResult.status === "pending-review" ? "secondary" : "default"}>
            {lastHomeworkResult.status === "pending-review" ? "Pending review" : "Completed"}
          </Badge>
          <div className="text-4xl font-bold text-primary mb-1">{lastHomeworkResult.score}%</div>
          <p className="text-sm font-medium">{lastHomeworkResult.homeworkTitle}</p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <span className="text-green-600 font-medium">{correctCount} correct</span>
            <span className="text-red-600 font-medium">{incorrectCount} incorrect</span>
            {pendingCount > 0 && <span className="text-muted-foreground font-medium">{pendingCount} pending</span>}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-success" />
            <span>Your submission is saved.</span>
          </div>
        </CardContent>
      </Card>

      {lastHomeworkResult.answers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Your Answers</h2>
          {lastHomeworkResult.answers.map((answer, index) => (
            <AnswerCard key={`${answer.exerciseId}-${answer.questionKey}-${index}`} answer={answer} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Link to="/student/revision">
          <Button className="w-full gap-1.5">
            <RotateCcw className="w-4 h-4" />
            Start Revision
          </Button>
        </Link>
        <Link to="/student/progress">
          <Button variant="outline" className="w-full gap-1.5">
            <TrendingUp className="w-4 h-4" />
            See My Progress
          </Button>
        </Link>
      </div>
    </div>
  );
}
