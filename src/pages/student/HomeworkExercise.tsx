import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { MatchingPairsBoard } from "@/components/MatchingPairsBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const blankWidth = `${Math.max(String(question.answer).length + 2, 8)}ch`;
  const segments = question.text.split("___");

  if (segments.length === 1) {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium leading-7">{question.text}</p>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your answer"
          className="h-11 max-w-xs"
          data-testid={`gap-fill-input-${question.id}`}
        />
      </div>
    );
  }

  return (
    <label className="block text-base font-medium leading-8 text-foreground">
      <span>{segments[0]}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="answer"
        className="mx-2 inline-flex h-11 rounded-none border-0 border-b-2 border-primary/40 bg-transparent px-0 text-center text-base font-semibold shadow-none focus-visible:ring-0"
        style={{ width: blankWidth }}
        data-testid={`gap-fill-input-${question.id}`}
      />
      {segments.slice(1).map((segment, index) => (
        <span key={`${question.id}-${index}`}>{segment}</span>
      ))}
    </label>
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
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
                {current.question.incorrectText}
              </div>
              <Input
                placeholder="Rewrite the sentence correctly"
                value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
                onChange={(event) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), event.target.value)}
                className="h-11"
              />
            </div>
          ) : current.type === "sentence-building" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(current.question.tokens ?? []).map((token) => (
                  <Badge key={`${current.question.id}-${token}`} variant="outline" className="text-sm">
                    {token}
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Build the sentence"
                value={String(answers[getQuestionAnswerKey(current.exerciseId, current.question.id)] ?? "")}
                onChange={(event) => setAnswer(getQuestionAnswerKey(current.exerciseId, current.question.id), event.target.value)}
                className="h-11"
              />
            </div>
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
          <Button size="sm" onClick={() => void handleSubmit()} className="gap-1" disabled={submitting}>
            <Check className="h-4 w-4" />
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
