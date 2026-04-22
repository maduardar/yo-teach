import { randomBytes } from "node:crypto";
import {
  HomeworkExerciseType,
  HomeworkSetStatus,
  HomeworkSubmissionStatus,
  Prisma,
  RevisionSourceType,
  RevisionStatus,
  UserRole,
} from "../generated/prisma/client";
import type { ExerciseQuestion, Homework, HomeworkExercise } from "../lib/homework-types";
import {
  DEFAULT_HOMEWORK_GENERATION_MODEL,
  parseHomeworkGenerationModel,
  type HomeworkGenerationModel,
} from "../lib/homework-generation-models";
import {
  createErrorCorrectionPayload,
  createGapFillPayload,
  homeworkGeneratedExerciseSchema,
  createMatchingPayload,
  createMultipleChoicePayload,
  createOpenAnswerPayload,
  createPhraseExplanationPayload,
  createSentenceBuildingPayload,
  parseHomeworkExercisePayload,
} from "./homework-payloads";
import type { ExerciseMeta, HomeworkDraftOutput } from "./homework-payloads";
import {
  homeworkGenerationContextSchema,
  homeworkGenerationOutputSchema,
  homeworkGenerationPlanSchema,
  type HomeworkGenerationContext,
  type HomeworkGenerationOutput,
  type HomeworkGenerationPlan,
  type HomeworkGenerationPlanItem,
} from "./homework-generation-schemas";
import type { HomeworkGenerationProvider } from "./homework-generation-provider";
import { z } from "zod";
import { prisma } from "./db";
import { ApiError, formatUnknownError } from "./errors";
import { mapRevisionItem } from "./app-api";
import {
  createHomeworkGenerationJob,
  createHomeworkGenerationJobEvent,
  getHomeworkGenerationJob,
  updateHomeworkGenerationJob,
} from "./homework-generation-jobs";

const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];

function serializeId(value: number) {
  return String(value);
}

