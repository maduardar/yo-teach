import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeworkProvider } from "@/context/HomeworkContext";
import HomeworkExercise from "@/pages/student/HomeworkExercise";
import StudentHomework from "@/pages/student/Homework";
import HomeworkGenerator from "@/pages/teacher/HomeworkGenerator";
import PublishedHomework from "@/pages/teacher/PublishedHomework";
import type { Homework } from "@/lib/homework-types";
import type { AppBootstrapResponse } from "@/lib/app-types";

const testHomeworkBase: Homework = {
  id: "hw1",
  groupId: "g1",
  lessonId: "l1",
  title: "Travel & Tenses — Homework #12",
  dueDate: "2026-03-31",
  status: "published",
  shareLink: "http://localhost:8080/hw/abc123",
  composition: { latestLesson: 50, revision: 30, weakPoints: 20 },
  exercises: [
    {
      id: "ex1",
      type: "gap-fill",
      instruction: "Fill in the gaps with the correct form of the verb.",
      source: { sourceType: "lesson", sourceRefId: "l1", explanation: "Past Simple and Present Perfect review." },
      questions: [
        { id: "q1", text: "I ___ (take) a photo of the sunset yesterday.", answer: "took", studentAnswer: "took", correct: true },
        { id: "q2", text: "She ___ (miss) her flight last week.", answer: "missed", studentAnswer: "has missed", correct: false },
      ],
    },
    {
      id: "ex2",
      type: "multiple-choice",
      instruction: "Choose the correct answer.",
      source: { sourceType: "weak-point", sourceRefId: "wp1", explanation: "Agreement expressions." },
      questions: [
        {
          id: "q3",
          text: "Which is correct?",
          options: ["I am agree with you.", "I agree with you.", "I am agreed with you."],
          answer: 1,
          studentAnswer: 1,
          correct: true,
        },
      ],
    },
    {
      id: "ex3",
      type: "phrase-explanation",
      instruction: "Type the target phrase that matches each English explanation.",
      source: { sourceType: "revision", sourceRefId: "r1", explanation: "Due vocabulary review." },
      questions: [
        { id: "q4", text: "Write the phrase that means to capture an image with a camera.", answer: "take a photo", studentAnswer: "take a photo", correct: true },
      ],
    },
    {
      id: "ex4",
      type: "matching",
      instruction: "Match the phrases with their meanings.",
      source: { sourceType: "revision", sourceRefId: "r2", explanation: "Collocation review." },
      pairs: [
        { left: "take a photo", right: "сфотографировать" },
        { left: "miss a flight", right: "опоздать на рейс" },
      ],
      rightOrder: ["опоздать на рейс", "сфотографировать"],
    },
    {
      id: "ex5",
      type: "error-correction",
      instruction: "Correct the learner error.",
      source: { sourceType: "weak-point", sourceRefId: "wp2", explanation: "Agreement expressions weak point." },
      questions: [
        {
          id: "q5",
          text: "Rewrite the sentence correctly.",
          incorrectText: "I am agree with you.",
          answer: "I agree with you.",
          studentAnswer: "I agree with you.",
          correct: true,
        },
      ],
    },
    {
      id: "ex6",
      type: "sentence-building",
      instruction: "Build a correct sentence using the words.",
      source: { sourceType: "lesson", sourceRefId: "l1", explanation: "Controlled sentence building." },
      questions: [
        {
          id: "q6",
          text: "Use all the words to make a sentence.",
          tokens: ["have", "I", "here", "lived", "since", "2020"],
          answer: "I have lived here since 2020.",
          studentAnswer: "I have lived here since 2020.",
          correct: true,
        },
      ],
    },
    {
      id: "ex7",
      type: "open-answer",
      instruction: "Write a short paragraph.",
      source: { sourceType: "mixed", sourceRefId: "l1", explanation: "Final writing output." },
      questions: [
        {
          id: "q7",
          text: "Write 3-4 sentences about a recent trip. Use: take a photo, miss a flight, be used to.",
          answer: "",
          requiredPhrases: ["take a photo", "miss a flight", "be used to"],
          minWords: 35,
          evaluationMode: "ai",
          evaluationStatus: undefined,
          studentAnswer: "",
          correct: null,
        },
      ],
    },
  ],
  studentProgress: {
    s1: { status: "completed", score: 85, completedAt: "2026-03-28" },
    s2: { status: "completed", score: 72, completedAt: "2026-03-29" },
    s3: { status: "in-progress", score: 0, completedAt: null },
  },
};

const draftHomework = {
  ...testHomeworkBase,
  id: "1",
  groupId: "1",
  lessonId: "1",
  status: "draft" as const,
  studentProgress: {
    "2": { status: "completed" as const, score: 85, completedAt: "2026-03-28" },
    "3": { status: "completed" as const, score: 72, completedAt: "2026-03-29" },
    "4": { status: "in-progress" as const, score: 0, completedAt: null },
  },
};

const assignedHomework = {
  ...draftHomework,
  status: "published" as const,
};

