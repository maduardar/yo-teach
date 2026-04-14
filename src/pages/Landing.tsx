import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, Sparkles, ArrowRight, CheckCircle } from "lucide-react";

const features = [
  { icon: BookOpen, title: "Smart Lesson Logs", desc: "Log what you covered and AI generates homework instantly." },
  { icon: Users, title: "Student Tracking", desc: "Track weak points per student. No one falls behind." },
  { icon: Sparkles, title: "AI-Powered Revision", desc: "Spaced repetition adapted to each student's gaps." },
];

const benefits = [
  "60–80% homework from latest lesson",
  "Automatic weak point detection",
  "Vocabulary stored as phrases in context",
  "One-click homework sharing",
  "Mobile-friendly student experience",
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center text-sm font-bold text-primary-foreground">L</div>
            <span className="font-semibold text-lg">LinguaAI</span>
          </div>
          <Link to="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 md:py-28 px-4">
        <div className="max-w-3xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            AI-powered English teaching assistant
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 text-foreground leading-tight">
            Teach smarter,<br />not harder
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-8">
            Log your lesson, get instant homework. Track each student's weak points. Spaced revision that actually works. Built for teachers of Russian-speaking learners.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/login">
              <Button size="lg" className="gap-2 text-base px-8">
                Get started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-base px-8">
                Try the demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Everything a language teacher needs</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto bg-card rounded-2xl p-8 md:p-10 shadow-card">
          <h2 className="text-xl font-bold mb-6">Why teachers love LinguaAI</h2>
          <div className="space-y-3">
            {benefits.map((b) => (
              <div key={b} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <span className="text-sm">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        <p>LinguaAI — AI-powered English teaching assistant. Prototype 2026.</p>
      </footer>
    </div>
  );
}
