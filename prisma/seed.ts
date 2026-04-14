import {
  HomeworkExerciseType,
  HomeworkSetStatus,
  HomeworkSubmissionStatus,
  MembershipRole,
  RevisionSourceType,
  RevisionStatus,
  StudentStatus,
  UserRole,
  WeakPointSeverity,
  WeakPointSource,
} from "../src/generated/prisma/client";
import { prisma } from "../src/server/db";
import {
  createErrorCorrectionPayload,
  createGapFillPayload,
  createMatchingPayload,
  createMultipleChoicePayload,
  createOpenAnswerPayload,
  createPhraseExplanationPayload,
  createSentenceBuildingPayload,
} from "../src/server/homework-payloads";
import { hashPassword } from "../src/server/passwords";

async function main() {
  const teacherDemoPasswordHash = hashPassword("teacher-demo");
  const studentDemoPasswordHash = hashPassword("student-demo");

  await prisma.homeworkAnswer.deleteMany();
  await prisma.homeworkSubmission.deleteMany();
  await prisma.homeworkExercise.deleteMany();
  await prisma.homeworkSet.deleteMany();
  await prisma.revisionItem.deleteMany();
  await prisma.studentWeakPoint.deleteMany();
  await prisma.lessonStudentMistake.deleteMany();
  await prisma.lessonVocabItem.deleteMany();
  await prisma.lessonGrammarItem.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.studentInvitation.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const teacher = await prisma.user.create({
    data: {
      email: "darina@example.com",
      username: "darina",
      firstName: "Darina",
      lastName: "M.",
      name: "Darina M.",
      avatar: "DM",
      role: UserRole.TEACHER,
      passwordHash: teacherDemoPasswordHash,
      emailVerifiedAt: new Date("2026-03-20T10:00:00.000Z"),
    },
  });

  const anna = await prisma.user.create({
    data: {
      email: "anna@example.com",
      username: "anna",
      firstName: "Anna",
      lastName: "Petrova",
      name: "Anna",
      avatar: "A",
      role: UserRole.STUDENT,
      studentStatus: StudentStatus.ACTIVE,
      passwordHash: studentDemoPasswordHash,
      ownerTeacherId: teacher.id,
    },
  });

  const misha = await prisma.user.create({
    data: {
      email: "misha@example.com",
      username: "misha",
      firstName: "Misha",
      lastName: "Sokolov",
      name: "Misha",
      avatar: "M",
      role: UserRole.STUDENT,
      studentStatus: StudentStatus.ACTIVE,
      passwordHash: studentDemoPasswordHash,
      ownerTeacherId: teacher.id,
    },
  });

  const katya = await prisma.user.create({
    data: {
      email: "katya@example.com",
      username: "katya",
      firstName: "Katya",
      lastName: "Ivanova",
      name: "Katya",
      avatar: "K",
      role: UserRole.STUDENT,
      studentStatus: StudentStatus.ACTIVE,
      passwordHash: studentDemoPasswordHash,
      ownerTeacherId: teacher.id,
    },
  });

  const liza = await prisma.user.create({
    data: {
      email: null,
      username: "liza.smirnova",
      firstName: "Liza",
      lastName: "Smirnova",
      name: "Liza Smirnova",
      avatar: "LS",
      role: UserRole.STUDENT,
      telegramHandle: "@liza_s",
      phoneNumber: null,
      studentStatus: StudentStatus.INVITED,
      ownerTeacherId: teacher.id,
    },
  });

  const group = await prisma.group.create({
    data: {
      name: "B1 Tuesday Evening",
      level: "B1",
      lastLessonAt: new Date("2026-03-24T18:00:00.000Z"),
    },
  });

  await prisma.groupMembership.createMany({
    data: [
      {
        groupId: group.id,
        userId: teacher.id,
        membershipRole: MembershipRole.TEACHER,
      },
      {
        groupId: group.id,
        userId: anna.id,
        membershipRole: MembershipRole.STUDENT,
      },
      {
        groupId: group.id,
        userId: misha.id,
        membershipRole: MembershipRole.STUDENT,
      },
      {
        groupId: group.id,
        userId: katya.id,
        membershipRole: MembershipRole.STUDENT,
      },
      {
        groupId: group.id,
        userId: liza.id,
        membershipRole: MembershipRole.STUDENT,
      },
    ],
  });

  await prisma.studentInvitation.create({
    data: {
      studentId: liza.id,
      groupId: group.id,
      teacherId: teacher.id,
      token: "seed-invite-liza-b1",
      expiresAt: new Date("2026-04-05T18:00:00.000Z"),
    },
  });

  const lesson = await prisma.lesson.create({
    data: {
      groupId: group.id,
      teacherId: teacher.id,
      title: "Present Perfect vs Past Simple + Travel Phrases",
      lessonDate: new Date("2026-03-24T18:00:00.000Z"),
      notes:
        "Students found the difference between Present Perfect and Past Simple challenging. Good engagement with travel vocabulary.",
    },
  });

  await prisma.lessonGrammarItem.createMany({
    data: [
      {
        lessonId: lesson.id,
        sortOrder: 1,
        title: "Present Perfect vs Past Simple",
      },
    ],
  });

  await prisma.lessonVocabItem.createMany({
    data: [
      {
        lessonId: lesson.id,
        sortOrder: 1,
        phrase: "take a photo",
        context: "I took a photo of the beach.",
      },
      {
        lessonId: lesson.id,
        sortOrder: 2,
        phrase: "miss a flight",
        context: "She missed her flight because of traffic.",
      },
      {
        lessonId: lesson.id,
        sortOrder: 3,
        phrase: "be used to",
        context: "I'm not used to waking up early.",
      },
    ],
  });

  await prisma.lessonStudentMistake.createMany({
    data: [
      {
        lessonId: lesson.id,
        studentId: anna.id,
        mistake: '"I am agree"',
        correction: '"I agree"',
        category: "agreement expressions",
      },
      {
        lessonId: lesson.id,
        studentId: misha.id,
        mistake: "Article omission",
        correction: "Missing articles before nouns",
        category: "articles",
      },
      {
        lessonId: lesson.id,
        studentId: katya.id,
        mistake: "Present Perfect / Past Simple confusion",
        correction: 'Used "I have went" instead of "I went"',
        category: "tense choice",
      },
    ],
  });

  const lessonMeta = {
    sourceType: "LESSON" as const,
    sourceRefId: String(lesson.id),
    explanation: "Generated from the lesson vocabulary and grammar.",
    learningObjective: "Practice the latest lesson content.",
    generationKind: "lesson",
  };
  const revisionMeta = {
    sourceType: "REVISION" as const,
    sourceRefId: String(lesson.id),
    explanation: "Generated from due revision items.",
    learningObjective: "Review overdue items.",
    generationKind: "revision",
  };
  const weakPointMeta = {
    sourceType: "WEAK_POINT" as const,
    sourceRefId: String(lesson.id),
    explanation: "Generated from repeated weak points.",
    learningObjective: "Target common learner errors.",
    generationKind: "weak-point",
  };
  const mixedMeta = {
    sourceType: "MIXED" as const,
    sourceRefId: String(lesson.id),
    explanation: "Final output task combining lesson, revision, and weak-point targets.",
    learningObjective: "Use target language in a short personalized answer.",
    generationKind: "final-writing",
  };

  const homeworkSet = await prisma.homeworkSet.create({
    data: {
      groupId: group.id,
      lessonId: lesson.id,
      createdById: teacher.id,
      title: "Travel & Tenses — Homework #12",
      dueDate: new Date("2026-03-31T18:00:00.000Z"),
      status: HomeworkSetStatus.PUBLISHED,
      shareToken: "abc123",
      compositionLatestLessonPct: 70,
      compositionRevisionPct: 20,
      compositionWeakPointsPct: 10,
    },
  });

  const createdExercises = await prisma.$transaction([
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 1,
        type: HomeworkExerciseType.GAP_FILL,
        instruction: "Fill in the gaps with the correct form of the verb.",
        payload: createGapFillPayload({
          meta: lessonMeta,
          questions: [
            {
              key: "q1",
              prompt: "I ___ (take) a photo of the sunset yesterday.",
              answer: "took",
            },
            {
              key: "q2",
              prompt: "She ___ (miss) her flight last week.",
              answer: "missed",
            },
            {
              key: "q3",
              prompt: "I ___ (live) here since 2020.",
              answer: "have lived",
            },
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 2,
        type: HomeworkExerciseType.MULTIPLE_CHOICE,
        instruction: "Choose the correct answer.",
        payload: createMultipleChoicePayload({
          meta: weakPointMeta,
          questions: [
            {
              key: "q4",
              prompt: "Which is correct?",
              options: ["I am agree with you.", "I agree with you.", "I am agreed with you."],
              correctOptionIndex: 1,
            },
            {
              key: "q5",
              prompt: "I ___ to waking up early.",
              options: ["used", "am used", "am use"],
              correctOptionIndex: 1,
            },
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 3,
        type: HomeworkExerciseType.PHRASE_EXPLANATION,
        instruction: "Type the target phrase that matches each English explanation.",
        payload: createPhraseExplanationPayload({
          meta: revisionMeta,
          questions: [
            {
              key: "q6",
              prompt: "Write the phrase that means to capture an image with a camera.",
              answer: "take a photo",
            },
            {
              key: "q7",
              prompt: "Write the phrase that means to arrive too late to catch your plane.",
              answer: "miss a flight",
            },
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 4,
        type: HomeworkExerciseType.MATCHING,
        instruction: "Match the phrases with their meanings.",
        payload: createMatchingPayload({
          meta: revisionMeta,
          pairs: [
            { left: "take a photo", right: "capture an image with a camera" },
            { left: "miss a flight", right: "arrive too late for your plane" },
            { left: "be used to", right: "feel familiar with something through habit" },
          ],
          rightOrder: [
            "arrive too late for your plane",
            "feel familiar with something through habit",
            "capture an image with a camera",
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 5,
        type: HomeworkExerciseType.ERROR_CORRECTION,
        instruction: "Correct the learner error.",
        payload: createErrorCorrectionPayload({
          meta: weakPointMeta,
          questions: [
            {
              key: "q8",
              prompt: "Rewrite the sentence correctly.",
              incorrectText: "I am agree with you.",
              answer: "I agree with you.",
            },
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 6,
        type: HomeworkExerciseType.SENTENCE_BUILDING,
        instruction: "Build a correct sentence using all the words.",
        payload: createSentenceBuildingPayload({
          meta: lessonMeta,
          questions: [
            {
              key: "q9",
              prompt: "Use the words to make a sentence.",
              tokens: ["I", "have", "lived", "here", "since", "2020"],
              answer: "I have lived here since 2020.",
            },
          ],
        }),
      },
    }),
    prisma.homeworkExercise.create({
      data: {
        homeworkSetId: homeworkSet.id,
        sortOrder: 7,
        type: HomeworkExerciseType.OPEN_ANSWER,
        instruction: "Write a short paragraph about the lesson topic.",
        payload: createOpenAnswerPayload({
          meta: mixedMeta,
          questions: [
            {
              key: "q10",
              prompt:
                "Write 3-4 sentences about a recent trip. Use take a photo, miss a flight, be used to, and avoid the pattern 'I am agree'.",
              minWords: 35,
              requiredPhrases: ["take a photo", "miss a flight"],
              targetMistakePattern: "agreement expressions",
              sampleAnswer: null,
              evaluationMode: "ai",
            },
          ],
        }),
      },
    }),
  ]);

  const [gapFillExercise, multipleChoiceExercise] = createdExercises;

  const submissionAnna = await prisma.homeworkSubmission.create({
    data: {
      homeworkSetId: homeworkSet.id,
      studentId: anna.id,
      status: HomeworkSubmissionStatus.SUBMITTED,
      score: 85,
      startedAt: new Date("2026-03-28T08:00:00.000Z"),
      submittedAt: new Date("2026-03-28T08:20:00.000Z"),
    },
  });

  const submissionMisha = await prisma.homeworkSubmission.create({
    data: {
      homeworkSetId: homeworkSet.id,
      studentId: misha.id,
      status: HomeworkSubmissionStatus.SUBMITTED,
      score: 72,
      startedAt: new Date("2026-03-29T08:00:00.000Z"),
      submittedAt: new Date("2026-03-29T08:18:00.000Z"),
    },
  });

  await prisma.homeworkSubmission.create({
    data: {
      homeworkSetId: homeworkSet.id,
      studentId: katya.id,
      status: HomeworkSubmissionStatus.IN_PROGRESS,
      score: null,
      startedAt: new Date("2026-03-29T09:00:00.000Z"),
      submittedAt: null,
    },
  });

  await prisma.homeworkAnswer.createMany({
    data: [
      {
        submissionId: submissionMisha.id,
        exerciseId: gapFillExercise.id,
        questionKey: "q2",
        answerValue: "has missed",
        correctValue: "missed",
        isCorrect: false,
        submittedAt: new Date("2026-03-29T08:18:00.000Z"),
      },
      {
        submissionId: submissionMisha.id,
        exerciseId: multipleChoiceExercise.id,
        questionKey: "q5",
        answerValue: 0,
        correctValue: 1,
        isCorrect: false,
        submittedAt: new Date("2026-03-29T08:18:00.000Z"),
      },
      {
        submissionId: submissionAnna.id,
        exerciseId: gapFillExercise.id,
        questionKey: "q1",
        answerValue: "took",
        correctValue: "took",
        isCorrect: true,
        submittedAt: new Date("2026-03-28T08:20:00.000Z"),
      },
    ],
  });

  await prisma.studentWeakPoint.createMany({
    data: [
      {
        studentId: anna.id,
        groupId: group.id,
        lessonId: lesson.id,
        area: "Agreement expressions",
        category: "grammar",
        severity: WeakPointSeverity.HIGH,
        source: WeakPointSource.LESSON_MISTAKE,
      },
      {
        studentId: anna.id,
        groupId: group.id,
        lessonId: lesson.id,
        area: "Collocations",
        category: "vocabulary",
        severity: WeakPointSeverity.MEDIUM,
        source: WeakPointSource.TEACHER_REVIEW,
      },
      {
        studentId: misha.id,
        groupId: group.id,
        lessonId: lesson.id,
        area: "Articles (a/an/the)",
        category: "grammar",
        severity: WeakPointSeverity.HIGH,
        source: WeakPointSource.LESSON_MISTAKE,
      },
      {
        studentId: katya.id,
        groupId: group.id,
        lessonId: lesson.id,
        area: "Tense choice (PP vs PS)",
        category: "grammar",
        severity: WeakPointSeverity.HIGH,
        source: WeakPointSource.HOMEWORK_SUBMISSION,
      },
    ],
  });

  await prisma.revisionItem.createMany({
    data: [
      {
        studentId: anna.id,
        sourceType: RevisionSourceType.VOCABULARY,
        sourceId: lesson.id,
        entityKey: `vocabulary:${lesson.id}:take-a-photo`,
        phrase: "take a photo",
        context: "I took a photo of the beach.",
        prompt: "Recall the phrase used for making a picture with a camera.",
        answer: "take a photo",
        dueDate: new Date("2026-03-29T08:00:00.000Z"),
        nextReviewAt: new Date("2026-03-29T08:00:00.000Z"),
        intervalDays: 7,
        consecutiveCorrect: 1,
        status: RevisionStatus.DUE,
        lastReviewedAt: new Date("2026-03-22T08:00:00.000Z"),
        lastResult: true,
      },
      {
        studentId: misha.id,
        sourceType: RevisionSourceType.VOCABULARY,
        sourceId: lesson.id,
        entityKey: `vocabulary:${lesson.id}:miss-a-flight`,
        phrase: "miss a flight",
        context: "She missed her flight because of traffic.",
        prompt: "Recall the phrase for arriving too late for your plane.",
        answer: "miss a flight",
        dueDate: new Date("2026-03-29T08:00:00.000Z"),
        nextReviewAt: new Date("2026-03-29T08:00:00.000Z"),
        intervalDays: 3,
        consecutiveCorrect: 0,
        status: RevisionStatus.DUE,
        lastReviewedAt: new Date("2026-03-20T08:00:00.000Z"),
        lastResult: false,
      },
      {
        studentId: katya.id,
        sourceType: RevisionSourceType.GRAMMAR,
        sourceId: lesson.id,
        entityKey: `grammar:${lesson.id}:present-perfect-since-for`,
        phrase: "Present Perfect with since/for",
        context: "I have lived here since 2020.",
        prompt: "Review the tense form used with since/for.",
        answer: "have lived",
        dueDate: new Date("2026-03-29T08:00:00.000Z"),
        nextReviewAt: new Date("2026-03-29T08:00:00.000Z"),
        intervalDays: 14,
        consecutiveCorrect: 2,
        status: RevisionStatus.DUE,
        lastReviewedAt: new Date("2026-03-15T08:00:00.000Z"),
        lastResult: true,
      },
    ],
  });

  console.log("Seeded teacher, students, group, lesson, homework set, submissions, weak points, and revision items.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
