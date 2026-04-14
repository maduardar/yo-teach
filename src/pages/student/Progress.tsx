import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useHomeworkStore } from "@/context/HomeworkContext";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function StudentProgress() {
  const { currentStudent, getAssignedHomeworks, weakPoints } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();
  const studentWeakPoints = weakPoints.filter((point) => point.studentId === currentStudent?.id);
  const vocabProgress = currentStudent?.vocabProgress ?? 100;
  const grammarProgress = currentStudent?.grammarProgress ?? 100;
  const homeworkStreak = currentStudent?.homeworkStreak ?? 0;
  const scoreTrend = assignedHomeworks
    .map((homework) => ({
      week: homework.dueDate,
      progress: currentStudent ? homework.studentProgress[currentStudent.id] : undefined,
    }))
    .filter((entry) => entry.progress?.status === "completed")
    .map((entry) => ({ week: entry.week, score: entry.progress?.score ?? 0 }));

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold">Your Progress</h1>

      <Card className="shadow-card">
        <CardContent className="flex items-center gap-3 p-4">
          <Flame className="w-6 h-6 text-accent" />
          <div>
            <div className="text-sm font-semibold">{homeworkStreak}-homework streak</div>
            <div className="text-xs text-muted-foreground">
              {scoreTrend.length}/{assignedHomeworks.length} homeworks completed
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Score Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreTrend}>
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(168, 55%, 28%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4 text-center">
            <TrendingUp className="mx-auto mb-2 h-5 w-5 text-primary" />
            <div className="text-xl font-bold">{vocabProgress}%</div>
            <div className="text-xs text-muted-foreground">Vocabulary</div>
            <Progress value={vocabProgress} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4 text-center">
            <TrendingUp className="mx-auto mb-2 h-5 w-5 text-primary" />
            <div className="text-xl font-bold">{grammarProgress}%</div>
            <div className="text-xs text-muted-foreground">Grammar</div>
            <Progress value={grammarProgress} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Areas to Improve</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {studentWeakPoints.length === 0 ? (
            <div className="text-sm text-muted-foreground">No weak points have been recorded yet.</div>
          ) : (
            studentWeakPoints.map((weakPoint) => (
              <div key={weakPoint.id} className="flex items-center justify-between py-2">
                <span className="text-sm">{weakPoint.area}</span>
                <Badge variant={weakPoint.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                  {weakPoint.severity}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="py-4 text-center text-sm text-muted-foreground">
        Average completed homework score: {average(scoreTrend.map((entry) => entry.score))}%
      </p>
    </div>
  );
}
