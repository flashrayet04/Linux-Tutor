"""
routes/quiz.py — Quiz Submission Endpoints
==========================================
Endpoints:
  POST /api/quiz/submit   — Submit a quiz result and earn XP
  GET  /api/quiz/history  — List all of the current user's past quiz attempts
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db, QuizAttempt, User

quiz_bp = Blueprint("quiz", __name__)


def _json_error(message: str, status_code: int):
    """Return a consistent JSON error response."""
    return jsonify({"error": message}), status_code


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/quiz/submit
# ─────────────────────────────────────────────────────────────────────────────
@quiz_bp.post("/submit")
@login_required
def submit_quiz():
    """
    Record a completed quiz attempt and award XP.

    Expected JSON body:
      {
        "lesson_id":       "module_2",
        "score":           80,
        "total_questions": 10,
        "correct_answers": 8
      }

    ── total_xp integrity ──────────────────────────────────────────────────────
    The QuizAttempt row AND the User.total_xp increment are committed inside a
    single db.session.commit() call.  If the commit fails for any reason, both
    changes are rolled back together — so the XP column can never drift from
    the actual sum of attempts.
    ──────────────────────────────────────────────────────────────────────────
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    lesson_id       = data.get("lesson_id", "").strip()
    score           = data.get("score")
    total_questions = data.get("total_questions")
    correct_answers = data.get("correct_answers")

    # ── Input validation ───────────────────────────────────────────────────
    if not lesson_id:
        return _json_error("lesson_id is required.", 400)

    for field_name, value in [("score", score), ("total_questions", total_questions), ("correct_answers", correct_answers)]:
        if value is None:
            return _json_error(f"'{field_name}' is required.", 400)
        if not isinstance(value, int) or value < 0:
            return _json_error(f"'{field_name}' must be a non-negative integer.", 400)

    if total_questions == 0:
        return _json_error("total_questions must be greater than 0.", 400)

    if correct_answers > total_questions:
        return _json_error("correct_answers cannot exceed total_questions.", 400)

    if score > total_questions * 10:
        # Basic sanity check — score shouldn't exceed 10 points per question
        return _json_error("Score value is unexpectedly large.", 400)

    # ── Create the attempt and update XP in ONE transaction ───────────────
    attempt = QuizAttempt(
        user_id          = current_user.id,
        lesson_id        = lesson_id,
        score            = score,
        total_questions  = total_questions,
        correct_answers  = correct_answers,
        attempted_at     = datetime.now(timezone.utc),
    )
    db.session.add(attempt)

    # Fetch the User row again inside this session so SQLAlchemy tracks the
    # change, then increment total_xp in the same commit.
    user = db.session.get(User, current_user.id)
    user.total_xp += score

    # Single commit — both the attempt row and the XP update go together.
    db.session.commit()

    return jsonify({
        "message":  f"Quiz submitted! You earned {score} XP.",
        "attempt":  attempt.to_dict(),
        "total_xp": user.total_xp,
    }), 201


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/quiz/history
# ─────────────────────────────────────────────────────────────────────────────
@quiz_bp.get("/history")
@login_required
def quiz_history():
    """
    Return all past quiz attempts for the logged-in user,
    most recent first.
    """
    attempts = (
        QuizAttempt.query
        .filter_by(user_id=current_user.id)
        .order_by(QuizAttempt.attempted_at.desc())
        .all()
    )
    return jsonify({"history": [a.to_dict() for a in attempts]})
