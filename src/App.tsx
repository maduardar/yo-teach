import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HomeworkProvider } from "@/context/HomeworkContext";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

import TeacherLayout from "./components/TeacherLayout";
import TeacherDashboard from "./pages/teacher/Dashboard";
import TeacherGroups from "./pages/teacher/Groups";
import GroupDetail from "./pages/teacher/GroupDetail";
import StudentDetail from "./pages/teacher/StudentDetail";
import TeacherLessons from "./pages/teacher/Lessons";
import NewLesson from "./pages/teacher/NewLesson";
import TeacherLessonDetail from "./pages/teacher/LessonDetail";
import HomeworkGenerator from "./pages/teacher/HomeworkGenerator";
import PublishedHomework from "./pages/teacher/PublishedHomework";
import TeacherAnalytics from "./pages/teacher/Analytics";

import StudentLayout from "./components/StudentLayout";
import StudentDashboard from "./pages/student/Dashboard";
import StudentHomework from "./pages/student/Homework";
import HomeworkExercise from "./pages/student/HomeworkExercise";
import HomeworkResults from "./pages/student/HomeworkResults";
import StudentRevision from "./pages/student/Revision";
import StudentProgress from "./pages/student/Progress";
import StudentVocab from "./pages/student/Vocab";
import HomeworkReview from "./pages/student/HomeworkReview";
import StudentInvitation from "./pages/student/Invitation";
import HomeworkByToken from "./pages/student/HomeworkByToken";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HomeworkProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<StudentInvitation />} />
          <Route path="/hw/:shareToken" element={<HomeworkByToken />} />

            {/* Teacher */}
            <Route path="/teacher" element={<TeacherLayout />}>
              <Route index element={<TeacherDashboard />} />
              <Route path="groups" element={<TeacherGroups />} />
              <Route path="groups/:groupId" element={<GroupDetail />} />
              <Route path="students/:studentId" element={<StudentDetail />} />
              <Route path="lessons" element={<TeacherLessons />} />
              <Route path="lessons/new" element={<NewLesson />} />
              <Route path="lessons/:lessonId" element={<TeacherLessonDetail />} />
              <Route path="homework" element={<PublishedHomework />} />
              <Route path="homework/generate" element={<HomeworkGenerator />} />
              <Route path="analytics" element={<TeacherAnalytics />} />
            </Route>

            {/* Student */}
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<StudentDashboard />} />
              <Route path="homework" element={<StudentHomework />} />
              <Route path="homework/exercise" element={<HomeworkExercise />} />
              <Route path="homework/results" element={<HomeworkResults />} />
              <Route path="homework/review" element={<HomeworkReview />} />
              <Route path="revision" element={<StudentRevision />} />
              <Route path="progress" element={<StudentProgress />} />
              <Route path="vocab" element={<StudentVocab />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HomeworkProvider>
  </QueryClientProvider>
);

export default App;
