export const homeworkGenerationModels = ["auto", "gemini", "openai", "stub"] as const;

export type HomeworkGenerationModel = (typeof homeworkGenerationModels)[number];

export const DEFAULT_HOMEWORK_GENERATION_MODEL: HomeworkGenerationModel = "openai";

export const HOMEWORK_GENERATION_MODEL_LABELS: Record<HomeworkGenerationModel, string> = {
  auto: "Auto",
  gemini: "Gemini Flash",
  openai: "GPT-5 mini",
  stub: "Deterministic stub",
};

export function isHomeworkGenerationModel(value: string | null | undefined): value is HomeworkGenerationModel {
  return value !== null && value !== undefined && homeworkGenerationModels.includes(value as HomeworkGenerationModel);
}

export function parseHomeworkGenerationModel(value: string | null | undefined): HomeworkGenerationModel {
  return isHomeworkGenerationModel(value) ? value : DEFAULT_HOMEWORK_GENERATION_MODEL;
}
