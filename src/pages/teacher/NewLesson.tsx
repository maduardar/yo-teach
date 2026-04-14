import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useHomeworkStore } from "@/context/HomeworkContext";

export default function NewLesson() {
  const navigate = useNavigate();
  const { groups, students, createLesson } = useHomeworkStore();
  const [title, setTitle] = useState("Present Perfect vs Past Simple + Travel Phrases");
  const [date, setDate] = useState("2026-03-29");
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [grammar, setGrammar] = useState(["Present Perfect vs Past Simple"]);
  const [grammarInput, setGrammarInput] = useState("");

  // Bulk vocabulary input: "phrase (example sentence)" per line
  const [vocabBulk, setVocabBulk] = useState(
    `take a photo (I took a photo of the beach.)
miss a flight (She missed her flight because of traffic.)
be used to (I'm not used to waking up early.)`
  );

  const [notes, setNotes] = useState("Students found the difference between Present Perfect and Past Simple challenging.");
  const [saving, setSaving] = useState(false);

  // Per-student mistakes: each entry has a studentId + bulk text
  const [mistakeEntries, setMistakeEntries] = useState([
    { id: "me1", studentId: "", text: '"I am agree" → "I agree"' },
    { id: "me2", studentId: "", text: "Article omission\nMissing articles before nouns" },
    { id: "me3", studentId: "", text: 'PP/PS confusion\nUsed "I have went" instead of "I went"' },
  ]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const groupStudents = selectedGroup
    ? students.filter(s => selectedGroup.students.includes(s.id))
    : [];

  useEffect(() => {
    if (!groups.some((group) => group.id === selectedGroupId) && groups[0]) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const addGrammar = () => {
    if (grammarInput.trim()) {
      setGrammar([...grammar, grammarInput.trim()]);
      setGrammarInput("");
    }
  };

  const addMistakeEntry = () => {
    setMistakeEntries([...mistakeEntries, { id: `me${Date.now()}`, studentId: "", text: "" }]);
  };

  const updateMistakeEntry = (id: string, field: "studentId" | "text", value: string) => {
    setMistakeEntries(mistakeEntries.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMistakeEntry = (id: string) => {
    setMistakeEntries(mistakeEntries.filter(m => m.id !== id));
  };

  // Parse vocab bulk text into structured items for preview
  const parsedVocab = vocabBulk
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.+?)\s*\((.+)\)\s*$/);
      if (match) return { phrase: match[1].trim(), context: match[2].trim() };
      return { phrase: line, context: "" };
    });

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Lesson title is required.");
      return;
    }

    if (!selectedGroupId) {
      toast.error("Select a group.");
      return;
    }

    setSaving(true);

    try {
      const lesson = await createLesson({
        groupId: selectedGroupId,
        title,
        date,
        grammar,
        vocabulary: parsedVocab,
        notes,
        studentMistakes: mistakeEntries
          .map((entry) => {
            const [firstLine = "", secondLine = ""] = entry.text
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);

            const arrowParts = firstLine.split("→").map((part) => part.trim()).filter(Boolean);
            const mistake = arrowParts[0] ?? firstLine;
            const correction = arrowParts[1] ?? secondLine;

            return {
              studentId: entry.studentId,
              mistake,
              correction: correction ?? "",
              category: secondLine && secondLine !== correction ? secondLine : "lesson note",
            };
          })
          .filter((entry) => entry.studentId && entry.mistake),
      });

      toast.success("Lesson saved successfully.");
      navigate(`/teacher/lessons/${lesson.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save lesson.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/teacher/lessons" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to lessons
      </Link>

      <h1 className="text-2xl font-bold">Log New Lesson</h1>

      <div className="space-y-6 max-w-2xl">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Lesson Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grammar */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Grammar Points</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {grammar.map((g, i) => (
                <Badge key={i} className="gap-1">
                  {g}
                  <button onClick={() => setGrammar(grammar.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add grammar point..." value={grammarInput} onChange={e => setGrammarInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addGrammar()} />
              <Button variant="outline" size="sm" onClick={addGrammar}><Plus className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Vocabulary — bulk input */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vocabulary Phrases</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              One phrase per line. Put example sentences in brackets: <span className="font-mono">take a photo (I took a photo of the beach.)</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={vocabBulk}
              onChange={e => setVocabBulk(e.target.value)}
              rows={5}
              placeholder={`take a photo (I took a photo of the beach.)\nmiss a flight (She missed her flight.)`}
              className="font-mono text-sm"
            />
            {parsedVocab.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Preview — AI will parse into phrase + context:</div>
                <div className="space-y-1.5">
                  {parsedVocab.map((v, i) => (
                    <div key={i} className="flex items-start bg-muted/50 rounded-lg p-2.5 text-sm">
                      <div className="flex-1">
                        <span className="font-medium">{v.phrase}</span>
                        {v.context && <span className="text-muted-foreground italic ml-2">"{v.context}"</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <div className="space-y-2">
          <Label>Lesson Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>

        {/* Student Mistakes — per student */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Student Mistakes</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Select a student, then list their mistakes — one per line.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {mistakeEntries.map((entry) => (
              <div key={entry.id} className="bg-destructive/5 rounded-lg p-3 border border-destructive/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Select value={entry.studentId} onValueChange={v => updateMistakeEntry(entry.id, "studentId", v)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupStudents.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => removeMistakeEntry(entry.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Textarea
                  value={entry.text}
                  onChange={e => updateMistakeEntry(entry.id, "text", e.target.value)}
                  rows={2}
                  placeholder={`"I am agree" → "I agree"\nArticle omission`}
                  className="text-sm"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addMistakeEntry} className="gap-1">
              <Plus className="w-3.5 h-3.5" />Add student mistakes
            </Button>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Lesson"}</Button>
        </div>
      </div>
    </div>
  );
}
