import express, { type NextFunction, type Request, type Response } from "express";
import {
  activateInvitation,
  completeTeacherOAuth,
  confirmTeacherEmail,
  createLesson,
  deleteLesson,
  createGroup,
  createStudentForGroup,
  getSession,
  getTeacherOAuthAuthorizationUrl,
  getAssignedHomeworks,
  getBootstrapData,
  getInvitationByToken,
  login,
  loginAsDemo,
  registerTeacher,
  updateLesson,
} from "./app-api";
import { formatUnknownError, toApiError } from "./errors";
import {
  addManualHomeworkExercise,
  deleteHomework,
  deleteHomeworkExercise,
  generateHomeworkDraftForLesson,
  getHomeworkGenerationJobStatus,
  getHomeworkById,
  publishHomework,
  regenerateHomeworkExercise,
  regenerateHomeworkQuestion,
  startHomeworkGenerationJob,
  submitHomeworkAnswers,
  submitRevisionAnswer,
  updateHomeworkDraft,
  updateHomeworkExercise,
} from "./homework-generation-service";
import { buildClearedSessionCookie, buildSessionCookie, readSessionFromCookieHeader } from "./auth-session";
import { ApiError } from "./errors";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(express.json());

function getApiOrigin(request: Request) {
  const forwardedHost = request.get("x-forwarded-host");
  if (forwardedHost) {
    return `${request.get("x-forwarded-proto") ?? request.protocol}://${forwardedHost}`;
  }

  return `${request.protocol}://${request.get("host")}`;
}

function getAppOrigin(request: Request) {
  const origin = request.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Ignore malformed referer values and fall through to configured origin.
    }
  }

  return process.env.APP_ORIGIN || getApiOrigin(request);
}

function readRequiredSession(request: Request, role: "teacher" | "student") {
  const session = readSessionFromCookieHeader(request.headers.cookie);
  if (!session || session.role !== role) {
    throw new ApiError(401, "You must be signed in to continue.");
  }
  return session;
}

app.get("/api/health", (_request, response) => {
  response.status(200).json({ ok: true });
});

