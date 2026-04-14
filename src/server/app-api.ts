import { randomBytes } from "node:crypto";
import {
  AuthProvider,
  HomeworkExerciseType,
  HomeworkSetStatus,
  MembershipRole,
  Prisma,
  RevisionStatus as PrismaRevisionStatus,
  StudentStatus,
  UserRole,
  WeakPointSeverity as PrismaWeakPointSeverity,
  WeakPointSource,
} from "../generated/prisma/client";
import type { Homework } from "../lib/homework-types";
import type {
  ActivateInvitationResponse,
  AuthSessionResponse,
  AppBootstrapResponse,
  AssignedHomeworkResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  DeleteLessonResponse,
  CreateGroupRequest,
  CreateGroupResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  GroupRecord,
  InvitationLookupResponse,
  LessonRecord,
  LoginResponse,
  RevisionItemRecord,
  StudentRecord,
  TeacherOAuthProvider,
  TeacherRegistrationRequest,
  TeacherRegistrationResponse,
  TeacherRecord,
  UpdateLessonResponse,
  WeakPointRecord,
} from "../lib/app-types";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { mapHomeworkRecord } from "./homework-generation-service";
import { hashPassword, verifyPassword } from "./passwords";
import { createSignedToken, readSignedToken, type AppSession } from "./auth-session";
import { sendTeacherVerificationEmail } from "./teacher-email";
const fallbackTeacherRecord: TeacherRecord = {
  id: "0",
  name: "Teacher",
  email: "",
  avatar: "T",
};

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

function buildAvatar(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || "ST";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

async function createUniqueUsername(firstName: string, lastName: string) {
  const base = `${slugify(firstName)}.${slugify(lastName)}`.replace(/\.$/, "") || slugify(firstName) || "student";
  let nextValue = base;
  let counter = 2;

  while (
    await prisma.user.findFirst({
      where: { username: nextValue },
      select: { id: true },
    })
  ) {
    nextValue = `${base}${counter}`;
    counter += 1;
  }

  return nextValue;
}

function assertValidEmail(email: string) {
  if (!email) {
    throw new ApiError(400, "Email is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Email is invalid.");
  }
}

function mapLoginUser(user: {
  id: number;
  role: UserRole;
  name: string;
  email: string | null;
  username: string | null;
}): LoginResponse["user"] {
  return {
    id: serializeId(user.id),
    role: user.role === UserRole.TEACHER ? "teacher" : "student",
    name: user.name,
    email: user.email ?? undefined,
    username: user.username ?? undefined,
  };
}

async function createTeacherVerification(user: {
  id: number;
  firstName: string;
  email: string;
}, appOrigin: string) {
  await prisma.teacherEmailVerification.deleteMany({
    where: {
      userId: user.id,
      consumedAt: null,
    },
  });

  const token = randomBytes(24).toString("hex");
  await prisma.teacherEmailVerification.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  const verifyUrl = `${appOrigin.replace(/\/$/, "")}/login?verifyTeacherToken=${encodeURIComponent(token)}`;
  return sendTeacherVerificationEmail({
    email: user.email,
    firstName: user.firstName,
    verifyUrl,
  });
}

async function getOrCreateTeacherFromOAuth(input: {
  provider: AuthProvider.GOOGLE | AuthProvider.YANDEX;
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
}) {
  const existingIdentity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: input.provider,
        providerUserId: input.providerUserId,
      },
    },
    include: {
      user: true,
    },
  });
  if (existingIdentity) {
    if (existingIdentity.user.role !== UserRole.TEACHER) {
      throw new ApiError(409, "This social account is already connected to a student profile.");
    }

    if (!existingIdentity.user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existingIdentity.user.id },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
    }

    return existingIdentity.user;
  }

  const existingTeacher = await prisma.user.findFirst({
    where: {
      role: UserRole.TEACHER,
      email: input.email,
    },
  });

  if (existingTeacher) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existingTeacher.id },
        data: {
          emailVerifiedAt: existingTeacher.emailVerifiedAt ?? new Date(),
        },
      }),
      prisma.authIdentity.create({
        data: {
          userId: existingTeacher.id,
          provider: input.provider,
          providerUserId: input.providerUserId,
          email: input.email,
        },
      }),
    ]);

    return prisma.user.findUniqueOrThrow({ where: { id: existingTeacher.id } });
  }

  const username = await createUniqueUsername(input.firstName || input.fullName, input.lastName || "teacher");
  const teacher = await prisma.user.create({
    data: {
      email: input.email,
      username,
      firstName: input.firstName || input.fullName,
      lastName: input.lastName || "Teacher",
      name: input.fullName,
      avatar: buildAvatar(input.firstName || input.fullName, input.lastName || "Teacher"),
      role: UserRole.TEACHER,
      emailVerifiedAt: new Date(),
      authIdentities: {
        create: {
          provider: input.provider,
          providerUserId: input.providerUserId,
          email: input.email,
        },
      },
    },
  });

  return teacher;
}

