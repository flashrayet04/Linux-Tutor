"""
routes/progress.py — Lesson Progress Endpoints
===============================================
Endpoints:
  GET  /api/progress/lessons  — List all of the current user's lesson progress
  POST /api/progress/lessons  — Mark a lesson as completed (upsert)
  GET  /api/progress/stats    — Summary stats (XP, lessons done, quizzes done)
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db, LessonProgress, QuizAttempt

progress_bp = Blueprint("progress", __name__)


def _json_error(message: str, status_code: int):
    """Return a consistent JSON error response."""
    return jsonify({"error": message}), status_code


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/progress/lessons
# ─────────────────────────────────────────────────────────────────────────────
@progress_bp.get("/lessons")
@login_required
def get_lessons():
    """
    Return all lesson progress records for the logged-in user,
    ordered by lesson_id for a consistent display.
    """
    records = (
        LessonProgress.query
        .filter_by(user_id=current_user.id)
        .order_by(LessonProgress.lesson_id)
        .all()
    )
    return jsonify({"lessons": [r.to_dict() for r in records]})


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/progress/lessons
# ─────────────────────────────────────────────────────────────────────────────
@progress_bp.post("/lessons")
@login_required
def mark_lesson_complete():
    """
    Mark a lesson as completed for the current user.

    Expected JSON body:
      { "lesson_id": "module_1", "lesson_title": "Navigation (pwd, ls, cd)" }

    This is an upsert — if the lesson was already recorded, it updates the
    existing row instead of creating a duplicate.
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    lesson_id    = data.get("lesson_id",    "").strip()
    lesson_title = data.get("lesson_title", "").strip()

    if not lesson_id or not lesson_title:
        return _json_error("lesson_id and lesson_title are required.", 400)

    # Upsert: look for an existing record for this user + lesson
    record = LessonProgress.query.filter_by(
        user_id=current_user.id,
        lesson_id=lesson_id
    ).first()

    if record:
        # Already exists — just update it
        record.completed    = True
        record.lesson_title = lesson_title  # In case the title was updated
        record.completed_at = datetime.now(timezone.utc)
    else:
        # First time seeing this lesson — create a new record
        record = LessonProgress(
            user_id      = current_user.id,
            lesson_id    = lesson_id,
            lesson_title = lesson_title,
            completed    = True,
            completed_at = datetime.now(timezone.utc),
        )
        db.session.add(record)

    db.session.commit()
    return jsonify({
        "message": f"Lesson '{lesson_title}' marked as complete!",
        "lesson":  record.to_dict()
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/progress/stats
# ─────────────────────────────────────────────────────────────────────────────
@progress_bp.get("/stats")
@login_required
def get_stats():
    """
    Return a summary of the user's progress:
      - total_xp       : accumulated quiz score (from User.total_xp)
      - lessons_done   : number of lessons marked completed
      - quizzes_done   : number of quiz attempts submitted
    """
    lessons_done = (
        LessonProgress.query
        .filter_by(user_id=current_user.id, completed=True)
        .count()
    )
    quizzes_done = (
        QuizAttempt.query
        .filter_by(user_id=current_user.id)
        .count()
    )

    return jsonify({
        "stats": {
            "username":     current_user.username,
            "total_xp":     current_user.total_xp,
            "lessons_done": lessons_done,
            "quizzes_done": quizzes_done,
        }
    })