app.get("/api/bootstrap", async (_request, response, next) => {
  try {
    response.json(await getBootstrapData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/groups", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "teacher");
    response.status(201).json(await createGroup({ ...request.body, teacherId: session.userId }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "teacher");
    response.status(201).json(await createLesson({ ...request.body, teacherId: session.userId }));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/lessons/:lessonId", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "teacher");
    response.json(await updateLesson(request.params.lessonId, { ...request.body, teacherId: session.userId }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/lessons/:lessonId", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "teacher");
    response.json(await deleteLesson(request.params.lessonId, session.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/:lessonId/homeworks/generate", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.status(201).json(
      await generateHomeworkDraftForLesson(request.params.lessonId, { model: request.body.model }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/:lessonId/homeworks/generate-jobs", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.status(202).json(
      await startHomeworkGenerationJob(request.params.lessonId, { model: request.body.model }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/homework-generation-jobs/:jobId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(getHomeworkGenerationJobStatus(request.params.jobId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/groups/:groupId/students", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "teacher");
    response.status(201).json(
      await createStudentForGroup(
        request.params.groupId,
        request.body,
        session.userId,
        getAppOrigin(request),
      ),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/invitations/:token", async (request, response, next) => {
  try {
    response.json(await getInvitationByToken(request.params.token));
  } catch (error) {
    next(error);
  }
});

app.post("/api/invitations/:token/activate", async (request, response, next) => {
  try {
    response.json(await activateInvitation(request.params.token, String(request.body.password ?? "")));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/student-login", async (request, response, next) => {
  try {
    const result = await login(String(request.body.identifier ?? ""), String(request.body.password ?? ""));
    response.setHeader("Set-Cookie", buildSessionCookie({ role: result.user.role, userId: result.user.id }));
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/demo-login", async (request, response, next) => {
  try {
    const role = request.body.role === "student" ? "student" : "teacher";
    const result = await loginAsDemo(role, request.body.studentId);
    response.setHeader("Set-Cookie", buildSessionCookie({ role: result.user.role, userId: result.user.id }));
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const result = await login(String(request.body.identifier ?? ""), String(request.body.password ?? ""));
    response.setHeader("Set-Cookie", buildSessionCookie({ role: result.user.role, userId: result.user.id }));
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/teacher-register", async (request, response, next) => {
  try {
    response.status(201).json(await registerTeacher(request.body, getAppOrigin(request)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/teacher-confirm", async (request, response, next) => {
  try {
    const result = await confirmTeacherEmail(String(request.body?.token ?? ""));
    response.setHeader("Set-Cookie", buildSessionCookie({ role: "teacher", userId: result.user.id }));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (request, response, next) => {
  try {
    response.status(200).json(await getSession(readSessionFromCookieHeader(request.headers.cookie)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_request, response) => {
  response.setHeader("Set-Cookie", buildClearedSessionCookie());
  response.status(200).json({ ok: true });
});

app.get("/api/auth/teacher-oauth/:provider/start", async (request, response, next) => {
  try {
    const provider = request.params.provider;
    if (provider !== "google" && provider !== "yandex") {
      throw new ApiError(404, "OAuth provider not found.");
    }

    const { authorizationUrl } = getTeacherOAuthAuthorizationUrl({
      provider,
      apiOrigin: getApiOrigin(request),
      appOrigin: getAppOrigin(request),
    });
    response.redirect(302, authorizationUrl);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/teacher-oauth/:provider/callback", async (request, response, next) => {
  try {
    const provider = request.params.provider;
    if (provider !== "google" && provider !== "yandex") {
      throw new ApiError(404, "OAuth provider not found.");
    }

    const result = await completeTeacherOAuth({
      provider,
      code: String(request.query.code ?? ""),
      state: String(request.query.state ?? ""),
      apiOrigin: getApiOrigin(request),
    });
    response.setHeader("Set-Cookie", buildSessionCookie({ role: "teacher", userId: result.user.id }));
    response.redirect(302, `${result.appOrigin.replace(/\/$/, "")}/teacher`);
  } catch (error) {
    const origin = getAppOrigin(request).replace(/\/$/, "");
    const message = error instanceof Error ? error.message : "OAuth sign-in failed.";
    response.redirect(302, `${origin}/login?oauthError=${encodeURIComponent(message)}`);
  }
});

app.get("/api/students/:studentId/homeworks", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "student");
    const studentId = request.params.studentId === "me" ? session.userId : request.params.studentId;
    if (studentId !== session.userId) {
      throw new ApiError(403, "You can only access your own homework.");
    }
    response.json(await getAssignedHomeworks(studentId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/homeworks/:homeworkId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await getHomeworkById(request.params.homeworkId));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/homeworks/:homeworkId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await deleteHomework(request.params.homeworkId));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/homeworks/:homeworkId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await updateHomeworkDraft(request.params.homeworkId, request.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/homeworks/:homeworkId/exercises", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.status(201).json(await addManualHomeworkExercise(request.params.homeworkId, request.body.type));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/homeworks/:homeworkId/exercises/:exerciseId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await updateHomeworkExercise(request.params.homeworkId, request.params.exerciseId, request.body.exercise));
  } catch (error) {
    next(error);
  }
});

app.post("/api/homeworks/:homeworkId/exercises/:exerciseId/regenerate", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(
      await regenerateHomeworkExercise(request.params.homeworkId, request.params.exerciseId, {
        model: request.body.model,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/homeworks/:homeworkId/exercises/:exerciseId/questions/:questionId/regenerate", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(
      await regenerateHomeworkQuestion(
        request.params.homeworkId,
        request.params.exerciseId,
        request.params.questionId,
        {
          model: request.body.model,
          additionalContext: request.body.additionalContext,
        },
      ),
    );
  } catch (error) {
    next(error);
  }
});

app.delete("/api/homeworks/:homeworkId/exercises/:exerciseId", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await deleteHomeworkExercise(request.params.homeworkId, request.params.exerciseId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/homeworks/:homeworkId/publish", async (request, response, next) => {
  try {
    readRequiredSession(request, "teacher");
    response.json(await publishHomework(request.params.homeworkId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/homeworks/:homeworkId/submissions", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "student");
    response.status(201).json(
      await submitHomeworkAnswers(request.params.homeworkId, session.userId, request.body.answers ?? []),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/revision/:revisionItemId/answer", async (request, response, next) => {
  try {
    const session = readRequiredSession(request, "student");
    response.json(
      await submitRevisionAnswer(request.params.revisionItemId, session.userId, Boolean(request.body.correct)),
    );
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const apiError = toApiError(error);
  console.error(formatUnknownError(error));
  response.status(apiError.status).json({ error: apiError.message });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
