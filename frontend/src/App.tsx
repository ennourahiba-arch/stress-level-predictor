import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import StudentDashboard from "./pages/StudentDashboard";
import ProfessorDashboard from "./pages/ProfessorDashboard";
import Join from "./pages/Join";
import TeamGame from "./pages/TeamGame";
import HostRoom from "./pages/HostRoom";
import CoursePage from "./pages/Course";
import LessonPage from "./pages/Lesson";
import LessonPractice from "./pages/LessonPractice";
import MockPage from "./pages/Mock";
import Duel from "./pages/Duel";
import DuelNew from "./pages/DuelNew";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="student" element={<StudentDashboard />} />
        <Route path="professor" element={<ProfessorDashboard />} />
        <Route path="join" element={<Join />} />
        <Route path="join/:code" element={<Join />} />
        <Route path="class/:code" element={<TeamGame />} />
        <Route path="host/:code" element={<HostRoom />} />
        <Route path="course/:courseId" element={<CoursePage />} />
        <Route path="course/:courseId/lesson/:lessonId" element={<LessonPage />} />
        <Route path="course/:courseId/lesson/:lessonId/practice/:format" element={<LessonPractice />} />
        <Route path="course/:courseId/mock" element={<MockPage />} />
        <Route path="duel/new" element={<DuelNew />} />
        <Route path="duel/:code" element={<Duel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