async function exchangeGoogleCode(input: {
  code: string;
  apiOrigin: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiError(400, "Google sign-in is not configured.");
  }

  const redirectUri = `${input.apiOrigin.replace(/\/$/, "")}/api/auth/teacher-oauth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    throw new ApiError(502, "Google sign-in failed during token exchange.");
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new ApiError(502, "Google sign-in did not return an access token.");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  if (!profileResponse.ok) {
    throw new ApiError(502, "Google sign-in failed while loading the user profile.");
  }

  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
  };

  if (!profile.sub || !profile.email || !profile.email_verified) {
    throw new ApiError(400, "Google sign-in requires a verified email.");
  }

  return getOrCreateTeacherFromOAuth({
    provider: AuthProvider.GOOGLE,
    providerUserId: profile.sub,
    email: profile.email.toLowerCase(),
    firstName: profile.given_name ?? profile.name ?? "Teacher",
    lastName: profile.family_name ?? "",
    fullName: profile.name ?? ([profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.email),
  });
}

async function exchangeYandexCode(input: {
  code: string;
  apiOrigin: string;
}) {
  const clientId = process.env.YANDEX_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YANDEX_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiError(400, "Yandex sign-in is not configured.");
  }

  const redirectUri = `${input.apiOrigin.replace(/\/$/, "")}/api/auth/teacher-oauth/yandex/callback`;
  const tokenResponse = await fetch("https://oauth.yandex.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    throw new ApiError(502, "Yandex sign-in failed during token exchange.");
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new ApiError(502, "Yandex sign-in did not return an access token.");
  }

  const profileResponse = await fetch("https://login.yandex.ru/info?format=json", {
    headers: {
      Authorization: `OAuth ${tokenPayload.access_token}`,
    },
  });
  if (!profileResponse.ok) {
    throw new ApiError(502, "Yandex sign-in failed while loading the user profile.");
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    default_email?: string;
    first_name?: string;
    last_name?: string;
    real_name?: string;
  };

  if (!profile.id || !profile.default_email) {
    throw new ApiError(400, "Yandex sign-in requires an email address.");
  }

  return getOrCreateTeacherFromOAuth({
    provider: AuthProvider.YANDEX,
    providerUserId: profile.id,
    email: profile.default_email.toLowerCase(),
    firstName: profile.first_name ?? profile.real_name ?? "Teacher",
    lastName: profile.last_name ?? "",
    fullName:
      profile.real_name ?? ([profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.default_email),
  });
}

function mapStudentStatus(status: StudentStatus | null): StudentRecord["status"] {
  if (status === StudentStatus.INVITED) {
    return "invited";
  }
  if (status === StudentStatus.INACTIVE) {
    return "inactive";
  }
  return "active";
}

function mapTeacher(teacher: {
  id: number;
  name: string;
  email: string | null;
  avatar: string | null;
}): TeacherRecord {
  return {
    id: serializeId(teacher.id),
    name: teacher.name,
    email: teacher.email ?? fallbackTeacherRecord.email,
    avatar: teacher.avatar ?? buildAvatar(teacher.name, ""),
  };
}

function mapGroup(group: {
  id: number;
  name: string;
  level: string;
  lastLessonAt: Date | null;
  memberships: { userId: number; user: { role: UserRole } }[];
}, completionRate: number): GroupRecord {
  return {
    id: serializeId(group.id),
    name: group.name,
    level: group.level,
    students: group.memberships
      .filter((membership) => membership.user.role === UserRole.STUDENT)
      .map((membership) => serializeId(membership.userId)),
    lastLessonDate: group.lastLessonAt ? group.lastLessonAt.toISOString().slice(0, 10) : "—",
    completionRate,
  };
}

function mapStudent(
  student: {
    id: number;
    firstName: string;
    lastName: string;
    name: string;
    avatar: string | null;
    email: string | null;
    username: string | null;
    telegramHandle: string | null;
    phoneNumber: string | null;
    studentStatus: StudentStatus | null;
    ownerTeacherId: number | null;
    studentInvitations: { token: string; expiresAt: Date | null }[];
  },
  progress?: { vocabProgress: number; grammarProgress: number; homeworkStreak: number },
): StudentRecord {
  const invitation = student.studentInvitations[0];

  return {
    id: serializeId(student.id),
    firstName: student.firstName,
    lastName: student.lastName,
    name: student.name,
    avatar: student.avatar ?? buildAvatar(student.firstName, student.lastName),
    email: student.email,
    username: student.username ?? slugify(student.name),
    telegramHandle: student.telegramHandle,
    phoneNumber: student.phoneNumber,
    status: mapStudentStatus(student.studentStatus),
    teacherId: student.ownerTeacherId ? serializeId(student.ownerTeacherId) : null,
    inviteToken: invitation?.token ?? null,
    inviteExpiresAt: invitation?.expiresAt?.toISOString() ?? null,
    vocabProgress: progress?.vocabProgress ?? 100,
    grammarProgress: progress?.grammarProgress ?? 100,
    homeworkStreak: progress?.homeworkStreak ?? 0,
  };
}

function mapLesson(lesson: {
  id: number;
  groupId: number;
  title: string;
  lessonDate: Date;
  notes: string | null;
  grammarItems: { sortOrder: number; title: string }[];
  vocabItems: { sortOrder: number; phrase: string; context: string | null }[];
  studentMistakes: { studentId: number; mistake: string; correction: string | null; category: string }[];
}): LessonRecord {
  return {
    id: serializeId(lesson.id),
    groupId: serializeId(lesson.groupId),
    title: lesson.title,
    date: lesson.lessonDate.toISOString().slice(0, 10),
    grammar: lesson.grammarItems.sort((left, right) => left.sortOrder - right.sortOrder).map((item) => item.title),
    vocabulary: lesson.vocabItems
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({ phrase: item.phrase, context: item.context ?? "" })),
    notes: lesson.notes ?? "",
    studentMistakes: lesson.studentMistakes.map((mistake) => ({
      studentId: serializeId(mistake.studentId),
      mistake: mistake.mistake,
      correction: mistake.correction ?? "",
      category: mistake.category,
    })),
  };
}

function mapWeakPointSeverity(severity: PrismaWeakPointSeverity): WeakPointRecord["severity"] {
  if (severity === PrismaWeakPointSeverity.HIGH) {
    return "high";
  }
  if (severity === PrismaWeakPointSeverity.MEDIUM) {
    return "medium";
  }
  return "low";
}

function mapWeakPoint(weakPoint: {
  id: number;
  studentId: number;
  groupId: number;
  lessonId: number | null;
  area: string;
  category: string;
  severity: PrismaWeakPointSeverity;
  source: WeakPointSource;
  note: string | null;
}): WeakPointRecord {
  return {
    id: serializeId(weakPoint.id),
    studentId: serializeId(weakPoint.studentId),
    groupId: serializeId(weakPoint.groupId),
    lessonId: weakPoint.lessonId ? serializeId(weakPoint.lessonId) : null,
    area: weakPoint.area,
    category: weakPoint.category,
    severity: mapWeakPointSeverity(weakPoint.severity),
    source: weakPoint.source.toLowerCase(),
    note: weakPoint.note,
  };
}

function mapRevisionStatus(status: PrismaRevisionStatus): RevisionItemRecord["status"] {
  if (status === PrismaRevisionStatus.DONE) {
    return "done";
  }
  if (status === PrismaRevisionStatus.SNOOZED) {
    return "snoozed";
  }
  return "due";
}

export function mapRevisionItem(revisionItem: {
  id: number;
  studentId: number;
  sourceType: string;
  sourceId: number | null;
  entityKey: string;
  phrase: string | null;
  context: string | null;
  prompt: string;
  answer: string;
  nextReviewAt: Date;
  intervalDays: number;
  consecutiveCorrect: number;
  status: PrismaRevisionStatus;
  lastReviewedAt: Date | null;
  lastResult: boolean | null;
}): RevisionItemRecord {
  return {
    id: serializeId(revisionItem.id),
    studentId: serializeId(revisionItem.studentId),
    sourceType: revisionItem.sourceType.toLowerCase(),
    sourceId: revisionItem.sourceId ? serializeId(revisionItem.sourceId) : null,
    entityKey: revisionItem.entityKey,
    phrase: revisionItem.phrase,
    context: revisionItem.context,
    prompt: revisionItem.prompt,
    answer: revisionItem.answer,
    dueDate: revisionItem.nextReviewAt.toISOString(),
    nextReviewAt: revisionItem.nextReviewAt.toISOString(),
    intervalDays: revisionItem.intervalDays,
    consecutiveCorrect: revisionItem.consecutiveCorrect,
    status: mapRevisionStatus(revisionItem.status),
    lastReviewedAt: revisionItem.lastReviewedAt?.toISOString() ?? null,
    lastResult: revisionItem.lastResult,
  };
}

export async function getBootstrapData(): Promise<AppBootstrapResponse> {
  const [teachers, groups, students, lessons, weakPoints, revisionItems, homeworks] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.TEACHER },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.group.findMany({
      include: {
        memberships: {
          include: { user: { select: { role: true } } },
        },
        homeworkSets: {
          where: { status: HomeworkSetStatus.PUBLISHED },
          select: {
            id: true,
            submissions: {
              select: {
                studentId: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: UserRole.STUDENT },
      include: {
        studentInvitations: {
          where: { consumedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.lesson.findMany({
      include: {
        grammarItems: true,
        vocabItems: true,
        studentMistakes: true,
      },
      orderBy: { lessonDate: "desc" },
    }),
    prisma.studentWeakPoint.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.revisionItem.findMany({
      orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
    }),
    prisma.homeworkSet.findMany({
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
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const teacherRecords = teachers.map((teacher) => mapTeacher(teacher));

  return {
    teacher: teacherRecords[0] ?? fallbackTeacherRecord,
    teachers: teacherRecords,
    groups: groups.map((group) => {
      const studentIds = group.memberships
        .filter((membership) => membership.user.role === UserRole.STUDENT)
        .map((membership) => membership.userId);
      const totalExpectedSubmissions = studentIds.length * group.homeworkSets.length;
      const completedSubmissions = group.homeworkSets.reduce((count, homeworkSet) => {
        return (
          count +
          homeworkSet.submissions.filter(
            (submission) =>
              studentIds.includes(submission.studentId) &&
              (submission.status === "SUBMITTED" || submission.status === "REVIEWED"),
          ).length
        );
      }, 0);
      const completionRate =
        totalExpectedSubmissions > 0 ? Math.round((completedSubmissions / totalExpectedSubmissions) * 100) : 0;

      return mapGroup(group, completionRate);
    }),
    students: students.map((student) => {
      const studentId = student.id;
      const studentWeakPoints = weakPoints.filter((wp) => wp.studentId === studentId);
      const vocabCount = studentWeakPoints.filter((wp) => wp.category.toLowerCase() === "vocabulary").length;
      const grammarCount = studentWeakPoints.filter((wp) => wp.category.toLowerCase() === "grammar").length;
      const vocabProgress = Math.max(20, 100 - vocabCount * 15);
      const grammarProgress = Math.max(20, 100 - grammarCount * 15);

      // Compute real consecutive streak: count published homeworks completed in a row
      // from most recent backward
      const studentHomeworks = homeworks
        .filter((hw) => hw.status === HomeworkSetStatus.PUBLISHED)
        .filter((hw) => hw.submissions.some((sub) => sub.studentId === studentId))
        .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
      let homeworkStreak = 0;
      for (const hw of studentHomeworks) {
        const submission = hw.submissions.find((sub) => sub.studentId === studentId);
        if (
          submission &&
          (submission.status === "SUBMITTED" || submission.status === "REVIEWED")
        ) {
          homeworkStreak += 1;
        } else {
          break;
        }
      }

      return mapStudent(student, { vocabProgress, grammarProgress, homeworkStreak });
    }),
    lessons: lessons.map((lesson) => mapLesson(lesson)),
    weakPoints: weakPoints.map((weakPoint) => mapWeakPoint(weakPoint)),
    revisionItems: revisionItems.map((revisionItem) => mapRevisionItem(revisionItem)),
    homeworks: homeworks.map((homework) => mapHomeworkRecord(homework)),
  };
}

export async function createGroup(input: CreateGroupRequest): Promise<CreateGroupResponse> {
  const name = input.name.trim();
  if (!name) {
    throw new ApiError(400, "Group name is required.");
  }

  const teacherId = parseId(input.teacherId, "Teacher");
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: UserRole.TEACHER },
    select: { id: true },
  });
  if (!teacher) {
    throw new ApiError(404, "Teacher not found.");
  }

  const group = await prisma.group.create({
    data: {
      name,
      level: input.level.trim() || "B1",
      memberships: {
        create: {
          userId: teacher.id,
          membershipRole: MembershipRole.TEACHER,
        },
      },
    },
    include: {
      memberships: {
        include: { user: { select: { role: true } } },
      },
    },
  });

  return { group: mapGroup(group, 0) };
}

export async function createStudentForGroup(
  groupId: string,
  input: CreateStudentRequest,
  teacherId: string,
  appOrigin: string,
): Promise<CreateStudentResponse> {
  const numericGroupId = parseId(groupId, "Group");
  const group = await prisma.group.findUnique({ where: { id: numericGroupId } });
  if (!group) {
    throw new ApiError(404, "Group not found.");
  }
  const numericTeacherId = parseId(teacherId, "Teacher");
  const teacher = await prisma.user.findFirst({
    where: {
      id: numericTeacherId,
      role: UserRole.TEACHER,
    },
    select: { id: true },
  });
  if (!teacher) {
    throw new ApiError(404, "Teacher not found.");
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) {
    throw new ApiError(400, "First name is required.");
  }
  if (!lastName) {
    throw new ApiError(400, "Last name is required.");
  }

  const username = await createUniqueUsername(firstName, lastName);
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const student = await prisma.user.create({
    data: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      avatar: buildAvatar(firstName, lastName),
      email: null,
      username,
      telegramHandle: input.telegramHandle?.trim() || null,
      phoneNumber: input.phoneNumber?.trim() || null,
      role: UserRole.STUDENT,
      studentStatus: StudentStatus.INVITED,
      ownerTeacherId: teacher.id,
      memberships: {
        create: {
          groupId: numericGroupId,
          membershipRole: MembershipRole.STUDENT,
        },
      },
      studentInvitations: {
        create: {
          teacherId: teacher.id,
          token,
          expiresAt,
          groupId: numericGroupId,
        },
      },
    },
    include: {
      studentInvitations: {
        where: { consumedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return {
    student: mapStudent(student),
    inviteLink: `${appOrigin.replace(/\/$/, "")}/invite/${token}`,
  };
}

async function validateLessonInput(input: CreateLessonRequest) {
  const title = input.title.trim();
  if (!title) {
    throw new ApiError(400, "Lesson title is required.");
  }

  const teacherId = parseId(input.teacherId, "Teacher");
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: UserRole.TEACHER },
    select: { id: true },
  });
  if (!teacher) {
    throw new ApiError(404, "Teacher record not found.");
  }

  const group = await prisma.group.findUnique({
    where: { id: parseId(input.groupId, "Group") },
    include: {
      memberships: {
        select: { userId: true, membershipRole: true },
      },
    },
  });
  if (!group) {
    throw new ApiError(404, "Group not found.");
  }

  const lessonDate = new Date(`${input.date}T12:00:00.000Z`);
  if (Number.isNaN(lessonDate.getTime())) {
    throw new ApiError(400, "Lesson date is invalid.");
  }

  const grammar = input.grammar.map((item) => item.trim()).filter(Boolean);
  if (grammar.length === 0) {
    throw new ApiError(400, "Add at least one grammar point.");
  }

  const vocabulary = input.vocabulary
    .map((item) => ({
      phrase: item.phrase.trim(),
      context: item.context.trim(),
    }))
    .filter((item) => item.phrase);
  if (vocabulary.length === 0) {
    throw new ApiError(400, "Add at least one vocabulary phrase.");
  }

  const allowedStudentIds = new Set<number>(
    group.memberships
      .filter((membership) => membership.membershipRole === MembershipRole.STUDENT)
      .map((membership) => membership.userId),
  );

  const studentMistakes = input.studentMistakes
    .map((entry) => ({
      studentId: parseId(entry.studentId, "Student"),
      mistake: entry.mistake.trim(),
      correction: entry.correction.trim(),
      category: entry.category.trim(),
    }))
    .filter((entry) => entry.studentId && entry.mistake);

  for (const mistake of studentMistakes) {
    if (!allowedStudentIds.has(mistake.studentId)) {
      throw new ApiError(400, "A recorded mistake references a student outside this group.");
    }
  }

  return {
    teacher,
    group,
    title,
    lessonDate,
    grammar,
    vocabulary,
    studentMistakes,
    notes: input.notes?.trim() || null,
  };
}

async function syncGroupLastLessonAt(
  transaction: Prisma.TransactionClient,
  groupId: number,
) {
  const latestLesson = await transaction.lesson.findFirst({
    where: { groupId },
    orderBy: { lessonDate: "desc" },
    select: { lessonDate: true },
  });

  await transaction.group.update({
    where: { id: groupId },
    data: { lastLessonAt: latestLesson?.lessonDate ?? null },
  });
}

export async function createLesson(input: CreateLessonRequest): Promise<CreateLessonResponse> {
  const { teacher, group, title, lessonDate, grammar, vocabulary, studentMistakes, notes } =
    await validateLessonInput(input);

  const lesson = await prisma.$transaction(async (transaction) => {
    const createdLesson = await transaction.lesson.create({
      data: {
        groupId: group.id,
        teacherId: teacher.id,
        title,
        lessonDate,
        notes,
        grammarItems: {
          create: grammar.map((item, index) => ({
            sortOrder: index + 1,
            title: item,
          })),
        },
        vocabItems: {
          create: vocabulary.map((item, index) => ({
            sortOrder: index + 1,
            phrase: item.phrase,
            context: item.context || null,
          })),
        },
        studentMistakes: {
          create: studentMistakes.map((item) => ({
            studentId: item.studentId,
            mistake: item.mistake,
            correction: item.correction || null,
            category: item.category || "lesson note",
          })),
        },
      },
      include: {
        grammarItems: true,
        vocabItems: true,
        studentMistakes: true,
      },
    });

    await syncGroupLastLessonAt(transaction, group.id);

    return createdLesson;
  });

  return { lesson: mapLesson(lesson) };
}

export async function updateLesson(lessonId: string, input: CreateLessonRequest): Promise<UpdateLessonResponse> {
  const numericLessonId = parseId(lessonId, "Lesson");
  const existingLesson = await prisma.lesson.findUnique({
    where: { id: numericLessonId },
    select: { id: true, teacherId: true, groupId: true },
  });
  if (!existingLesson) {
    throw new ApiError(404, "Lesson not found.");
  }

  const { teacher, group, title, lessonDate, grammar, vocabulary, studentMistakes, notes } =
    await validateLessonInput(input);
  if (existingLesson.teacherId !== teacher.id) {
    throw new ApiError(403, "You can only edit your own lessons.");
  }

  const lesson = await prisma.$transaction(async (transaction) => {
    await transaction.lessonGrammarItem.deleteMany({ where: { lessonId: numericLessonId } });
    await transaction.lessonVocabItem.deleteMany({ where: { lessonId: numericLessonId } });
    await transaction.lessonStudentMistake.deleteMany({ where: { lessonId: numericLessonId } });

    const updatedLesson = await transaction.lesson.update({
      where: { id: numericLessonId },
      data: {
        groupId: group.id,
        title,
        lessonDate,
        notes,
        grammarItems: {
          create: grammar.map((item, index) => ({
            sortOrder: index + 1,
            title: item,
          })),
        },
        vocabItems: {
          create: vocabulary.map((item, index) => ({
            sortOrder: index + 1,
            phrase: item.phrase,
            context: item.context || null,
          })),
        },
        studentMistakes: {
          create: studentMistakes.map((item) => ({
            studentId: item.studentId,
            mistake: item.mistake,
            correction: item.correction || null,
            category: item.category || "lesson note",
          })),
        },
      },
      include: {
        grammarItems: true,
        vocabItems: true,
        studentMistakes: true,
      },
    });

    await syncGroupLastLessonAt(transaction, existingLesson.groupId);
    if (existingLesson.groupId !== group.id) {
      await syncGroupLastLessonAt(transaction, group.id);
    }

    return updatedLesson;
  });

  return { lesson: mapLesson(lesson) };
}

export async function deleteLesson(lessonId: string, teacherId: string): Promise<DeleteLessonResponse> {
  const numericLessonId = parseId(lessonId, "Lesson");
  const numericTeacherId = parseId(teacherId, "Teacher");
  const lesson = await prisma.lesson.findUnique({
    where: { id: numericLessonId },
    select: { id: true, teacherId: true, groupId: true },
  });
  if (!lesson) {
    throw new ApiError(404, "Lesson not found.");
  }
  if (lesson.teacherId !== numericTeacherId) {
    throw new ApiError(403, "You can only delete your own lessons.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.lesson.delete({
      where: { id: numericLessonId },
    });

    await syncGroupLastLessonAt(transaction, lesson.groupId);
  });

  return { lessonId: serializeId(numericLessonId) };
}

export async function getInvitationByToken(token: string): Promise<InvitationLookupResponse> {
  const invitation = await prisma.studentInvitation.findUnique({
    where: { token },
    include: {
      student: true,
      group: {
        include: {
          memberships: {
            include: { user: { select: { role: true } } },
          },
        },
      },
    },
  });

  if (!invitation) {
    return { state: "invalid" };
  }

  if (invitation.consumedAt) {
    return { state: "consumed", invitation: {
      token: invitation.token,
      studentId: serializeId(invitation.studentId),
      studentName: invitation.student.name,
      username: invitation.student.username ?? "",
      status: mapStudentStatus(invitation.student.studentStatus),
      inviteExpiresAt: invitation.expiresAt?.toISOString() ?? null,
      group: mapGroup(invitation.group, 0),
    } };
  }

  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    return {
      state: "expired",
      invitation: {
        token: invitation.token,
        studentId: serializeId(invitation.studentId),
        studentName: invitation.student.name,
        username: invitation.student.username ?? "",
        status: mapStudentStatus(invitation.student.studentStatus),
        inviteExpiresAt: invitation.expiresAt.toISOString(),
        group: mapGroup(invitation.group, 0),
      },
    };
  }

  return {
    state: "valid",
    invitation: {
      token: invitation.token,
      studentId: serializeId(invitation.studentId),
      studentName: invitation.student.name,
      username: invitation.student.username ?? "",
      status: mapStudentStatus(invitation.student.studentStatus),
      inviteExpiresAt: invitation.expiresAt?.toISOString() ?? null,
      group: mapGroup(invitation.group, 0),
    },
  };
}

export async function activateInvitation(token: string, password: string): Promise<ActivateInvitationResponse> {
  if (password.trim().length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }

  const invitation = await prisma.studentInvitation.findUnique({
    where: { token },
    include: {
      student: {
        include: {
          studentInvitations: {
            where: { consumedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!invitation || invitation.consumedAt) {
    throw new ApiError(404, "This invite link is invalid or has already been used.");
  }

  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "This invite link has expired.");
  }

  const updatedStudent = await prisma.$transaction(async (transaction) => {
    await transaction.studentInvitation.update({
      where: { id: invitation.id },
      data: { consumedAt: new Date() },
    });

    return transaction.user.update({
      where: { id: invitation.studentId },
      data: {
        passwordHash: hashPassword(password.trim()),
        studentStatus: StudentStatus.ACTIVE,
      },
      include: {
        studentInvitations: {
          where: { consumedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  });

  return {
    student: mapStudent(updatedStudent),
    identifier: updatedStudent.username ?? updatedStudent.email ?? "",
  };
}

export async function confirmTeacherEmail(token: string): Promise<LoginResponse> {
  const verification = await prisma.teacherEmailVerification.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });

  if (!verification || verification.consumedAt) {
    throw new ApiError(404, "This confirmation link is invalid or has already been used.");
  }
  if (verification.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "This confirmation link has expired.");
  }
  if (verification.user.role !== UserRole.TEACHER || !verification.user.email) {
    throw new ApiError(400, "Only teacher accounts can be confirmed with this link.");
  }

  const teacher = await prisma.$transaction(async (transaction) => {
    await transaction.teacherEmailVerification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });

    return transaction.user.update({
      where: { id: verification.userId },
      data: {
        emailVerifiedAt: new Date(),
      },
    });
  });

  return {
    user: mapLoginUser(teacher),
  };
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const teacher = await prisma.user.findFirst({
    where: {
      role: UserRole.TEACHER,
      email: normalizedIdentifier,
    },
  });

  if (teacher && teacher.passwordHash && verifyPassword(password.trim(), teacher.passwordHash)) {
    if (!teacher.emailVerifiedAt) {
      throw new ApiError(403, "Confirm your email before signing in.");
    }

    return {
      user: mapLoginUser(teacher),
    };
  }

  const student = await prisma.user.findFirst({
    where: {
      role: UserRole.STUDENT,
      studentStatus: StudentStatus.ACTIVE,
      ownerTeacherId: { not: null },
      OR: [
        { username: normalizedIdentifier },
        { email: normalizedIdentifier },
        { telegramHandle: normalizedIdentifier },
        { phoneNumber: normalizedIdentifier },
      ],
    },
  });

  if (!student || !student.passwordHash || !verifyPassword(password.trim(), student.passwordHash)) {
    throw new ApiError(401, "Invalid credentials.");
  }

  return {
    user: mapLoginUser(student),
  };
}

const DEMO_TEACHER_PASSWORD = "teacher-demo";
const DEMO_STUDENT_PASSWORD = "student-demo";

export async function loginAsDemo(role: "teacher" | "student", studentId?: string): Promise<LoginResponse> {
  if (role === "teacher") {
    const teacher = await prisma.user.findFirst({
      where: { role: UserRole.TEACHER },
      orderBy: { createdAt: "asc" },
    });
    if (!teacher?.email) {
      throw new ApiError(404, "No demo teacher account is available.");
    }
    return login(teacher.email, DEMO_TEACHER_PASSWORD);
  }

  if (studentId) {
    const numericId = parseId(studentId, "Student");
    const student = await prisma.user.findFirst({
      where: { id: numericId, role: UserRole.STUDENT, studentStatus: StudentStatus.ACTIVE },
    });
    if (!student?.username) {
      throw new ApiError(404, "No active demo student with that id is available.");
    }
    return login(student.username, DEMO_STUDENT_PASSWORD);
  }

  const student = await prisma.user.findFirst({
    where: { role: UserRole.STUDENT, studentStatus: StudentStatus.ACTIVE },
    orderBy: { createdAt: "asc" },
  });
  if (!student?.username) {
    throw new ApiError(404, "No active demo student is available.");
  }
  return login(student.username, DEMO_STUDENT_PASSWORD);
}

export async function registerTeacher(
  input: TeacherRegistrationRequest,
  appOrigin: string,
): Promise<TeacherRegistrationResponse> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!firstName) {
    throw new ApiError(400, "First name is required.");
  }
  if (!lastName) {
    throw new ApiError(400, "Last name is required.");
  }
  assertValidEmail(email);
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username: email }],
    },
    select: { id: true },
  });
  if (existingUser) {
    throw new ApiError(409, "A user with this email already exists.");
  }

  const username = await createUniqueUsername(firstName, lastName);
  const teacher = await prisma.user.create({
    data: {
      email,
      username,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      avatar: buildAvatar(firstName, lastName),
      role: UserRole.TEACHER,
      passwordHash: hashPassword(password),
      emailVerifiedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      name: true,
      email: true,
      avatar: true,
    },
  });

  const delivery = await createTeacherVerification(
    {
      id: teacher.id,
      firstName: teacher.firstName,
      email,
    },
    appOrigin,
  );

  return {
    user: mapTeacher(teacher),
    requiresEmailVerification: true,
    verificationPreviewUrl: delivery.previewUrl,
  };
}

export async function getSession(authSession: AppSession | null): Promise<AuthSessionResponse> {
  if (!authSession) {
    return { session: null, user: null };
  }

  const numericUserId = Number(authSession.userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { session: null, user: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: numericUserId },
  });

  if (!user) {
    return { session: null, user: null };
  }

  if (authSession.role === "teacher") {
    if (user.role !== UserRole.TEACHER || !user.emailVerifiedAt) {
      return { session: null, user: null };
    }
  } else if (user.role !== UserRole.STUDENT || user.studentStatus !== StudentStatus.ACTIVE || !user.ownerTeacherId) {
    return { session: null, user: null };
  }

  return {
    session: {
      role: authSession.role,
      userId: serializeId(user.id),
    },
    user: mapLoginUser(user),
  };
}

function getTeacherOAuthConfig(provider: TeacherOAuthProvider, apiOrigin: string) {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new ApiError(400, "Google sign-in is not configured.");
    }

    return {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      clientId,
      redirectUri: `${apiOrigin.replace(/\/$/, "")}/api/auth/teacher-oauth/google/callback`,
      scope: "openid email profile",
    };
  }

  const clientId = process.env.YANDEX_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(400, "Yandex sign-in is not configured.");
  }

  return {
    authorizationEndpoint: "https://oauth.yandex.com/authorize",
    clientId,
    redirectUri: `${apiOrigin.replace(/\/$/, "")}/api/auth/teacher-oauth/yandex/callback`,
    scope: "login:email login:info",
  };
}

export function getTeacherOAuthAuthorizationUrl(input: {
  provider: TeacherOAuthProvider;
  apiOrigin: string;
  appOrigin: string;
}) {
  const config = getTeacherOAuthConfig(input.provider, input.apiOrigin);
  const state = createSignedToken(
    {
      provider: input.provider,
      appOrigin: input.appOrigin,
    },
    60 * 10,
  );

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
    scope: config.scope,
  });

  return {
    authorizationUrl: `${config.authorizationEndpoint}?${params.toString()}`,
  };
}

export async function completeTeacherOAuth(input: {
  provider: TeacherOAuthProvider;
  code: string;
  state: string;
  apiOrigin: string;
}) {
  const statePayload = readSignedToken<{ provider: TeacherOAuthProvider; appOrigin: string }>(input.state);
  if (!statePayload || statePayload.provider !== input.provider) {
    throw new ApiError(400, "The sign-in state is invalid or has expired.");
  }

  const teacher =
    input.provider === "google"
      ? await exchangeGoogleCode({ code: input.code, apiOrigin: input.apiOrigin })
      : await exchangeYandexCode({ code: input.code, apiOrigin: input.apiOrigin });

  return {
    user: mapLoginUser(teacher),
    appOrigin: statePayload.appOrigin,
  };
}

export async function getAssignedHomeworks(studentId: string): Promise<AssignedHomeworkResponse> {
  const numericStudentId = parseId(studentId, "Student");
  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId: numericStudentId,
      user: { role: UserRole.STUDENT },
    },
    select: { groupId: true },
  });

  const homeworks = await prisma.homeworkSet.findMany({
    where: {
      groupId: { in: memberships.map((membership) => membership.groupId) },
      status: HomeworkSetStatus.PUBLISHED,
    },
    include: {
      exercises: true,
      submissions: {
        where: { studentId: numericStudentId },
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
    orderBy: { dueDate: "asc" },
  });

  return {
    homeworks: homeworks.map((homework) => mapHomeworkRecord(homework)),
  };
}
