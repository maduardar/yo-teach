import { z } from "zod";
import { homeworkDraftOutputSchema } from "./homework-payloads";

export const generationLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  notes: z.string(),
  grammar: z.array(z.string()),
  vocabulary: z.array(
    z.object({
      id: z.string(),
      phrase: z.string(),
      context: z.string(),
    }),
  ),
  studentMistakes: z.array(
    z.object({
      id: z.string(),
      studentId: z.string(),
      mistake: z.string(),
      correction: z.string(),
      category: z.string(),
    }),
  ),
});

export const generationRevisionItemSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  sourceType: z.string(),
  sourceRefId: z.string().nullable(),
  entityKey: z.string(),
  phrase: z.string().nullable(),
  context: z.string().nullable(),
  prompt: z.string(),
  answer: z.string(),
  nextReviewAt: z.string(),
  intervalDays: z.number().int().positive(),
  consecutiveCorrect: z.number().int().nonnegative(),
});

export const generationWeakPointSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  area: z.string(),
  category: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  source: z.string(),
  lessonId: z.string().nullable(),
});

export const generationGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.string(),
  students: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export const homeworkGenerationContextSchema = z.object({
  now: z.string(),
  group: generationGroupSchema,
  lesson: generationLessonSchema,
  dueRevisionItems: z.array(generationRevisionItemSchema),
  weakPoints: z.array(generationWeakPointSchema),
  vocabularyCap: z.number().int().positive(),
  quotas: z.object({
    latestLesson: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    weakPoints: z.number().int().nonnegative(),
  }),
});

export const homeworkGenerationPlanItemSchema = z.object({
  bucket: z.enum(["lesson", "revision", "weak-point", "final-writing"]),
  type: z.enum([
    "GAP_FILL",
    "MULTIPLE_CHOICE",
    "PHRASE_EXPLANATION",
    "MATCHING",
    "OPEN_ANSWER",
    "ERROR_CORRECTION",
    "SENTENCE_BUILDING",
  ]),
  sourceType: z.enum(["LESSON", "REVISION", "WEAK_POINT", "MIXED", "MANUAL"]),
  sourceRefId: z.string().nullable().optional(),
  learningObjective: z.string(),
  explanation: z.string(),
});

export const homeworkGenerationPlanSchema = z.object({
  summary: z.object({
    dueRevisionCount: z.number().int().nonnegative(),
    weakPointCount: z.number().int().nonnegative(),
    lessonVocabularyCount: z.number().int().nonnegative(),
    lessonGrammarCount: z.number().int().nonnegative(),
  }),
  composition: z.object({
    latestLesson: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    weakPoints: z.number().int().nonnegative(),
  }),
  items: z.array(homeworkGenerationPlanItemSchema).min(1),
});

export const homeworkGenerationOutputSchema = homeworkDraftOutputSchema;

export type HomeworkGenerationContext = z.infer<typeof homeworkGenerationContextSchema>;
export type HomeworkGenerationPlan = z.infer<typeof homeworkGenerationPlanSchema>;
export type HomeworkGenerationPlanItem = z.infer<typeof homeworkGenerationPlanItemSchema>;
export type HomeworkGenerationOutput = z.infer<typeof homeworkGenerationOutputSchema>;