const bootstrapResponse: AppBootstrapResponse = {
  teacher: {
    id: "1",
    name: "Darina M.",
    email: "darina@example.com",
    avatar: "DM",
  },
  teachers: [
    {
      id: "1",
      name: "Darina M.",
      email: "darina@example.com",
      avatar: "DM",
    },
  ],
  groups: [
    {
      id: "1",
      name: "B1 Tuesday Evening",
      level: "B1",
      students: ["2", "3", "4"],
      lastLessonDate: "2026-03-24",
      completionRate: 67,
    },
  ],
  students: [
    {
      id: "2",
      firstName: "Anna",
      lastName: "Petrova",
      name: "Anna",
      avatar: "A",
      email: "anna@example.com",
      username: "anna",
      telegramHandle: null,
      phoneNumber: null,
      status: "active",
      teacherId: "1",
      inviteToken: null,
      inviteExpiresAt: null,
    },
    {
      id: "3",
      firstName: "Misha",
      lastName: "Sokolov",
      name: "Misha",
      avatar: "M",
      email: "misha@example.com",
      username: "misha",
      telegramHandle: null,
      phoneNumber: null,
      status: "active",
      teacherId: "1",
      inviteToken: null,
      inviteExpiresAt: null,
    },
    {
      id: "4",
      firstName: "Katya",
      lastName: "Ivanova",
      name: "Katya",
      avatar: "K",
      email: "katya@example.com",
      username: "katya",
      telegramHandle: null,
      phoneNumber: null,
      status: "active",
      teacherId: "1",
      inviteToken: null,
      inviteExpiresAt: null,
    },
  ],
  lessons: [
    {
      id: "1",
      groupId: "1",
      title: "Present Perfect vs Past Simple + Travel Phrases",
      date: "2026-03-24",
      grammar: ["Present Perfect vs Past Simple"],
      vocabulary: [
        { phrase: "take a photo", context: "I took a photo of the beach." },
        { phrase: "miss a flight", context: "She missed her flight because of traffic." },
      ],
      notes: "",
      studentMistakes: [],
    },
  ],
  weakPoints: [],
  revisionItems: [],
  homeworks: [draftHomework],
};

function installFetchMock(session: { role: "student" | "teacher"; userId: string }) {
  let currentHomework = structuredClone(draftHomework);

  return vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method ?? (typeof input === "string" ? "GET" : input.method);
    if (url.includes("/api/auth/session")) {
      return new Response(JSON.stringify({ session, user: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/bootstrap")) {
      return new Response(JSON.stringify({ ...bootstrapResponse, homeworks: [currentHomework] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/students/2/homeworks")) {
      return new Response(JSON.stringify({ homeworks: [assignedHomework] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/homeworks/1") && method === "GET") {
      return new Response(JSON.stringify({ homework: currentHomework }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/homeworks/1") && method === "PATCH" && !url.includes("/exercises/")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { title: string; dueDate: string };
      currentHomework = {
        ...currentHomework,
        title: body.title,
        dueDate: body.dueDate,
      };
      return new Response(JSON.stringify({ homework: currentHomework }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/homeworks/1/exercises/") && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        exercise: (typeof currentHomework.exercises)[number];
      };
      const exerciseId = url.split("/api/homeworks/1/exercises/")[1];
      currentHomework = {
        ...currentHomework,
        exercises: currentHomework.exercises.map((exercise) => (exercise.id === exerciseId ? body.exercise : exercise)),
      };
      return new Response(JSON.stringify({ homework: currentHomework, exercise: body.exercise }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/homeworks/1/publish") && method === "POST") {
      currentHomework = {
        ...currentHomework,
        status: "published",
      };
      return new Response(JSON.stringify({ homework: currentHomework }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unhandled test request: ${url}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function renderWithHomeworkRoutes(initialEntry: string, session: { role: "student" | "teacher"; userId: string }) {
  installFetchMock(session);

  return render(
    <HomeworkProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/student/homework" element={<StudentHomework />} />
          <Route path="/student/homework/exercise" element={<HomeworkExercise />} />
          <Route path="/teacher/homework/generate" element={<HomeworkGenerator />} />
          <Route path="/teacher/homework" element={<PublishedHomework />} />
        </Routes>
      </MemoryRouter>
    </HomeworkProvider>,
  );
}

describe("homework exercise flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders gap-fill answers as inline blanks and shows phrase explanation prompts", async () => {
    renderWithHomeworkRoutes("/student/homework/exercise?homeworkId=1", { role: "student", userId: "2" });

    await waitFor(() => expect(screen.getByTestId("gap-fill-input-q1")).toBeInTheDocument());

    const gapFillInput = screen.getByTestId("gap-fill-input-q1");
    expect(gapFillInput).toHaveStyle({ width: "8ch" });
    expect(screen.getByText(/Fill in the gaps with the correct form of the verb/i)).toBeInTheDocument();

    for (let clickCount = 0; clickCount < 6; clickCount += 1) {
      if (screen.queryByPlaceholderText(/type the phrase in english/i)) {
        break;
      }
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    }

    expect(screen.getByPlaceholderText(/type the phrase in english/i)).toBeInTheDocument();
    expect(screen.getByText(/capture an image with a camera/i)).toBeInTheDocument();
  });

  it("publishes teacher edits into the shared homework state", async () => {
    renderWithHomeworkRoutes("/teacher/homework/generate?lessonId=1&homeworkId=1", { role: "teacher", userId: "1" });

    await waitFor(() => expect(screen.getByDisplayValue("Travel & Tenses — Homework #12")).toBeInTheDocument());

    const titleInput = screen.getByDisplayValue("Travel & Tenses — Homework #12");
    fireEvent.change(titleInput, { target: { value: "Travel phrases refresh" } });

    fireEvent.click(screen.getByRole("button", { name: /publish homework/i }));

    await waitFor(() => expect(screen.getByText("Travel phrases refresh")).toBeInTheDocument());
    expect(screen.getByText("Phrase Recall")).toBeInTheDocument();
  });
});
