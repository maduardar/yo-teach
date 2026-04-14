import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useHomeworkStore } from "@/context/HomeworkContext";

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function StudentDetail() {
  const { homeworks, students, groups, weakPoints, revisionItems, lessons } = useHomeworkStore();
  const { studentId } = useParams();
  const student = students.find((candidate) => candidate.id === studentId) ?? null;

  if (!student) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Student not found</h1>
        <Link to="/teacher/groups">
          <Badge variant="outline">Back to groups</Badge>
        </Link>
      </div>
    );
  }

  const studentGroup = groups.find((group) => group.students.includes(student.id));
  const studentWeakPoints = weakPoints.filter((point) => point.studentId === student.id);
  const studentRevisionItems = revisionItems.filter((item) => item.studentId === student.id);
  const studentScores = homeworks
    .map((homework) => ({
      label: homework.dueDate,
      progress: homework.studentProgress[student.id],
    }))
    .filter((entry) => entry.progress?.status === "completed")
    .map((entry) => ({
      week: entry.label,
      score: entry.progress?.score ?? 0,
    }));
  const lastScore = studentScores.at(-1)?.score ?? 0;
  const lessonMistakes = useMemo(
    () =>
      lessons
        .flatMap((lesson) =>
          lesson.studentMistakes
            .filter((mistake) => mistake.studentId === student.id)
            .map((mistake) => ({ ...mistake, lessonTitle: lesson.title })),
        )
        .slice(0, 6),
    [lessons, student.id],
  );
  const insight = studentWeakPoints[0]
    ? `${student.name} needs extra work on ${studentWeakPoints[0].area.toLowerCase()}.`
    : `${student.name} has no recorded weak points yet.`;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to={studentGroup ? `/teacher/groups/${studentGroup.id}` : "/teacher/groups"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to group
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
          {student.avatar}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{student.name}</h1>
          <p className="text-sm text-muted-foreground">
            {student.email ?? student.username} · {studentGroup?.name ?? "No group assigned"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Last Score</div>
            <div className="text-2xl font-bold">{lastScore}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Weak Points</div>
            <div className="text-2xl font-bold">{studentWeakPoints.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Revision Due</div>
            <div className="text-2xl font-bold">{studentRevisionItems.filter((item) => item.status === "due").length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Score Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={studentScores}>
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(168, 55%, 28%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Weak Points</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {studentWeakPoints.length === 0 ? (
            <div className="text-sm text-muted-foreground">No weak points recorded yet.</div>
          ) : (
            studentWeakPoints.map((weakPoint) => (
              <div key={weakPoint.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">{weakPoint.area}</div>
                  <div className="text-xs text-muted-foreground">{weakPoint.category}</div>
                </div>
                <Badge variant={weakPoint.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                  {weakPoint.severity}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Lesson Mistakes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lessonMistakes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No lesson mistakes logged for this student yet.</div>
          ) : (
            lessonMistakes.map((mistake, index) => (
              <div key={`${mistake.lessonTitle}-${index}`} className="rounded-lg border border-destructive/10 bg-destructive/5 p-3">
                <div className="mb-1 text-sm font-medium">{mistake.lessonTitle}</div>
                <div className="text-sm">{mistake.mistake}</div>
                {mistake.correction && <div className="mt-1 text-xs text-primary">Correct: {mistake.correction}</div>}
                <div className="mt-1 text-xs text-muted-foreground">{mistake.category}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card gradient-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Teacher Insight
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{insight}</p>
          <div className="rounded-lg bg-card p-3">
            <div className="mb-2 text-xs text-muted-foreground">Average completed homework score</div>
            <Progress value={getAverage(studentScores.map((entry) => entry.score))} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
