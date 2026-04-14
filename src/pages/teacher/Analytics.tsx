import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from "recharts";
import { useHomeworkStore } from "@/context/HomeworkContext";

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function TeacherAnalytics() {
  const { groups, students, homeworks, weakPoints, revisionItems } = useHomeworkStore();
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id ?? "");

  useEffect(() => {
    if (!selectedGroupId && groups[0]) {
      setSelectedGroupId(groups[0].id);
    }
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId) && groups[0]) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const groupStudents = useMemo(
    () => (selectedGroup ? students.filter((student) => selectedGroup.students.includes(student.id)) : []),
    [selectedGroup, students],
  );
  const groupHomeworks = useMemo(
    () => (selectedGroup ? homeworks.filter((homework) => homework.groupId === selectedGroup.id) : []),
    [homeworks, selectedGroup],
  );
  const groupWeakPoints = useMemo(
    () => (selectedGroup ? weakPoints.filter((point) => point.groupId === selectedGroup.id) : []),
    [selectedGroup, weakPoints],
  );
  const groupRevisionItems = useMemo(
    () =>
      selectedGroup
        ? revisionItems.filter((item) => groupStudents.some((student) => student.id === item.studentId))
        : [],
    [groupStudents, revisionItems, selectedGroup],
  );

  const completionRate = selectedGroup?.completionRate ?? 0;
  const completedScores = groupHomeworks.flatMap((homework) =>
    Object.entries(homework.studentProgress)
      .filter(([studentId, progress]) => selectedGroup?.students.includes(studentId) && progress.status === "completed")
      .map(([, progress]) => progress.score),
  );
  const averageAccuracy = getAverage(completedScores);
  const weakAreaCount = new Set(groupWeakPoints.map((point) => point.area)).size;
  const revisionDueCount = groupRevisionItems.filter((item) => item.status === "due").length;

  const scoreTrend = groupHomeworks.map((homework) => {
    const scores = Object.entries(homework.studentProgress)
      .filter(([studentId, progress]) => selectedGroup?.students.includes(studentId) && progress.status === "completed")
      .map(([, progress]) => progress.score);
    return {
      label: homework.dueDate,
      score: getAverage(scores),
    };
  });

  const groupedWeakPoints = groupWeakPoints.reduce<Record<string, number>>((accumulator, weakPoint) => {
    accumulator[weakPoint.area] = (accumulator[weakPoint.area] ?? 0) + 1;
    return accumulator;
  }, {});

  const grammarAreas = Object.entries(groupedWeakPoints)
    .filter(([area]) => groupWeakPoints.find((point) => point.area === area)?.category === "grammar")
    .map(([area, count]) => ({ area, accuracy: Math.max(20, 100 - count * 15) }))
    .sort((left, right) => left.accuracy - right.accuracy)
    .slice(0, 5);

  const vocabAreas = Object.entries(groupedWeakPoints)
    .filter(([area]) => groupWeakPoints.find((point) => point.area === area)?.category === "vocabulary")
    .map(([phrase, count]) => ({ phrase, accuracy: Math.max(20, 100 - count * 15) }))
    .sort((left, right) => left.accuracy - right.accuracy)
    .slice(0, 5);

  const studentComparison = groupStudents.map((student) => {
    const weakPointCount = groupWeakPoints.filter((point) => point.studentId === student.id).length;
    const studentScores = groupHomeworks
      .map((homework) => homework.studentProgress[student.id])
      .filter((progress): progress is { status: string; score: number; completedAt: string | null } => Boolean(progress));
    const latestCompleted = [...studentScores].reverse().find((progress) => progress.status === "completed");
    return {
      student,
      weakPointCount,
      score: latestCompleted?.score ?? null,
      inProgress: studentScores.some((progress) => progress.status !== "completed"),
    };
  });

  const suggestion = groupWeakPoints[0]
    ? `Focus the next lesson on ${groupWeakPoints[0].area.toLowerCase()} and schedule revision for the students still marked due.`
    : "Add a lesson and homework for this group to unlock analytics trends.";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">{selectedGroup?.name ?? "No group selected"} — group progress</p>
        </div>
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <SelectValue placeholder="Select group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Completion Rate</div>
            <div className="text-2xl font-bold">{completionRate}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Avg Accuracy</div>
            <div className="text-2xl font-bold">{averageAccuracy}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Weak Areas</div>
            <div className="text-2xl font-bold">{weakAreaCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="px-4 pb-3 pt-4">
            <div className="mb-1 text-xs text-muted-foreground">Revision Due</div>
            <div className="text-2xl font-bold">{revisionDueCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Group Score Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreTrend}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(168, 55%, 28%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weakest Grammar Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grammarAreas} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="area" width={160} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="accuracy" fill="hsl(168, 55%, 28%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weakest Vocabulary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vocabAreas.length === 0 ? (
              <div className="text-sm text-muted-foreground">No vocabulary weak points in this group yet.</div>
            ) : (
              vocabAreas.map((item) => (
                <div key={item.phrase} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.phrase}</span>
                  <div className="flex items-center gap-2">
                    <Progress value={item.accuracy} className="h-2 w-24" />
                    <span className="w-8 text-xs text-muted-foreground">{item.accuracy}%</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {studentComparison.map(({ student, weakPointCount, score, inProgress }) => (
            <div key={student.id} className="flex items-center justify-between border-b py-2 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {student.avatar}
                </div>
                <div>
                  <div className="text-sm font-medium">{student.name}</div>
                  <div className="text-xs text-muted-foreground">{weakPointCount} weak points</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {score !== null ? (
                  <>
                    <Progress value={score} className="h-2 w-20" />
                    <span className="w-10 text-right text-sm font-medium">{score}%</span>
                  </>
                ) : (
                  <Badge variant={inProgress ? "secondary" : "outline"} className="text-xs">
                    {inProgress ? "in progress" : "no score"}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-card gradient-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Next Lesson Suggestion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{suggestion}</p>
        </CardContent>
      </Card>
    </div>
  );
}
