"""
models.py — Database Models for Linux Tutor
=============================================
Defines three tables:
  - User           : registered accounts
  - LessonProgress : which lessons each user has completed
  - QuizAttempt    : every quiz submission with its score

Important design decision — total_xp:
  total_xp is stored as a plain Integer column on User AND is always updated
  inside the *same* database transaction as the QuizAttempt insert.
  This keeps the leaderboard query fast (ORDER BY column) while the
  transaction guarantee prevents it from ever drifting out of sync.
"""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

# ── Shared db instance (imported by app.py and all routes) ───────────────────
db = SQLAlchemy()


# ─────────────────────────────────────────────────────────────────────────────
# User
# ─────────────────────────────────────────────────────────────────────────────
class User(UserMixin, db.Model):
    """
    Represents a registered learner (or admin).

    UserMixin supplies the four properties Flask-Login needs:
    is_authenticated, is_active, is_anonymous, get_id().
    """
    __tablename__ = "user"

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80),  unique=True, nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

    # ⚠  is_admin is NEVER accepted from client request bodies.
    #    It is only set via direct DB access or the admin panel by an existing admin.
    is_admin      = db.Column(db.Boolean, default=False, nullable=False)

    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Cached XP total — kept in sync by updating inside the QuizAttempt transaction.
    total_xp      = db.Column(db.Integer, default=0, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    lesson_progress = db.relationship("LessonProgress", backref="user", lazy=True, cascade="all, delete-orphan")
    quiz_attempts   = db.relationship("QuizAttempt",   backref="user", lazy=True, cascade="all, delete-orphan")

    # ── Password helpers ──────────────────────────────────────────────────────
    def set_password(self, plaintext_password: str) -> None:
        """Hash and store the password. Never stores plaintext."""
        self.password_hash = generate_password_hash(plaintext_password)

    def check_password(self, plaintext_password: str) -> bool:
        """Return True if the supplied password matches the stored hash."""
        return check_password_hash(self.password_hash, plaintext_password)

    # ── Serialisation ─────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        """Return a safe dictionary — password_hash is intentionally excluded."""
        return {
            "id":         self.id,
            "username":   self.username,
            "email":      self.email,
            "is_admin":   self.is_admin,
            "total_xp":   self.total_xp,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<User {self.username!r}>"


# ─────────────────────────────────────────────────────────────────────────────
# LessonProgress
# ─────────────────────────────────────────────────────────────────────────────
class LessonProgress(db.Model):
    """
    Tracks which lessons a user has completed.
    One row per (user, lesson) pair — re-completing the same lesson updates
    the existing row rather than inserting a duplicate (handled in routes).
    """
    __tablename__ = "lesson_progress"

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    lesson_id     = db.Column(db.String(50),  nullable=False)   # e.g. "module_1"
    lesson_title  = db.Column(db.String(200), nullable=False)
    completed     = db.Column(db.Boolean, default=False, nullable=False)
    completed_at  = db.Column(db.DateTime, nullable=True)       # Null until first completion

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "lesson_id":    self.lesson_id,
            "lesson_title": self.lesson_title,
            "completed":    self.completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def __repr__(self) -> str:
        return f"<LessonProgress user={self.user_id} lesson={self.lesson_id} done={self.completed}>"


# ─────────────────────────────────────────────────────────────────────────────
# QuizAttempt
# ─────────────────────────────────────────────────────────────────────────────
class QuizAttempt(db.Model):
    """
    Records every quiz submission.

    When a new row is inserted, the route handler also increments
    user.total_xp by attempt.score *inside the same db.session.commit()*.
    """
    __tablename__ = "quiz_attempt"

    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    lesson_id        = db.Column(db.String(50), nullable=False)   # Which module's quiz
    score            = db.Column(db.Integer, nullable=False)
    total_questions  = db.Column(db.Integer, nullable=False)
    correct_answers  = db.Column(db.Integer, nullable=False)
    attempted_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "lesson_id":       self.lesson_id,
            "score":           self.score,
            "total_questions": self.total_questions,
            "correct_answers": self.correct_answers,
            "attempted_at":    self.attempted_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<QuizAttempt user={self.user_id} lesson={self.lesson_id} score={self.score}>"
