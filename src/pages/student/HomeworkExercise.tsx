import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MatchingPairsBoard } from "@/components/MatchingPairsBoard";
import { SentenceBuildingBoard } from "@/components/SentenceBuildingBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useHomeworkStore } from "@/context/HomeworkContext";
import {
  type ExerciseQuestion,
  type HomeworkExercise as HomeworkExerciseRecord,
  type MatchingPair,
} from "@/lib/homework-types";
import { apiRequest } from "@/lib/api";
import type { HomeworkSubmissionResponse } from "@/lib/app-types";
import { getExerciseTypeLabel, getInitialMeaningOrder } from "@/lib/homework";

type MatchingStep = {
  exerciseId: string;
  exerciseIndex: number;
  type: "matching";
  instruction: string;
  pairs: MatchingPair[];
};

type QuestionStep = {
  exerciseId: string;
  exerciseIndex: number;
  type:
    | "gap-fill"
    | "multiple-choice"
    | "phrase-explanation"
    | "open-answer"
    | "error-correction"
    | "sentence-building";
  instruction: string;
  question: ExerciseQuestion;
};

type ExerciseStep = MatchingStep | QuestionStep;

function getQuestionAnswerKey(exerciseId: string, questionId: string) {
  return `${exerciseId}:${questionId}`;
}

function buildSteps(homeworkExercises: HomeworkExerciseRecord[]): ExerciseStep[] {
  return homeworkExercises.flatMap((exercise, exerciseIndex) =>
    exercise.type === "matching"
      ? [
          {
            exerciseId: exercise.id,
            exerciseIndex,
            type: exercise.type,
            instruction: exercise.instruction,
            pairs: exercise.pairs,
          },
        ]
      : exercise.questions.map((question) => ({
          exerciseId: exercise.id,
          exerciseIndex,
          type: exercise.type,
          instruction: exercise.instruction,
          question,
        })),
  );
}

function buildMatchingState(exercises: HomeworkExerciseRecord[]) {
  return Object.fromEntries(
    exercises
      .filter((exercise) => exercise.type === "matching")
      .map((exercise) => [exercise.id, getInitialMeaningOrder(exercise.pairs, exercise.rightOrder)]),
  ) as Record<string, string[]>;
}

function renderGapFillSentence(
  question: ExerciseQuestion,
  value: string,
  onChange: (nextValue: string) => void,
) {
  const segments = question.text.split("___");
  const blankCount = segments.length - 1;
  const hint = question.hint ?? "";

  if (segments.length === 1) {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium leading-7">{question.text}</p>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hint || "Type your answer"}
          className="h-11 max-w-xs"
          data-testid={`gap-fill-input-${question.id}`}
        />
      </div>
    );
  }

  if (blankCount === 1) {
    const blankWidth = `${Math.max(hint.length || String(question.answer).length + 2, 8)}ch`;
    return (
      <label className="block text-base font-medium leading-8 text-foreground">
        <span>{segments[0]}</span>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hint || ""}
          className="mx-2 inline-flex h-11 rounded-none border-0 border-b-2 border-primary/40 bg-transparent px-0 text-center text-base font-semibold shadow-none focus-visible:ring-0 placeholder:font-normal placeholder:text-muted-foreground/50"
          style={{ width: blankWidth }}
          data-testid={`gap-fill-input-${question.id}`}
        />
        <span>{segments[1]}</span>
      </label>
    );
  }

  // Multiple blanks: split value by "," or store as comma-separated
  const gapValues = value.split(",").map((v) => v.trimStart());
  while (gapValues.length < blankCount) gapValues.push("");

  const updateGap = (gapIndex: number, gapValue: string) => {
    const updated = [...gapValues];
    updated[gapIndex] = gapValue;
    onChange(updated.join(", "));
  };

  return (
    <div className="block text-base font-medium leading-8 text-foreground">
      {segments.map((segment, index) => (
        <span key={`${question.id}-seg-${index}`}>
          <span>{segment}</span>
          {index < blankCount && (
            <Input
              value={gapValues[index] ?? ""}
              onChange={(event) => updateGap(index, event.target.value)}
              placeholder={index === 0 && hint ? hint : ""}
              className="mx-1 inline-flex h-9 w-28 rounded-none border-0 border-b-2 border-primary/40 bg-transparent px-0 text-center text-base font-semibold shadow-none focus-visible:ring-0 placeholder:font-normal placeholder:text-muted-foreground/50"
              data-testid={`gap-fill-input-${question.id}-${index}`}
            />
          )}
        </span>
      ))}
    </div>
  );
}

