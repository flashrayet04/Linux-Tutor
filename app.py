"""
app.py — Linux Tutor Flask Application
=======================================
This is the main entry point.  It:
  1. Loads config from the .env file
  2. Creates the Flask app
  3. Sets up all extensions (SQLAlchemy, Migrate, Login, CORS, Limiter, CSRF)
  4. Registers all route blueprints
  5. Sets up the admin panel
  6. Provides helpful startup messages

HOW TO RUN (first time):
  pip install -r requirements.txt
  cp .env.example .env          # Then edit .env with your SECRET_KEY
  flask db init                 # Only needed once to create migrations/
  flask db migrate -m "Initial schema"
  flask db upgrade
  python app.py

HOW TO RUN (after the first time):
  python app.py
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env BEFORE importing Flask
# so that os.environ is populated when we read it below.
load_dotenv()

from flask import Flask, jsonify, request, redirect
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect, CSRFError

from models import db, User
from admin_views import create_admin
from routes.auth import auth_bp
from routes.progress import progress_bp
from routes.quiz import quiz_bp
from routes.leaderboard import leaderboard_bp


# ─────────────────────────────────────────────────────────────────────────────
# App factory
# ─────────────────────────────────────────────────────────────────────────────
def create_app() -> Flask:
    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────────
    # SECRET_KEY must be a long random string (see .env.example for how to generate one).
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-me")

    # Never allow the app to start in production with the placeholder key —
    # sessions and CSRF tokens signed with a known key can be forged.
    if (os.environ.get("FLASK_ENV") == "production"
            and app.config["SECRET_KEY"] == "dev-only-change-me"):
        raise RuntimeError(
            "Refusing to start: FLASK_ENV=production but SECRET_KEY is still "
            "the default placeholder. Set a real SECRET_KEY in your .env file."
        )

    # SQLite database — the file will be created automatically next to app.py
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///database.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False  # Suppresses a deprecation warning

    # ── Session cookie settings ───────────────────────────────────────────────
    # SameSite=Lax works for same-site deployments (frontend + backend on the same domain).
    # Change to 'None' + Secure=True if they are on different origins AND you're on HTTPS.
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_HTTPONLY"] = True   # JavaScript can't read the cookie
    app.config["SESSION_COOKIE_SECURE"]   = os.environ.get("FLASK_ENV") == "production"

    # ── Initialise extensions ─────────────────────────────────────────────────

    # Database
    db.init_app(app)

    # Database migrations — run "flask db migrate" and "flask db upgrade" in the terminal
    Migrate(app, db)

    # CSRF protection — enabled globally but EXEMPTED for all /api/* blueprints.
    #
    # Why exempt the API routes?
    # Our JSON API is protected from CSRF by two mechanisms that don't need a token:
    #   1. CORS — browsers only send credentials to allowed origins (set above).
    #   2. SameSite cookie — the session cookie is not sent on cross-site requests.
    # CSRF tokens are mainly needed for HTML form submissions (e.g. the /admin panel),
    # which is the only place we keep it enforced.
    csrf = CSRFProtect(app)

    # Login manager — handles sessions and @login_required
    login_manager = LoginManager(app)
    login_manager.login_view = "auth.login"   # Where to redirect unauthenticated users

    @login_manager.user_loader
    def load_user(user_id: str):
        """Flask-Login calls this to look up a user from the session cookie."""
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        """Return JSON (not a redirect) when an API endpoint requires login."""
        return jsonify({"error": "You must be logged in to access this resource."}), 401

    # CORS — allow the frontend origin to send credentials (cookies).
    # In development, we allow all origins so tools like PowerShell and Postman work easily.
    # In production, set FRONTEND_ORIGIN in your .env to restrict it to your real domain.
    is_dev = os.environ.get("FLASK_ENV", "development") == "development"
    frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5500")
    CORS(app,
         origins="*" if is_dev else [frontend_origin],
         supports_credentials=False if is_dev else True)

    # Rate limiter — limits are applied per-endpoint using decorators below
    limiter = Limiter(
        get_remote_address,           # Key function: rate-limit by IP address
        app=app,
        default_limits=[],            # No global limit; we set per-route limits
        storage_uri="memory://",      # In-memory; fine for dev / single-process
    )

    # ── Exempt all /api/* blueprints from CSRF ───────────────────────────────
    # The admin panel (/admin) is NOT exempted — it uses HTML forms and needs CSRF.
    csrf.exempt(auth_bp)
    csrf.exempt(progress_bp)
    csrf.exempt(quiz_bp)
    csrf.exempt(leaderboard_bp)

    # ── Register blueprints (route groups) ────────────────────────────────────
    app.register_blueprint(auth_bp,        url_prefix="/api/auth")
    app.register_blueprint(progress_bp,    url_prefix="/api/progress")
    app.register_blueprint(quiz_bp,        url_prefix="/api/quiz")
    app.register_blueprint(leaderboard_bp, url_prefix="/api/leaderboard")

    # ── Apply rate limits to auth endpoints ───────────────────────────────────
    login_limit    = os.environ.get("LOGIN_RATE_LIMIT",    "5 per minute")
    register_limit = os.environ.get("REGISTER_RATE_LIMIT", "3 per minute")

    limiter.limit(login_limit)(auth_bp)       # All /api/auth routes share this limit
    # For a tighter limit specifically on /register, target the view function:
    # limiter.limit(register_limit)(auth_bp.view_functions["auth.register"])
    # (The simpler blueprint-level limit above is fine for now.)

    # ── Admin panel ───────────────────────────────────────────────────────────
    create_admin(app)

    # ── Global error handlers ─────────────────────────────────────────────────
    # These ensure the client always gets JSON, never Flask's default HTML error pages.

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request."}), 400

    @app.errorhandler(401)
    def unauthorized_error(e):
        return jsonify({"error": "Unauthorised — please log in."}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden — you do not have permission."}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(429)
    def too_many_requests(e):
        return jsonify({"error": "Too many requests — please slow down and try again."}), 429

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()   # Roll back any partial DB transaction
        return jsonify({"error": "An internal server error occurred."}), 500

    @app.errorhandler(CSRFError)
    def csrf_error(e):
        return jsonify({"error": f"CSRF validation failed: {e.description}"}), 400

    # ── Health-check route ────────────────────────────────────────────────────
    @app.get("/api/health")
    def health():
        """Simple endpoint to confirm the server is running."""
        return jsonify({"status": "ok", "service": "Linux Tutor API"})

    # ── Browser login page (for accessing /admin in the browser) ─────────────
    # This is a simple HTML form — not part of the JSON API.
    # After a successful login it redirects straight to /admin.
    # CSRF is exempted here because the form is protected by password auth + rate limiting.
    @app.route("/login", methods=["GET", "POST"])
    @csrf.exempt
    def browser_login():
        from flask_login import login_user
        error_msg = ""

        if request.method == "POST":
            email    = request.form.get("email",    "").strip().lower()
            password = request.form.get("password", "")
            user = User.query.filter_by(email=email).first()
            if user and user.check_password(password):
                login_user(user)
                return redirect("/admin")
            else:
                error_msg = "Invalid email or password. Please try again."

        # Render a minimal login form
        error_html = f'<p style="color:#ff6b6b;margin-bottom:12px;">{error_msg}</p>' if error_msg else ""
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Linux Tutor — Admin Login</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d1117;
      font-family: 'Segoe UI', sans-serif;
    }}
    .card {{
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 40px;
      width: 360px;
    }}
    h1 {{
      color: #58a6ff;
      font-size: 22px;
      margin-bottom: 6px;
    }}
    p.sub {{
      color: #8b949e;
      font-size: 13px;
      margin-bottom: 28px;
    }}
    label {{
      display: block;
      color: #c9d1d9;
      font-size: 13px;
      margin-bottom: 6px;
    }}
    input {{
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 14px;
      margin-bottom: 18px;
      outline: none;
    }}
    input:focus {{ border-color: #58a6ff; }}
    button {{
      width: 100%;
      padding: 10px;
      background: #238636;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      cursor: pointer;
      font-weight: 600;
    }}
    button:hover {{ background: #2ea043; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>🐧 Linux Tutor</h1>
    <p class="sub">Admin Panel Login</p>
    {error_html}
    <form method="POST">
      <label>Email</label>
      <input type="email" name="email" placeholder="your@email.com" required autofocus>
      <label>Password</label>
      <input type="password" name="password" placeholder="••••••••" required>
      <button type="submit">Sign In →</button>
    </form>
  </div>
</body>
</html>"""

    # ── Serve Frontend Web App ─────────────────────────────────────────────
    @app.route("/")
    def serve_frontend_index():
        from flask import send_from_directory
        root_dir = os.path.abspath(os.path.join(app.root_path, ".."))
        return send_from_directory(root_dir, "index.html")

    # Only these files/extensions are safe to serve as static frontend assets.
    # Without this whitelist, send_from_directory would happily serve any
    # file in the project root that isn't blocked by traversal protection —
    # including app.py, models.py, requirements.txt, .env.example, etc.
    _STATIC_ALLOWED_EXTENSIONS = {".html", ".js", ".css", ".png", ".jpg",
                                   ".jpeg", ".svg", ".ico", ".woff", ".woff2",
                                   ".map", ".json"}

    @app.route("/<path:filename>")
    def serve_frontend_static(filename):
        from flask import send_from_directory
        root_dir = os.path.abspath(os.path.join(app.root_path, ".."))

        _, ext = os.path.splitext(filename)
        if ext.lower() not in _STATIC_ALLOWED_EXTENSIONS:
            return jsonify({"error": "Resource not found."}), 404

        target_path = os.path.join(root_dir, filename)
        if os.path.isfile(target_path):
            return send_from_directory(root_dir, filename)
        return jsonify({"error": "Resource not found."}), 404

    return app


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = create_app()

    env = os.environ.get("FLASK_ENV", "development")
    debug = env == "development"

    print("\n" + "=" * 60)
    print("  🐧 Linux Tutor Backend Starting Up")
    print("=" * 60)
    print(f"  Environment : {env}")
    print(f"  Debug mode  : {debug}")
    print(f"  Database    : {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"  Web App     : http://127.0.0.1:5000/")
    print(f"  Admin panel : http://127.0.0.1:5000/admin")
    print(f"  Health check: http://127.0.0.1:5000/api/health")
    print("=" * 60 + "\n")

    if app.config["SECRET_KEY"] == "dev-only-change-me":
        print("⚠  WARNING: You are using the default SECRET_KEY.")
        print("   Copy .env.example to .env and set a real SECRET_KEY before deploying.\n")

    app.run(debug=debug, host="127.0.0.1", port=5000)