function parseId(value: string, resourceName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${resourceName} id is invalid.`);
  }

  return parsed;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = (hash * 1664525 + 1013904223) | 0;
    return ((hash >>> 0) / 0x100000000);
  };
}

function shuffleDeterministically(items: string[], seed?: string) {
  if (items.length <= 1) {
    return [...items];
  }

  const result = [...items];
  const rng = seededRandom(seed ?? items.join(","));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // If shuffle produced the original order, swap first two
  if (result.every((item, idx) => item === items[idx])) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

const geminiExerciseResponseSchema = z.object({
  exercise: homeworkGeneratedExerciseSchema,
});

const geminiOpenAnswerEvaluationSchema = z.object({
  isCorrect: z.boolean(),
  score: z.number().int().min(0).max(100),
  explanation: z.string().min(1),
});

type JsonSchema = Record<string, unknown>;

type OpenAIResponseFormat = {
  name: string;
  description: string;
  schema: JsonSchema;
};

function jsonSchemaObject(properties: Record<string, JsonSchema>, required: string[], description?: string): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
    ...(description ? { description } : {}),
  };
}

function jsonSchemaNullableString(description?: string): JsonSchema {
  return {
    type: ["string", "null"],
    ...(description ? { description } : {}),
  };
}

function jsonSchemaString(description?: string): JsonSchema {
  return {
    type: "string",
    ...(description ? { description } : {}),
  };
}

function jsonSchemaInteger(description?: string): JsonSchema {
  return {
    type: "integer",
    ...(description ? { description } : {}),
  };
}

function jsonSchemaArray(items: JsonSchema, description?: string, minItems?: number): JsonSchema {
  return {
    type: "array",
    items,
    ...(typeof minItems === "number" ? { minItems } : {}),
    ...(description ? { description } : {}),
  };
}

const openAIExerciseMetaJsonSchema = jsonSchemaObject(
  {
    sourceType: { type: "string", enum: ["LESSON", "REVISION", "WEAK_POINT", "MIXED", "MANUAL"] },
    sourceRefId: jsonSchemaNullableString(),
    explanation: jsonSchemaNullableString(),
    learningObjective: jsonSchemaNullableString(),
    generationKind: jsonSchemaNullableString(),
  },
  ["sourceType", "sourceRefId", "explanation", "learningObjective", "generationKind"],
);

const openAIBaseQuestionProperties = {
  key: jsonSchemaString(),
  prompt: jsonSchemaString(),
  hint: jsonSchemaNullableString(),
};

const openAIMatchingPairJsonSchema = jsonSchemaObject(
  {
    left: jsonSchemaString(),
    right: jsonSchemaString(),
  },
  ["left", "right"],
);

const openAIGapFillQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    answer: jsonSchemaString(),
    acceptableAnswers: jsonSchemaArray(jsonSchemaString()),
  },
  ["key", "prompt", "hint", "answer", "acceptableAnswers"],
);

const openAIMultipleChoiceQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    options: jsonSchemaArray(jsonSchemaString(), undefined, 2),
    correctOptionIndex: jsonSchemaInteger(),
  },
  ["key", "prompt", "hint", "options", "correctOptionIndex"],
);

const openAIPhraseExplanationQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    answer: jsonSchemaString(),
  },
  ["key", "prompt", "hint", "answer"],
);

const openAIOpenAnswerQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    minWords: {
      type: ["integer", "null"],
    },
    requiredPhrases: jsonSchemaArray(jsonSchemaString()),
    targetMistakePattern: jsonSchemaNullableString(),
    sampleAnswer: jsonSchemaNullableString(),
    evaluationMode: {
      type: "string",
      enum: ["ai", "stub_auto"],
    },
  },
  [
    "key",
    "prompt",
    "hint",
    "minWords",
    "requiredPhrases",
    "targetMistakePattern",
    "sampleAnswer",
    "evaluationMode",
  ],
);

const openAIErrorCorrectionQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    incorrectText: jsonSchemaString(),
    answer: jsonSchemaString(),
    acceptableAnswers: jsonSchemaArray(jsonSchemaString()),
  },
  ["key", "prompt", "hint", "incorrectText", "answer", "acceptableAnswers"],
);

const openAISentenceBuildingQuestionJsonSchema = jsonSchemaObject(
  {
    ...openAIBaseQuestionProperties,
    tokens: jsonSchemaArray(jsonSchemaString(), undefined, 2),
    answer: jsonSchemaString(),
    acceptableAnswers: jsonSchemaArray(jsonSchemaString()),
  },
  ["key", "prompt", "hint", "tokens", "answer", "acceptableAnswers"],
);

function createOpenAIExerciseFormat(
  name: string,
  description: string,
  exerciseSchema: JsonSchema,
): OpenAIResponseFormat {
  return {
    name,
    description,
    schema: jsonSchemaObject(
      {
        exercise: exerciseSchema,
      },
      ["exercise"],
    ),
  };
}

const openAIGapFillExerciseFormat = createOpenAIExerciseFormat(
  "homework_gap_fill_exercise",
  "Exact YoTeach gap-fill exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["GAP_FILL"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAIGapFillQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIMultipleChoiceExerciseFormat = createOpenAIExerciseFormat(
  "homework_multiple_choice_exercise",
  "Exact YoTeach multiple-choice exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["MULTIPLE_CHOICE"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAIMultipleChoiceQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIPhraseExplanationExerciseFormat = createOpenAIExerciseFormat(
  "homework_phrase_explanation_exercise",
  "Exact YoTeach phrase-explanation exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["PHRASE_EXPLANATION"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAIPhraseExplanationQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIMatchingExerciseFormat = createOpenAIExerciseFormat(
  "homework_matching_exercise",
  "Exact YoTeach matching exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["MATCHING"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          pairs: jsonSchemaArray(openAIMatchingPairJsonSchema, undefined, 1),
          rightOrder: jsonSchemaArray(jsonSchemaString(), undefined, 1),
        },
        ["meta", "pairs", "rightOrder"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIOpenAnswerExerciseFormat = createOpenAIExerciseFormat(
  "homework_open_answer_exercise",
  "Exact YoTeach open-answer exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["OPEN_ANSWER"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAIOpenAnswerQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIErrorCorrectionExerciseFormat = createOpenAIExerciseFormat(
  "homework_error_correction_exercise",
  "Exact YoTeach error-correction exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["ERROR_CORRECTION"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAIErrorCorrectionQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAISentenceBuildingExerciseFormat = createOpenAIExerciseFormat(
  "homework_sentence_building_exercise",
  "Exact YoTeach sentence-building exercise format.",
  jsonSchemaObject(
    {
      type: { type: "string", enum: ["SENTENCE_BUILDING"] },
      instruction: jsonSchemaString(),
      payload: jsonSchemaObject(
        {
          meta: openAIExerciseMetaJsonSchema,
          questions: jsonSchemaArray(openAISentenceBuildingQuestionJsonSchema, undefined, 1),
        },
        ["meta", "questions"],
      ),
    },
    ["type", "instruction", "payload"],
  ),
);

const openAIOpenAnswerEvaluationFormat: OpenAIResponseFormat = {
  name: "open_answer_evaluation",
  description: "Strict evaluation result for an open-answer exercise.",
  schema: jsonSchemaObject(
    {
      isCorrect: { type: "boolean" },
      score: jsonSchemaInteger(),
      explanation: jsonSchemaString(),
    },
    ["isCorrect", "score", "explanation"],
  ),
};

function buildFocusedGenerationContext(
  context: HomeworkGenerationContext,
  planItem: HomeworkGenerationPlanItem,
): HomeworkGenerationContext {
  const focusedRevisionItems =
    planItem.sourceType === "REVISION" && planItem.sourceRefId
      ? context.dueRevisionItems.filter((item) => item.id === planItem.sourceRefId)
      : planItem.sourceType === "MIXED"
        ? context.dueRevisionItems.slice(0, 2)
        : [];

  const focusedWeakPoints =
    planItem.sourceType === "WEAK_POINT" && planItem.sourceRefId
      ? context.weakPoints.filter((item) => item.id === planItem.sourceRefId)
      : planItem.sourceType === "MIXED"
        ? context.weakPoints.slice(0, 2)
        : [];

  const focusedVocabulary =
    planItem.bucket === "lesson" || planItem.sourceType === "LESSON" || planItem.sourceType === "MIXED"
      ? context.lesson.vocabulary.slice(0, Math.min(context.vocabularyCap, 5))
      : context.lesson.vocabulary.slice(0, 2);

  const focusedGrammar =
    planItem.bucket === "lesson" || planItem.sourceType === "LESSON" || planItem.sourceType === "MIXED"
      ? context.lesson.grammar.slice(0, 3)
      : context.lesson.grammar.slice(0, 1);

  const focusedMistakes =
    planItem.sourceType === "WEAK_POINT" || planItem.sourceType === "MIXED"
      ? context.lesson.studentMistakes.slice(0, 3)
      : context.lesson.studentMistakes.slice(0, 1);

  return homeworkGenerationContextSchema.parse({
    ...context,
    lesson: {
      ...context.lesson,
      vocabulary: focusedVocabulary,
      grammar: focusedGrammar,
      studentMistakes: focusedMistakes,
    },
    dueRevisionItems: focusedRevisionItems,
    weakPoints: focusedWeakPoints,
  });
}

function getOpenAIExerciseFormat(type: HomeworkGenerationPlanItem["type"]) {
  switch (type) {
    case "GAP_FILL":
      return openAIGapFillExerciseFormat;
    case "MULTIPLE_CHOICE":
      return openAIMultipleChoiceExerciseFormat;
    case "PHRASE_EXPLANATION":
      return openAIPhraseExplanationExerciseFormat;
    case "MATCHING":
      return openAIMatchingExerciseFormat;
    case "OPEN_ANSWER":
      return openAIOpenAnswerExerciseFormat;
    case "ERROR_CORRECTION":
      return openAIErrorCorrectionExerciseFormat;
    case "SENTENCE_BUILDING":
      return openAISentenceBuildingExerciseFormat;
  }
}

function getOpenAIExerciseRules(type: HomeworkGenerationPlanItem["type"]) {
  switch (type) {
    case "GAP_FILL":
      return [
        "Return at least one question.",
        "Each question must have a non-empty string answer.",
        "Use ___ or a similar blank in the prompt where appropriate.",
      ];
    case "MULTIPLE_CHOICE":
      return [
        "Return at least one question.",
        "Each question must include at least 2 options.",
        "correctOptionIndex must be a valid zero-based index into options.",
      ];
    case "PHRASE_EXPLANATION":
      return [
        "Return at least one question.",
        "Each answer must be the target phrase in English as a non-empty string.",
      ];
    case "MATCHING":
      return [
        "Return at least 2 pairs.",
        "rightOrder must contain the same right-side strings as pairs.right in a shuffled order.",
      ];
    case "OPEN_ANSWER":
      return [
        "Return exactly one question.",
        "evaluationMode must be 'ai'.",
        "requiredPhrases must be an array, even if empty.",
      ];
    case "ERROR_CORRECTION":
      return [
        "Return at least one question.",
        "incorrectText must be a non-empty incorrect sentence, never null.",
        "answer must be the corrected sentence as a non-empty string.",
      ];
    case "SENTENCE_BUILDING":
      return [
        "Return at least one question.",
        "tokens must contain at least 2 word tokens.",
        "answer must be the fully correct sentence as a non-empty string.",
      ];
  }
}

function getExerciseTypeLabel(type: HomeworkGenerationPlanItem["type"]) {
  switch (type) {
    case "GAP_FILL":
      return "gap-fill";
    case "MULTIPLE_CHOICE":
      return "multiple-choice";
    case "PHRASE_EXPLANATION":
      return "phrase explanation";
    case "MATCHING":
      return "matching";
    case "OPEN_ANSWER":
      return "open-answer";
    case "ERROR_CORRECTION":
      return "error-correction";
    case "SENTENCE_BUILDING":
      return "sentence-building";
  }
}

function describeGeneratedExercise(item: HomeworkGenerationPlanItem) {
  return `${getExerciseTypeLabel(item.type)} exercise`;
}

async function generateOpenAIExercise(
  context: HomeworkGenerationContext,
  planItem: HomeworkGenerationPlanItem,
  existingType: HomeworkGenerationPlanItem["type"],
  ordinal: number,
  options?: {
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
  },
) {
  const focusedContext = buildFocusedGenerationContext(context, planItem);
  const responseFormat = getOpenAIExerciseFormat(existingType);
  const typeSpecificRules = getOpenAIExerciseRules(existingType);
  const extraContext = options?.additionalContext?.trim();
  const systemPrompt = [
    "You generate one ESL homework exercise as strict JSON.",
    "Return only a response that matches the provided JSON schema exactly.",
    "Use the exact field names from the schema with no aliases or extra keys.",
    "Return { exercise: ... } only.",
    "The exercise must use the requested type and preserve the learning objective.",
    "All question content must live inside payload.questions or payload.pairs.",
    "Keep prompts concise, classroom-appropriate, and aligned to the lesson level.",
    extraContext
      ? "Teacher additional context is mandatory. You must use it when regenerating the targeted question."
      : "",
  ].join(" ");
  const userPrompt = JSON.stringify(
    {
      task: options?.targetQuestion ? "Regenerate one homework exercise and replace the targeted question." : "Generate one homework exercise.",
      context: focusedContext,
      ordinal,
      planItem: { ...planItem, type: existingType },
      currentExercise: options?.currentExercise ? toComparableExercise(options.currentExercise) : null,
      targetQuestion: options?.targetQuestion ?? null,
      teacherAdditionalContext: extraContext ?? null,
      outputRules: [
        "Return exactly one exercise in the schema.",
        "Use the exact requested type.",
        "Do not invent alternate keys like prompt, choices, words, mapping, latestLessonPercent, or revisionPercent outside the schema.",
        options?.targetQuestion
          ? "Preserve the same exercise type and regenerate the targeted question in the same general slot."
          : "Generate a fresh exercise from the provided plan.",
        options?.currentExercise
          ? "The regenerated result must be meaningfully different from currentExercise. Change wording and learning content, not just ids."
          : "There is no prior exercise to compare against.",
        extraContext ? "Apply the teacher additional context directly in the regenerated question." : "No extra teacher constraints were provided.",
        ...typeSpecificRules,
      ],
    },
    null,
    2,
  );

  try {
    const response = await callOpenAI(z.unknown(), responseFormat, systemPrompt, userPrompt);
    const payload = asObject(response);
    return homeworkGeneratedExerciseSchema.parse(sanitizeOpenAIExerciseShape(payload?.exercise));
  } catch (error) {
    throw new Error(
      `GPT-5 mini could not generate a valid ${getExerciseTypeLabel(existingType)} exercise. Try again or choose another model.`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function extractOpenAIOutputText(payload: {
  output?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  output_text?: string;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();

  return text && text.length > 0 ? text : null;
}

function getVocabularyCap(level: string) {
  if (level.startsWith("A")) {
    return 5;
  }
  if (level.startsWith("B")) {
    return 7;
  }
  if (level.startsWith("C1")) {
    return 8;
  }
  return 8;
}

function getOpenAIHomeworkGenerationConcurrency() {
  const parsed = Number(process.env.OPENAI_HOMEWORK_GENERATION_CONCURRENCY ?? 3);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

function computeComposition(counts: { lesson: number; revision: number; weak: number }) {
  const total = counts.lesson + counts.revision + counts.weak;
  if (total === 0) {
    return { latestLesson: 0, revision: 0, weakPoints: 0 };
  }

  return {
    latestLesson: Math.round((counts.lesson / total) * 100),
    revision: Math.round((counts.revision / total) * 100),
    weakPoints: Math.max(0, 100 - Math.round((counts.lesson / total) * 100) - Math.round((counts.revision / total) * 100)),
  };
}

function nextIntervalDays(correct: boolean, consecutiveCorrect: number) {
  if (!correct) {
    return REVIEW_INTERVALS[0];
  }

  return REVIEW_INTERVALS[Math.min(consecutiveCorrect, REVIEW_INTERVALS.length - 1)];
}

function asFrontendType(type: HomeworkExerciseType): HomeworkExercise["type"] {
  switch (type) {
    case HomeworkExerciseType.GAP_FILL:
      return "gap-fill";
    case HomeworkExerciseType.MULTIPLE_CHOICE:
      return "multiple-choice";
    case HomeworkExerciseType.PHRASE_EXPLANATION:
      return "phrase-explanation";
    case HomeworkExerciseType.MATCHING:
      return "matching";
    case HomeworkExerciseType.OPEN_ANSWER:
      return "open-answer";
    case HomeworkExerciseType.ERROR_CORRECTION:
      return "error-correction";
    case HomeworkExerciseType.SENTENCE_BUILDING:
      return "sentence-building";
  }
}

function asPrismaExerciseType(type: HomeworkExercise["type"]): HomeworkExerciseType {
  switch (type) {
    case "gap-fill":
      return HomeworkExerciseType.GAP_FILL;
    case "multiple-choice":
      return HomeworkExerciseType.MULTIPLE_CHOICE;
    case "phrase-explanation":
      return HomeworkExerciseType.PHRASE_EXPLANATION;
    case "matching":
      return HomeworkExerciseType.MATCHING;
    case "open-answer":
      return HomeworkExerciseType.OPEN_ANSWER;
    case "error-correction":
      return HomeworkExerciseType.ERROR_CORRECTION;
    case "sentence-building":
      return HomeworkExerciseType.SENTENCE_BUILDING;
  }
}

function fallbackMeta(): ExerciseMeta {
  return {
    sourceType: "MANUAL",
    sourceRefId: null,
    explanation: null,
    learningObjective: null,
    generationKind: null,
  };
}

function mapHomeworkExercise(exercise: {
  id: number;
  type: HomeworkExerciseType;
  instruction: string;
  payload: Prisma.JsonValue;
}) {
  const parsedPayload = parseHomeworkExercisePayload(exercise.type, exercise.payload);
  if (exercise.type === HomeworkExerciseType.MATCHING) {
    return {
      id: serializeId(exercise.id),
      type: "matching" as const,
      instruction: exercise.instruction,
      source: {
        sourceType: parsedPayload.meta.sourceType
          .toLowerCase()
          .replaceAll("_", "-") as HomeworkExercise["source"]["sourceType"],
        sourceRefId: parsedPayload.meta.sourceRefId ?? null,
        explanation: parsedPayload.meta.explanation ?? null,
        learningObjective: parsedPayload.meta.learningObjective ?? null,
        generationKind: parsedPayload.meta.generationKind ?? null,
      },
      pairs: parsedPayload.pairs,
      rightOrder: parsedPayload.rightOrder,
    };
  }

  const questions = parsedPayload.questions.map((question) => ({
    id: question.key,
    text: question.prompt,
    hint: "hint" in question ? question.hint ?? undefined : undefined,
    answer:
      "correctOptionIndex" in question
        ? question.correctOptionIndex
        : "answer" in question
          ? question.answer
          : "",
    options: "options" in question ? question.options : undefined,
    acceptableAnswers: "acceptableAnswers" in question ? question.acceptableAnswers : undefined,
    incorrectText: "incorrectText" in question ? question.incorrectText : undefined,
    tokens: "tokens" in question ? question.tokens : undefined,
    minWords: "minWords" in question ? question.minWords : undefined,
    requiredPhrases: "requiredPhrases" in question ? question.requiredPhrases : undefined,
    targetMistakePattern: "targetMistakePattern" in question ? question.targetMistakePattern ?? null : undefined,
    evaluationMode: "evaluationMode" in question ? question.evaluationMode : undefined,
    evaluationStatus: undefined,
    explanation: parsedPayload.meta.explanation ?? null,
  }));

  return {
    id: serializeId(exercise.id),
    type: asFrontendType(exercise.type),
    instruction: exercise.instruction,
    source: {
      sourceType: parsedPayload.meta.sourceType
        .toLowerCase()
        .replaceAll("_", "-") as HomeworkExercise["source"]["sourceType"],
      sourceRefId: parsedPayload.meta.sourceRefId ?? null,
      explanation: parsedPayload.meta.explanation ?? null,
      learningObjective: parsedPayload.meta.learningObjective ?? null,
      generationKind: parsedPayload.meta.generationKind ?? null,
    },
    questions,
  };
}

export function mapHomeworkRecord(homework: {
  id: number;
  groupId: number;
  lessonId: number;
  title: string;
  dueDate: Date;
  status: HomeworkSetStatus;
  shareToken: string;
  compositionLatestLessonPct: number | null;
  compositionRevisionPct: number | null;
  compositionWeakPointsPct: number | null;
  exercises: {
    id: number;
    type: HomeworkExerciseType;
    sortOrder: number;
    instruction: string;
    payload: Prisma.JsonValue;
  }[];
  submissions: {
    id?: number;
    studentId: number;
    status: HomeworkSubmissionStatus;
    score: number | null;
    submittedAt: Date | null;
    answers?: {
      exerciseId: number;
      questionKey: string;
      answerValue: Prisma.JsonValue;
      correctValue: Prisma.JsonValue | null;
      isCorrect: boolean | null;
      exercise: {
        id: number;
        type: HomeworkExerciseType;
        instruction: string;
      };
    }[];
  }[];
}): Homework {
  const mappedExercises = homework.exercises
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((exercise) => mapHomeworkExercise(exercise));
  const exerciseLookup = new Map(mappedExercises.map((exercise) => [exercise.id, exercise]));
  return {
    id: serializeId(homework.id),
    groupId: serializeId(homework.groupId),
    lessonId: serializeId(homework.lessonId),
    title: homework.title,
    dueDate: homework.dueDate.toISOString().slice(0, 10),
    status:
      homework.status === HomeworkSetStatus.DRAFT ? "draft" : homework.status === HomeworkSetStatus.ARCHIVED ? "archived" : "published",
    shareLink: `${process.env.APP_ORIGIN || "http://localhost:8080"}/hw/${homework.shareToken}`,
    composition: {
      latestLesson: homework.compositionLatestLessonPct ?? 0,
      revision: homework.compositionRevisionPct ?? 0,
      weakPoints: homework.compositionWeakPointsPct ?? 0,
    },
    exercises: mappedExercises,
    studentProgress: Object.fromEntries(
      homework.submissions.map((submission) => {
        const hasPendingReview = submission.answers?.some((answer) => answer.isCorrect === null) ?? false;
        return [
          serializeId(submission.studentId),
          {
            status:
              submission.status === HomeworkSubmissionStatus.IN_PROGRESS
                ? "in-progress"
                : hasPendingReview
                  ? "pending-review"
                  : "completed",
            score: submission.score ?? 0,
            completedAt: submission.submittedAt?.toISOString().slice(0, 10) ?? null,
          },
        ];
      }),
    ),
    studentSubmissions: homework.submissions.map((submission) => ({
      studentId: serializeId(submission.studentId),
      status:
        submission.status === HomeworkSubmissionStatus.IN_PROGRESS
          ? "in-progress"
          : submission.answers?.some((answer) => answer.isCorrect === null)
            ? "pending-review"
            : "completed",
      score: submission.score ?? 0,
      completedAt: submission.submittedAt?.toISOString().slice(0, 10) ?? null,
      answers:
        submission.answers?.map((answer) => {
          const currentExercise = exerciseLookup.get(serializeId(answer.exerciseId));
          const questionPrompt =
            currentExercise?.type === "matching"
              ? currentExercise.instruction
              : currentExercise?.questions.find((question) => question.id === answer.questionKey)?.text ?? null;
          let displayAnswer: string | number | string[] | null = (answer.answerValue as string | number | string[] | null) ?? null;
          let displayCorrect: string | number | string[] | null = (answer.correctValue as string | number | string[] | null) ?? null;
          if (answer.exercise.type === HomeworkExerciseType.MULTIPLE_CHOICE && currentExercise?.type === "multiple-choice") {
            const question = currentExercise.questions.find((q) => q.id === answer.questionKey);
            if (question?.options) {
              const selIdx = typeof displayAnswer === "number" ? displayAnswer : Number(displayAnswer);
              if (Number.isInteger(selIdx) && selIdx >= 0 && selIdx < question.options.length) {
                displayAnswer = question.options[selIdx];
              }
              const corIdx = typeof displayCorrect === "number" ? displayCorrect : Number(displayCorrect);
              if (Number.isInteger(corIdx) && corIdx >= 0 && corIdx < question.options.length) {
                displayCorrect = question.options[corIdx];
              }
            }
          }
          return {
            exerciseId: serializeId(answer.exerciseId),
            exerciseType: asFrontendType(answer.exercise.type),
            instruction: answer.exercise.instruction,
            questionKey: answer.questionKey,
            questionPrompt,
            answerValue: displayAnswer,
            correctValue: displayCorrect,
            isCorrect: answer.isCorrect,
          };
        }) ?? [],
    })),
  };
}

function buildExercisePayload(exercise: HomeworkExercise) {
  const meta = {
    sourceType: exercise.source.sourceType.toUpperCase().replace("-", "_"),
    sourceRefId: exercise.source.sourceRefId ?? null,
    explanation: exercise.source.explanation ?? null,
    learningObjective: exercise.source.learningObjective ?? null,
    generationKind: exercise.source.generationKind ?? null,
  } as ExerciseMeta;

  switch (exercise.type) {
    case "gap-fill":
      return createGapFillPayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          answer: String(question.answer),
          acceptableAnswers: question.acceptableAnswers,
        })),
      });
    case "multiple-choice":
      return createMultipleChoicePayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          options: question.options ?? [],
          correctOptionIndex: Number(question.answer),
        })),
      });
    case "phrase-explanation":
      return createPhraseExplanationPayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          answer: String(question.answer),
        })),
      });
    case "matching":
      return createMatchingPayload({
        meta,
        pairs: exercise.pairs,
        rightOrder: exercise.rightOrder,
      });
    case "open-answer":
      return createOpenAnswerPayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          minWords: question.minWords,
          requiredPhrases: question.requiredPhrases ?? [],
          targetMistakePattern: question.targetMistakePattern ?? null,
          sampleAnswer: typeof question.answer === "string" ? question.answer : null,
          evaluationMode: question.evaluationMode ?? "ai",
        })),
      });
    case "error-correction":
      return createErrorCorrectionPayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          incorrectText: question.incorrectText ?? "",
          answer: String(question.answer),
          acceptableAnswers: question.acceptableAnswers,
          hint: question.explanation ?? null,
        })),
      });
    case "sentence-building":
      return createSentenceBuildingPayload({
        meta,
        questions: exercise.questions.map((question) => ({
          key: question.id,
          prompt: question.text,
          tokens: question.tokens ?? [],
          answer: String(question.answer),
          acceptableAnswers: question.acceptableAnswers,
          hint: question.explanation ?? null,
        })),
      });
  }
}

function createDefaultManualExercise(type: HomeworkExercise["type"]): HomeworkExercise {
  const baseSource = {
    sourceType: "manual" as const,
    sourceRefId: null,
    explanation: "Added manually by the teacher.",
    learningObjective: "Teacher custom exercise",
    generationKind: "manual",
  };

  switch (type) {
    case "gap-fill":
      return {
        id: "manual-gap-fill",
        type,
        instruction: "Fill in the gaps.",
        source: baseSource,
        questions: [{ id: "manual-q1", text: "Type the missing word.", answer: "" }],
      };
    case "multiple-choice":
      return {
        id: "manual-mc",
        type,
        instruction: "Choose the correct option.",
        source: baseSource,
        questions: [{ id: "manual-q1", text: "Select the best answer.", answer: 0, options: ["Option A", "Option B"] }],
      };
    case "phrase-explanation":
      return {
        id: "manual-phrase",
        type,
        instruction: "Write the phrase that matches the explanation.",
        source: baseSource,
        questions: [{ id: "manual-q1", text: "Explain the phrase in English.", answer: "" }],
      };
    case "matching":
      return {
        id: "manual-match",
        type,
        instruction: "Match the items.",
        source: baseSource,
        pairs: [
          { left: "left item 1", right: "right item 1" },
          { left: "left item 2", right: "right item 2" },
        ],
      };
    case "open-answer":
      return {
        id: "manual-open",
        type,
        instruction: "Write a short answer.",
        source: baseSource,
        questions: [
          {
            id: "manual-q1",
            text: "Write 2-4 sentences.",
            answer: "",
            minWords: 25,
            requiredPhrases: [],
            evaluationMode: "ai",
            evaluationStatus: undefined,
            correct: null,
          },
        ],
      };
    case "error-correction":
      return {
        id: "manual-error",
        type,
        instruction: "Correct the error.",
        source: baseSource,
        questions: [{ id: "manual-q1", text: "Rewrite the sentence correctly.", incorrectText: "I am agree.", answer: "I agree." }],
      };
    case "sentence-building":
      return {
        id: "manual-sentence",
        type,
        instruction: "Build a sentence from the words.",
        source: baseSource,
        questions: [{ id: "manual-q1", text: "Use all the words.", tokens: ["I", "am", "here"], answer: "I am here." }],
      };
  }
}

function makeQuestionKey(prefix: string, index: number) {
  return `${prefix}-q${index + 1}`;
}

function describePlanItem(planItem: HomeworkGenerationPlanItem) {
  switch (planItem.bucket) {
    case "lesson":
      return `Generating lesson exercise`;
    case "revision":
      return `Generating revision exercise`;
    case "weak-point":
      return `Generating weak-point exercise`;
    case "final-writing":
      return `Generating final writing task`;
  }
}

function withMeta(meta: ExerciseMeta, explanation: string, objective: string, generationKind: string): ExerciseMeta {
  return {
    ...meta,
    explanation,
    learningObjective: objective,
    generationKind,
  };
}

function asObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function sanitizeOpenAIExerciseShape(exercise: unknown) {
  const exerciseObject = asObject(exercise);
  if (!exerciseObject) {
    return exercise;
  }

  const type = typeof exerciseObject.type === "string" ? exerciseObject.type : "";
  const payload = asObject(exerciseObject.payload);
  const questions = Array.isArray(payload?.questions) ? payload.questions : null;
  const sanitizedQuestions =
    questions?.map((question) => {
      const questionObject = asObject(question);
      if (!questionObject) {
        return question;
      }

      const nextQuestion = { ...questionObject };
      if ((type === "GAP_FILL" || type === "PHRASE_EXPLANATION" || type === "ERROR_CORRECTION" || type === "SENTENCE_BUILDING" || type === "OPEN_ANSWER") && nextQuestion.answer == null) {
        nextQuestion.answer = "";
      }
      if (type === "OPEN_ANSWER" && nextQuestion.minWords == null) {
        nextQuestion.minWords = 35;
      }
      if (type === "OPEN_ANSWER" && nextQuestion.evaluationMode == null) {
        nextQuestion.evaluationMode = "ai";
      }
      if (type === "MULTIPLE_CHOICE" && nextQuestion.correctOptionIndex == null) {
        nextQuestion.correctOptionIndex = 0;
      }
      if (type === "SENTENCE_BUILDING" && Array.isArray(nextQuestion.tokens) && nextQuestion.tokens.length > 1) {
        nextQuestion.tokens = shuffleDeterministically(nextQuestion.tokens as string[]);
      }
      return nextQuestion;
    }) ?? questions;

  return {
    ...exerciseObject,
    payload: payload
      ? {
          ...payload,
          ...(sanitizedQuestions ? { questions: sanitizedQuestions } : {}),
        }
      : exerciseObject.payload,
  };
}

async function callGemini<T>(schema: z.ZodSchema<T>, systemPrompt: string, userPrompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: {
        parts?: { text?: string }[];
      };
    }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return schema.parse(JSON.parse(text));
}

async function callOpenAI<T>(
  schema: z.ZodSchema<T>,
  responseFormat: OpenAIResponseFormat,
  systemPrompt: string,
  userPrompt: string,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const timeoutMs = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 45000);
  let response: globalThis.Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: responseFormat.name,
            description: responseFormat.description,
            schema: responseFormat.schema,
            strict: true,
          },
          verbosity: "low",
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms.`, { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    output?: {
      type?: string;
      content?: {
        type?: string;
        text?: string;
      }[];
    }[];
    output_text?: string;
  };
  const text = extractOpenAIOutputText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `OpenAI returned invalid JSON. Raw response: ${text.slice(0, 4000)}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  try {
    return schema.parse(parsedJson);
  } catch (error) {
    throw new Error(
      `OpenAI response failed schema validation. Raw response: ${text.slice(0, 4000)}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function createStubProvider(): HomeworkGenerationProvider {
  return {
    async generateDraft({ context, plan, onProgress }) {
      const lessonVocabulary = context.lesson.vocabulary.slice(0, context.vocabularyCap);
      const dueRevisionItems = context.dueRevisionItems;
      const weakPoints = context.weakPoints;
      const exercises: HomeworkGenerationOutput["exercises"] = plan.items.map((item, index) => {
        const vocab = lessonVocabulary[index % Math.max(lessonVocabulary.length, 1)];
        const revision = dueRevisionItems[index % Math.max(dueRevisionItems.length, 1)];
        const weakPoint = weakPoints[index % Math.max(weakPoints.length, 1)];
        const meta = withMeta(
          {
            sourceType: item.sourceType,
            sourceRefId: item.sourceRefId ?? null,
            explanation: item.explanation,
            learningObjective: item.learningObjective,
            generationKind: item.type.toLowerCase(),
          },
          item.explanation,
          item.learningObjective,
          item.type.toLowerCase(),
        );

        switch (item.type) {
          case "GAP_FILL":
            return {
              type: item.type,
              instruction: "Fill in the gap with the correct word or verb form.",
              payload: createGapFillPayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`gap-${index}`, 0),
                    prompt: `${revision?.context || vocab?.context || "I ___ here since 2020."}`.replace(
                      revision?.answer || vocab?.phrase || "have lived",
                      "___",
                    ),
                    answer: revision?.answer || vocab?.phrase || "have lived",
                  },
                ],
              }),
            };
          case "MULTIPLE_CHOICE":
            return {
              type: item.type,
              instruction: "Choose the best answer.",
              payload: createMultipleChoicePayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`mc-${index}`, 0),
                    prompt: weakPoint
                      ? `Choose the correct sentence for ${weakPoint.area.toLowerCase()}.`
                      : "Choose the correct sentence.",
                    options: weakPoint
                      ? [
                          weakPoint.area.includes("Agreement") ? "I am agree with you." : "I have went there.",
                          weakPoint.area.includes("Agreement") ? "I agree with you." : "I went there.",
                          weakPoint.area.includes("Agreement") ? "I am agreed with you." : "I have go there.",
                        ]
                      : ["Option A", "Option B", "Option C"],
                    correctOptionIndex: 1,
                  },
                ],
              }),
            };
          case "PHRASE_EXPLANATION":
            return {
              type: item.type,
              instruction: "Type the target phrase that matches the explanation.",
              payload: createPhraseExplanationPayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`phrase-${index}`, 0),
                    prompt:
                      revision?.prompt ||
                      `Write the phrase related to ${vocab?.phrase || context.lesson.vocabulary[0]?.phrase || "today's lesson"}.`,
                    answer: revision?.answer || vocab?.phrase || "take a photo",
                  },
                ],
              }),
            };
          case "MATCHING": {
            const revisionPairs = dueRevisionItems
              .filter((itemValue) => itemValue.phrase)
              .slice(0, 3)
              .map((itemValue) => ({
                left: itemValue.phrase ?? itemValue.prompt,
                right: itemValue.context || itemValue.prompt,
              }));
            const pairs =
              lessonVocabulary.length > 0
                ? lessonVocabulary.slice(0, 3).map((itemValue) => ({
                    left: itemValue.phrase,
                    right: itemValue.context || itemValue.phrase,
                  }))
                : revisionPairs.length > 0
                  ? revisionPairs
                  : [
                      { left: "take a photo", right: "capture an image" },
                      { left: "miss a flight", right: "arrive too late for the plane" },
                    ];
            return {
              type: item.type,
              instruction: "Match the phrases with their contexts.",
              payload: createMatchingPayload({
                meta,
                pairs,
                rightOrder: shuffleDeterministically(pairs.map((pair) => pair.right)),
              }),
            };
          }
          case "ERROR_CORRECTION":
            return {
              type: item.type,
              instruction: "Correct the error.",
              payload: createErrorCorrectionPayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`error-${index}`, 0),
                    prompt: weakPoint
                      ? `Rewrite the sentence correctly. Focus on ${weakPoint.area.toLowerCase()}.`
                      : "Rewrite the sentence correctly.",
                    incorrectText: weakPoint?.area.includes("Agreement") ? "I am agree with you." : "I have went there yesterday.",
                    answer: weakPoint?.area.includes("Agreement") ? "I agree with you." : "I went there yesterday.",
                  },
                ],
              }),
            };
          case "SENTENCE_BUILDING": {
            const answer = vocab?.context || "I have lived here since 2020.";
            return {
              type: item.type,
              instruction: "Build a correct sentence.",
              payload: createSentenceBuildingPayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`sentence-${index}`, 0),
                    prompt: `Use all the words to build a sentence about ${vocab?.phrase || "the lesson topic"}.`,
                    tokens: shuffleDeterministically(answer.replace(/[.?!]/g, "").split(" ")),
                    answer,
                  },
                ],
              }),
            };
          }
          case "OPEN_ANSWER": {
            const requiredPhrases = lessonVocabulary.slice(0, 4).map((itemValue) => itemValue.phrase);
            return {
              type: item.type,
              instruction: "Write a short answer.",
              payload: createOpenAnswerPayload({
                meta,
                questions: [
                  {
                    key: makeQuestionKey(`open-${index}`, 0),
                    prompt:
                      weakPoint && requiredPhrases.length > 0
                        ? `Write 3-4 sentences about the lesson topic. Use ${requiredPhrases.join(", ")} and avoid the mistake pattern "${weakPoint.area}".`
                        : `Write 3-4 sentences about ${context.lesson.title}. Use ${requiredPhrases.join(", ")}.`,
                    minWords: requiredPhrases.length <= 2 ? 40 : requiredPhrases.length <= 3 ? 60 : Math.min(100, requiredPhrases.length * 20),
                    requiredPhrases,
                    targetMistakePattern: weakPoint?.area ?? null,
                    sampleAnswer: null,
                    evaluationMode: "ai",
                  },
                ],
              }),
            };
          }
        }
      });
      plan.items.forEach((item, index) => {
        onProgress?.({
          completedExercises: index + 1,
          totalExercises: plan.items.length,
          currentLabel: describePlanItem(item),
        });
      });

      return homeworkGenerationOutputSchema.parse({
        title: `${context.lesson.title} — Homework Draft`,
        dueDate: new Date(new Date(context.now).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        composition: plan.composition,
        exercises,
      });
    },
    async regenerateExercise({ context, planItem, existingType, ordinal, additionalContext, currentExercise, targetQuestion }) {
      const output = await this.generateDraft({
        context,
        plan: homeworkGenerationPlanSchema.parse({
          summary: {
            dueRevisionCount: context.dueRevisionItems.length,
            weakPointCount: context.weakPoints.length,
            lessonVocabularyCount: context.lesson.vocabulary.length,
            lessonGrammarCount: context.lesson.grammar.length,
          },
          composition: computeComposition({ lesson: 1, revision: 0, weak: 0 }),
          items: [{ ...planItem, type: existingType }],
        }),
      });
      const exercise = output.exercises[Math.min(ordinal, output.exercises.length - 1)];
      if (!exercise) {
        return exercise;
      }

      if (exercise.type === "MATCHING" || !targetQuestion || !additionalContext?.trim()) {
        return {
          ...exercise,
          instruction: `${exercise.instruction} Alternative version.`.trim(),
        };
      }

      const question =
        "questions" in exercise.payload
          ? exercise.payload.questions[Math.min(ordinal, exercise.payload.questions.length - 1)] ?? exercise.payload.questions[0]
          : null;
      if (!question) {
        return exercise;
      }

      return {
        ...exercise,
        payload: {
          ...exercise.payload,
          questions: exercise.payload.questions.map((currentQuestion, index) =>
            index === Math.min(ordinal, exercise.payload.questions.length - 1)
              ? {
                  ...currentQuestion,
                  prompt: `${currentQuestion.prompt} ${additionalContext.trim()}`.trim(),
                }
              : currentQuestion,
          ),
        },
      };
    },
    async evaluateOpenAnswer({ prompt, answer, requiredPhrases }) {
      const normalizedAnswer = normalizeText(answer);
      const matchedRequiredPhrases = requiredPhrases.filter((phrase) => normalizedAnswer.includes(normalizeText(phrase)));
      const missingPhrases = requiredPhrases.filter((phrase) => !normalizedAnswer.includes(normalizeText(phrase)));
      let explanation: string;
      if (requiredPhrases.length === 0) {
        explanation = "Your answer was recorded. Detailed AI feedback is not available right now — your teacher will review it.";
      } else if (missingPhrases.length === 0) {
        explanation = "You used all the required phrases correctly.";
      } else {
        explanation = `You needed to use ${missingPhrases.map((p) => `«${p}»`).join(", ")} but ${missingPhrases.length === 1 ? "it's" : "they're"} missing from your answer.`;
      }
      return {
        mode: "stub_auto",
        isCorrect: requiredPhrases.length === 0 || matchedRequiredPhrases.length === requiredPhrases.length,
        score:
          requiredPhrases.length === 0
            ? Math.min(100, Math.max(60, answer.trim().split(/\s+/).filter(Boolean).length * 4))
            : Math.round((matchedRequiredPhrases.length / requiredPhrases.length) * 100),
        explanation,
      };
    },
  };
}