export default function HomeworkExercise() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const homeworkId = searchParams.get("homeworkId");
  const { currentStudent, getAssignedHomeworks, setLastHomeworkResult, refreshAssignedHomeworks } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();
  const homework =
    assignedHomeworks.find((candidate) => candidate.id === homeworkId) ?? (homeworkId ? null : assignedHomeworks[0] ?? null);
  const steps = useMemo(() => buildSteps(homework?.exercises ?? []), [homework]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [matchingOrders, setMatchingOrders] = useState<Record<string, string[]>>(() => buildMatchingState(homework?.exercises ?? []));
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);

  useEffect(() => {
    setMatchingOrders(buildMatchingState(homework?.exercises ?? []));
    setAnswers({});
    setStep(0);
  }, [homework]);

  useEffect(() => {
    setStep((currentStep) => Math.min(currentStep, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  if (!homework) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No homework is currently assigned to you.
        </CardContent>
      </Card>
    );
  }

  const current = steps[step];
  if (!current) {
    return null;
  }

  const setAnswer = (id: string, value: string | number) => {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [id]: value }));
  };

  const countUnanswered = () => {
    let count = 0;
    for (const s of steps) {
      if (s.type === "matching") continue;
      const key = getQuestionAnswerKey(s.exerciseId, s.question.id);
      const val = answers[key];
      if (val === undefined || val === "" || (s.type === "multiple-choice" && typeof val !== "number")) {
        count++;
      }
    }
    return count;
  };

  const confirmSubmit = () => {
    const unanswered = countUnanswered();
    if (unanswered > 0) {
      setShowSubmitWarning(true);
    } else {
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!currentStudent) {
      toast.error("Sign in as a student to submit homework.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = homework.exercises.flatMap((exercise) => {
        if (exercise.type === "matching") {
          return [
            {
              exerciseId: exercise.id,
              questionKey: exercise.id,
              value: matchingOrders[exercise.id] ?? getInitialMeaningOrder(exercise.pairs, exercise.rightOrder),
            },
          ];
        }

        return exercise.questions.map((question) => {
          const answerKey = getQuestionAnswerKey(exercise.id, question.id);
          const rawValue = answers[answerKey];

          return {
            exerciseId: exercise.id,
            questionKey: question.id,
            value:
              exercise.type === "multiple-choice"
                ? typeof rawValue === "number"
                  ? rawValue
                  : -1
                : rawValue ?? "",
          };
        });
      });

      const response = await apiRequest<HomeworkSubmissionResponse>(`/api/homeworks/${homework.id}/submissions`, {
        method: "POST",
        body: {
          studentId: currentStudent.id,
          answers: payload,
        },
      });

      setLastHomeworkResult({
        homeworkId: homework.id,
        homeworkTitle: homework.title,
        score: response.score,
        status: response.status,
        answers: response.answers,
      });
      await refreshAssignedHomeworks();
      toast.success(response.status === "pending-review" ? "Homework submitted." : "Homework submitted.");
      navigate("/student/homework/results");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit homework.");
    } finally {
      setSubmitting(false);
    }
  };

  const matchingOrder =
    current.type === "matching"
      ? matchingOrders[current.exerciseId] ?? getInitialMeaningOrder(current.pairs)
      : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">{homework.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Due {homework.dueDate}</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {step + 1}/{steps.length}
        </span>
        <Progress value={((step + 1) / steps.length) * 100} className="h-2 flex-1" />
      </div>

      <Badge variant="secondary" className="text-xs">
        {getExerciseTypeLabel(current.type)}
      </Badge>
      <p className="text-sm text-muted-foreground">{current.instruction}</p>

      <Card className="shadow-card">
        <CardContent className="p-5">
          {current.type === "matching" && matchingOrder ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Reorder the meanings so each row matches the phrase beside it.</p>
                <p className="text-xs text-muted-foreground">Drag the right-side blocks or use the arrow buttons.</p>
              </div>
              <MatchingPairsBoard
                pairs={current.pairs}
                rightOrder={matchingOrder}
                onChange={(nextOrder) =>
                  setMatchingOrders((currentOrders) => ({
                    ...currentOrders,
                    [current.exerciseId]: nextOrder,
                  }))
                }
                interactive
              />
            </div>
          ) : current.type === "multiple-choice" ? (
            <div className="space-y-4">
              <p className="text-base font-medium">{current.question.text}</p>
              <div className="space-y-2">
                {current.question.options?.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), index)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                      answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] === index
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : current.type === "gap-fill" ? (
            renderGapFillSentence(
              current.question,
              String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? ""),
              (nextValue) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), nextValue),
            )
          ) : current.type === "phrase-explanation" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Phrase Explanation</p>
                <p className="text-base font-medium leading-7">{current.question.text}</p>
              </div>
              <Input
                placeholder="Type the phrase in English"
                value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
                onChange={(event) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), event.target.value)}
                className="h-11"
              />
            </div>
          ) : current.type === "error-correction" ? (
            <div className="space-y-4">
              <div className="relative rounded-lg border border-destructive/20 bg-destructive/5 p-4 pr-10 text-sm">
                {current.question.incorrectText}
                <button
                  type="button"
                  className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(current.question.incorrectText ?? "");
                    toast.success("Copied to clipboard");
                  }}
                  title="Copy to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder="Rewrite the sentence correctly"
                value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
                onChange={(event) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), event.target.value)}
                className="h-11"
              />
            </div>
          ) : current.type === "sentence-building" ? (
            <SentenceBuildingBoard
              tokens={current.question.tokens ?? []}
              value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
              onChange={(nextValue) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), nextValue)}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-base font-medium leading-7">{current.question.text}</p>
                <p className="text-xs text-muted-foreground">
                  {current.question.minWords ? `Write at least ${current.question.minWords} words.` : "Write a short answer."}
                </p>
              </div>
              <Textarea
                placeholder="Type your answer"
                value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
                onChange={(event) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), event.target.value)}
                className="min-h-32"
              />
              {(() => {
                const text = String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "");
                const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
                const minWords = current.question.minWords;
                return (
                  <p className={`text-xs ${minWords && wordCount < minWords ? "text-destructive" : "text-muted-foreground"}`}>
                    {wordCount} {wordCount === 1 ? "word" : "words"}{minWords ? ` / ${minWords} min` : ""}
                  </p>
                );
              })()}
              {(current.question.requiredPhrases ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Required phrases</p>
                  <div className="flex flex-wrap gap-2">
                    {(current.question.requiredPhrases ?? []).map((phrase) => (
                      <Badge key={phrase} variant="outline">
                        {phrase}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0 || submitting}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        {step < steps.length - 1 ? (
          <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1" disabled={submitting}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={confirmSubmit} className="gap-1" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitting ? "Checking answers..." : "Submit"}
          </Button>
        )}
      </div>

      <AlertDialog open={showSubmitWarning} onOpenChange={setShowSubmitWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unanswered questions</AlertDialogTitle>
            <AlertDialogDescription>
              You have {countUnanswered()} unanswered {countUnanswered() === 1 ? "question" : "questions"}. They will be scored as incorrect. Submit anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSubmitWarning(false);
                void handleSubmit();
              }}
            >
              Submit anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
