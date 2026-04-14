import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function HomeworkByToken() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { session, isBootstrapping } = useHomeworkStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBootstrapping) return;

    if (!session || session.role !== "student") {
      navigate(`/login?redirect=/hw/${shareToken}`, { replace: true });
      return;
    }

    apiRequest<{ homeworkId: string }>(`/api/homework-by-token/${shareToken}`)
      .then((data) => {
        navigate(`/student/homework/exercise?homeworkId=${data.homeworkId}`, { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Homework not found.");
      });
  }, [session, isBootstrapping, shareToken, navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-destructive">{error}</p>
          <button onClick={() => navigate("/login")} className="text-sm text-primary underline">
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading homework...</p>
    </div>
  );
}
