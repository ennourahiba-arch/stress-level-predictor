"""French and Italian for the Calculus question bank.

The bank's texts come from a small set of fixed templates, so they are translated
here exactly (no machine translation). `tr` raises on anything it doesn't know,
so the pack build fails rather than shipping an untranslated string.
"""
from __future__ import annotations

import re

LANGS = ("fr", "it")

EXACT: dict[str, dict[str, str]] = {
    # topics
    "Derivatives": {"fr": "Dérivées", "it": "Derivate"},
    "The chain rule": {"fr": "La dérivation en chaîne", "it": "La regola della catena"},
    "Critical points": {"fr": "Points critiques", "it": "Punti critici"},
    "Max & min on closed intervals": {"fr": "Max et min sur un intervalle fermé", "it": "Max e min su intervalli chiusi"},
    # prompts
    "Find f′(x). Type your answer in terms of x.": {
        "fr": "Calculez f′(x). Écrivez votre réponse en fonction de x.",
        "it": "Calcola f′(x). Scrivi la risposta in funzione di x."},
    "Find every critical point of f. List the x-values, separated by commas.": {
        "fr": "Trouvez tous les points critiques de f. Donnez les valeurs de x, séparées par des virgules.",
        "it": "Trova tutti i punti critici di f. Elenca i valori di x, separati da virgole."},
    "Find the absolute maximum of f on the interval, and every x where it happens.": {
        "fr": "Trouvez le maximum absolu de f sur l'intervalle, et toutes les valeurs de x où il est atteint.",
        "it": "Trova il massimo assoluto di f sull'intervallo e tutti i valori di x in cui si raggiunge."},
    "Find the absolute minimum of f on the interval, and every x where it happens.": {
        "fr": "Trouvez le minimum absolu de f sur l'intervalle, et toutes les valeurs de x où il est atteint.",
        "it": "Trova il minimo assoluto di f sull'intervallo e tutti i valori di x in cui si raggiunge."},
    # input help
    "Use ^ for powers and * or nothing for multiplication, e.g. 12x^3 - 6x^(-4) or 8(2x+3)^3.": {
        "fr": "Utilisez ^ pour les puissances et * (ou rien) pour la multiplication, par ex. 12x^3 - 6x^(-4) ou 8(2x+3)^3.",
        "it": "Usa ^ per le potenze e * (o niente) per la moltiplicazione, ad es. 12x^3 - 6x^(-4) o 8(2x+3)^3."},
    "Separate values with commas, e.g. -1, 3. Fractions like 2/3 are fine.": {
        "fr": "Séparez les valeurs par des virgules, par ex. -1, 3. Les fractions comme 2/3 sont acceptées.",
        "it": "Separa i valori con virgole, ad es. -1, 3. Le frazioni come 2/3 vanno bene."},
    "Enter the value, then the x-value(s). Separate several x-values with commas.": {
        "fr": "Saisissez la valeur, puis la ou les valeurs de x. Séparez plusieurs valeurs de x par des virgules.",
        "it": "Inserisci il valore, poi il valore o i valori di x. Separa più valori di x con virgole."},
    # hints
    "Rewrite each fraction as a power of x first, e.g. 2/x^3 = 2x^(-3).": {
        "fr": "Réécrivez d'abord chaque fraction comme une puissance de x, par ex. 2/x^3 = 2x^(-3).",
        "it": "Riscrivi prima ogni frazione come potenza di x, ad es. 2/x^3 = 2x^(-3)."},
    "Name the inner function u, differentiate the outside, then multiply by du/dx.": {
        "fr": "Nommez u la fonction intérieure, dérivez la fonction extérieure, puis multipliez par du/dx.",
        "it": "Chiama u la funzione interna, deriva la funzione esterna, poi moltiplica per du/dx."},
    "Solve f′(x) = 0, not f(x) = 0. Factor f′(x) first.": {
        "fr": "Résolvez f′(x) = 0, et non f(x) = 0. Factorisez d'abord f′(x).",
        "it": "Risolvi f′(x) = 0, non f(x) = 0. Prima fattorizza f′(x)."},
    "Factor f′(x) completely. A repeated factor gives one critical point, not two.": {
        "fr": "Factorisez complètement f′(x). Un facteur répété donne un seul point critique, pas deux.",
        "it": "Fattorizza completamente f′(x). Un fattore ripetuto dà un solo punto critico, non due."},
    "Factor f′(x) completely, including any power of x.": {
        "fr": "Factorisez complètement f′(x), y compris les puissances de x.",
        "it": "Fattorizza completamente f′(x), comprese le potenze di x."},
    "Candidates are the critical points inside the interval and both endpoints. Evaluate f at all of them.": {
        "fr": "Les candidats sont les points critiques dans l'intervalle et les deux bornes. Évaluez f en chacun d'eux.",
        "it": "I candidati sono i punti critici interni all'intervallo e i due estremi. Valuta f in ciascuno."},
    "Candidates are the critical points inside the interval and both endpoints. Evaluate f at all of them. Two candidates can tie.": {
        "fr": "Les candidats sont les points critiques dans l'intervalle et les deux bornes. Évaluez f en chacun d'eux. Deux candidats peuvent être à égalité.",
        "it": "I candidati sono i punti critici interni all'intervallo e i due estremi. Valuta f in ciascuno. Due candidati possono essere a pari merito."},
    # multiple-choice prompts
    "Which of these is f′(x)?": {"fr": "Laquelle de ces expressions est f′(x) ?", "it": "Quale di queste è f′(x)?"},
    "Which list gives all the critical points of f?": {"fr": "Quelle liste donne tous les points critiques de f ?", "it": "Quale elenco contiene tutti i punti critici di f?"},
    "What is the absolute maximum of f on the interval, and where?": {
        "fr": "Quel est le maximum absolu de f sur l'intervalle, et où est-il atteint ?",
        "it": "Qual è il massimo assoluto di f sull'intervallo, e dove si raggiunge?"},
    "What is the absolute minimum of f on the interval, and where?": {
        "fr": "Quel est le minimum absolu de f sur l'intervalle, et où est-il atteint ?",
        "it": "Qual è il minimo assoluto di f sull'intervallo, e dove si raggiunge?"},
    # mistake labels on wrong options
    "Forgot to multiply by the inner function's derivative": {"fr": "A oublié de multiplier par la dérivée de la fonction intérieure", "it": "Ha dimenticato di moltiplicare per la derivata della funzione interna"},
    "Multiplied by the inner function instead of its derivative": {"fr": "A multiplié par la fonction intérieure au lieu de sa dérivée", "it": "Ha moltiplicato per la funzione interna invece che per la sua derivata"},
    "Didn't differentiate the outer function": {"fr": "N'a pas dérivé la fonction extérieure", "it": "Non ha derivato la funzione esterna"},
    "Power rule: forgot to lower the exponent": {"fr": "Règle de la puissance : a oublié de diminuer l'exposant", "it": "Regola della potenza: non ha abbassato l'esponente"},
    "Power rule applied incorrectly to a negative exponent": {"fr": "Règle de la puissance mal appliquée à un exposant négatif", "it": "Regola della potenza applicata male a un esponente negativo"},
    "Sign error in one term": {"fr": "Erreur de signe dans un terme", "it": "Errore di segno in un termine"},
    "Arithmetic error with the coefficients": {"fr": "Erreur de calcul sur les coefficients", "it": "Errore di calcolo con i coefficienti"},
    "Solved f(x) = 0 instead of f′(x) = 0": {"fr": "A résolu f(x) = 0 au lieu de f′(x) = 0", "it": "Ha risolto f(x) = 0 invece di f′(x) = 0"},
    "Sign error when solving f′(x) = 0": {"fr": "Erreur de signe en résolvant f′(x) = 0", "it": "Errore di segno nel risolvere f′(x) = 0"},
    "Missed one of the solutions": {"fr": "A oublié une des solutions", "it": "Ha perso una delle soluzioni"},
    "Included a value where f′(x) ≠ 0": {"fr": "A inclus une valeur où f′(x) ≠ 0", "it": "Ha incluso un valore in cui f′(x) ≠ 0"},
    "Factoring error": {"fr": "Erreur de factorisation", "it": "Errore di fattorizzazione"},
    "Forgot to evaluate the interval endpoints": {"fr": "A oublié d'évaluer les bornes de l'intervalle", "it": "Ha dimenticato di valutare gli estremi dell'intervallo"},
    "Found the minimum instead": {"fr": "A trouvé le minimum à la place", "it": "Ha trovato invece il minimo"},
    "Found the maximum instead": {"fr": "A trouvé le maximum à la place", "it": "Ha trovato invece il massimo"},
    "Right value, wrong location": {"fr": "Bonne valeur, mauvais point", "it": "Valore giusto, punto sbagliato"},
    "Used a critical point outside the interval": {"fr": "A utilisé un point critique hors de l'intervalle", "it": "Ha usato un punto critico fuori dall'intervallo"},
    "Arithmetic error when evaluating f": {"fr": "Erreur de calcul en évaluant f", "it": "Errore di calcolo nel valutare f"},
    # worked-solution steps
    "Answer.": {"fr": "Réponse.", "it": "Risposta."},
    "Compare.": {"fr": "Comparer.", "it": "Confronta."},
    "Differentiate.": {"fr": "Dériver.", "it": "Deriva."},
    "Rewrite as powers of x.": {"fr": "Réécrire avec des puissances de x.", "it": "Riscrivi come potenze di x."},
    "Power rule on each term.": {"fr": "Règle de la puissance sur chaque terme.", "it": "Regola della potenza su ogni termine."},
    "Power rule; the constant differentiates to 0.": {"fr": "Règle de la puissance ; la dérivée de la constante est 0.", "it": "Regola della potenza; la costante ha derivata 0."},
    "Set f′(x) = 0 and solve.": {"fr": "Poser f′(x) = 0 et résoudre.", "it": "Poni f′(x) = 0 e risolvi."},
    "Evaluate at the critical points and both endpoints.": {"fr": "Évaluer aux points critiques et aux deux bornes.", "it": "Valuta nei punti critici e nei due estremi."},
}

