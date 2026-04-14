import { randomBytes } from "node:crypto";
import type { Homework } from "../lib/homework-types";
import type { HomeworkGenerationModel } from "../lib/homework-generation-models";
import type { HomeworkGenerationJobEvent, HomeworkGenerationPlan } from "../lib/app-types";

export type HomeworkGenerationJobStatus = "queued" | "running" | "completed" | "failed";

export type HomeworkGenerationJobRecord = {
  id: string;
  lessonId: string;
  model: HomeworkGenerationModel;
  status: HomeworkGenerationJobStatus;
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

const jobs = new Map<string, HomeworkGenerationJobRecord>();

function nowIso() {
  return new Date().toISOString();
}

export function createHomeworkGenerationJob(lessonId: string, model: HomeworkGenerationModel) {
  const id = randomBytes(8).toString("hex");
  const record: HomeworkGenerationJobRecord = {
    id,
    lessonId,
    model,
    status: "queued",
    completedExercises: 0,
    totalExercises: 0,
    currentLabel: "Queued",
    error: null,
    homework: null,
    plan: null,
    events: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.set(id, record);
  return record;
}

export function updateHomeworkGenerationJob(
  jobId: string,
  updater: (job: HomeworkGenerationJobRecord) => HomeworkGenerationJobRecord,
) {
  const existing = jobs.get(jobId);
  if (!existing) {
    return null;
  }
  const next = {
    ...updater(existing),
    updatedAt: nowIso(),
  };
  jobs.set(jobId, next);
  return next;
}

export function getHomeworkGenerationJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}

export function createHomeworkGenerationJobEvent(input: {
  level: "success" | "info";
  exerciseIndex: number | null;
  message: string;
}): HomeworkGenerationJobEvent {
  return {
    id: randomBytes(8).toString("hex"),
    level: input.level,
    exerciseIndex: input.exerciseIndex,
    message: input.message,
    createdAt: nowIso(),
  };
}
