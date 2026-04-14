import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useHomeworkStore } from "@/context/HomeworkContext";
import { apiRequest } from "@/lib/api";
import type { RevisionAnswerResponse } from "@/lib/app-types";

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
}

export default function StudentRevision() {
  const { currentStudent, revisionItems, refreshBootstrap } = useHomeworkStore();
  const exercises = useMemo(
    () => revisionItems.filter((item) => item.studentId === currentStudent?.id && item.status === "due"),
    [currentStudent?.id, revisionItems],
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const total = exercises.length;
  const current = exercises[step];
  const done = step >= total && total > 0;

  const reveal = async (id: string) => {
    const studentInput = answers[id] || "";
    const correct = normalizeAnswer(studentInput) === normalizeAnswer(current.answer);
    setRevealed((currentState) => ({ ...currentState, [id]: true }));
    setResults((currentState) => ({ ...currentState, [id]: correct }));
    setSubmitting(true);
    try {
      await apiRequest<RevisionAnswerResponse>(`/api/revision/${id}/answer`, {
        method: "POST",
        body: { correct },
      });
    } catch {
      // Answer is still shown to the user; persistence failure is non-blocking
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step < total - 1) {
      setStep(step + 1);
    } else {
      setStep(total);
      toast.success("Revision complete.");
      void refreshBootstrap();
    }
  };

  if (total === 0) {
    return (
      <div className="space-y-5 animate-fade-in">
        <h1 className="text-xl font-bold">Daily Revision</h1>
        <Card className="shadow-card">
          <CardContent className="p-5 text-sm text-muted-foreground">No revision items are due right now.</CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5 animate-fade-in py-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <h1 className="text-xl font-bold">Revision Complete</h1>
        <p className="text-sm text-muted-foreground">You reviewed {total} items today.</p>
        <Button
          variant="outline"
          onClick={() => {
            setStep(0);
            setAnswers({});
            setRevealed({});
          }}
          className="gap-1.5"
        >
          <RotateCcw className="w-4 h-4" />
          Practice Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">Daily Revision</h1>
        <p className="text-sm text-muted-foreground">{total} items due today</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {step + 1}/{total}
        </span>
        <Progress value={((step + 1) / total) * 100} className="h-2 flex-1" />
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <Badge variant="secondary" className="text-xs">
            {current.phrase ?? current.sourceType}
          </Badge>

          {current.context && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 text-xs text-muted-foreground">Context:</p>
              <p className="text-sm italic">&quot;{current.context}&quot;</p>
            </div>
          )}

          <p className="text-sm font-medium">{current.prompt}</p>

          <div className="space-y-2">
            <Input
              placeholder="Type your answer..."
              value={answers[current.id] || ""}
              onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: event.target.value }))}
            />
            {!revealed[current.id] ? (
              <Button variant="outline" size="sm" onClick={() => reveal(current.id)} disabled={submitting}>
                Check Answer
              </Button>
            ) : results[current.id] ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-3 text-sm">
                <CheckCircle className="h-4 w-4 text-success shrink-0" />
                <span>Correct! {current.answer}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span>Not quite.</span>
                </div>
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-sm">
                  Correct answer: {current.answer}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={next}>
        {step < total - 1 ? "Next" : "Finish Revision"}
      </Button>
    </div>
  );
}