PATTERNS: list[tuple[re.Pattern[str], dict[str, str]]] = [
    (re.compile(r"Critical points inside \[(.+)\]\."), {"fr": r"Points critiques dans [\1].", "it": r"Punti critici interni a [\1]."}),
    (re.compile(r"Outer (\S+), inner u = (.+)\."), {"fr": r"Extérieure \1, intérieure u = \2.", "it": r"Esterna \1, interna u = \2."}),
    (re.compile(r"Power rule; the constant (\S+) differentiates to 0\."),
     {"fr": r"Règle de la puissance ; la dérivée de la constante \1 est 0.", "it": r"Regola della potenza; la costante \1 ha derivata 0."}),
]

# Words that appear inside formulas, e.g. \text{absolute maximum } = 18 \text{ at } x = 3
LATEX_WORDS: dict[str, dict[str, str]] = {
    r"\text{absolute maximum }": {"fr": r"\text{maximum absolu }", "it": r"\text{massimo assoluto }"},
    r"\text{absolute minimum }": {"fr": r"\text{minimum absolu }", "it": r"\text{minimo assoluto }"},
    r"\text{ at }": {"fr": r"\text{ en }", "it": r"\text{ in }"},
    r"\text{none}": {"fr": r"\text{aucun}", "it": r"\text{nessuno}"},
}


