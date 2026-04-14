import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Flame, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useHomeworkStore } from "@/context/HomeworkContext";

function exerciseTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "gap-fill": "Gap Fill",
    "multiple-choice": "Multiple Choice",
    "phrase-explanation": "Phrase Recall",
    matching: "Matching",
    "open-answer": "Open Answer",
    "error-correction": "Error Correction",
    "sentence-building": "Sentence Building",
  };
  return labels[type] ?? type;
}

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
  const learnedPhraseCount = currentStudent?.learnedPhraseCount ?? 0;
  const homeworkStreak = currentStudent?.homeworkStreak ?? 0;
  const scoreTrend = assignedHomeworks
    .map((homework) => ({
      week: homework.dueDate,
      progress: currentStudent ? homework.studentProgress[currentStudent.id] : undefined,
    }))
    .filter((entry) => entry.progress?.status === "completed")
    .map((entry) => ({ week: entry.week, score: entry.progress?.score ?? 0 }));

  // Group weak points by category
  const weakPointsByCategory = studentWeakPoints.reduce<Record<string, typeof studentWeakPoints>>((acc, wp) => {
    const category = wp.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(wp);
    return acc;
  }, {});

  // Derive performance insights from homework submissions
  const allAnswers = assignedHomeworks.flatMap((hw) => {
    const submission = currentStudent ? hw.studentSubmissions?.find((s) => s.studentId === currentStudent.id) : null;
    return submission?.answers ?? [];
  });
  const exerciseTypeStats = allAnswers.reduce<Record<string, { correct: number; total: number }>>((acc, a) => {
    if (!acc[a.exerciseType]) acc[a.exerciseType] = { correct: 0, total: 0 };
    acc[a.exerciseType].total++;
    if (a.isCorrect) acc[a.exerciseType].correct++;
    return acc;
  }, {});
  const weakExerciseTypes = Object.entries(exerciseTypeStats)
    .map(([type, stats]) => ({ type, accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0, total: stats.total }))
    .filter((entry) => entry.total >= 2 && entry.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy);

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

      <Link to="/student/vocab">
        <Card className="shadow-card hover:border-primary/30 transition-colors cursor-pointer">
          <CardContent className="px-4 pb-3 pt-4 text-center">
            <BookOpen className="mx-auto mb-2 h-5 w-5 text-primary" />
            <div className="text-3xl font-bold">{learnedPhraseCount}</div>
            <div className="text-xs text-muted-foreground">phrases learned</div>
          </CardContent>
        </Card>
      </Link>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Areas to Improve</CardTitle>
          <p className="text-xs text-muted-foreground">Based on your homework results and lesson feedback</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {weakExerciseTypes.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Homework Performance
              </div>
              {weakExerciseTypes.map((entry) => (
                <div key={entry.type} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{exerciseTypeLabel(entry.type)}</span>
                  <Badge variant={entry.accuracy < 50 ? "destructive" : "secondary"} className="text-xs">
                    {entry.accuracy}% accuracy
                  </Badge>
                </div>
              ))}
            </div>
          )}
          {Object.keys(weakPointsByCategory).length === 0 && weakExerciseTypes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No areas to improve yet. Keep completing homework!</div>
          ) : (
            Object.entries(weakPointsByCategory).map(([category, points]) => (
              <div key={category}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {category}
                </div>
                {points.map((weakPoint) => (
                  <div key={weakPoint.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm">{weakPoint.area}</span>
                    <Badge variant={weakPoint.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                      {weakPoint.severity}
                    </Badge>
                  </div>
                ))}
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
