export type ExerciseSource = {
  sourceType: "lesson" | "revision" | "weak-point" | "mixed" | "manual";
  sourceRefId?: string | null;
  explanation?: string | null;
  learningObjective?: string | null;
  generationKind?: string | null;
};

export type ExerciseQuestion = {
  id: string;
  text: string;
  hint?: string;
  answer: string | number;
  options?: string[];
  acceptableAnswers?: string[];
  studentAnswer?: string | number;
  correct?: boolean | null;
  incorrectText?: string;
  tokens?: string[];
  minWords?: number;
  requiredPhrases?: string[];
  targetMistakePattern?: string | null;
  evaluationMode?: "ai" | "stub_auto";
  evaluationStatus?: "correct" | "incorrect" | "pending";
  explanation?: string | null;
};

export type MatchingPair = {
  left: string;
  right: string;
};

type ExerciseBase = {
  id: string;
  instruction: string;
  source: ExerciseSource;
};

type GapFillExercise = ExerciseBase & {
  type: "gap-fill";
  questions: ExerciseQuestion[];
};

type MultipleChoiceExercise = ExerciseBase & {
  type: "multiple-choice";
  questions: ExerciseQuestion[];
};

type PhraseExplanationExercise = ExerciseBase & {
  type: "phrase-explanation";
  questions: ExerciseQuestion[];
};

type MatchingExercise = ExerciseBase & {
  type: "matching";
  pairs: MatchingPair[];
  rightOrder?: string[];
};

type OpenAnswerExercise = ExerciseBase & {
  type: "open-answer";
  questions: ExerciseQuestion[];
};

type ErrorCorrectionExercise = ExerciseBase & {
  type: "error-correction";
  questions: ExerciseQuestion[];
};

type SentenceBuildingExercise = ExerciseBase & {
  type: "sentence-building";
  questions: ExerciseQuestion[];
};

export type HomeworkExercise =
  | GapFillExercise
  | MultipleChoiceExercise
  | PhraseExplanationExercise
  | MatchingExercise
  | OpenAnswerExercise
  | ErrorCorrectionExercise
  | SentenceBuildingExercise;

export type Homework = {
  id: string;
  groupId: string;
  lessonId: string;
  title: string;
  dueDate: string;
  status: "draft" | "published" | "archived";
  shareLink: string;
  composition: {
    latestLesson: number;
    revision: number;
    weakPoints: number;
  };
  exercises: HomeworkExercise[];
  studentProgress: Record<
    string,
    {
      status: "completed" | "in-progress" | "pending-review";
      score: number;
      completedAt: string | null;
    }
  >;
  studentSubmissions?: {
    studentId: string;
    status: "completed" | "in-progress" | "pending-review";
    score: number;
    completedAt: string | null;
    answers: {
      exerciseId: string;
      exerciseType: HomeworkExercise["type"];
      instruction: string;
      questionKey: string;
      questionPrompt?: string | null;
      answerValue: string | number | string[] | null;
      correctValue: string | number | string[] | null;
      isCorrect: boolean | null;
    }[];
  }[];
};