function createGeminiProvider(): HomeworkGenerationProvider {
  return {
    async generateDraft({ context, plan, onProgress }) {
      const systemPrompt = [
        "You generate English-language ESL homework as strict JSON.",
        "Return only valid JSON with no markdown.",
        "Follow the requested composition and plan exactly.",
        "Use only the supported exercise types and payload shapes provided by the user.",
        "Keep prompts concise, classroom-appropriate, and aligned to the lesson level.",
        "Open-answer exercises must use evaluationMode 'ai'.",
      ].join(" ");
      const userPrompt = JSON.stringify(
        {
          task: "Generate a homework draft from the provided normalized context and plan.",
          context,
          plan,
          outputRequirements: {
            title: "string",
            dueDate: "YYYY-MM-DD",
            composition: "use the plan composition percentages",
            exercises: "strictly conform to the supported payload schema",
          },
        },
        null,
        2,
      );

      const response = await callGemini(homeworkGenerationOutputSchema, systemPrompt, userPrompt);
      onProgress?.({
        completedExercises: plan.items.length,
        totalExercises: plan.items.length,
        currentLabel: "Generated full draft",
      });
      return homeworkGenerationOutputSchema.parse(response);
    },
    async regenerateExercise({ context, planItem, existingType, ordinal, additionalContext, currentExercise, targetQuestion }) {
      const systemPrompt = [
        "You regenerate a single ESL homework exercise as strict JSON.",
        "Return only valid JSON with no markdown.",
        "Preserve the requested exercise type and learning objective.",
        "Open-answer exercises must use evaluationMode 'ai'.",
        additionalContext?.trim() ? "Teacher additional context is mandatory and must shape the targeted question." : "",
        currentExercise ? "The regenerated result must be meaningfully different from the current exercise, not just cosmetically changed." : "",
      ].join(" ");
      const userPrompt = JSON.stringify(
        {
          task: "Regenerate one exercise.",
          context,
          ordinal,
          planItem: { ...planItem, type: existingType },
          currentExercise: currentExercise ? toComparableExercise(currentExercise) : null,
          targetQuestion: targetQuestion ?? null,
          teacherAdditionalContext: additionalContext?.trim() || null,
          output: "Return { exercise: ... } where exercise matches the supported exercise schema.",
        },
        null,
        2,
      );

      const response = await callGemini(geminiExerciseResponseSchema, systemPrompt, userPrompt);
      return response.exercise;
    },
    async evaluateOpenAnswer({ prompt, answer, requiredPhrases }) {
      const systemPrompt = [
        "You are an experienced, warm ESL teacher reviewing a student's written homework answer. Return strict JSON only, no markdown.",
        "Your explanation should read like a short teacher comment — human, specific, and encouraging without being over-the-top.",
        "Guidelines for the explanation field:",
        "- Start by noting what the student did well (good vocabulary, correct structure, clear idea) — be specific, not generic.",
        "- If the student uses an unnatural or awkward phrasing, suggest a more natural alternative in this format: Instead of «student phrase» you could say «natural alternative» — it sounds more natural.",
        "- If required phrases are missing, explicitly state which ones are absent: You needed to use «phrase» but it's missing from your answer.",
        "- If the answer is off-topic or too short, say so directly but kindly.",
        "- Keep the explanation to 2-4 sentences. Do not use bullet points.",
        "- Score 0-100: 85-100 = strong answer with minor issues at most, 60-84 = acceptable but has noticeable gaps, below 60 = significant problems.",
        "- Do not penalize if the word count is within 10% below the minimum requirement.",
        "Required phrases should strongly influence correctness and score.",
      ].join(" ");
      const userPrompt = JSON.stringify(
        {
          task: "Evaluate a student's open-answer homework response.",
          prompt,
          answer,
          requiredPhrases,
          output: {
            isCorrect: "boolean",
            score: "integer 0-100",
            explanation: "2-4 sentence teacher-style comment",
          },
        },
        null,
        2,
      );

      const response = await callGemini(geminiOpenAnswerEvaluationSchema, systemPrompt, userPrompt);
      return {
        mode: "ai",
        isCorrect: response.isCorrect,
        score: response.score,
        explanation: response.explanation,
      };
    },
  };
}

