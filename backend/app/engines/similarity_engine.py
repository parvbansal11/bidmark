"""
Similarity Engine — TF-IDF / cosine similarity over normalized document text,
blended with a lightweight structural similarity signal. Used by the Document
DNA / Fingerprinting module (USP 2) to compare evidence across bidders.
"""
from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _structural_similarity(struct_a: dict, struct_b: dict) -> float:
    if not struct_a or not struct_b:
        return 0.0
    keys = set(struct_a) | set(struct_b)
    matches = 0
    total = 0
    for k in keys:
        va, vb = struct_a.get(k), struct_b.get(k)
        if va is None and vb is None:
            continue
        total += 1
        if va == vb:
            matches += 1
        elif isinstance(va, (int, float)) and isinstance(vb, (int, float)) and max(va, vb, 1) > 0:
            ratio = min(va, vb) / max(va, vb, 1)
            matches += ratio
    return matches / total if total else 0.0


def compute_similarity(text_a: str, text_b: str, struct_a: dict | None = None, struct_b: dict | None = None) -> dict:
    text_a = text_a or ""
    text_b = text_b or ""
    text_score = 0.0
    common_sections: list[str] = []

    if text_a.strip() and text_b.strip():
        try:
            vectorizer = TfidfVectorizer(stop_words="english")
            matrix = vectorizer.fit_transform([text_a, text_b])
            text_score = float(cosine_similarity(matrix[0], matrix[1])[0][0])
            feature_names = vectorizer.get_feature_names_out()
            a_terms = set(vectorizer.build_analyzer()(text_a))
            b_terms = set(vectorizer.build_analyzer()(text_b))
            common_sections = sorted(list(a_terms & b_terms))[:15]
        except ValueError:
            text_score = 1.0 if text_a.strip() == text_b.strip() else 0.0

    struct_score = _structural_similarity(struct_a or {}, struct_b or {})
    combined = round(0.75 * text_score + 0.25 * struct_score, 4)

    if combined >= 0.85:
        level = "HIGH"
    elif combined >= 0.60:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "similarity_score": combined,
        "level": level,
        "common_sections": common_sections,
        "requires_review": level in ("HIGH", "MEDIUM"),
    }
