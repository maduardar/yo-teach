import type { Homework } from "@/lib/homework-types";
import type { HomeworkGenerationModel } from "@/lib/homework-generation-models";

export type StudentStatus = "invited" | "active" | "inactive";
export type WeakPointSeverity = "low" | "medium" | "high";
export type RevisionStatus = "due" | "done" | "snoozed";

export type TeacherRecord = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

export type StudentRecord = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  avatar: string;
  email: string | null;
  username: string;
  telegramHandle: string | null;
  phoneNumber: string | null;
  status: StudentStatus;
  teacherId: string | null;
  inviteToken: string | null;
  inviteExpiresAt: string | null;
  vocabProgress: number;
  grammarProgress: number;
  homeworkStreak: number;
  learnedPhraseCount: number;
};

export type GroupRecord = {
  id: string;
  name: string;
  level: string;
  students: string[];
  lastLessonDate: string;
  completionRate: number;
};

export type LessonVocabRecord = {
  phrase: string;
  context: string;
};

export type LessonMistakeRecord = {
  studentId: string;
  mistake: string;
  correction: string;
  category: string;
};

export type LessonRecord = {
  id: string;
  groupId: string;
  title: string;
  date: string;
  grammar: string[];
  vocabulary: LessonVocabRecord[];
  notes: string;
  studentMistakes: LessonMistakeRecord[];
};

export type WeakPointRecord = {
  id: string;
  studentId: string;
  groupId: string;
  lessonId: string | null;
  area: string;
  category: string;
  severity: WeakPointSeverity;
  source: string;
  note: string | null;
};

export type RevisionItemRecord = {
  id: string;
  studentId: string;
  sourceType: string;
  sourceId: string | null;
  entityKey: string;
  phrase: string | null;
  context: string | null;
  prompt: string;
  answer: string;
  dueDate: string;
  nextReviewAt: string;
  intervalDays: number;
  consecutiveCorrect: number;
  status: RevisionStatus;
  lastReviewedAt: string | null;
  lastResult: boolean | null;
};

export type SessionState =
  | {
      role: "teacher";
      userId: string;
    }
  | {
      role: "student";
      userId: string;
    }
  | null;

export type AppBootstrapResponse = {
  teacher: TeacherRecord;
  teachers: TeacherRecord[];
  groups: GroupRecord[];
  students: StudentRecord[];
  lessons: LessonRecord[];
  weakPoints: WeakPointRecord[];
  revisionItems: RevisionItemRecord[];
  homeworks: Homework[];
};

export type CreateGroupRequest = {
  name: string;
  level: string;
  teacherId: string;
};

export type CreateGroupResponse = {
  group: GroupRecord;
};

export type CreateStudentRequest = {
  firstName: string;
  lastName: string;
  telegramHandle?: string;
  phoneNumber?: string;
};

export type CreateStudentResponse = {
  student: StudentRecord;
  inviteLink: string;
};

export type CreateLessonRequest = {
  teacherId: string;
  groupId: string;
  title: string;
  date: string;
  grammar: string[];
  vocabulary: LessonVocabRecord[];
  notes?: string;
  studentMistakes: LessonMistakeRecord[];
};

export type CreateLessonResponse = {
  lesson: LessonRecord;
};

export type UpdateLessonRequest = CreateLessonRequest;

export type UpdateLessonResponse = {
  lesson: LessonRecord;
};

export type DeleteLessonResponse = {
  lessonId: string;
};

export type InvitationLookupResponse =
  | {
      state: "invalid";
    }
  | {
      state: "expired" | "consumed" | "valid";
      invitation: {
        token: string;
        studentId: string;
        studentName: string;
        username: string;
        status: StudentStatus;
        inviteExpiresAt: string | null;
        group: GroupRecord;
      };
    };

export type ActivateInvitationRequest = {
  password: string;
};

