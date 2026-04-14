import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { LockKeyhole, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHomeworkStore } from "@/context/HomeworkContext";
import type { InvitationLookupResponse } from "@/lib/app-types";

export default function StudentInvitation() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { activateStudentInvite, currentStudent, fetchInvitation } = useHomeworkStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationLookupResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setInvitation({ state: "invalid" });
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchInvitation(token)
      .then((response) => {
        if (!cancelled) {
          setInvitation(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvitation({ state: "invalid" });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchInvitation, token]);

  if (currentStudent) {
    return <Navigate to="/student" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">Loading invitation...</CardContent>
        </Card>
      </div>
    );
  }

  if (!token || !invitation || invitation.state === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <UserPlus className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold">Invite unavailable</h1>
              <p className="text-sm text-muted-foreground">
                This invite link is invalid or has already been used.
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Back to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation.state === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
              <LockKeyhole className="h-6 w-6 text-accent" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold">Invite expired</h1>
              <p className="text-sm text-muted-foreground">
                Ask your teacher for a fresh invite link.
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Back to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation.state === "consumed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold">Invite already used</h1>
              <p className="text-sm text-muted-foreground">
                This account has already been activated. Sign in with your username instead.
              </p>
            </div>
            <Link to={`/login?identifier=${encodeURIComponent(invitation.invitation.username)}`}>
              <Button variant="outline" className="w-full">
                Go to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleActivate = async () => {
    if (password.trim().length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await activateStudentInvite(token, password);
      toast.success("Account activated. Log in to continue.");
      navigate(`/login?identifier=${encodeURIComponent(result.identifier)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to activate account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero text-primary-foreground">
            <UserPlus className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Join your class</CardTitle>
            <p className="text-sm text-muted-foreground">
              You were invited to join {invitation.invitation.group.name}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="font-medium">{invitation.invitation.studentName}</div>
            <div className="mt-1 text-muted-foreground">Login ID: {invitation.invitation.username}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Set password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat your password"
            />
          </div>
          <Button className="w-full" onClick={handleActivate} disabled={submitting}>
            {submitting ? "Activating..." : "Activate account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            After activation, sign in with <span className="font-medium">{invitation.invitation.username}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
