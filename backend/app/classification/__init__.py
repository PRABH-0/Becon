"""Event classification, normalization, tagging, and severity module for Becon."""

from app.classification.category import classify_event_category
from app.classification.normalizer import normalize_event_title
from app.classification.severity import calculate_severity_score
from app.classification.tagger import match_event_topics, populate_event_topics

__all__ = [
    "normalize_event_title",
    "classify_event_category",
    "calculate_severity_score",
    "match_event_topics",
    "populate_event_topics",
]
