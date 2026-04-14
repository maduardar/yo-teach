import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Users, FileText, AlertTriangle, Sparkles, ArrowRight, Plus, RotateCcw } from "lucide-react";
import { useHomeworkStore } from "@/context/HomeworkContext";
import type { Homework } from "@/lib/homework-types";

function getCompletionRate(homeworks: Homework[]) {
  const progresses = homeworks.flatMap((homework) => Object.values(homework.studentProgress));
  if (progresses.length === 0) {
    return 0;
  }

  const completed = progresses.filter((progress) => progress.status === "completed").length;
  return Math.round((completed / progresses.length) * 100);
}

export default function TeacherDashboard() {
  const { homeworks, groups, students, teacher, weakPoints, revisionItems } = useHomeworkStore();
  const highWeakPoints = weakPoints
    .filter((point) => point.severity === "high")
    .map((point) => ({
      ...point,
      student: students.find((student) => student.id === point.studentId)?.name ?? "Student",
    }))
    .slice(0, 6);
  const revisionDue = revisionItems.filter((item) => item.status === "due");
  const completionRate = getCompletionRate(homeworks);
  const lessonSuggestion = weakPoints[0]
    ? `Review ${weakPoints[0].area.toLowerCase()} next and assign revision to the students with recent high-severity weak points.`
    : "Log a lesson and publish homework to start collecting analytics.";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {teacher.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your students</p>
        </div>
        <div className="flex gap-2">
          <Link to="/teacher/lessons/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Log lesson
            </Button>
          </Link>
          <Link to="/teacher/homework">
            <Button size="sm" variant="outline" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Homework
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium">Groups</span>
            </div>
            <div className="text-2xl font-bold">{groups.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium">Students</span>
            </div>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-medium">Completion</span>
            </div>
            <div className="text-2xl font-bold">{completionRate}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Revision due</span>
            </div>
            <div className="text-2xl font-bold">{revisionDue.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Homework</CardTitle>
            </CardHeader>
            <CardContent>
              {homeworks.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No homework has been published yet.
                </div>
              ) : (
                homeworks.map((homework) => (
                  <Link
                    to="/teacher/homework"
                    key={homework.id}
                    className="mx-[-1rem] flex items-center justify-between rounded-lg border-b px-4 py-3 transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <div>
                      <div className="text-sm font-medium">{homework.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Due {homework.dueDate} · {groups.find((group) => group.id === homework.groupId)?.name ?? "Group"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={homework.status === "published" ? "default" : "secondary"} className="text-xs">
                        {homework.status}
                      </Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Your Groups</CardTitle>
              <Link to="/teacher/groups">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {groups.map((group) => (
                <Link
                  to={`/teacher/groups/${group.id}`}
                  key={group.id}
                  className="mx-[-1rem] flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div>
                    <div className="text-sm font-medium">{group.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {group.students.length} students · Level {group.level}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium">{group.completionRate}%</div>
                      <Progress value={group.completionRate} className="h-1.5 w-16" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-accent" />
                Student Weak Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              {highWeakPoints.length === 0 ? (
                <div className="text-sm text-muted-foreground">No high-severity weak points yet.</div>
              ) : (
                <div className="space-y-2">
                  {highWeakPoints.map((weakPoint) => (
                    <div key={weakPoint.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-normal">
                          {weakPoint.student}
                        </Badge>
                        <span className="text-sm">{weakPoint.area}</span>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {weakPoint.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-card gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4 text-primary" />
                Next Step
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-card p-3 text-sm leading-relaxed">{lessonSuggestion}</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <RotateCcw className="w-4 h-4" />
                Revision Due
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {revisionDue.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing is due right now.</div>
              ) : (
                revisionDue.slice(0, 6).map((item) => (
                  <div key={item.id} className="border-b py-2 last:border-0">
                    <div className="text-sm font-medium">{item.phrase ?? item.prompt}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground italic">
                      {students.find((student) => student.id === item.studentId)?.name ?? "Student"}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
