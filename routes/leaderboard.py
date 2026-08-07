"""
routes/leaderboard.py — Leaderboard Endpoint
=============================================
Endpoints:
  GET /api/leaderboard/  — Top 10 users ranked by total XP
"""

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from models import User

leaderboard_bp = Blueprint("leaderboard", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/leaderboard/
# ─────────────────────────────────────────────────────────────────────────────
@leaderboard_bp.get("/")
@login_required
def get_leaderboard():
    """
    Return the top 10 users ordered by total_xp (highest first).

    Only public-safe fields are returned — no emails or password hashes.
    Rank is added as a convenience field (1-indexed position in the list).
    is_me lets the frontend highlight the current user's row.
    """
    top_users = (
        User.query
        .order_by(User.total_xp.desc())
        .limit(10)
        .all()
    )

    leaderboard = []
    for rank, user in enumerate(top_users, start=1):
        leaderboard.append({
            "rank":     rank,
            "username": user.username,
            "total_xp": user.total_xp,
            # True if this row belongs to the person making the request
            "is_me":    user.id == current_user.id,
        })

    return jsonify({"leaderboard": leaderboard})
