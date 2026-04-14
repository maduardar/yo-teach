import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function TeacherGroups() {
  const { groups, students, createGroup } = useHomeworkStore();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState("B1");

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a group name.");
      return;
    }

    try {
      await createGroup(newName, newLevel);
      setNewName("");
      setNewLevel("B1");
      setOpen(false);
      toast.success("Group created. Add students from the group page.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create group.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-sm text-muted-foreground">Manage your teaching groups</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
              <DialogDescription>
                Create a teaching group and then add students from the group page.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input
                  placeholder="e.g. A2 Monday Morning"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={newLevel} onValueChange={setNewLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create Group
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <Link to={`/teacher/groups/${group.id}`} key={group.id}>
            <Card className="cursor-pointer shadow-card transition-shadow hover:shadow-card-hover">
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{group.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Level {group.level} · {group.students.length} students · Last lesson {group.lastLessonDate}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.students.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No students yet</span>
                      ) : (
                        group.students.map((studentId) => {
                          const student = students.find((candidate) => candidate.id === studentId);
                          return student ? (
                            <span key={studentId} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                              {student.name}
                            </span>
                          ) : null;
                        })
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-medium">{group.completionRate}%</div>
                    <Progress value={group.completionRate} className="mt-1 h-1.5 w-20" />
                    <div className="mt-0.5 text-xs text-muted-foreground">completion</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
