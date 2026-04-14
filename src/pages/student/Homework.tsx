import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, FileText, RotateCcw } from "lucide-react";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function StudentHomework() {
  const { currentStudent, getAssignedHomeworks } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();
  const studentId = currentStudent?.id ?? "";

  const todo = assignedHomeworks.filter((hw) => {
    const progress = hw.studentProgress[studentId];
    return !progress || progress.status === "in-progress";
  });

  const completed = assignedHomeworks.filter((hw) => {
    const progress = hw.studentProgress[studentId];
    return progress?.status === "completed" || progress?.status === "pending-review";
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold">Homework</h1>

      {assignedHomeworks.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="p-5 text-sm text-muted-foreground">
            No homework is assigned to you yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {todo.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">To Do</h2>
              {todo.map((homework) => (
                <Card key={homework.id} className="shadow-card">
                  <CardContent className="p-5">
                    <Badge className="mb-3 text-xs">Assigned</Badge>
                    <h2 className="font-semibold text-lg">{homework.title}</h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        {homework.exercises.length} exercises
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        Due {homework.dueDate}
                      </div>
                    </div>
                    <Link to={`/student/homework/exercise?homeworkId=${homework.id}`}>
                      <Button className="w-full mt-4">Start Homework</Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed</h2>
              {completed.map((homework) => {
                const progress = homework.studentProgress[studentId];
                const submission = homework.studentSubmissions?.find((s) => s.studentId === studentId);
                return (
                  <Card key={homework.id} className="shadow-card">
                    <CardContent className="p-4 space-y-3">
                      <Link to={`/student/homework/review?homeworkId=${homework.id}`}>
                        <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                          <div>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-sm">{homework.title}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Score: {progress?.score ?? 0}%
                              {submission?.completedAt && ` · ${new Date(submission.completedAt).toLocaleDateString()}`}
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {progress?.score ?? 0}%
                          </Badge>
                        </div>
                      </Link>
                      <Link to={`/student/homework/exercise?homeworkId=${homework.id}`}>
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Start Over
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
