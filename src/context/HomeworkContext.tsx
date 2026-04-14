import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api";
import type { Homework } from "@/lib/homework-types";
import type {
  ActivateInvitationResponse,
  AuthSessionResponse,
  AppBootstrapResponse,
  AssignedHomeworkResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateGroupResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  DeleteHomeworkResponse,
  DeleteLessonResponse,
  GroupRecord,
  InvitationLookupResponse,
  LessonRecord,
  LoginResponse,
  HomeworkSubmissionResult,
  RevisionItemRecord,
  SessionState,
  StudentRecord,
  TeacherRecord,
  TeacherRegistrationResponse,
  UpdateLessonResponse,
  WeakPointRecord,
} from "@/lib/app-types";

type HomeworkContextValue = {
  teacher: TeacherRecord;
  teachers: TeacherRecord[];
  groups: GroupRecord[];
  students: StudentRecord[];
  lessons: LessonRecord[];
  weakPoints: WeakPointRecord[];
  revisionItems: RevisionItemRecord[];
  homeworks: Homework[];
  isBootstrapping: boolean;
  session: SessionState;
  currentStudent: StudentRecord | null;
  currentTeacher: TeacherRecord | null;
  lastHomeworkResult: HomeworkSubmissionResult | null;
  updateHomework: (homeworkId: string, updater: (current: Homework) => Homework) => void;
  createGroup: (name: string, level: string) => Promise<GroupRecord>;
  createLesson: (input: Omit<CreateLessonRequest, "teacherId">) => Promise<LessonRecord>;
  updateLesson: (lessonId: string, input: Omit<CreateLessonRequest, "teacherId">) => Promise<LessonRecord>;
  deleteLesson: (lessonId: string) => Promise<void>;
  deleteHomework: (homeworkId: string) => Promise<void>;
  createStudentInGroup: (groupId: string, input: CreateStudentRequest) => Promise<CreateStudentResponse>;
  fetchInvitation: (token: string) => Promise<InvitationLookupResponse>;
  activateStudentInvite: (token: string, password: string) => Promise<ActivateInvitationResponse>;
  signInWithCredentials: (identifier: string, password: string) => Promise<{ role: "student" | "teacher"; userId: string }>;
  registerTeacher: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<TeacherRegistrationResponse>;
  signInAsTeacherDemo: () => Promise<void>;
  signInAsStudentDemo: (studentId?: string) => Promise<void>;
  signOut: () => void;
  getAssignedHomeworks: () => Homework[];
  setLastHomeworkResult: (result: HomeworkSubmissionResult | null) => void;
  refreshAssignedHomeworks: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
};

const fallbackTeacherRecord: TeacherRecord = {
  id: "0",
  name: "Teacher",
  email: "",
  avatar: "T",
};

const HomeworkContext = createContext<HomeworkContextValue | null>(null);

