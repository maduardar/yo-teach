import { Link } from "react-router-dom";
import { CheckCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function HomeworkResults() {
  const { lastHomeworkResult } = useHomeworkStore();

  if (!lastHomeworkResult) {
    return (
      <div className="space-y-5 animate-fade-in">
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No recent homework submission was found.
          </CardContent>
        </Card>
        <Link to="/student/homework">
          <Button className="w-full">Back to Homework</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <Card className="shadow-card text-center">
        <CardContent className="p-6">
          <Badge className="mb-4" variant={lastHomeworkResult.status === "pending-review" ? "secondary" : "default"}>
            {lastHomeworkResult.status === "pending-review" ? "Pending review" : "Completed"}
          </Badge>
          <div className="text-4xl font-bold text-primary mb-1">{lastHomeworkResult.score}%</div>
          <p className="text-sm font-medium">{lastHomeworkResult.homeworkTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {lastHomeworkResult.status === "pending-review"
              ? "Your submission was saved, but AI scoring could not be completed yet."
              : "Your answers were submitted successfully."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-success" />
            <span>Your submission is saved.</span>
          </div>
        </CardContent>
      </Card>

      <Link to="/student/revision">
        <Button className="w-full gap-1.5">
          <RotateCcw className="w-4 h-4" />
          Start Revision
        </Button>
      </Link>
    </div>
  );
}
