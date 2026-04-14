import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GraduationCap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHomeworkStore } from "@/context/HomeworkContext";
import { apiRequest } from "@/lib/api";
import type { LoginResponse } from "@/lib/app-types";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInAsTeacherDemo, signInAsStudentDemo, signInWithCredentials, registerTeacher, refreshBootstrap, students, teachers } =
    useHomeworkStore();
  const [tab, setTab] = useState<"login" | "register" | "demo">("demo");
  const [identifier, setIdentifier] = useState(searchParams.get("identifier") ?? "");
  const [password, setPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextIdentifier = searchParams.get("identifier");
    if (nextIdentifier) {
      setTab("login");
      setIdentifier(nextIdentifier);
    }
  }, [searchParams]);

  useEffect(() => {
    const verifyTeacherToken = searchParams.get("verifyTeacherToken");
    const oauthError = searchParams.get("oauthError");
    if (oauthError) {
      toast.error(oauthError);
    }
    if (!verifyTeacherToken) {
      return;
    }

    setSubmitting(true);
    void apiRequest<LoginResponse>("/api/auth/teacher-confirm", {
      method: "POST",
      body: { token: verifyTeacherToken },
    })
      .then(async () => {
        await refreshBootstrap();
        toast.success("Email confirmed.");
        navigate("/teacher", { replace: true });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to confirm email.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  }, [navigate, refreshBootstrap, searchParams]);

  const handleSignIn = async () => {
    if (!identifier.trim() || !password.trim()) {
      toast.error("Enter your login identifier and password.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await signInWithCredentials(identifier, password);
      navigate(result.role === "teacher" ? "/teacher" : "/student");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherRegistration = async () => {
    if (!registerFirstName.trim() || !registerLastName.trim() || !registerEmail.trim() || !registerPassword.trim()) {
      toast.error("Fill in all teacher registration fields.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await registerTeacher({
        firstName: registerFirstName,
        lastName: registerLastName,
        email: registerEmail,
        password: registerPassword,
      });
      setVerificationPreviewUrl(result.verificationPreviewUrl);
      setRegisterPassword("");
      setTab("login");
      toast.success("Check your email to confirm your teacher account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to register teacher.");
    } finally {
      setSubmitting(false);
    }
  };

  const demoStudent = students.find((student) => student.status === "active");
  const demoTeacher = teachers[0];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-hero text-sm font-bold text-primary-foreground">L</div>
            <span className="text-xl font-semibold">LinguaAI</span>
          </Link>
          <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue or try the demo</p>
        </div>

        <div className="mb-6 flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setTab("demo")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "demo" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Quick Demo
          </button>
          <button
            onClick={() => setTab("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === "login" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("register")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "register" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Register
          </button>
        </div>

        {tab === "demo" ? (
          <div className="space-y-3">
            <p className="mb-4 text-sm text-muted-foreground">Choose a role to explore the prototype:</p>
            <button
              onClick={async () => {
                try {
                  await signInAsTeacherDemo();
                  navigate("/teacher");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Unable to sign in as the demo teacher.");
                }
              }}
              className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-card-hover"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg gradient-hero">
                <GraduationCap className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">Teacher — {demoTeacher?.name ?? "Seeded teacher"}</div>
                <div className="text-xs text-muted-foreground">Manage lessons, homework & students</div>
              </div>
            </button>
            <button
              onClick={async () => {
                if (!demoStudent) {
                  toast.error("No active demo student is available.");
                  return;
                }

                try {
                  await signInAsStudentDemo(demoStudent.id);
                  navigate("/student");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Unable to sign in as the demo student.");
                }
              }}
              className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-card-hover"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg gradient-accent">
                <BookOpen className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">Student — {demoStudent?.name ?? "Anna"}</div>
                <div className="text-xs text-muted-foreground">Complete homework & revision</div>
              </div>
            </button>
          </div>
        ) : tab === "login" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Teacher email or student login ID</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="teacher@example.com or anna"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button className="w-full" onClick={handleSignIn} disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
            <div className="space-y-1 text-center text-xs text-muted-foreground">
              <p>
                Teacher demo login: <span className="font-medium">{demoTeacher?.email || "darina@example.com"}</span> /{" "}
                <span className="font-medium">teacher-demo</span>
              </p>
              <p>
                Seeded active students use their username with password{" "}
                <span className="font-medium">student-demo</span>
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Teacher sign-in options</div>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => window.location.assign("/api/auth/teacher-oauth/google/start")}>
                  Sign in with Google
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => window.location.assign("/api/auth/teacher-oauth/yandex/start")}>
                  Sign in with Yandex
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="register-first-name">First name</Label>
                <Input
                  id="register-first-name"
                  value={registerFirstName}
                  onChange={(event) => setRegisterFirstName(event.target.value)}
                  placeholder="Darina"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-last-name">Last name</Label>
                <Input
                  id="register-last-name"
                  value={registerLastName}
                  onChange={(event) => setRegisterLastName(event.target.value)}
                  placeholder="Maduar"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <Input
                id="register-email"
                type="email"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                placeholder="teacher@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <Input
                id="register-password"
                type="password"
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <Button className="w-full" onClick={handleTeacherRegistration} disabled={submitting}>
              {submitting ? "Creating account..." : "Create teacher account"}
            </Button>
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              Teacher accounts are activated only after email confirmation.
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Teacher sign-in options</div>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => window.location.assign("/api/auth/teacher-oauth/google/start")}>
                  Google
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => window.location.assign("/api/auth/teacher-oauth/yandex/start")}>
                  Yandex
                </Button>
              </div>
            </div>
            {verificationPreviewUrl && (
              <div className="rounded-lg border border-dashed p-3 text-sm">
                <div className="font-medium">Development confirmation link</div>
                <div className="mt-1 text-muted-foreground">
                  Email delivery is not configured, so the confirmation link is exposed here.
                </div>
                <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => window.location.assign(verificationPreviewUrl)}>
                  Open confirmation link
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
