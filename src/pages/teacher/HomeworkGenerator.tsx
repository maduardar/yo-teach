import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MatchingPairsBoard } from "@/components/MatchingPairsBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHomeworkStore } from "@/context/HomeworkContext";
import { type ExerciseQuestion, type Homework, type HomeworkExercise } from "@/lib/homework-types";
import { apiRequest } from "@/lib/api";
import type {
  AddHomeworkExerciseResponse,
  DeleteHomeworkExerciseResponse,
  GenerateHomeworkDraftRequest,
  HomeworkDetailResponse,
  HomeworkGenerationJobResponse,
  HomeworkGenerationPlan,
  PublishHomeworkResponse,
  RegenerateHomeworkExerciseRequest,
  RegenerateHomeworkExerciseResponse,
  RegenerateHomeworkQuestionRequest,
  RegenerateHomeworkQuestionResponse,
  StartHomeworkGenerationJobResponse,
  UpdateHomeworkDraftResponse,
  UpdateHomeworkExerciseResponse,
} from "@/lib/app-types";
import {
  HOMEWORK_GENERATION_MODEL_LABELS,
  parseHomeworkGenerationModel,
} from "@/lib/homework-generation-models";
import { getExerciseTypeLabel, getInitialMeaningOrder } from "@/lib/homework";

const manualExerciseTypeOptions: HomeworkExercise["type"][] = [
  "gap-fill",
  "multiple-choice",
  "phrase-explanation",
  "matching",
  "error-correction",
  "sentence-building",
  "open-answer",
];

