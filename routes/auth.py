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

import re
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from flask_wtf.csrf import generate_csrf

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
