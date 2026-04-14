import { z } from "zod";

export const exerciseSourceTypeSchema = z.enum(["LESSON", "REVISION", "WEAK_POINT", "MIXED", "MANUAL"]);
export type ExerciseSourceType = z.infer<typeof exerciseSourceTypeSchema>;

export const exerciseMetaSchema = z.object({
  sourceType: exerciseSourceTypeSchema,
  sourceRefId: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  learningObjective: z.string().nullable().optional(),
  generationKind: z.string().nullable().optional(),
});

const answerQuestionBaseSchema = z.object({
  key: z.string(),
  prompt: z.string(),
  hint: z.string().nullable().optional(),
});

const gapFillQuestionSchema = answerQuestionBaseSchema.extend({
  answer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
});

const multipleChoiceQuestionSchema = answerQuestionBaseSchema.extend({
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().nonnegative(),
});

const phraseExplanationQuestionSchema = answerQuestionBaseSchema.extend({
  answer: z.string(),
});

const matchingPairSchema = z.object({
  left: z.string(),
  right: z.string(),
});

const openAnswerQuestionSchema = answerQuestionBaseSchema.extend({
  minWords: z.number().int().positive().optional(),
  requiredPhrases: z.array(z.string()).default([]),
  targetMistakePattern: z.string().nullable().optional(),
  sampleAnswer: z.string().nullable().optional(),
  evaluationMode: z.enum(["ai", "stub_auto"]).default("ai"),
});

const errorCorrectionQuestionSchema = answerQuestionBaseSchema.extend({
  incorrectText: z.string(),
  answer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
});

const sentenceBuildingQuestionSchema = answerQuestionBaseSchema.extend({
  tokens: z.array(z.string()).min(2),
  answer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
});

export const gapFillPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(gapFillQuestionSchema).min(1),
});

export const multipleChoicePayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(multipleChoiceQuestionSchema).min(1),
});

export const phraseExplanationPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(phraseExplanationQuestionSchema).min(1),
});

export const matchingPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  pairs: z.array(matchingPairSchema).min(1),
  rightOrder: z.array(z.string()).optional(),
});

export const openAnswerPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(openAnswerQuestionSchema).min(1).max(1),
});

export const errorCorrectionPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(errorCorrectionQuestionSchema).min(1),
});

export const sentenceBuildingPayloadSchema = z.object({
  meta: exerciseMetaSchema,
  questions: z.array(sentenceBuildingQuestionSchema).min(1),
});

export const homeworkDraftOutputSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string().min(1),
  composition: z.object({
    latestLesson: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    weakPoints: z.number().int().nonnegative(),
  }),
  exercises: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("GAP_FILL"),
        instruction: z.string().min(1),
        payload: gapFillPayloadSchema,
      }),
      z.object({
        type: z.literal("MULTIPLE_CHOICE"),
        instruction: z.string().min(1),
        payload: multipleChoicePayloadSchema,
      }),
      z.object({
        type: z.literal("PHRASE_EXPLANATION"),
        instruction: z.string().min(1),
        payload: phraseExplanationPayloadSchema,
      }),
      z.object({
        type: z.literal("MATCHING"),
        instruction: z.string().min(1),
        payload: matchingPayloadSchema,
      }),
      z.object({
        type: z.literal("OPEN_ANSWER"),
        instruction: z.string().min(1),
        payload: openAnswerPayloadSchema,
      }),
      z.object({
        type: z.literal("ERROR_CORRECTION"),
        instruction: z.string().min(1),
        payload: errorCorrectionPayloadSchema,
      }),
      z.object({
        type: z.literal("SENTENCE_BUILDING"),
        instruction: z.string().min(1),
        payload: sentenceBuildingPayloadSchema,
      }),
    ]),
  ).min(1),
});

export const homeworkGeneratedExerciseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("GAP_FILL"),
    instruction: z.string().min(1),
    payload: gapFillPayloadSchema,
  }),
  z.object({
    type: z.literal("MULTIPLE_CHOICE"),
    instruction: z.string().min(1),
    payload: multipleChoicePayloadSchema,
  }),
  z.object({
    type: z.literal("PHRASE_EXPLANATION"),
    instruction: z.string().min(1),
    payload: phraseExplanationPayloadSchema,
  }),
  z.object({
    type: z.literal("MATCHING"),
    instruction: z.string().min(1),
    payload: matchingPayloadSchema,
  }),
  z.object({
    type: z.literal("OPEN_ANSWER"),
    instruction: z.string().min(1),
    payload: openAnswerPayloadSchema,
  }),
  z.object({
    type: z.literal("ERROR_CORRECTION"),
    instruction: z.string().min(1),
    payload: errorCorrectionPayloadSchema,
  }),
  z.object({
    type: z.literal("SENTENCE_BUILDING"),
    instruction: z.string().min(1),
    payload: sentenceBuildingPayloadSchema,
  }),
]);

export type ExerciseMeta = z.infer<typeof exerciseMetaSchema>;
export type GapFillPayload = z.infer<typeof gapFillPayloadSchema>;
export type MultipleChoicePayload = z.infer<typeof multipleChoicePayloadSchema>;
export type PhraseExplanationPayload = z.infer<typeof phraseExplanationPayloadSchema>;
export type MatchingPayload = z.infer<typeof matchingPayloadSchema>;
export type OpenAnswerPayload = z.infer<typeof openAnswerPayloadSchema>;
export type ErrorCorrectionPayload = z.infer<typeof errorCorrectionPayloadSchema>;
export type SentenceBuildingPayload = z.infer<typeof sentenceBuildingPayloadSchema>;
export type HomeworkDraftOutput = z.infer<typeof homeworkDraftOutputSchema>;
export type HomeworkGeneratedExercise = z.infer<typeof homeworkGeneratedExerciseSchema>;

export function createGapFillPayload(payload: GapFillPayload) {
  return gapFillPayloadSchema.parse(payload);
}

export function createMultipleChoicePayload(payload: MultipleChoicePayload) {
  return multipleChoicePayloadSchema.parse(payload);
}

export function createPhraseExplanationPayload(payload: PhraseExplanationPayload) {
  return phraseExplanationPayloadSchema.parse(payload);
}

export function createMatchingPayload(payload: MatchingPayload) {
  return matchingPayloadSchema.parse(payload);
}

export function createOpenAnswerPayload(payload: OpenAnswerPayload) {
  return openAnswerPayloadSchema.parse(payload);
}

export function createErrorCorrectionPayload(payload: ErrorCorrectionPayload) {
  return errorCorrectionPayloadSchema.parse(payload);
}

export function createSentenceBuildingPayload(payload: SentenceBuildingPayload) {
  return sentenceBuildingPayloadSchema.parse(payload);
}

export function parseHomeworkExercisePayload(type: string, payload: unknown) {
  switch (type) {
    case "GAP_FILL":
      return gapFillPayloadSchema.parse(payload);
    case "MULTIPLE_CHOICE":
      return multipleChoicePayloadSchema.parse(payload);
    case "PHRASE_EXPLANATION":
      return phraseExplanationPayloadSchema.parse(payload);
    case "MATCHING":
      return matchingPayloadSchema.parse(payload);
    case "OPEN_ANSWER":
      return openAnswerPayloadSchema.parse(payload);
    case "ERROR_CORRECTION":
      return errorCorrectionPayloadSchema.parse(payload);
    case "SENTENCE_BUILDING":
      return sentenceBuildingPayloadSchema.parse(payload);
    default:
      throw new Error(`Unsupported exercise type: ${type}`);
  }
}