function makeManualQuestionId(exerciseId: string) {
  return `${exerciseId}-q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getQuestionRegenerationKey(exerciseId: string, questionId: string) {
  return `${exerciseId}:${questionId}`;
}

function createManualQuestion(exercise: HomeworkExercise): ExerciseQuestion {
  const id = makeManualQuestionId(exercise.id);

  switch (exercise.type) {
    case "gap-fill":
      return { id, text: "Write the missing word or phrase.", answer: "" };
    case "multiple-choice":
      return {
        id,
        text: "Choose the best answer.",
        answer: 0,
        options: ["Option A", "Option B"],
      };
    case "phrase-explanation":
      return { id, text: "Write the target phrase in English.", answer: "" };
    case "open-answer":
      return {
        id,
        text: "Write a short answer.",
        answer: "",
        minWords: 25,
        requiredPhrases: [],
        targetMistakePattern: null,
        evaluationMode: "ai",
      };
    case "error-correction":
      return {
        id,
        text: "Rewrite the sentence correctly.",
        incorrectText: "I am agree.",
        answer: "I agree.",
      };
    case "sentence-building":
      return {
        id,
        text: "Use all the words to build a sentence.",
        tokens: ["I", "am", "here"],
        answer: "I am here.",
      };
    case "matching":
      return { id, text: "", answer: "" };
  }
}

function cloneExercise(exercise: HomeworkExercise): HomeworkExercise {
  if (exercise.type === "matching") {
    return {
      ...exercise,
      source: { ...exercise.source },
      pairs: exercise.pairs.map((pair) => ({ ...pair })),
      rightOrder: exercise.rightOrder ? [...exercise.rightOrder] : undefined,
    };
  }

  return {
    ...exercise,
    source: { ...exercise.source },
    questions: exercise.questions.map((question) => ({
      ...question,
      options: question.options ? [...question.options] : undefined,
      acceptableAnswers: question.acceptableAnswers ? [...question.acceptableAnswers] : undefined,
      tokens: question.tokens ? [...question.tokens] : undefined,
      requiredPhrases: question.requiredPhrases ? [...question.requiredPhrases] : undefined,
    })),
  };
}

function cloneHomework(homework: Homework): Homework {
  return {
    ...homework,
    composition: { ...homework.composition },
    studentProgress: { ...homework.studentProgress },
    exercises: homework.exercises.map((exercise) => cloneExercise(exercise)),
  };
}

function replaceHomeworkExercise(
  homework: Homework,
  exerciseId: string,
  updater: (exercise: HomeworkExercise) => HomeworkExercise,
) {
  return {
    ...homework,
    exercises: homework.exercises.map((exercise) => (exercise.id === exerciseId ? updater(exercise) : exercise)),
  };
}

function ExerciseEditor({
  exercise,
  editable,
  onChange,
  onAddQuestion,
  onDeleteQuestion,
  onRegenerateQuestion,
  busyQuestionKey,
  questionRegenerationContexts,
  onQuestionRegenerationContextChange,
}: {
  exercise: HomeworkExercise;
  editable: boolean;
  onChange: (exercise: HomeworkExercise) => void;
  onAddQuestion: (exercise: HomeworkExercise) => void;
  onDeleteQuestion: (exercise: HomeworkExercise, questionId: string) => void;
  onRegenerateQuestion: (exercise: HomeworkExercise, questionId: string) => void;
  busyQuestionKey: string | null;
  questionRegenerationContexts: Record<string, string>;
  onQuestionRegenerationContextChange: (exerciseId: string, questionId: string, value: string) => void;
}) {
  if (exercise.type === "matching") {
    const currentOrder = exercise.rightOrder ?? getInitialMeaningOrder(exercise.pairs, exercise.rightOrder);

    return (
      <div className="space-y-4">
        {exercise.pairs.map((pair, index) => (
          <div key={`${exercise.id}-pair-${index}`} className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Left item</Label>
              <Input
                value={pair.left}
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...exercise,
                    pairs: exercise.pairs.map((currentPair, pairIndex) =>
                      pairIndex === index ? { ...currentPair, left: event.target.value } : currentPair,
                    ),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Right item</Label>
              <Input
                value={pair.right}
                disabled={!editable}
                onChange={(event) => {
                  const nextRight = event.target.value;
                  const previousRight = pair.right;
                  onChange({
                    ...exercise,
                    pairs: exercise.pairs.map((currentPair, pairIndex) =>
                      pairIndex === index ? { ...currentPair, right: nextRight } : currentPair,
                    ),
                    rightOrder: currentOrder.map((value) => (value === previousRight ? nextRight : value)),
                  });
                }}
              />
            </div>
          </div>
        ))}
        {editable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              onChange({
                ...exercise,
                pairs: [...exercise.pairs, { left: "new phrase", right: "new meaning" }],
                rightOrder: [...currentOrder, "new meaning"],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add pair
          </Button>
        )}
        <div className="space-y-2">
          <Label>Order students will reorder</Label>
          <MatchingPairsBoard
            pairs={exercise.pairs}
            rightOrder={currentOrder}
            onChange={(nextOrder) => onChange({ ...exercise, rightOrder: nextOrder })}
            interactive={editable}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {exercise.questions.map((question, index) => (
        <div key={question.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Question {index + 1}</div>
            {editable && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onRegenerateQuestion(exercise, question.id)}
                  disabled={busyQuestionKey === getQuestionRegenerationKey(exercise.id, question.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate question
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onDeleteQuestion(exercise, question.id)}
                  disabled={exercise.questions.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={question.text}
              disabled={!editable}
              onChange={(event) =>
                onChange({
                  ...exercise,
                  questions: exercise.questions.map((currentQuestion) =>
                    currentQuestion.id === question.id ? { ...currentQuestion, text: event.target.value } : currentQuestion,
                  ),
                })
              }
            />
          </div>

          {exercise.type === "multiple-choice" && (
            <div className="space-y-3">
              <Label>Options</Label>
              {(question.options ?? []).map((option, optionIndex) => (
                <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-2">
                  <Input
                    value={option}
                    disabled={!editable}
                    onChange={(event) =>
                      onChange({
                        ...exercise,
                        questions: exercise.questions.map((currentQuestion) =>
                          currentQuestion.id === question.id
                            ? {
                                ...currentQuestion,
                                options: (currentQuestion.options ?? []).map((currentOption, currentOptionIndex) =>
                                  currentOptionIndex === optionIndex ? event.target.value : currentOption,
                                ),
                              }
                            : currentQuestion,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant={Number(question.answer) === optionIndex ? "default" : "outline"}
                    size="sm"
                    disabled={!editable}
                    onClick={() =>
                      onChange({
                        ...exercise,
                        questions: exercise.questions.map((currentQuestion) =>
                          currentQuestion.id === question.id ? { ...currentQuestion, answer: optionIndex } : currentQuestion,
                        ),
                      })
                    }
                  >
                    Correct
                  </Button>
                </div>
              ))}
              {editable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    onChange({
                      ...exercise,
                      questions: exercise.questions.map((currentQuestion) =>
                        currentQuestion.id === question.id
                          ? { ...currentQuestion, options: [...(currentQuestion.options ?? []), "New option"] }
                          : currentQuestion,
                      ),
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add option
                </Button>
              )}
            </div>
          )}

          {(exercise.type === "gap-fill" || exercise.type === "phrase-explanation" || exercise.type === "error-correction" || exercise.type === "sentence-building") && (
            <div className="space-y-2">
              <Label>Correct answer</Label>
              <Input
                value={String(question.answer)}
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...exercise,
                    questions: exercise.questions.map((currentQuestion) =>
                      currentQuestion.id === question.id ? { ...currentQuestion, answer: event.target.value } : currentQuestion,
                    ),
                  })
                }
              />
            </div>
          )}

          {exercise.type === "error-correction" && (
            <div className="space-y-2">
              <Label>Incorrect sentence</Label>
              <Input
                value={question.incorrectText ?? ""}
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...exercise,
                    questions: exercise.questions.map((currentQuestion) =>
                      currentQuestion.id === question.id
                        ? { ...currentQuestion, incorrectText: event.target.value }
                        : currentQuestion,
                    ),
                  })
                }
              />
            </div>
          )}

          {exercise.type === "sentence-building" && (
            <div className="space-y-2">
              <Label>Tokens</Label>
              <Input
                value={(question.tokens ?? []).join(", ")}
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...exercise,
                    questions: exercise.questions.map((currentQuestion) =>
                      currentQuestion.id === question.id
                        ? {
                            ...currentQuestion,
                            tokens: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          }
                        : currentQuestion,
                    ),
                  })
                }
              />
            </div>
          )}

          {exercise.type === "open-answer" && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Minimum words</Label>
                  <Input
                    type="number"
                    min={1}
                    value={question.minWords ?? 25}
                    disabled={!editable}
                    onChange={(event) =>
                      onChange({
                        ...exercise,
                        questions: exercise.questions.map((currentQuestion) =>
                          currentQuestion.id === question.id
                            ? { ...currentQuestion, minWords: Number(event.target.value) || 1 }
                            : currentQuestion,
                        ),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Evaluation mode</Label>
                  <Select
                    value={question.evaluationMode ?? "ai"}
                    onValueChange={(value) =>
                      onChange({
                        ...exercise,
                        questions: exercise.questions.map((currentQuestion) =>
                          currentQuestion.id === question.id
                            ? { ...currentQuestion, evaluationMode: value as "ai" | "stub_auto" }
                            : currentQuestion,
                        ),
                      })
                    }
                    disabled={!editable}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">AI review</SelectItem>
                      <SelectItem value="stub_auto">Stub auto-check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Required phrases</Label>
                <Input
                  value={(question.requiredPhrases ?? []).join(", ")}
                  disabled={!editable}
                  onChange={(event) =>
                    onChange({
                      ...exercise,
                      questions: exercise.questions.map((currentQuestion) =>
                        currentQuestion.id === question.id
                          ? {
                              ...currentQuestion,
                              requiredPhrases: event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            }
                          : currentQuestion,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Target mistake pattern</Label>
                <Input
                  value={question.targetMistakePattern ?? ""}
                  disabled={!editable}
                  onChange={(event) =>
                    onChange({
                      ...exercise,
                      questions: exercise.questions.map((currentQuestion) =>
                        currentQuestion.id === question.id
                          ? { ...currentQuestion, targetMistakePattern: event.target.value || null }
                          : currentQuestion,
                      ),
                    })
                  }
                />
              </div>
            </>
          )}

          {editable && (
            <div className="space-y-2">
              <Label>Additional regeneration context</Label>
              <Textarea
                value={questionRegenerationContexts[getQuestionRegenerationKey(exercise.id, question.id)] ?? ""}
                onChange={(event) =>
                  onQuestionRegenerationContextChange(exercise.id, question.id, event.target.value)
                }
                placeholder="Optional: specify target vocabulary, difficulty, tone, grammar focus, or any constraint for this question."
              />
            </div>
          )}
        </div>
      ))}

      {editable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onAddQuestion(exercise)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add question
        </Button>
      )}
    </div>
  );
}

export default function HomeworkGenerator() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lessonId = searchParams.get("lessonId");
  const homeworkId = searchParams.get("homeworkId");
  const generationModel = parseHomeworkGenerationModel(searchParams.get("model"));
  const { lessons, refreshBootstrap } = useHomeworkStore();
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? null;
  const [homework, setHomework] = useState<Homework | null>(null);
  const [plan, setPlan] = useState<HomeworkGenerationPlan | null>(null);
  const [selectedNewType, setSelectedNewType] = useState<HomeworkExercise["type"]>("gap-fill");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<{
    completedExercises: number;
    totalExercises: number;
    currentLabel: string | null;
  } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busyExerciseId, setBusyExerciseId] = useState<string | null>(null);
  const [busyQuestionKey, setBusyQuestionKey] = useState<string | null>(null);
  const [questionRegenerationContexts, setQuestionRegenerationContexts] = useState<Record<string, string>>({});
  const [addingExercise, setAddingExercise] = useState(false);

  const isEditable = homework?.status === "draft";

  useEffect(() => {
    let cancelled = false;

    async function loadHomework() {
      if (!lessonId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const generateFreshDraft = async (showToast = false) => {
          const seenEventIds = new Set<string>();
          const startResponse = await apiRequest<StartHomeworkGenerationJobResponse>(`/api/lessons/${lessonId}/homeworks/generate-jobs`, {
            method: "POST",
            body: { model: generationModel } satisfies GenerateHomeworkDraftRequest,
          });
          if (cancelled) {
            return;
          }

          let finished = false;
          while (!finished && !cancelled) {
            const statusResponse = await apiRequest<HomeworkGenerationJobResponse>(
              `/api/homework-generation-jobs/${startResponse.job.id}`,
            );
            if (cancelled) {
              return;
            }

            setGenerationStatus({
              completedExercises: statusResponse.job.completedExercises,
              totalExercises: statusResponse.job.totalExercises,
              currentLabel: statusResponse.job.currentLabel,
            });

            for (const event of statusResponse.job.events) {
              if (seenEventIds.has(event.id)) {
                continue;
              }
              seenEventIds.add(event.id);
              if (event.level === "success") {
                toast.success(event.message);
              } else {
                toast.info(event.message);
              }
            }

            if (statusResponse.job.status === "completed" && statusResponse.job.homework) {
              setLoadError(null);
              setHomework(cloneHomework(statusResponse.job.homework));
              setPlan(statusResponse.job.plan);
              await refreshBootstrap();
              setSearchParams({ lessonId, homeworkId: statusResponse.job.homework.id, model: generationModel }, { replace: true });
              if (showToast) {
                toast.success(`Draft homework generated with ${HOMEWORK_GENERATION_MODEL_LABELS[generationModel]}.`);
              }
              finished = true;
              setGenerationStatus(null);
              break;
            }

            if (statusResponse.job.status === "failed") {
              throw new Error(statusResponse.job.error ?? "Unable to generate homework.");
            }

            await new Promise((resolve) => window.setTimeout(resolve, 900));
          }
        };

        if (homeworkId) {
          try {
            const response = await apiRequest<HomeworkDetailResponse>(`/api/homeworks/${homeworkId}`);
            if (cancelled) {
              return;
            }

            if (response.homework.lessonId !== lessonId) {
              throw new Error("Homework does not belong to this lesson.");
            }

            setHomework(cloneHomework(response.homework));
            setPlan(null);
            setLoadError(null);
          } catch {
            await generateFreshDraft(true);
          }
        } else {
          await generateFreshDraft(true);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to load homework.";
          toast.error(message);
          setHomework(null);
          setPlan(null);
          setGenerationStatus(null);
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHomework();

    return () => {
      cancelled = true;
    };
  }, [generationModel, homeworkId, lessonId, refreshBootstrap, setSearchParams]);

  const generationPlanPreview = useMemo(() => plan ?? (homework ? null : null), [homework, plan]);

  const persistDraft = async () => {
    if (!homework) {
      throw new Error("Homework draft is not loaded.");
    }
    if (homework.status !== "draft") {
      throw new Error("Only draft homework can be edited.");
    }

    const metadataResponse = await apiRequest<UpdateHomeworkDraftResponse>(`/api/homeworks/${homework.id}`, {
      method: "PATCH",
      body: {
        title: homework.title,
        dueDate: homework.dueDate,
      },
    });

    let latestHomework = cloneHomework(metadataResponse.homework);
    for (const exercise of homework.exercises) {
      const response = await apiRequest<UpdateHomeworkExerciseResponse>(
        `/api/homeworks/${homework.id}/exercises/${exercise.id}`,
        {
          method: "PATCH",
          body: { exercise },
        },
      );
      latestHomework = cloneHomework(response.homework);
    }

    setHomework(latestHomework);
    await refreshBootstrap();
    return latestHomework;
  };

  const handleSaveDraft = async () => {
    if (!homework) {
      return;
    }

    setSavingDraft(true);
    try {
      await persistDraft();
      toast.success("Draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleRegenerateExercise = async (exerciseId: string) => {
    if (!homework) {
      return;
    }

    setBusyExerciseId(exerciseId);
    try {
      await persistDraft();
      const response = await apiRequest<RegenerateHomeworkExerciseResponse>(
        `/api/homeworks/${homework.id}/exercises/${exerciseId}/regenerate`,
        {
          method: "POST",
          body: { model: generationModel } satisfies RegenerateHomeworkExerciseRequest,
        },
      );
      setHomework(cloneHomework(response.homework));
      await refreshBootstrap();
      toast.success("Exercise regenerated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to regenerate exercise.");
    } finally {
      setBusyExerciseId(null);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!homework) {
      return;
    }

    setBusyExerciseId(exerciseId);
    try {
      await persistDraft();
      const response = await apiRequest<DeleteHomeworkExerciseResponse>(
        `/api/homeworks/${homework.id}/exercises/${exerciseId}`,
        { method: "DELETE" },
      );
      setHomework(cloneHomework(response.homework));
      await refreshBootstrap();
      toast.success("Exercise deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete exercise.");
    } finally {
      setBusyExerciseId(null);
    }
  };

  const handleAddQuestion = (exercise: HomeworkExercise) => {
    if (!homework || exercise.type === "matching") {
      return;
    }

    setHomework(
      replaceHomeworkExercise(homework, exercise.id, (currentExercise) =>
        currentExercise.type === "matching"
          ? currentExercise
          : {
              ...currentExercise,
              questions: [...currentExercise.questions, createManualQuestion(currentExercise)],
            },
      ),
    );
  };

  const handleDeleteQuestion = (exercise: HomeworkExercise, questionId: string) => {
    if (!homework || exercise.type === "matching" || exercise.questions.length <= 1) {
      return;
    }

    setHomework(
      replaceHomeworkExercise(homework, exercise.id, (currentExercise) =>
        currentExercise.type === "matching"
          ? currentExercise
          : {
              ...currentExercise,
              questions: currentExercise.questions.filter((question) => question.id !== questionId),
            },
      ),
    );
  };

  const handleQuestionRegenerationContextChange = (exerciseId: string, questionId: string, value: string) => {
    setQuestionRegenerationContexts((currentContexts) => ({
      ...currentContexts,
      [getQuestionRegenerationKey(exerciseId, questionId)]: value,
    }));
  };

  const handleRegenerateQuestion = async (exercise: HomeworkExercise, questionId: string) => {
    if (!homework || exercise.type === "matching") {
      return;
    }

    const questionBusyKey = getQuestionRegenerationKey(exercise.id, questionId);
    setBusyQuestionKey(questionBusyKey);
    try {
      await persistDraft();
      const response = await apiRequest<RegenerateHomeworkQuestionResponse>(
        `/api/homeworks/${homework.id}/exercises/${exercise.id}/questions/${questionId}/regenerate`,
        {
          method: "POST",
          body: {
            model: generationModel,
            additionalContext: questionRegenerationContexts[questionBusyKey]?.trim() || undefined,
          } satisfies RegenerateHomeworkQuestionRequest,
        },
      );
      setHomework(cloneHomework(response.homework));
      setQuestionRegenerationContexts((currentContexts) => {
        const nextContexts = { ...currentContexts };
        delete nextContexts[questionBusyKey];
        return nextContexts;
      });
      await refreshBootstrap();
      toast.success("Question regenerated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to regenerate question.");
    } finally {
      setBusyQuestionKey(null);
    }
  };

  const handleAddExercise = async () => {
    if (!homework) {
      return;
    }

    setAddingExercise(true);
    try {
      await persistDraft();
      const response = await apiRequest<AddHomeworkExerciseResponse>(`/api/homeworks/${homework.id}/exercises`, {
        method: "POST",
        body: { type: selectedNewType },
      });
      setHomework(cloneHomework(response.homework));
      await refreshBootstrap();
      toast.success("Exercise added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add exercise.");
    } finally {
      setAddingExercise(false);
    }
  };

  const handlePublish = async () => {
    if (!homework) {
      return;
    }

    setPublishing(true);
    try {
      const latestDraft = await persistDraft();
      const response = await apiRequest<PublishHomeworkResponse>(`/api/homeworks/${latestDraft.id}/publish`, {
        method: "POST",
      });
      setHomework(cloneHomework(response.homework));
      await refreshBootstrap();
      toast.success("Homework published.");
      navigate("/teacher/homework");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to publish homework.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to={lesson ? `/teacher/lessons/${lesson.id}` : "/teacher/lessons"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to lessons
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-5 w-5 text-primary" />
            Lesson Homework
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lesson ? `Linked to ${lesson.title}` : "Open a lesson first"}
          </p>
        </div>
        {lesson && (
          <Link to={`/teacher/homework/generate?lessonId=${lesson.id}&model=${generationModel}`}>
            <Button variant="outline" className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Generate another draft
            </Button>
          </Link>
        )}
      </div>

      {!lesson ? (
        <Card className="shadow-card">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Open a lesson first. Homework generation is lesson-specific.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="shadow-card">
          <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
            <div>
              {generationStatus?.currentLabel ??
                `Preparing homework draft with ${HOMEWORK_GENERATION_MODEL_LABELS[generationModel]}...`}
            </div>
            {generationStatus && generationStatus.totalExercises > 0 && (
              <div>
                Generating exercise {Math.min(generationStatus.completedExercises + 1, generationStatus.totalExercises)} of{" "}
                {generationStatus.totalExercises}
              </div>
            )}
          </CardContent>
        </Card>
      ) : !homework ? (
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
            <div>{loadError ?? "Homework could not be loaded for this lesson."}</div>
            {lesson && (
              <Link to={`/teacher/homework/generate?lessonId=${lesson.id}&model=${generationModel}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={homework.status === "published" ? "default" : "secondary"}>{homework.status}</Badge>
            <Badge variant="outline">{homework.exercises.length} exercises</Badge>
            <Badge variant="outline">Model: {HOMEWORK_GENERATION_MODEL_LABELS[generationModel]}</Badge>
            {!isEditable && (
              <span className="text-sm text-muted-foreground">
                Published homework is read-only here. Generate another draft from the lesson to make changes.
              </span>
            )}
          </div>

          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={homework.title}
                disabled={!isEditable}
                onChange={(event) => setHomework({ ...homework, title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={homework.dueDate}
                disabled={!isEditable}
                onChange={(event) => setHomework({ ...homework, dueDate: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">Exercises ({homework.exercises.length})</div>
              {isEditable && (
                <div className="flex items-center gap-2">
                  <Select value={selectedNewType} onValueChange={(value) => setSelectedNewType(value as HomeworkExercise["type"])}>
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {manualExerciseTypeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getExerciseTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleAddExercise} disabled={addingExercise} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    {addingExercise ? "Adding..." : "Add exercise"}
                  </Button>
                </div>
              )}
            </div>

            {homework.exercises.map((exercise, index) => (
              <Card key={exercise.id} className="shadow-card">
                <CardHeader className="space-y-3 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getExerciseTypeLabel(exercise.type)}
                        </Badge>
                        <span className="text-sm font-medium">Exercise {index + 1}</span>
                      </div>
                    </div>
                    {isEditable && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void handleRegenerateExercise(exercise.id)}
                          disabled={busyExerciseId === exercise.id}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void handleDeleteExercise(exercise.id)}
                          disabled={busyExerciseId === exercise.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Instruction</Label>
                    <Textarea
                      value={exercise.instruction}
                      disabled={!isEditable}
                      onChange={(event) =>
                        setHomework(replaceHomeworkExercise(homework, exercise.id, (currentExercise) => ({
                          ...currentExercise,
                          instruction: event.target.value,
                        })))
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ExerciseEditor
                    exercise={exercise}
                    editable={Boolean(isEditable)}
                    onChange={(nextExercise) =>
                      setHomework(replaceHomeworkExercise(homework, exercise.id, () => nextExercise))
                    }
                    onAddQuestion={handleAddQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                    onRegenerateQuestion={handleRegenerateQuestion}
                    busyQuestionKey={busyQuestionKey}
                    questionRegenerationContexts={questionRegenerationContexts}
                    onQuestionRegenerationContextChange={handleQuestionRegenerationContextChange}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {isEditable && (
              <>
                <Button onClick={() => void handlePublish()} disabled={publishing || savingDraft} className="gap-1.5">
                  {publishing ? "Publishing..." : "Publish Homework"}
                </Button>
                <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={savingDraft || publishing}>
                  {savingDraft ? "Saving..." : "Save Draft"}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
