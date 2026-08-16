"""AllegreVCS MusicXML measure-level diff engine."""

from allegrevcs_diff.diff import diff_scores
from allegrevcs_diff.parser import parse_score

__all__ = ["diff_scores", "parse_score"]
__version__ = "0.1.0"
