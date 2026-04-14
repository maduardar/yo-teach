import type {
  HomeworkGenerationContext,
  HomeworkGenerationOutput,
  HomeworkGenerationPlan,
  HomeworkGenerationPlanItem,
} from "./homework-generation-schemas";
import type { HomeworkGeneratedExercise } from "./homework-payloads";
import type { HomeworkExercise } from "../lib/homework-types";

export type OpenAnswerEvaluation = {
  mode: "ai" | "stub_auto";
  isCorrect: boolean;
  score: number;
  explanation: string;
};

export type HomeworkGenerationProvider = {
  generateDraft: (input: {
    context: HomeworkGenerationContext;
    plan: HomeworkGenerationPlan;
    onProgress?: (progress: {
      completedExercises: number;
      totalExercises: number;
      currentLabel: string | null;
      event?: {
        level: "success" | "info";
        exerciseIndex: number | null;
        message: string;
      };
    }) => void;
  }) => Promise<HomeworkGenerationOutput>;
  regenerateExercise: (input: {
    context: HomeworkGenerationContext;
    planItem: HomeworkGenerationPlanItem;
    existingType: HomeworkGenerationPlanItem["type"];
    ordinal: number;
    additionalContext?: string;
    currentExercise?: HomeworkExercise | null;
    targetQuestion?: {
      prompt: string;
      answer: string | number;
      incorrectText?: string;
      options?: string[];
      tokens?: string[];
      requiredPhrases?: string[];
    } | null;
  }) => Promise<HomeworkGeneratedExercise>;
  evaluateOpenAnswer: (input: {
    prompt: string;
    answer: string;
    requiredPhrases: string[];
  }) => Promise<OpenAnswerEvaluation>;
};
