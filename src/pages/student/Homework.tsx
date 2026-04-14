import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, FileText } from "lucide-react";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function StudentHomework() {
  const { getAssignedHomeworks } = useHomeworkStore();
  const assignedHomeworks = getAssignedHomeworks();

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
        assignedHomeworks.map((homework) => (
          <Card key={homework.id} className="shadow-card">
            <CardContent className="p-5">
              <Badge className="mb-3 text-xs">Assigned</Badge>
              <h2 className="font-semibold text-lg">{homework.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Practice what we covered in your recent lesson and complete the published exercises.
              </p>

              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  {homework.exercises.length} exercises
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  ~15 min
                </div>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Due: {homework.dueDate}
              </div>

              <Link to={`/student/homework/exercise?homeworkId=${homework.id}`}>
                <Button className="w-full mt-4">Start Homework</Button>
              </Link>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
