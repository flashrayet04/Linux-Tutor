"""
routes/auth.py — Authentication Endpoints
==========================================
Endpoints:
  POST /api/auth/register    — Create a new account
  POST /api/auth/login       — Log in and start a session
  POST /api/auth/logout      — End the session
  GET  /api/auth/me          — Get the current user's profile
  GET  /api/auth/csrf-token  — Return a CSRF token for the frontend to use
"""

import os
import re
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session, current_app
from flask_login import login_user, logout_user, login_required, current_user
from flask_wtf.csrf import generate_csrf
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from models import db, User, _DUMMY_PASSWORD_HASH
from werkzeug.security import check_password_hash

# ── Blueprint setup ───────────────────────────────────────────────────────────
# url_prefix is set in app.py when we register this blueprint
auth_bp = Blueprint("auth", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def _validate_register_input(data: dict) -> str | None:
    """
    Check all required fields for registration.
    Returns an error message string, or None if everything is valid.
    """
    username = data.get("username", "").strip()
    email    = data.get("email",    "").strip()
    password = data.get("password", "")

    if not username or not email or not password:
        return "username, email, and password are all required."

    if not (3 <= len(username) <= 30):
        return "Username must be between 3 and 30 characters."

    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return "Username may only contain letters, numbers, and underscores."

    if not EMAIL_REGEX.match(email):
        return "Please provide a valid email address."

    if len(password) < 8:
        return "Password must be at least 8 characters long."

    return None  # All good


def _json_error(message: str, status_code: int):
    """Return a consistent JSON error response."""
    return jsonify({"error": message}), status_code


# ── Password reset token helpers ──────────────────────────────────────────
# We use a stateless signed token (via itsdangerous) instead of storing a
# reset token in the database. The token itself encodes the user's email
# and an expiry, signed with SECRET_KEY — so it can't be forged, and it
# needs no extra database columns or migrations.
_RESET_SALT = "password-reset"
_RESET_MAX_AGE_SECONDS = 60 * 60  # 1 hour


def _get_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def _send_password_reset_email(to_email: str, reset_url: str) -> None:
    """
    Sends the password reset email via SMTP.

    If MAIL_USERNAME / MAIL_PASSWORD aren't set in the environment yet,
    this safely falls back to printing the reset link to the server logs
    instead of raising an error — handy for local dev and for testing on
    Render before you've configured a real mail account.
    """
    mail_user = os.environ.get("MAIL_USERNAME")
    mail_pass = os.environ.get("MAIL_PASSWORD")
    mail_server = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    mail_port = int(os.environ.get("MAIL_PORT", "587"))

    if not mail_user or not mail_pass:
        current_app.logger.warning(
            f"[DEV] MAIL_USERNAME/MAIL_PASSWORD not set — "
            f"password reset link for {to_email}: {reset_url}"
        )
        return

    body = (
        "Hi there,\n\n"
        "We received a request to reset your Linux Tutor password.\n\n"
        f"Click the link below to choose a new password:\n{reset_url}\n\n"
        "This link expires in 1 hour. If you didn't request this, "
        "you can safely ignore this email — your password won't be changed.\n\n"
        "— Linux Tutor"
    )
    msg = MIMEText(body)
    msg["Subject"] = "Reset your Linux Tutor password"
    msg["From"] = mail_user
    msg["To"] = to_email

    with smtplib.SMTP(mail_server, mail_port, timeout=10) as server:
        server.starttls()
        server.login(mail_user, mail_pass)
        server.send_message(msg)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/auth/csrf-token
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.get("/csrf-token")
def get_csrf_token():
    """
    Returns a CSRF token.
    The frontend should call this once on page load and then include
    the token as a header: X-CSRFToken: <token>
    on every POST / PUT / DELETE request.
    """
    token = generate_csrf()
    return jsonify({"csrf_token": token})


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/register
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/register")
def register():
    """
    Create a new user account.

    Expected JSON body:
      { "username": "alice", "email": "alice@example.com", "password": "secret123" }

    Security notes:
      - is_admin is NEVER read from the request body.
      - Duplicate username/email returns 409, not a raw DB error.
      - Password is hashed before storage.
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    # Validate input
    error = _validate_register_input(data)
    if error:
        return _json_error(error, 400)

    username = data["username"].strip()
    email    = data["email"].strip().lower()
    password = data["password"]

    # Check for duplicates — return 409 Conflict with a helpful message
    if User.query.filter_by(username=username).first():
        return _json_error("That username is already taken.", 409)
    if User.query.filter_by(email=email).first():
        return _json_error("An account with that email already exists.", 409)

    # Create the user
    new_user = User(username=username, email=email)
    new_user.set_password(password)
    # is_admin stays False (the default) — never set from request data

    db.session.add(new_user)
    db.session.commit()

    # Log the new user in immediately
    login_user(new_user)

    return jsonify({
        "message": "Account created successfully!",
        "user": new_user.to_dict()
    }), 201


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/login
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/login")
def login():
    """
    Log in with email + password.

    Expected JSON body:
      { "email": "alice@example.com", "password": "secret123" }

    Rate-limited in app.py (5 attempts / minute / IP) to deter brute-force.
    Returns a generic "Invalid credentials" on failure so we do NOT reveal
    whether the email exists (username enumeration prevention).
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    email    = data.get("email",    "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return _json_error("email and password are required.", 400)

    user = User.query.filter_by(email=email).first()

    # Timing-safe check: always run a password hash comparison, even when
    # the email doesn't exist, so a nonexistent-email request takes the same
    # time as a wrong-password request. Without this, an attacker could
    # measure response times to enumerate which emails are registered,
    # despite the generic error message below.
    if user is not None:
        password_ok = user.check_password(password)
    else:
        check_password_hash(_DUMMY_PASSWORD_HASH, password)
        password_ok = False

    if user is None or not password_ok:
        return _json_error("Invalid email or password.", 401)

    login_user(user, remember=False)
    return jsonify({
        "message": "Logged in successfully.",
        "user": user.to_dict()
    })


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/logout
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/logout")
@login_required
def logout():
    """End the current user's session."""
    logout_user()
    return jsonify({"message": "Logged out successfully."})


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/auth/me
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.get("/me")
@login_required
def me():
    """
    Return the currently logged-in user's profile.
    The frontend can call this on page load to check if the user is still
    logged in (the session cookie is sent automatically by the browser).
    """
    return jsonify({"user": current_user.to_dict()})


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/change-password
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/change-password")
@login_required
def change_password():
    """
    Change the logged-in user's password.

    Expected JSON body:
      { "current_password": "old123", "new_password": "newpass456" }

    Requires the CURRENT password as proof of identity — someone with just
    an open session (e.g. a shared/public computer) can't silently hijack
    the account by changing the password without knowing it.
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    current_password = data.get("current_password", "")
    new_password     = data.get("new_password", "")

    if not current_password or not new_password:
        return _json_error("current_password and new_password are both required.", 400)

    if not current_user.check_password(current_password):
        return _json_error("Current password is incorrect.", 400)

    if len(new_password) < 8:
        return _json_error("New password must be at least 8 characters long.", 400)

    current_user.set_password(new_password)
    db.session.commit()

    return jsonify({"message": "Password changed successfully."})


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/forgot-password
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/forgot-password")
def forgot_password():
    """
    Request a password reset link by email.

    Expected JSON body:
      { "email": "alice@example.com" }

    Always returns the same generic success message, whether or not that
    email is actually registered — this prevents attackers from using this
    endpoint to discover which emails have accounts (enumeration attack).
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    email = data.get("email", "").strip().lower()
    if not email:
        return _json_error("email is required.", 400)

    user = User.query.filter_by(email=email).first()
    if user:
        token = _get_serializer().dumps(email, salt=_RESET_SALT)
        reset_url = f"{request.host_url.rstrip('/')}/?resetToken={token}"
        try:
            _send_password_reset_email(email, reset_url)
        except Exception as e:
            # Don't leak SMTP errors to the client — log server-side instead.
            current_app.logger.error(f"Failed to send password reset email: {e}")

    return jsonify({
        "message": "If that email is registered, a password reset link has been sent."
    })


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/reset-password
# ─────────────────────────────────────────────────────────────────────────────
@auth_bp.post("/reset-password")
def reset_password():
    """
    Complete a password reset using the token from the emailed link.

    Expected JSON body:
      { "token": "...", "new_password": "newpass456" }
    """
    data = request.get_json(silent=True)
    if not data:
        return _json_error("Request body must be JSON.", 400)

    token        = data.get("token", "")
    new_password = data.get("new_password", "")

    if not token or not new_password:
        return _json_error("token and new_password are both required.", 400)

    if len(new_password) < 8:
        return _json_error("New password must be at least 8 characters long.", 400)

    try:
        email = _get_serializer().loads(token, salt=_RESET_SALT, max_age=_RESET_MAX_AGE_SECONDS)
    except SignatureExpired:
        return _json_error("This reset link has expired. Please request a new one.", 400)
    except BadSignature:
        return _json_error("This reset link is invalid.", 400)

    user = User.query.filter_by(email=email).first()
    if not user:
        return _json_error("No account found for this reset link.", 404)

    user.set_password(new_password)
    db.session.commit()

    return jsonify({"message": "Password reset successfully. You can now log in."})
