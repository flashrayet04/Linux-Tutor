"""
admin_views.py — Flask-Admin Panel Configuration
=================================================
Sets up the /admin web UI with three model views:
  - UserAdmin          : manage user accounts
  - LessonProgressAdmin: view lesson completion records
  - QuizAttemptAdmin   : view quiz submission records

Security:
  Every view overrides `is_accessible()` to check that the visitor is:
    1. Logged in (is_authenticated)
    2. An admin (is_admin == True)
  Unauthorized visitors are redirected to /api/auth/login — never shown
  a stack trace or a blank 403 page.
"""

from flask import redirect, url_for
from flask_admin import Admin, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user

from models import db, User, LessonProgress, QuizAttempt


# ─────────────────────────────────────────────────────────────────────────────
# Secure base class — all our admin views inherit from this
# ─────────────────────────────────────────────────────────────────────────────
class SecureModelView(ModelView):
    """
    Adds admin-only access control to every ModelView that extends this class.

    is_accessible() is called by Flask-Admin before rendering any page.
    inaccessible_callback() determines where to send non-admin visitors.
    """

    def is_accessible(self) -> bool:
        """Return True only for authenticated admin users."""
        return current_user.is_authenticated and current_user.is_admin

    def inaccessible_callback(self, name, **kwargs):
        """
        Redirect non-admin visitors to the login page.
        This replaces the default behaviour of returning a blank 403 response.
        """
        return redirect(url_for("auth.login"))


# ─────────────────────────────────────────────────────────────────────────────
# Custom Admin Index — replaces the default home page
# ─────────────────────────────────────────────────────────────────────────────
class SecureAdminIndexView(AdminIndexView):
    """Protect the /admin home page with the same access check."""

    @expose("/")
    def index(self):
        if not (current_user.is_authenticated and current_user.is_admin):
            return redirect(url_for("auth.login"))
        return super().index()


# ─────────────────────────────────────────────────────────────────────────────
# User admin view
# ─────────────────────────────────────────────────────────────────────────────
class UserAdmin(SecureModelView):
    """
    Manage user accounts.

    - password_hash is hidden so it never appears in the UI.
    - is_admin CAN be toggled here by an existing admin (the only safe way).
    - Users can be searched by username or email.
    """
    column_list          = ("id", "username", "email", "is_admin", "total_xp", "created_at")
    column_searchable_list = ("username", "email")
    column_filters       = ("is_admin",)
    column_sortable_list = ("id", "username", "total_xp", "created_at")
    form_excluded_columns = ("password_hash", "lesson_progress", "quiz_attempts")

    # Prevent the admin from accidentally creating a user without a hashed password
    # via the UI (they'd need to use the /register endpoint instead).
    can_create = False


# ─────────────────────────────────────────────────────────────────────────────
# LessonProgress admin view
# ─────────────────────────────────────────────────────────────────────────────
class LessonProgressAdmin(SecureModelView):
    """Read-only view of lesson completion records."""
    column_list          = ("id", "user_id", "lesson_id", "lesson_title", "completed", "completed_at")
    column_searchable_list = ("lesson_id", "lesson_title")
    column_filters       = ("completed",)
    column_sortable_list = ("id", "user_id", "lesson_id", "completed_at")
    can_create           = False
    can_edit             = False
    can_delete           = True   # Allow removing broken/test records


# ─────────────────────────────────────────────────────────────────────────────
# QuizAttempt admin view
# ─────────────────────────────────────────────────────────────────────────────
class QuizAttemptAdmin(SecureModelView):
    """Read-only view of quiz submission records."""
    column_list          = ("id", "user_id", "lesson_id", "score", "total_questions", "correct_answers", "attempted_at")
    column_searchable_list = ("lesson_id",)
    column_sortable_list = ("id", "user_id", "score", "attempted_at")
    can_create           = False
    can_edit             = False
    can_delete           = True


# ─────────────────────────────────────────────────────────────────────────────
# Factory function — called once from app.py
# ─────────────────────────────────────────────────────────────────────────────
def create_admin(app) -> Admin:
    """
    Create and configure the Flask-Admin instance.
    Called from app.py after the db and login_manager are initialised.
    """
    admin = Admin(
        app,
        name="Linux Tutor Admin",
        template_mode="bootstrap4",      # Modern Bootstrap 4 styling
        index_view=SecureAdminIndexView(),
    )

    admin.add_view(UserAdmin(User,           db.session, name="Users"))
    admin.add_view(LessonProgressAdmin(LessonProgress, db.session, name="Lesson Progress"))
    admin.add_view(QuizAttemptAdmin(QuizAttempt,       db.session, name="Quiz Attempts"))

    return admin
