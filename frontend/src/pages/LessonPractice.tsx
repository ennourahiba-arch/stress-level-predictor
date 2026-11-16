import { useParams } from "react-router-dom";
import { ErrorState, Loading } from "../components/States";
import type { Format } from "../lib/types";
import { CourseMissing } from "./Course";
import { useLesson } from "./Lesson";
import Oral from "./Oral";
import { PracticeLesson } from "./Practice";

export default function LessonPractice() {
  const format = useParams().format as Format;
  const { course, lesson } = useLesson();
  if (course === undefined) return <Loading />;
  if (!course) return <CourseMissing />;
  if (!lesson || !lesson.banks[format]) return <ErrorState message="There are no questions in this format for this lesson yet." />;
  return format === "oral" ? <Oral course={course} lesson={lesson} /> : <PracticeLesson course={course} lesson={lesson} format={format} />;
}
