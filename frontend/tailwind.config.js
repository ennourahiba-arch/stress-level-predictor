/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see src/index.css) so light and dark themes switch together.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("surface"),
        navy: { DEFAULT: v("ink"), soft: v("ink-soft"), mute: v("ink-mute") },
        violet: { DEFAULT: v("violet"), ink: v("violet-ink"), wash: v("violet-wash") },
        teal: { DEFAULT: v("teal"), ink: v("teal-ink"), wash: v("teal-wash") },
        coral: { DEFAULT: v("coral"), ink: v("coral-ink"), wash: v("coral-wash") },
        paper: v("paper"),
        line: v("line"),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ['"Atkinson Hyperlegible"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { sheet: "6px" },
    },
  },
  plugins: [],
};
