import { Link } from "react-router-dom";
import { BadgeCheck, GraduationCap, ListChecks, MessagesSquare, PenLine, Presentation } from "lucide-react";
import DemoCard from "../components/DemoCard";
import { useT } from "../i18n";

/** Lists whose text is translated where shown (exported so the translation test can check them). */
export const STEPS = [
  ["Rate your confidence", "Before you start, say how ready you feel. Later you'll see how that compares with your results."],
  ["Answer five questions", "In your exam's format. Hints unlock as you try, and every answer ends with a worked solution."],
  ["See what to work on", "A readiness score, the mistake you keep making, and what to practice next."],
];

export const FORMATS = [
  { icon: ListChecks, title: "Graded instantly", text: "Multiple choice, multiple response, true or false, fill in the blanks and matching. Wrong options are the mistakes students really make." },
  { icon: PenLine, title: "Written answers", text: "Short answers, long answers and worked problems, marked point by point against your course." },
  { icon: MessagesSquare, title: "Oral exam", text: "An examiner asks you questions in a chat, follows up when you're vague, and won't hand you the answer. Answer by typing or speaking." },
];

export default function Landing() {
  const { t } = useT();
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center [&>*]:min-w-0">
        <div>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.02] sm:text-6xl">{t("Practice in the format of your real exam.")}</h1>
          <p className="mt-5 max-w-[34rem] text-lg text-navy-soft">
            {t("Upload your course and past exams. Rehearsal writes practice questions in the same style, grades your answers, and shows you how ready you are, for any subject.")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/student" className="btn-primary"><GraduationCap size={18} aria-hidden /> {t("I'm a student")}</Link>
            <Link to="/professor" className="btn-ghost"><Presentation size={18} aria-hidden /> {t("I'm a professor")}</Link>
          </div>
          <p className="mt-5 text-navy-mute">{t("Try a real question now, no sign-up needed.")}</p>
        </div>
        <div>
          <DemoCard />
          <p className="mt-3 text-[15px] text-navy-soft">
            {t("Want this for your own course?")}{" "}
            <Link to="/student" className="font-bold text-violet-ink underline decoration-2 underline-offset-4 hover:text-navy">{t("Upload your notes")}</Link>
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">{t("How a practice session works")}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map(([title, desc], i) => (
              <li key={title} className="flex gap-4">
                <span className="font-display text-4xl font-extrabold text-coral">{i + 1}</span>
                <div><h3 className="text-xl font-bold">{t(title)}</h3><p className="mt-1 text-navy-soft">{t(desc)}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">{t("Eight exam formats")}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {FORMATS.map((f) => (
            <div key={f.title}>
              <f.icon size={22} className="text-violet-ink" aria-hidden />
              <h3 className="mt-2 text-xl font-bold">{t(f.title)}</h3>
              <p className="mt-1 text-navy-soft">{t(f.text)}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">{t("On your own")}</h2>
            <p className="mt-2 text-navy-soft">{t("Short sessions, at your pace. Progress stays on your device, and practice works offline once the questions are saved.")}</p>
            <Link to="/student" className="mt-4 inline-block font-bold text-violet-ink underline decoration-2 underline-offset-4">{t("Start practicing")}</Link>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t("In class")}</h2>
            <p className="mt-2 text-navy-soft">{t("A live quiz in the middle of a lecture. Teams answer on one phone each, and after every question the professor sees what the room got wrong, and why.")}</p>
            <Link to="/professor" className="mt-4 inline-block font-bold text-violet-ink underline decoration-2 underline-offset-4">{t("Run a class quiz")}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex gap-4 rounded-xl bg-navy p-6 text-white sm:p-8">
          <BadgeCheck className="mt-1 shrink-0 text-teal" size={26} aria-hidden />
          <div>
            <h2 className="text-2xl font-bold text-white">{t("Questions you can trust")}</h2>
            <p className="mt-2 max-w-[44rem] text-white/80">
              {t("Calculus questions are verified with SymPy, a symbolic maths library, and typed answers are checked exactly. Questions from your own course quote it word for word, are reviewed by a second, independent AI, and professors approve them before class.")}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
