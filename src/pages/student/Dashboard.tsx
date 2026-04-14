import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FileText, RotateCcw, TrendingUp, Flame } from "lucide-react";
import { useHomeworkStore } from "@/context/HomeworkContext";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function StudentDashboard() {
  const { currentStudent, getAssignedHomeworks, revisionItems } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();
  const nextHomework = assignedHomeworks[0];
  const currentStudentId = currentStudent?.id ?? "";
  const completedScores = assignedHomeworks
    .map((homework) => homework.studentProgress[currentStudentId])
    .filter((progress): progress is { status: string; score: number; completedAt: string | null } => Boolean(progress))
    .filter((progress) => progress.status === "completed")
    .map((progress) => progress.score);
  const revisionDue = revisionItems.filter((item) => item.studentId === currentStudentId && item.status === "due");
  const vocabProgress = currentStudent?.vocabProgress ?? 100;
  const grammarProgress = currentStudent?.grammarProgress ?? 100;
  const homeworkStreak = currentStudent?.homeworkStreak ?? 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">Hey, {currentStudent?.firstName ?? "there"}!</h1>
        <p className="text-sm text-muted-foreground">Keep up the great work</p>
      </div>

      <Card className="shadow-card gradient-card">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
            <Flame className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">{homeworkStreak}-homework streak</div>
            <div className="text-xs text-muted-foreground">
              {completedScores.length}/{assignedHomeworks.length} assigned homeworks completed
            </div>
          </div>
          <div className="text-2xl font-bold text-primary">{average(completedScores)}%</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-xs">Vocabulary</span>
            </div>
            <Progress value={vocabProgress} className="mt-1 h-2" />
            <div className="mt-1 text-xs text-muted-foreground">{vocabProgress}% on track</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-xs">Grammar</span>
            </div>
            <Progress value={grammarProgress} className="mt-1 h-2" />
            <div className="mt-1 text-xs text-muted-foreground">{grammarProgress}% on track</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Homework Due</span>
          </div>
          {nextHomework ? (
            <>
              <div className="text-sm font-medium">{nextHomework.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Due {nextHomework.dueDate} · {nextHomework.exercises.length} exercises
              </div>
              <Link to="/student/homework">
                <Button className="mt-3 w-full" size="sm">
                  Start Homework
                </Button>
              </Link>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No homework is assigned yet. Once your teacher publishes work for your group, it will appear here.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold">Revision Due Today</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {revisionDue.length} items
            </Badge>
          </div>
          {revisionDue.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing is due right now.</div>
          ) : (
            revisionDue.slice(0, 2).map((item) => (
              <div key={item.id} className="border-b py-2 last:border-0">
                <div className="text-sm font-medium">{item.phrase ?? item.prompt}</div>
                {item.context && <div className="text-xs italic text-muted-foreground">&quot;{item.context}&quot;</div>}
              </div>
            ))
          )}
          <Link to="/student/revision">
            <Button variant="outline" className="mt-3 w-full" size="sm">
              Start Revision
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