export function HomeworkProvider({ children }: { children: ReactNode }) {
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPointRecord[]>([]);
  const [revisionItems, setRevisionItems] = useState<RevisionItemRecord[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [assignedHomeworks, setAssignedHomeworks] = useState<Homework[]>([]);
  const [lastHomeworkResult, setLastHomeworkResult] = useState<HomeworkSubmissionResult | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [session, setSession] = useState<SessionState>(null);

  const currentTeacher =
    session?.role === "teacher" ? teachers.find((teacher) => teacher.id === session.userId) ?? null : null;
  const teacher = currentTeacher ?? teachers[0] ?? fallbackTeacherRecord;
  const currentStudent =
    session?.role === "student" ? students.find((student) => student.id === session.userId) ?? null : null;

  const refreshAssignedHomeworks = async () => {
    if (!session || session.role !== "student") {
      setAssignedHomeworks([]);
      return;
    }

    const response = await apiRequest<AssignedHomeworkResponse>(`/api/students/${session.userId}/homeworks`);
    setAssignedHomeworks(response.homeworks);
  };

  const refreshBootstrap = async () => {
    setIsBootstrapping(true);
    try {
      const authSession = await apiRequest<AuthSessionResponse>("/api/auth/session");
      setSession(authSession.session);
      const bootstrap = await apiRequest<AppBootstrapResponse>("/api/bootstrap");
      setTeachers(bootstrap.teachers);
      setGroups(bootstrap.groups);
      setStudents(bootstrap.students);
      setLessons(bootstrap.lessons);
      setWeakPoints(bootstrap.weakPoints);
      setRevisionItems(bootstrap.revisionItems);
      setHomeworks(bootstrap.homeworks);
      if (authSession.session?.role === "student") {
        const assigned = await apiRequest<AssignedHomeworkResponse>(`/api/students/${authSession.session.userId}/homeworks`);
        setAssignedHomeworks(assigned.homeworks);
      } else {
        setAssignedHomeworks([]);
      }
    } finally {
      setIsBootstrapping(false);
    }
  };

  useEffect(() => {
    void refreshBootstrap().catch((error) => {
      if (import.meta.env.MODE !== "test") {
        console.warn("Failed to refresh bootstrap data", error);
      }
    });
  }, []);

  useEffect(() => {
    if (!session || session.role !== "student") {
      setAssignedHomeworks([]);
      return;
    }

    let cancelled = false;

    void refreshAssignedHomeworks()
      .then(() => {
        if (cancelled) {
          return;
        }
      })
      .catch((error) => {
        if (!cancelled) {
          if (import.meta.env.MODE !== "test") {
            console.warn("Failed to load assigned homework", error);
          }
          setAssignedHomeworks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const value = useMemo<HomeworkContextValue>(
    () => ({
      teacher,
      teachers,
      groups,
      students,
      lessons,
      weakPoints,
      revisionItems,
      homeworks,
      isBootstrapping,
      session,
      currentStudent,
      currentTeacher,
      lastHomeworkResult,
      updateHomework: (homeworkId, updater) => {
        setHomeworks((currentHomeworks) =>
          currentHomeworks.map((homework) => (homework.id === homeworkId ? updater(homework) : homework)),
        );
      },
      createGroup: async (name, level) => {
        if (!currentTeacher) {
          throw new Error("Sign in as a teacher to create a group.");
        }

        const response = await apiRequest<CreateGroupResponse>("/api/groups", {
          method: "POST",
          body: { name, level, teacherId: currentTeacher.id },
        });

        setGroups((currentGroups) => [...currentGroups, response.group]);
        return response.group;
      },
      createLesson: async (input) => {
        if (!currentTeacher) {
          throw new Error("Sign in as a teacher to save a lesson.");
        }

        const response = await apiRequest<CreateLessonResponse>("/api/lessons", {
          method: "POST",
          body: { ...input, teacherId: currentTeacher.id },
        });

        setLessons((currentLessons) => [response.lesson, ...currentLessons]);
        setGroups((currentGroups) =>
          currentGroups.map((group) =>
            group.id === response.lesson.groupId ? { ...group, lastLessonDate: response.lesson.date } : group,
          ),
        );
        return response.lesson;
      },
      updateLesson: async (lessonId, input) => {
        if (!currentTeacher) {
          throw new Error("Sign in as a teacher to update a lesson.");
        }

        const response = await apiRequest<UpdateLessonResponse>(`/api/lessons/${lessonId}`, {
          method: "PATCH",
          body: { ...input, teacherId: currentTeacher.id },
        });

        await refreshBootstrap();
        return response.lesson;
      },
      deleteLesson: async (lessonId) => {
        if (!currentTeacher) {
          throw new Error("Sign in as a teacher to delete a lesson.");
        }

        await apiRequest<DeleteLessonResponse>(`/api/lessons/${lessonId}`, {
          method: "DELETE",
          body: { teacherId: currentTeacher.id },
        });

        await refreshBootstrap();
      },
      deleteHomework: async (homeworkId) => {
        if (!currentTeacher) {
          throw new Error("Sign in as a teacher to delete homework.");
        }

        await apiRequest<DeleteHomeworkResponse>(`/api/homeworks/${homeworkId}`, {
          method: "DELETE",
        });

        await refreshBootstrap();
      },
      createStudentInGroup: async (groupId, input) => {
        const response = await apiRequest<CreateStudentResponse>(`/api/groups/${groupId}/students`, {
          method: "POST",
          body: input,
        });

        setStudents((currentStudents) => [...currentStudents, response.student]);
        setGroups((currentGroups) =>
          currentGroups.map((group) =>
            group.id === groupId ? { ...group, students: [...group.students, response.student.id] } : group,
          ),
        );
        return response;
      },
      fetchInvitation: (token) => apiRequest<InvitationLookupResponse>(`/api/invitations/${token}`),
      activateStudentInvite: async (token, password) => {
        const response = await apiRequest<ActivateInvitationResponse>(`/api/invitations/${token}/activate`, {
          method: "POST",
          body: { password },
        });

        setStudents((currentStudents) =>
          currentStudents.map((student) => (student.id === response.student.id ? response.student : student)),
        );
        return response;
      },
      signInWithCredentials: async (identifier, password) => {
        const response = await apiRequest<LoginResponse>("/api/auth/login", {
          method: "POST",
          body: { identifier, password },
        });

        const nextSession = { role: response.user.role, userId: response.user.id } as const;
        setSession(nextSession);
        return nextSession;
      },
      registerTeacher: async (input) => {
        const response = await apiRequest<TeacherRegistrationResponse>("/api/auth/teacher-register", {
          method: "POST",
          body: input,
        });

        setTeachers((currentTeachers) => [...currentTeachers, response.user]);
        return response;
      },
      signInAsTeacherDemo: async () => {
        const result = await apiRequest<LoginResponse>("/api/auth/demo-login", {
          method: "POST",
          body: { role: "teacher" },
        });

        setSession({ role: result.user.role, userId: result.user.id });
      },
      signInAsStudentDemo: async (studentId) => {
        const result = await apiRequest<LoginResponse>("/api/auth/demo-login", {
          method: "POST",
          body: { role: "student", studentId },
        });

        setSession({ role: result.user.role, userId: result.user.id });
      },
      signOut: () => {
        void apiRequest("/api/auth/logout", { method: "POST" }).finally(() => {
          setSession(null);
          setLastHomeworkResult(null);
          setAssignedHomeworks([]);
        });
      },
      getAssignedHomeworks: () => (session?.role === "student" ? assignedHomeworks : []),
      setLastHomeworkResult,
      refreshAssignedHomeworks,
      refreshBootstrap,
    }),
    [
      assignedHomeworks,
      currentStudent,
      currentTeacher,
      groups,
      homeworks,
      lessons,
      lastHomeworkResult,
      revisionItems,
      session,
      students,
      teacher,
      teachers,
      weakPoints,
      isBootstrapping,
    ],
  );

  return <HomeworkContext.Provider value={value}>{children}</HomeworkContext.Provider>;
}

export function useHomeworkStore() {
  const context = useContext(HomeworkContext);

  if (!context) {
    throw new Error("useHomeworkStore must be used within a HomeworkProvider.");
  }

  return context;
}