export type ActivateInvitationResponse = {
  student: StudentRecord;
  identifier: string;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type LoginResponse = {
  user: {
    id: string;
    role: "student" | "teacher";
    name: string;
    username?: string;
    email?: string;
  };
};

export type AssignedHomeworkResponse = {
  homeworks: Homework[];
};

export type HomeworkGenerationPlan = {
  summary: {
    dueRevisionCount: number;
    weakPointCount: number;
    lessonVocabularyCount: number;
    lessonGrammarCount: number;
  };
  composition: Homework["composition"];
  items: {
    bucket: "lesson" | "revision" | "weak-point" | "final-writing";
    type: "GAP_FILL" | "MULTIPLE_CHOICE" | "PHRASE_EXPLANATION" | "MATCHING" | "OPEN_ANSWER" | "ERROR_CORRECTION" | "SENTENCE_BUILDING";
    sourceType: "LESSON" | "REVISION" | "WEAK_POINT" | "MIXED" | "MANUAL";
    sourceRefId: string | null;
    learningObjective: string;
    explanation: string;
  }[];
};

export type GenerateHomeworkDraftResponse = {
  homework: Homework;
  plan: HomeworkGenerationPlan;
};

export type GenerateHomeworkDraftRequest = {
  model?: HomeworkGenerationModel;
};

export type HomeworkGenerationJobEvent = {
  id: string;
  level: "success" | "info";
  exerciseIndex: number | null;
  message: string;
  createdAt: string;
};

export type HomeworkGenerationJob = {
  id: string;
  lessonId: string;
  model: HomeworkGenerationModel;
  status: "queued" | "running" | "completed" | "failed";
  completedExercises: number;
  totalExercises: number;
  currentLabel: string | null;
  error: string | null;
  homework: Homework | null;
  plan: HomeworkGenerationPlan | null;
  events: HomeworkGenerationJobEvent[];
  createdAt: string;
  updatedAt: string;
};

export type StartHomeworkGenerationJobResponse = {
  job: HomeworkGenerationJob;
};

export type HomeworkGenerationJobResponse = {
  job: HomeworkGenerationJob;
};

export type HomeworkDetailResponse = {
  homework: Homework;
};

export type DeleteHomeworkResponse = {
  homeworkId: string;
};

export type UpdateHomeworkDraftRequest = {
  title: string;
  dueDate: string;
};

export type UpdateHomeworkDraftResponse = {
  homework: Homework;
};

export type AddHomeworkExerciseRequest = {
  type: Homework["exercises"][number]["type"];
};

export type AddHomeworkExerciseResponse = {
  homework: Homework;
  exercise: Homework["exercises"][number];
};

export type UpdateHomeworkExerciseRequest = {
  exercise: Homework["exercises"][number];
};

export type UpdateHomeworkExerciseResponse = {
  homework: Homework;
  exercise: Homework["exercises"][number];
};

export type RegenerateHomeworkExerciseResponse = {
  homework: Homework;
  exercise: Homework["exercises"][number];
};

export type RegenerateHomeworkExerciseRequest = {
  model?: HomeworkGenerationModel;
};

export type RegenerateHomeworkQuestionRequest = {
  model?: HomeworkGenerationModel;
  additionalContext?: string;
};

export type RegenerateHomeworkQuestionResponse = {
  homework: Homework;
  exercise: Homework["exercises"][number];
};

export type DeleteHomeworkExerciseResponse = {
  homework: Homework;
  exerciseId: string;
};

export type PublishHomeworkResponse = {
  homework: Homework;
};

export type HomeworkSubmissionRequest = {
  answers: {
    exerciseId: string;
    questionKey: string;
    value: string | number | string[];
  }[];
};

export type AnswerFeedback = {
  exerciseId: string;
  exerciseType: string;
  questionKey: string;
  questionText: string;
  answerValue: string | number | string[];
  correctValue: string | number | string[] | null;
  isCorrect: boolean | null;
  explanation: string | null;
};

export type HomeworkSubmissionResponse = {
  submissionId: string;
  score: number;
  status: "completed" | "pending-review";
  answers: AnswerFeedback[];
};

export type HomeworkSubmissionResult = {
  homeworkId: string;
  homeworkTitle: string;
  score: number;
  status: "completed" | "pending-review";
  answers: AnswerFeedback[];
};

export type TeacherRegistrationRequest = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type TeacherRegistrationResponse = {
  user: TeacherRecord;
  requiresEmailVerification: boolean;
  verificationPreviewUrl: string | null;
};

export type AuthSessionResponse = {
  session: SessionState;
  user: LoginResponse["user"] | null;
};

export type TeacherOAuthProvider = "google" | "yandex";

export type TeacherOAuthStartResponse = {
  authorizationUrl: string;
};

export type RevisionAnswerRequest = {
  correct: boolean;
};

export type RevisionAnswerResponse = {
  revisionItem: RevisionItemRecord;
};