function createOpenAIProvider(): HomeworkGenerationProvider {
  return {
    async generateDraft({ context, plan, onProgress }) {
      const results: Array<HomeworkGenerationOutput["exercises"][number] | null> = new Array(plan.items.length).fill(null);
      const totalExercises = plan.items.length;
      let nextIndex = 0;
      let processedExercises = 0;
      const concurrency = Math.min(getOpenAIHomeworkGenerationConcurrency(), totalExercises);

      async function runWorker() {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= totalExercises) {
            return;
          }

          const item = plan.items[index];
          onProgress?.({
            completedExercises: processedExercises,
            totalExercises,
            currentLabel: describePlanItem(item),
          });

          try {
            const exercise = await generateOpenAIExercise(context, item, item.type, index);
            results[index] = exercise;
            processedExercises += 1;
            onProgress?.({
              completedExercises: processedExercises,
              totalExercises,
              currentLabel: `Generated ${describeGeneratedExercise(item)}.`,
              event: {
                level: "success",
                exerciseIndex: index,
                message: `Generated ${describeGeneratedExercise(item)} ${index + 1} of ${totalExercises}.`,
              },
            });
          } catch (error) {
            console.error(formatUnknownError(error));
            processedExercises += 1;
            onProgress?.({
              completedExercises: processedExercises,
              totalExercises,
              currentLabel: `Skipped ${describeGeneratedExercise(item)} after a generation error.`,
              event: {
                level: "info",
                exerciseIndex: index,
                message: `Could not generate ${describeGeneratedExercise(item)} ${index + 1} of ${totalExercises}. Skipped it and continued.`,
              },
            });
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
      const exercises = results.filter((exercise): exercise is HomeworkGenerationOutput["exercises"][number] => exercise !== null);
      if (exercises.length === 0) {
        throw new ApiError(502, "The AI model could not generate any exercises for this lesson. Try again or choose another model.");
      }

      return homeworkGenerationOutputSchema.parse({
        title: `${context.lesson.title} — Homework Draft`,
        dueDate: new Date(new Date(context.now).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        composition: plan.composition,
        exercises,
      });
    },
    async regenerateExercise({ context, planItem, existingType, ordinal, additionalContext, currentExercise, targetQuestion }) {
      return generateOpenAIExercise(context, planItem, existingType, ordinal, {
        additionalContext,
        currentExercise,
        targetQuestion,
      });
    },
    async evaluateOpenAnswer({ prompt, answer, requiredPhrases }) {
      const systemPrompt = [
        "You are an experienced, warm ESL teacher reviewing a student's written homework answer. Return only a response that matches the provided JSON schema exactly.",
        "Your explanation should read like a short teacher comment — human, specific, and encouraging without being over-the-top.",
        "Guidelines for the explanation field:",
        "- Start by noting what the student did well (good vocabulary, correct structure, clear idea) — be specific, not generic.",
        "- If the student uses an unnatural or awkward phrasing, suggest a more natural alternative in this format: Instead of «student phrase» you could say «natural alternative» — it sounds more natural.",
        "- If required phrases are missing, explicitly state which ones are absent: You needed to use «phrase» but it's missing from your answer.",
        "- If the answer is off-topic or too short, say so directly but kindly.",
        "- Keep the explanation to 2-4 sentences. Do not use bullet points.",
        "- Score 0-100: 85-100 = strong answer with minor issues at most, 60-84 = acceptable but has noticeable gaps, below 60 = significant problems.",
        "- Do not penalize if the word count is within 10% below the minimum requirement.",
        "Required phrases should strongly influence correctness and score.",
      ].join(" ");
      const userPrompt = JSON.stringify(
        {
          task: "Evaluate a student's open-answer homework response.",
          prompt,
          answer,
          requiredPhrases,
          output: {
            isCorrect: "boolean",
            score: "integer 0-100",
            explanation: "2-4 sentence teacher-style comment",
          },
        },
        null,
        2,
      );

      const response = await callOpenAI(
        geminiOpenAnswerEvaluationSchema,
        openAIOpenAnswerEvaluationFormat,
        systemPrompt,
        userPrompt,
      );
      return {
        mode: "ai",
        isCorrect: response.isCorrect,
        score: response.score,
        explanation: response.explanation,
      };
    },
  };
}

function createFallbackProviderChain(providers: HomeworkGenerationProvider[]): HomeworkGenerationProvider {
  return {
    async generateDraft(input) {
      let lastError: unknown = null;
      for (const provider of providers) {
        try {
          return await provider.generateDraft(input);
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Homework generation failed.");
    },
    async regenerateExercise(input) {
      let lastError: unknown = null;
      for (const provider of providers) {
        try {
          return await provider.regenerateExercise(input);
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Exercise regeneration failed.");
    },
    async evaluateOpenAnswer(input) {
      let lastError: unknown = null;
      for (const provider of providers) {
        try {
          return await provider.evaluateOpenAnswer(input);
        } catch (error) {
          console.error(`[evaluateOpenAnswer] provider failed:`, error instanceof Error ? error.message : error);
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Open-answer evaluation failed.");
    },
  };
}

export function getHomeworkGenerationProvider(model: HomeworkGenerationModel = DEFAULT_HOMEWORK_GENERATION_MODEL) {
  const fallbackProvider = createStubProvider();
  switch (model) {
    case "stub":
      return fallbackProvider;
    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        throw new ApiError(400, "Gemini Flash is not configured.");
      }
      return createGeminiProvider();
    case "openai":
      if (!process.env.OPENAI_API_KEY) {
        throw new ApiError(400, "GPT-5 mini is not configured.");
      }
      return createOpenAIProvider();
    case "auto": {
      const providers: HomeworkGenerationProvider[] = [];
      if (process.env.OPENAI_API_KEY) {
        providers.push(createOpenAIProvider());
      }
      if (process.env.GEMINI_API_KEY) {
        providers.push(createGeminiProvider());
      }
      providers.push(fallbackProvider);
      return createFallbackProviderChain(providers);
    }
  }
}

export async function generateHomeworkPlan(context: HomeworkGenerationContext): Promise<HomeworkGenerationPlan> {
  const revisionItems = context.dueRevisionItems.slice(0, context.quotas.revision);
  const weakPoints = context.weakPoints.slice(0, context.quotas.weakPoints);
  const items: HomeworkGenerationPlanItem[] = [];

  const lessonExerciseTypes: HomeworkGenerationPlanItem["type"][] = ["GAP_FILL", "SENTENCE_BUILDING", "MULTIPLE_CHOICE"];
  for (let index = 0; index < Math.max(1, context.quotas.latestLesson); index += 1) {
    items.push({
      bucket: "lesson",
      type: lessonExerciseTypes[index % lessonExerciseTypes.length],
      sourceType: "LESSON",
      sourceRefId: context.lesson.id,
      learningObjective: `Practice lesson content from ${context.lesson.title}`,
      explanation: "Generated from the latest lesson vocabulary and grammar.",
    });
  }

  for (const revisionItem of revisionItems) {
    items.push({
      bucket: "revision",
      type: items.length % 2 === 0 ? "PHRASE_EXPLANATION" : "MATCHING",
      sourceType: "REVISION",
      sourceRefId: revisionItem.id,
      learningObjective: `Review due item: ${revisionItem.phrase ?? revisionItem.prompt}`,
      explanation: "Generated from a due spaced-repetition review item.",
    });
  }

  for (const weakPoint of weakPoints) {
    items.push({
      bucket: "weak-point",
      type: weakPoint.category === "grammar" ? "ERROR_CORRECTION" : "MULTIPLE_CHOICE",
      sourceType: "WEAK_POINT",
      sourceRefId: weakPoint.id,
      learningObjective: `Target weak point: ${weakPoint.area}`,
      explanation: "Generated from repeated or high-severity group weak points.",
    });
  }

  items.push({
    bucket: "final-writing",
    type: "OPEN_ANSWER",
    sourceType: "MIXED",
    sourceRefId: context.lesson.id,
    learningObjective: "Use lesson vocabulary in a short guided writing task.",
    explanation: "Final output task using lesson vocabulary and at least one mistake pattern when available.",
  });

  return homeworkGenerationPlanSchema.parse({
    summary: {
      dueRevisionCount: context.dueRevisionItems.length,
      weakPointCount: context.weakPoints.length,
      lessonVocabularyCount: context.lesson.vocabulary.length,
      lessonGrammarCount: context.lesson.grammar.length,
    },
    composition: computeComposition({
      lesson: Math.max(1, context.quotas.latestLesson),
      revision: revisionItems.length,
      weak: weakPoints.length,
    }),
    items,
  });
}

export async function buildHomeworkGenerationContext(lessonId: string): Promise<HomeworkGenerationContext> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: parseId(lessonId, "Lesson") },
    include: {
      group: {
        include: {
          memberships: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
          },
        },
      },
      grammarItems: true,
      vocabItems: true,
      studentMistakes: true,
    },
  });

  if (!lesson) {
    throw new ApiError(404, "Lesson not found.");
  }

  if (lesson.grammarItems.length === 0 && lesson.vocabItems.length === 0 && lesson.studentMistakes.length === 0) {
    throw new ApiError(400, "This lesson has no usable content for homework generation.");
  }

  const studentIds = lesson.group.memberships
    .filter((membership) => membership.user.role === UserRole.STUDENT)
    .map((membership) => membership.user.id);
  const [dueRevisionItems, weakPoints] = await Promise.all([
    prisma.revisionItem.findMany({
      where: {
        studentId: { in: studentIds },
        nextReviewAt: { lte: new Date() },
      },
      orderBy: [{ nextReviewAt: "asc" }, { consecutiveCorrect: "asc" }],
    }),
    prisma.studentWeakPoint.findMany({
      where: {
        groupId: lesson.groupId,
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const context = homeworkGenerationContextSchema.parse({
    now: new Date().toISOString(),
    group: {
      id: serializeId(lesson.group.id),
      name: lesson.group.name,
      level: lesson.group.level,
      students: lesson.group.memberships
        .filter((membership) => membership.user.role === UserRole.STUDENT)
        .map((membership) => ({
          id: serializeId(membership.user.id),
          name: membership.user.name,
        })),
    },
    lesson: {
      id: serializeId(lesson.id),
      title: lesson.title,
      date: lesson.lessonDate.toISOString().slice(0, 10),
      notes: lesson.notes ?? "",
      grammar: lesson.grammarItems.sort((left, right) => left.sortOrder - right.sortOrder).map((item) => item.title),
      vocabulary: lesson.vocabItems
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({ id: serializeId(item.id), phrase: item.phrase, context: item.context ?? "" })),
      studentMistakes: lesson.studentMistakes.map((mistake) => ({
        id: serializeId(mistake.id),
        studentId: serializeId(mistake.studentId),
        mistake: mistake.mistake,
        correction: mistake.correction ?? "",
        category: mistake.category,
      })),
    },
    dueRevisionItems: dueRevisionItems.map((item) => ({
      id: serializeId(item.id),
      studentId: serializeId(item.studentId),
      studentName:
        lesson.group.memberships.find((membership) => membership.user.id === item.studentId)?.user.name ?? "Student",
      sourceType: item.sourceType.toLowerCase(),
      sourceRefId: item.sourceId ? serializeId(item.sourceId) : null,
      entityKey: item.entityKey,
      phrase: item.phrase,
      context: item.context,
      prompt: item.prompt,
      answer: item.answer,
      nextReviewAt: item.nextReviewAt.toISOString(),
      intervalDays: item.intervalDays,
      consecutiveCorrect: item.consecutiveCorrect,
    })),
    weakPoints: weakPoints.map((item) => ({
      id: serializeId(item.id),
      studentId: serializeId(item.studentId),
      studentName:
        lesson.group.memberships.find((membership) => membership.user.id === item.studentId)?.user.name ?? "Student",
      area: item.area,
      category: item.category,
      severity: item.severity.toLowerCase(),
      source: item.source.toLowerCase(),
      lessonId: item.lessonId ? serializeId(item.lessonId) : null,
    })),
    vocabularyCap: getVocabularyCap(lesson.group.level),
    quotas: {
      latestLesson: 3,
      revision: 2,
      weakPoints: 1,
    },
  });

  return context;
}

async function persistHomeworkDraft(
  lessonId: number,
  groupId: number,
  teacherId: number,
  draft: HomeworkDraftOutput,
) {
  const homework = await prisma.homeworkSet.create({
    data: {
      lessonId,
      groupId,
      createdById: teacherId,
      title: draft.title,
      dueDate: new Date(`${draft.dueDate}T18:00:00.000Z`),
      status: HomeworkSetStatus.DRAFT,
      shareToken: randomBytes(8).toString("hex"),
      compositionLatestLessonPct: draft.composition.latestLesson,
      compositionRevisionPct: draft.composition.revision,
      compositionWeakPointsPct: draft.composition.weakPoints,
      exercises: {
        create: draft.exercises.map((exercise, index) => ({
          sortOrder: index + 1,
          type: HomeworkExerciseType[exercise.type],
          instruction: exercise.instruction,
          payload: exercise.payload,
        })),
      },
    },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return mapHomeworkRecord(homework);
}

export async function generateHomeworkDraftForLesson(
  lessonId: string,
  options?: {
    model?: HomeworkGenerationModel;
    onProgress?: (progress: {
      completedExercises: number;
      totalExercises: number;
      currentLabel: string | null;
    }) => void;
  },
) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: parseId(lessonId, "Lesson") },
    select: { id: true, groupId: true, teacherId: true },
  });
  if (!lesson) {
    throw new ApiError(404, "Lesson not found.");
  }

  const context = await buildHomeworkGenerationContext(lessonId);
  const plan = await generateHomeworkPlan(context);
  options?.onProgress?.({
    completedExercises: 0,
    totalExercises: plan.items.length,
    currentLabel: "Starting generation",
  });
  const provider = getHomeworkGenerationProvider(
    parseHomeworkGenerationModel(options?.model ?? DEFAULT_HOMEWORK_GENERATION_MODEL),
  );
  const draft = await provider.generateDraft({ context, plan, onProgress: options?.onProgress });
  const parsedDraft = homeworkGenerationOutputSchema.parse(draft);

  return {
    homework: await persistHomeworkDraft(lesson.id, lesson.groupId, lesson.teacherId, parsedDraft),
    plan,
  };
}

export async function startHomeworkGenerationJob(
  lessonId: string,
  options?: { model?: HomeworkGenerationModel },
) {
  const model = parseHomeworkGenerationModel(options?.model ?? DEFAULT_HOMEWORK_GENERATION_MODEL);
  const job = createHomeworkGenerationJob(lessonId, model);

  void (async () => {
    updateHomeworkGenerationJob(job.id, (current) => ({
      ...current,
      status: "running",
      currentLabel: "Preparing generation context",
    }));

    try {
      const result = await generateHomeworkDraftForLesson(lessonId, {
        model,
        onProgress: ({ completedExercises, totalExercises, currentLabel, event }) => {
          updateHomeworkGenerationJob(job.id, (current) => ({
            ...current,
            status: "running",
            completedExercises,
            totalExercises,
            currentLabel,
            events: event ? [...current.events, createHomeworkGenerationJobEvent(event)] : current.events,
          }));
        },
      });

      updateHomeworkGenerationJob(job.id, (current) => ({
        ...current,
        status: "completed",
        completedExercises: result.homework.exercises.length,
        totalExercises: result.homework.exercises.length,
        currentLabel: "Completed",
        homework: result.homework,
        plan: result.plan,
        error: null,
      }));
    } catch (error) {
      console.error(formatUnknownError(error));
      updateHomeworkGenerationJob(job.id, (current) => ({
        ...current,
        status: "failed",
        currentLabel: null,
        error: error instanceof Error ? error.message : "Homework generation failed.",
      }));
    }
  })();

  return { job };
}

export function getHomeworkGenerationJobStatus(jobId: string) {
  const job = getHomeworkGenerationJob(jobId);
  if (!job) {
    throw new ApiError(404, "Homework generation job not found.");
  }

  return { job };
}

export async function getHomeworkById(homeworkId: string) {
  const homework = await prisma.homeworkSet.findUnique({
    where: { id: parseId(homeworkId, "Homework") },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!homework) {
    throw new ApiError(404, "Homework not found.");
  }

  return { homework: mapHomeworkRecord(homework) };
}

export async function updateHomeworkDraft(homeworkId: string, input: { title: string; dueDate: string }) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const title = input.title.trim();
  if (!title) {
    throw new ApiError(400, "Homework title is required.");
  }

  const dueDate = new Date(`${input.dueDate}T18:00:00.000Z`);
  if (Number.isNaN(dueDate.getTime())) {
    throw new ApiError(400, "Due date is invalid.");
  }

  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { status: true },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const homework = await prisma.homeworkSet.update({
    where: { id: numericHomeworkId },
    data: {
      title,
      dueDate,
    },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return { homework: mapHomeworkRecord(homework) };
}

export async function updateHomeworkExercise(homeworkId: string, exerciseId: string, exercise: HomeworkExercise) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const numericExerciseId = parseId(exerciseId, "Exercise");
  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { id: true, status: true },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const existingExercise = await prisma.homeworkExercise.findUnique({
    where: { id: numericExerciseId },
    select: { id: true, homeworkSetId: true },
  });
  if (!existingExercise || existingExercise.homeworkSetId !== numericHomeworkId) {
    throw new ApiError(404, "Exercise not found.");
  }

  await prisma.homeworkExercise.update({
    where: { id: numericExerciseId },
    data: {
      instruction: exercise.instruction,
      type: asPrismaExerciseType(exercise.type),
      payload: buildExercisePayload(exercise),
    },
  });

  const homework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!homework) {
    throw new ApiError(404, "Homework not found.");
  }

  return {
    homework: mapHomeworkRecord(homework),
    exercise: mapHomeworkRecord(homework).exercises.find((item) => item.id === exerciseId) ?? exercise,
  };
}

export async function addManualHomeworkExercise(homeworkId: string, type: HomeworkExercise["type"]) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { status: true },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const currentMaxSortOrder = await prisma.homeworkExercise.aggregate({
    where: { homeworkSetId: numericHomeworkId },
    _max: { sortOrder: true },
  });
  const exercise = createDefaultManualExercise(type);
  await prisma.homeworkExercise.create({
    data: {
      homeworkSetId: numericHomeworkId,
      sortOrder: (currentMaxSortOrder._max.sortOrder ?? 0) + 1,
      type: asPrismaExerciseType(type),
      instruction: exercise.instruction,
      payload: buildExercisePayload(exercise),
    },
  });

  const homework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!homework) {
    throw new ApiError(404, "Homework not found.");
  }

  const mapped = mapHomeworkRecord(homework);
  const addedExercise = mapped.exercises.at(-1);
  if (!addedExercise) {
    throw new ApiError(500, "Exercise creation failed.");
  }

  return { homework: mapped, exercise: addedExercise };
}

export async function deleteHomeworkExercise(homeworkId: string, exerciseId: string) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { id: true, status: true },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const numericExerciseId = parseId(exerciseId, "Exercise");
  const existingExercise = await prisma.homeworkExercise.findUnique({
    where: { id: numericExerciseId },
    select: { id: true, homeworkSetId: true },
  });
  if (!existingExercise || existingExercise.homeworkSetId !== numericHomeworkId) {
    throw new ApiError(404, "Exercise not found.");
  }

  await prisma.homeworkExercise.delete({
    where: { id: numericExerciseId },
  });

  const remainingExercises = await prisma.homeworkExercise.findMany({
    where: { homeworkSetId: numericHomeworkId },
    orderBy: { sortOrder: "asc" },
  });
  await prisma.$transaction(
    remainingExercises.map((exercise, index) =>
      prisma.homeworkExercise.update({
        where: { id: exercise.id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );

  const homework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!homework) {
    throw new ApiError(404, "Homework not found.");
  }

  return { homework: mapHomeworkRecord(homework), exerciseId };
}

function buildRegenerationPlanItem(
  exercise: {
    type: HomeworkExerciseType;
    payload: Prisma.JsonValue;
  },
  additionalContext?: string,
): HomeworkGenerationPlanItem {
  const parsedPayload = parseHomeworkExercisePayload(exercise.type, exercise.payload);
  const extraContext = additionalContext?.trim();

  return {
    bucket:
      parsedPayload.meta.sourceType === "REVISION"
        ? "revision"
        : parsedPayload.meta.sourceType === "WEAK_POINT"
          ? "weak-point"
          : parsedPayload.meta.sourceType === "MIXED"
            ? "final-writing"
            : "lesson",
    type: exercise.type,
    sourceType: parsedPayload.meta.sourceType,
    sourceRefId: parsedPayload.meta.sourceRefId ?? null,
    learningObjective: extraContext
      ? `${parsedPayload.meta.learningObjective ?? "Regenerated exercise"} Teacher context: ${extraContext}`
      : parsedPayload.meta.learningObjective ?? "Regenerated exercise",
    explanation: extraContext
      ? `${parsedPayload.meta.explanation ?? "Regenerated exercise"} Teacher context: ${extraContext}`
      : parsedPayload.meta.explanation ?? "Regenerated exercise",
  };
}

function replaceExerciseQuestion(
  exercise: HomeworkExercise,
  questionId: string,
  nextQuestion: ExerciseQuestion,
) {
  if (exercise.type === "matching") {
    return exercise;
  }

  return {
    ...exercise,
    questions: exercise.questions.map((question) =>
      question.id === questionId ? { ...nextQuestion, id: question.id } : question,
    ),
  };
}

function toComparableExercise(exercise: HomeworkExercise) {
  if (exercise.type === "matching") {
    return {
      type: exercise.type,
      instruction: exercise.instruction.trim(),
      pairs: exercise.pairs.map((pair) => ({
        left: pair.left.trim(),
        right: pair.right.trim(),
      })),
      rightOrder: exercise.rightOrder?.map((item) => item.trim()) ?? null,
    };
  }

  return {
    type: exercise.type,
    instruction: exercise.instruction.trim(),
    questions: exercise.questions.map((question) => ({
      text: question.text.trim(),
      answer: question.answer,
      options: question.options?.map((option) => option.trim()) ?? null,
      acceptableAnswers: question.acceptableAnswers?.map((value) => value.trim()) ?? null,
      incorrectText: question.incorrectText?.trim() ?? null,
      tokens: question.tokens?.map((token) => token.trim()) ?? null,
      minWords: question.minWords ?? null,
      requiredPhrases: question.requiredPhrases?.map((phrase) => phrase.trim()) ?? null,
      targetMistakePattern: question.targetMistakePattern?.trim() ?? null,
    })),
  };
}

function toComparableQuestion(question: ExerciseQuestion) {
  return {
    text: question.text.trim(),
    answer: question.answer,
    options: question.options?.map((option) => option.trim()) ?? null,
    acceptableAnswers: question.acceptableAnswers?.map((value) => value.trim()) ?? null,
    incorrectText: question.incorrectText?.trim() ?? null,
    tokens: question.tokens?.map((token) => token.trim()) ?? null,
    minWords: question.minWords ?? null,
    requiredPhrases: question.requiredPhrases?.map((phrase) => phrase.trim()) ?? null,
    targetMistakePattern: question.targetMistakePattern?.trim() ?? null,
  };
}

function isMeaningfullyDifferentExercise(left: HomeworkExercise, right: HomeworkExercise) {
  return JSON.stringify(toComparableExercise(left)) !== JSON.stringify(toComparableExercise(right));
}

function isMeaningfullyDifferentQuestion(left: ExerciseQuestion, right: ExerciseQuestion) {
  return JSON.stringify(toComparableQuestion(left)) !== JSON.stringify(toComparableQuestion(right));
}

function generatedExerciseToFrontend(exercise: z.infer<typeof homeworkGeneratedExerciseSchema>): HomeworkExercise {
  return mapHomeworkExercise({
    id: 0,
    type: HomeworkExerciseType[exercise.type],
    instruction: exercise.instruction,
    payload: exercise.payload,
  });
}

export async function regenerateHomeworkExercise(
  homeworkId: string,
  exerciseId: string,
  options?: { model?: HomeworkGenerationModel },
) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const draftHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { id: true, status: true },
  });
  if (!draftHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (draftHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const exercise = await prisma.homeworkExercise.findUnique({
    where: { id: parseId(exerciseId, "Exercise") },
    include: {
      homeworkSet: {
        select: { lessonId: true },
      },
    },
  });
  if (!exercise || exercise.homeworkSetId !== numericHomeworkId) {
    throw new ApiError(404, "Exercise not found.");
  }

  const context = await buildHomeworkGenerationContext(serializeId(exercise.homeworkSet.lessonId));
  const provider = getHomeworkGenerationProvider(
    parseHomeworkGenerationModel(options?.model ?? DEFAULT_HOMEWORK_GENERATION_MODEL),
  );
  let regenerated = await provider.regenerateExercise({
    context,
    planItem: buildRegenerationPlanItem(exercise),
    existingType: exercise.type,
    ordinal: 0,
    currentExercise: mapHomeworkExercise({
      id: exercise.id,
      type: exercise.type,
      instruction: exercise.instruction,
      payload: exercise.payload,
    }),
  });
  const currentExercise = mapHomeworkExercise({
    id: exercise.id,
    type: exercise.type,
    instruction: exercise.instruction,
    payload: exercise.payload,
  });
  if (!isMeaningfullyDifferentExercise(currentExercise, generatedExerciseToFrontend(regenerated))) {
    regenerated = await provider.regenerateExercise({
      context,
      planItem: buildRegenerationPlanItem(
        exercise,
        "Return a materially different alternative from the current exercise. Change the prompt and answer content, not just formatting.",
      ),
      existingType: exercise.type,
      ordinal: 0,
      additionalContext:
        "Return a materially different alternative from the current exercise. Change the prompt and answer content, not just formatting.",
      currentExercise,
    });
    if (!isMeaningfullyDifferentExercise(currentExercise, generatedExerciseToFrontend(regenerated))) {
      throw new ApiError(502, "The AI returned the same exercise again. Try regenerating once more or choose another model.");
    }
  }

  await prisma.homeworkExercise.update({
    where: { id: exercise.id },
    data: {
      instruction: regenerated.instruction,
      payload: regenerated.payload,
    },
  });

  const refreshedHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!refreshedHomework) {
    throw new ApiError(404, "Homework not found.");
  }

  const mapped = mapHomeworkRecord(refreshedHomework);
  return {
    homework: mapped,
    exercise: mapped.exercises.find((item) => item.id === serializeId(exercise.id)) ?? mapHomeworkExercise({
      id: exercise.id,
      type: exercise.type,
      instruction: regenerated.instruction,
      payload: regenerated.payload,
    }),
  };
}

export async function regenerateHomeworkQuestion(
  homeworkId: string,
  exerciseId: string,
  questionId: string,
  options?: { model?: HomeworkGenerationModel; additionalContext?: string },
) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const draftHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { id: true, status: true },
  });
  if (!draftHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (draftHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be edited.");
  }

  const exerciseRecord = await prisma.homeworkExercise.findUnique({
    where: { id: parseId(exerciseId, "Exercise") },
    include: {
      homeworkSet: {
        select: { lessonId: true },
      },
    },
  });
  if (!exerciseRecord || exerciseRecord.homeworkSetId !== numericHomeworkId) {
    throw new ApiError(404, "Exercise not found.");
  }

  const mappedExercise = mapHomeworkExercise({
    id: exerciseRecord.id,
    type: exerciseRecord.type,
    instruction: exerciseRecord.instruction,
    payload: exerciseRecord.payload,
  });
  if (mappedExercise.type === "matching") {
    throw new ApiError(400, "Matching exercises do not support question regeneration.");
  }

  const existingQuestion = mappedExercise.questions.find((question) => question.id === questionId);
  if (!existingQuestion) {
    throw new ApiError(404, "Question not found.");
  }

  const context = await buildHomeworkGenerationContext(serializeId(exerciseRecord.homeworkSet.lessonId));
  const provider = getHomeworkGenerationProvider(
    parseHomeworkGenerationModel(options?.model ?? DEFAULT_HOMEWORK_GENERATION_MODEL),
  );
  const questionIndex = Math.max(
    0,
    mappedExercise.questions.findIndex((question) => question.id === questionId),
  );
  const currentExercise = mapHomeworkExercise({
    id: exerciseRecord.id,
    type: exerciseRecord.type,
    instruction: exerciseRecord.instruction,
    payload: exerciseRecord.payload,
  });
  let regeneratedExercise = await provider.regenerateExercise({
    context,
    planItem: buildRegenerationPlanItem(exerciseRecord, options?.additionalContext),
    existingType: exerciseRecord.type,
    ordinal: questionIndex,
    additionalContext: options?.additionalContext,
    currentExercise,
    targetQuestion: {
      prompt: existingQuestion.text,
      answer: existingQuestion.answer,
      incorrectText: existingQuestion.incorrectText,
      options: existingQuestion.options,
      tokens: existingQuestion.tokens,
      requiredPhrases: existingQuestion.requiredPhrases,
    },
  });

  let nextQuestion =
    regeneratedExercise.type === "matching"
      ? null
      : regeneratedExercise.questions[
          Math.min(
            questionIndex,
            regeneratedExercise.questions.length - 1,
          )
        ] ?? regeneratedExercise.questions[0] ?? null;
  if (nextQuestion && !isMeaningfullyDifferentQuestion(existingQuestion, nextQuestion)) {
    regeneratedExercise = await provider.regenerateExercise({
      context,
      planItem: buildRegenerationPlanItem(
        exerciseRecord,
        `${options?.additionalContext?.trim() ? `${options.additionalContext.trim()} ` : ""}Return a materially different alternative from the current question.`,
      ),
      existingType: exerciseRecord.type,
      ordinal: questionIndex,
      additionalContext: `${options?.additionalContext?.trim() ? `${options.additionalContext.trim()} ` : ""}Return a materially different alternative from the current question.`,
      currentExercise,
      targetQuestion: {
        prompt: existingQuestion.text,
        answer: existingQuestion.answer,
        incorrectText: existingQuestion.incorrectText,
        options: existingQuestion.options,
        tokens: existingQuestion.tokens,
        requiredPhrases: existingQuestion.requiredPhrases,
      },
    });
    nextQuestion =
      regeneratedExercise.type === "matching"
        ? null
        : regeneratedExercise.questions[
            Math.min(
              questionIndex,
              regeneratedExercise.questions.length - 1,
            )
          ] ?? regeneratedExercise.questions[0] ?? null;
    if (nextQuestion && !isMeaningfullyDifferentQuestion(existingQuestion, nextQuestion)) {
      throw new ApiError(502, "The AI returned the same question again. Add more specific context or choose another model.");
    }
  }
  if (!nextQuestion) {
    throw new ApiError(502, "The AI model could not generate a replacement question.");
  }

  const nextExercise = replaceExerciseQuestion(mappedExercise, questionId, nextQuestion);

  await prisma.homeworkExercise.update({
    where: { id: exerciseRecord.id },
    data: {
      instruction: nextExercise.instruction,
      type: asPrismaExerciseType(nextExercise.type),
      payload: buildExercisePayload(nextExercise),
    },
  });

  const refreshedHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!refreshedHomework) {
    throw new ApiError(404, "Homework not found.");
  }

  const mapped = mapHomeworkRecord(refreshedHomework);
  return {
    homework: mapped,
    exercise: mapped.exercises.find((item) => item.id === serializeId(exerciseRecord.id)) ?? nextExercise,
  };
}