def tr(text: str, lang: str) -> str:
    """Exact translation of a bank string. Raises KeyError if unknown."""
    if text in EXACT:
        return EXACT[text][lang]
    for pat, out in PATTERNS:
        if pat.fullmatch(text):
            return pat.sub(out[lang], text)
    raise KeyError(f"no {lang} translation for: {text!r}")


def tr_latex(tex: str, lang: str) -> str:
    for en, out in LATEX_WORDS.items():
        tex = tex.replace(en, out[lang])
    if r"\text{" in tex and any(w in tex for w in ("absolute", " at ", "none")):
        raise KeyError(f"untranslated words in formula: {tex!r}")
    return tex


def localize_exercise(e: dict) -> dict:
    """Per-language overrides for every human-language field of an exercise."""
    out = {}
    for lang in LANGS:
        m = e["mcq"]
        out[lang] = {
            "prompt": tr(e["prompt"], lang),
            "input_help": tr(e["input_help"], lang),
            "hint": tr(e["hint"], lang),
            "answer_latex": tr_latex(e["answer_latex"], lang),
            "solution": [{"text": tr(s["text"], lang), "latex": tr_latex(s.get("latex", ""), lang)} for s in e["solution"]],
            "mcq": {"prompt": tr(m["prompt"], lang), "options": [tr_latex(o, lang) for o in m["options"]],
                    "labels": [tr(l, lang) if l else None for l in m["labels"]]},
        }
    return out
