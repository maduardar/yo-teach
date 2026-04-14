import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Home, FileText, RotateCcw, TrendingUp, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHomeworkStore } from "@/context/HomeworkContext";

const navItems = [
  { label: "Home", icon: Home, path: "/student" },
  { label: "Homework", icon: FileText, path: "/student/homework" },
  { label: "Revision", icon: RotateCcw, path: "/student/revision" },
  { label: "Progress", icon: TrendingUp, path: "/student/progress" },
];

export default function StudentLayout() {
  const location = useLocation();
  const { currentStudent, isBootstrapping, signOut } = useHomeworkStore();

  const isActive = (path: string) => {
    if (path === "/student") return location.pathname === "/student";
    return location.pathname.startsWith(path);
  };

  if (isBootstrapping) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!currentStudent) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-30 bg-card border-b px-4 h-14 flex items-center justify-between">
        <Link to="/student" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center text-xs font-bold text-primary-foreground">L</div>
          <span className="font-semibold">LinguaAI</span>
        </Link>
        <button type="button" onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 md:p-6 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom tabs */}
      <nav className="sticky bottom-0 bg-card border-t flex justify-around py-2 z-30">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors",
              isActive(item.path)
                ? "text-primary font-medium"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