export async function publishHomework(homeworkId: string) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: {
        select: { id: true },
      },
    },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be published.");
  }
  if (existingHomework.exercises.length === 0) {
    throw new ApiError(400, "Add at least one exercise before publishing.");
  }

  const homework = await prisma.homeworkSet.update({
    where: { id: numericHomeworkId },
    data: { status: HomeworkSetStatus.PUBLISHED },
    include: {
      exercises: true,
      submissions: {
        include: {
          answers: {
            include: {
              exercise: {
                select: {
                  id: true,
                  type: true,
                  instruction: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return { homework: mapHomeworkRecord(homework) };
}

export async function deleteHomework(homeworkId: string) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const existingHomework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    select: { id: true, status: true },
  });
  if (!existingHomework) {
    throw new ApiError(404, "Homework not found.");
  }
  if (existingHomework.status !== HomeworkSetStatus.DRAFT) {
    throw new ApiError(400, "Only draft homework can be deleted.");
  }

  await prisma.homeworkSet.delete({
    where: { id: numericHomeworkId },
  });

  return { homeworkId };
}

function determineRevisionSourceType(sourceType: HomeworkExercise["source"]["sourceType"], question: {
  text: string;
  answer: string | number;
  targetMistakePattern?: string | null;
}) {
  if (sourceType === "revision") {
    return RevisionSourceType.VOCABULARY;
  }
  if (sourceType === "weak-point" || question.targetMistakePattern) {
    return RevisionSourceType.WEAK_POINT;
  }
  if (sourceType === "lesson" && question.text.toLowerCase().includes("mistake")) {
    return RevisionSourceType.LESSON_MISTAKE;
  }
  if (/\b(am|is|are|was|were|have|has|had)\b/i.test(String(question.answer))) {
    return RevisionSourceType.GRAMMAR;
  }
  return RevisionSourceType.VOCABULARY;
}

function computeQuestionPrompt(exerciseType: HomeworkExercise["type"], question: {
  text: string;
  incorrectText?: string;
  tokens?: string[];
}) {
  if (exerciseType === "error-correction") {
    return `${question.text} ${question.incorrectText ?? ""}`.trim();
  }
  if (exerciseType === "sentence-building") {
    return `${question.text} ${(question.tokens ?? []).join(" ")}`.trim();
  }
  return question.text;
}

function evaluateAnswer(
  exercise: HomeworkExercise,
  question:
    | {
        id: string;
        text: string;
        answer: string | number;
        acceptableAnswers?: string[];
      }
    | null,
  answerValue: string | number | string[],
) {
  if (exercise.type === "matching") {
    const expected = exercise.rightOrder ?? exercise.pairs.map((pair) => pair.right);
    const actual = Array.isArray(answerValue) ? answerValue : [];
    const isCorrect = expected.join("||") === actual.join("||");
    return {
      isCorrect,
      correctValue: expected,
      pendingReview: false,
    };
  }

  if (!question) {
    return { isCorrect: null, correctValue: null, pendingReview: true };
  }

  if (exercise.type === "open-answer") {
    return {
      isCorrect: null,
      correctValue: null,
      pendingReview: true,
    };
  }

  if (exercise.type === "multiple-choice") {
    const selectedIndex =
      typeof answerValue === "number"
        ? answerValue
        : typeof answerValue === "string" && answerValue.trim() !== ""
          ? Number(answerValue)
          : -1;
    return {
      isCorrect: Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex === Number(question.answer),
      correctValue: question.answer,
      pendingReview: false,
    };
  }

  const acceptableAnswers = [String(question.answer), ...(question.acceptableAnswers ?? [])].map((value) => normalizeText(value));
  const normalizedValue = normalizeText(String(Array.isArray(answerValue) ? answerValue.join(" ") : answerValue));

  return {
    isCorrect: acceptableAnswers.includes(normalizedValue),
    correctValue: question.answer,
    pendingReview: false,
  };
}

async function updateRevisionStateFromAnswer(input: {
  studentId: number;
  exercise: HomeworkExercise;
  question: {
    id: string;
    text: string;
    answer: string | number;
    targetMistakePattern?: string | null;
  };
  isCorrect: boolean | null;
  answerValue: string | number | string[];
  sourceRefId: string | null | undefined;
}) {
  if (input.isCorrect === null) {
    return;
  }

  const now = new Date();
  const entityKey =
    input.exercise.source.sourceRefId
      ? `${input.exercise.source.sourceType}:${input.exercise.source.sourceRefId}:${input.question.id}`
      : `${input.exercise.source.sourceType}:${input.question.id}:${normalizeText(String(input.question.answer || input.question.text))}`;

  const existing = await prisma.revisionItem.findUnique({
    where: {
      studentId_entityKey: {
        studentId: input.studentId,
        entityKey,
      },
    },
  });

  const consecutiveCorrect = input.isCorrect ? (existing?.consecutiveCorrect ?? 0) + 1 : 0;
  const intervalDays = nextIntervalDays(input.isCorrect, consecutiveCorrect);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const sourceType = determineRevisionSourceType(input.exercise.source.sourceType, input.question);

  await prisma.revisionItem.upsert({
    where: {
      studentId_entityKey: {
        studentId: input.studentId,
        entityKey,
      },
    },
    create: {
      studentId: input.studentId,
      sourceType,
      sourceId: input.sourceRefId ? parseId(input.sourceRefId, "Revision source") : null,
      entityKey,
      phrase: typeof input.question.answer === "string" ? String(input.question.answer) : input.question.text,
      context: input.question.text,
      prompt: computeQuestionPrompt(input.exercise.type, input.question),
      answer: String(input.question.answer),
      dueDate: nextReviewAt,
      nextReviewAt,
      intervalDays,
      consecutiveCorrect,
      status: RevisionStatus.DONE,
      lastReviewedAt: now,
      lastResult: input.isCorrect,
    },
    update: {
      prompt: computeQuestionPrompt(input.exercise.type, input.question),
      answer: String(input.question.answer),
      dueDate: nextReviewAt,
      nextReviewAt,
      intervalDays,
      consecutiveCorrect,
      status: RevisionStatus.DONE,
      lastReviewedAt: now,
      lastResult: input.isCorrect,
      phrase: typeof input.question.answer === "string" ? String(input.question.answer) : existing?.phrase ?? input.question.text,
      context: input.question.text,
    },
  });
}

export async function submitHomeworkAnswers(
  homeworkId: string,
  studentId: string,
  answers: { exerciseId: string; questionKey: string; value: string | number | string[] }[],
) {
  const numericHomeworkId = parseId(homeworkId, "Homework");
  const numericStudentId = parseId(studentId, "Student");
  const homework = await prisma.homeworkSet.findUnique({
    where: { id: numericHomeworkId },
    include: {
      exercises: true,
      lesson: true,
      group: {
        include: {
          memberships: {
            where: { userId: numericStudentId },
            select: { id: true },
          },
        },
      },
      submissions: {
        where: { studentId: numericStudentId },
      },
    },
  });
  if (!homework || homework.status !== HomeworkSetStatus.PUBLISHED) {
    throw new ApiError(404, "Published homework not found.");
  }
  if (homework.group.memberships.length === 0) {
    throw new ApiError(403, "This student is not assigned to the homework group.");
  }

  const mappedExercises = homework.exercises.map((exercise) => mapHomeworkExercise(exercise));
  const provider = getHomeworkGenerationProvider("auto");
  const submission = homework.submissions[0]
    ? await prisma.homeworkSubmission.update({
        where: { id: homework.submissions[0].id },
        data: {
          status: HomeworkSubmissionStatus.SUBMITTED,
          startedAt: homework.submissions[0].startedAt ?? new Date(),
          submittedAt: new Date(),
        },
      })
    : await prisma.homeworkSubmission.create({
        data: {
          homeworkSetId: numericHomeworkId,
          studentId: numericStudentId,
          status: HomeworkSubmissionStatus.SUBMITTED,
          startedAt: new Date(),
          submittedAt: new Date(),
        },
      });

  await prisma.homeworkAnswer.deleteMany({ where: { submissionId: submission.id } });

  let scorableCount = 0;
  let scoredPoints = 0;
  let hasPendingReview = false;
  const answerResults: {
    exerciseId: string;
    exerciseType: string;
    questionKey: string;
    questionText: string;
    answerValue: string | number | string[];
    correctValue: string | number | string[] | null;
    isCorrect: boolean | null;
    explanation: string | null;
  }[] = [];

  for (const submittedAnswer of answers) {
    const exercise = mappedExercises.find((item) => item.id === submittedAnswer.exerciseId);
    if (!exercise) {
      continue;
    }

    const question =
      exercise.type === "matching"
        ? { id: submittedAnswer.questionKey, text: exercise.instruction, answer: (exercise.rightOrder ?? exercise.pairs.map((pair) => pair.right)).join("||") }
        : exercise.questions.find((item) => item.id === submittedAnswer.questionKey);
    if (!question) {
      continue;
    }

    const evaluation =
      exercise.type === "open-answer"
        ? await provider.evaluateOpenAnswer({
            prompt: question.text,
            answer: String(submittedAnswer.value),
            requiredPhrases: question.requiredPhrases ?? [],
          })
        : exercise.type === "phrase-explanation"
          ? await provider.evaluateOpenAnswer({
              prompt: `The student was asked to explain the phrase: "${question.text}". The designed answer is: "${question.answer}". Is the student's explanation generally correct? If correct but differently worded, mark correct and suggest: "You can also say: ${question.answer}".`,
              answer: String(submittedAnswer.value),
              requiredPhrases: [],
            })
          : null;

    const { isCorrect, correctValue, pendingReview } =
      exercise.type === "open-answer" || exercise.type === "phrase-explanation"
        ? {
            isCorrect: evaluation?.isCorrect ?? false,
            correctValue: exercise.type === "phrase-explanation" ? String(question.answer) : null,
            pendingReview: false,
          }
        : evaluateAnswer(exercise, question, submittedAnswer.value);

    if (pendingReview || isCorrect === null) {
      hasPendingReview = true;
    } else {
      scorableCount += 1;
      scoredPoints += evaluation ? evaluation.score ?? (isCorrect ? 100 : 0) : isCorrect ? 100 : 0;
    }

    await prisma.homeworkAnswer.create({
      data: {
        submissionId: submission.id,
        exerciseId: parseId(submittedAnswer.exerciseId, "Exercise"),
        questionKey: submittedAnswer.questionKey,
        answerValue: submittedAnswer.value as Prisma.InputJsonValue,
        correctValue: correctValue as Prisma.InputJsonValue,
        isCorrect,
        submittedAt: new Date(),
      },
    });

    let displayAnswerValue: string | number | string[] = submittedAnswer.value;
    let displayCorrectValue: string | number | string[] | null = correctValue;
    if (exercise.type === "multiple-choice" && question.options) {
      const selectedIdx = typeof submittedAnswer.value === "number" ? submittedAnswer.value : Number(submittedAnswer.value);
      displayAnswerValue = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < question.options.length
        ? question.options[selectedIdx]
        : String(submittedAnswer.value);
      const correctIdx = typeof correctValue === "number" ? correctValue : Number(correctValue);
      displayCorrectValue = Number.isInteger(correctIdx) && correctIdx >= 0 && correctIdx < question.options.length
        ? question.options[correctIdx]
        : correctValue;
    }

    answerResults.push({
      exerciseId: submittedAnswer.exerciseId,
      exerciseType: exercise.type,
      questionKey: submittedAnswer.questionKey,
      questionText: question.text,
      answerValue: displayAnswerValue,
      correctValue: displayCorrectValue,
      isCorrect,
      explanation: evaluation?.explanation ?? null,
    });

    await updateRevisionStateFromAnswer({
      studentId: numericStudentId,
      exercise,
      question,
      isCorrect,
      answerValue: submittedAnswer.value,
      sourceRefId: exercise.source.sourceRefId,
    });
  }

  const score = scorableCount > 0 ? Math.round(scoredPoints / scorableCount) : 0;
  await prisma.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      score,
      status: HomeworkSubmissionStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });

  return {
    submissionId: serializeId(submission.id),
    score,
    status: hasPendingReview ? "pending-review" : "completed",
    answers: answerResults,
  };
}

export async function submitRevisionAnswer(revisionItemId: string, studentId: string, correct: boolean) {
  const numericId = parseId(revisionItemId, "Revision item");
  const numericStudentId = parseId(studentId, "Student");

  const existing = await prisma.revisionItem.findUnique({ where: { id: numericId } });
  if (!existing) {
    throw new ApiError(404, "Revision item not found.");
  }
  if (existing.studentId !== numericStudentId) {
    throw new ApiError(403, "You can only answer your own revision items.");
  }

  const now = new Date();
  const consecutiveCorrect = correct ? existing.consecutiveCorrect + 1 : 0;
  const intervalDays = nextIntervalDays(correct, consecutiveCorrect);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.revisionItem.update({
    where: { id: numericId },
    data: {
      lastReviewedAt: now,
      lastResult: correct,
      consecutiveCorrect,
      intervalDays,
      nextReviewAt,
      dueDate: nextReviewAt,
      status: RevisionStatus.DONE,
    },
  });

  return { revisionItem: mapRevisionItem(updated) };
}
