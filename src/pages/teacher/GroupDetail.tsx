import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function GroupDetail() {
  const {
    groups,
    students,
    lessons,
    homeworks,
    weakPoints,
    createStudentInGroup,
  } = useHomeworkStore();
  const { groupId } = useParams();
  const group = groups.find((candidate) => candidate.id === groupId) ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telegramHandle, setTelegramHandle] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [latestInvite, setLatestInvite] = useState<{ studentId: string; inviteLink: string } | null>(null);

  const groupStudents = group ? students.filter((student) => group.students.includes(student.id)) : [];
  const groupLessons = group ? lessons.filter((lesson) => lesson.groupId === group.id) : [];
  const groupHomeworks = group ? homeworks.filter((homework) => homework.groupId === group.id) : [];
  const groupWeakPoints = groupStudents.flatMap((student) =>
    weakPoints
      .filter((point) => point.studentId === student.id && point.groupId === group?.id)
      .map((point) => ({ ...point, student: student.name })),
  );

  if (!group) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Group not found</h1>
          <p className="text-sm text-muted-foreground">Choose a group from the groups page.</p>
        </div>
        <Link to="/teacher/groups">
          <Button variant="outline">Back to groups</Button>
        </Link>
      </div>
    );
  }

  const copyInviteLink = async (inviteLink: string) => {
    await navigator.clipboard.writeText(inviteLink);
    toast.success("Invite link copied.");
  };

  const handleCreateStudent = async () => {
    if (!firstName.trim()) {
      toast.error("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      toast.error("Last name is required.");
      return;
    }

    setSaving(true);

    try {
      const result = await createStudentInGroup(group.id, {
        firstName,
        lastName,
        telegramHandle,
        phoneNumber,
      });

      setLatestInvite({ studentId: result.student.id, inviteLink: result.inviteLink });
      setFirstName("");
      setLastName("");
      setTelegramHandle("");
      setPhoneNumber("");
      setDialogOpen(false);
      toast.success("Student created and invited.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create student.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-sm text-muted-foreground">
            Level {group.level} · {groupStudents.length} students
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Student</DialogTitle>
                <DialogDescription>
                  Create a student profile for this group and generate an invite link.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>First name</Label>
                  <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Last name</Label>
                  <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telegram handle</Label>
                  <Input
                    value={telegramHandle}
                    onChange={(event) => setTelegramHandle(event.target.value)}
                    placeholder="@username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone number</Label>
                  <Input
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="+995..."
                  />
                </div>
                <Button onClick={handleCreateStudent} className="w-full" disabled={saving}>
                  {saving ? "Creating..." : "Create student"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Link to="/teacher/lessons/new">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Log lesson
            </Button>
          </Link>
          <Link to="/teacher/analytics">
            <Button size="sm" variant="outline" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Button>
          </Link>
        </div>
      </div>

      {latestInvite && (
        <Card className="shadow-card border-primary/20">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Invite link ready</div>
                <div className="text-xs text-muted-foreground">
                  {students.find((student) => student.id === latestInvite.studentId)?.name} is now invited.
                </div>
              </div>
              <Badge>invited</Badge>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <span className="flex-1 truncate text-sm text-muted-foreground">{latestInvite.inviteLink}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => copyInviteLink(latestInvite.inviteLink)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {groupStudents.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No students yet. Add your first student to generate an invite link.
            </div>
          )}
          {groupStudents.map((student) => {
            const homeworkProgress = groupHomeworks
              .map((homework) => homework.studentProgress[student.id])
              .find(Boolean);
            const inviteLink =
              student.inviteToken && typeof window !== "undefined"
                ? `${window.location.origin}/invite/${student.inviteToken}`
                : null;
            const inviteExpiresAt = student.inviteExpiresAt ? new Date(student.inviteExpiresAt) : null;
            const daysLeft = inviteExpiresAt ? Math.max(0, Math.ceil((inviteExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

            return (
              <div
                key={student.id}
                className="space-y-3 rounded-lg py-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {student.avatar}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{student.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {student.telegramHandle || student.phoneNumber || student.username}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={student.status === "active" ? "default" : "secondary"} className="text-xs">
                      {student.status}
                    </Badge>
                    {homeworkProgress && (
                      <Badge variant="outline" className="text-xs">
                        {homeworkProgress.status === "completed"
                          ? `${homeworkProgress.score}%`
                          : homeworkProgress.status}
                      </Badge>
                    )}
                    <Link to={`/teacher/students/${student.id}`}>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
                {inviteLink && (
                  <div className="mx-4 flex items-center gap-2 rounded-lg bg-muted/60 p-3">
                    <span className="flex-1 truncate text-xs text-muted-foreground">{inviteLink}</span>
                    {daysLeft !== null && (
                      <span className={`text-xs whitespace-nowrap ${daysLeft <= 2 ? "text-destructive" : "text-muted-foreground"}`}>
                        {daysLeft}d left
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyInviteLink(inviteLink)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Lessons</CardTitle>
        </CardHeader>
        <CardContent>
          {groupLessons.map((lesson) => (
            <Link
              key={lesson.id}
              to={`/teacher/lessons/${lesson.id}`}
              className="flex items-start justify-between gap-4 border-b py-3 transition-colors last:border-0 hover:bg-muted/30 -mx-4 px-4 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium">{lesson.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {lesson.date} · {lesson.grammar.join(", ")}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lesson.vocabulary.map((vocab) => (
                    <Badge key={vocab.phrase} variant="outline" className="text-xs font-normal">
                      {vocab.phrase}
                    </Badge>
                  ))}
                </div>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assigned Homework</CardTitle>
        </CardHeader>
        <CardContent>
          {groupHomeworks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No homework has been published for this group yet.</div>
          ) : (
            groupHomeworks.map((homework) => (
              <Link
                to="/teacher/homework"
                key={homework.id}
                className="flex items-center justify-between rounded-lg py-3 transition-colors hover:bg-muted/30 -mx-4 px-4"
              >
                <div>
                  <div className="text-sm font-medium">{homework.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Due {homework.dueDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={homework.status === "published" ? "default" : "secondary"} className="text-xs">
                    {homework.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-accent" />
            Group Weak Points
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {groupWeakPoints.map((point, index) => (
            <div key={index} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-normal">
                  {point.student}
                </Badge>
                <span className="text-sm">{point.area}</span>
              </div>
              <Badge variant={point.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                {point.severity}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
