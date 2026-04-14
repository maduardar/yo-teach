import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, RotateCcw, TrendingUp, Flame } from "lucide-react";
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
  const currentStudentId = currentStudent?.id ?? "";
  const completedScores = assignedHomeworks
    .map((homework) => homework.studentProgress[currentStudentId])
    .filter((progress): progress is { status: string; score: number; completedAt: string | null } => Boolean(progress))
    .filter((progress) => progress.status === "completed")
    .map((progress) => progress.score);
  const revisionDue = revisionItems.filter((item) => item.studentId === currentStudentId && item.status === "due");
  const learnedPhraseCount = currentStudent?.learnedPhraseCount ?? 0;
  const homeworkStreak = currentStudent?.homeworkStreak ?? 0;

  // Show only the most recent incomplete homework
  const nextHomework = assignedHomeworks.find((hw) => {
    const progress = hw.studentProgress[currentStudentId];
    return !progress || progress.status === "in-progress";
  });

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
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{average(completedScores)}%</div>
            <div className="text-[10px] text-muted-foreground">avg score</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/student/vocab">
          <Card className="shadow-card hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="px-4 pb-3 pt-4 text-center">
              <BookOpen className="mx-auto mb-1 h-5 w-5 text-primary" />
              <div className="text-2xl font-bold">{learnedPhraseCount}</div>
              <div className="text-xs text-muted-foreground">phrases learned</div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/student/revision">
          <Card className="shadow-card hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="px-4 pb-3 pt-4 text-center">
              <RotateCcw className="mx-auto mb-1 h-5 w-5 text-accent" />
              <div className="text-2xl font-bold">{revisionDue.length}</div>
              <div className="text-xs text-muted-foreground">revision due</div>
            </CardContent>
          </Card>
        </Link>
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
              <Link to={`/student/homework/exercise?homeworkId=${nextHomework.id}`}>
                <Button className="mt-3 w-full" size="sm">
                  Start Homework
                </Button>
              </Link>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No homework is due right now. Great job staying on top of things!
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

      <Link to="/student/progress">
        <Button variant="ghost" className="w-full gap-1.5 text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          View Progress
        </Button>
      </Link>
    </div>
  );
}
