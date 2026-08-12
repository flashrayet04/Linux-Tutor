/* ══════════════════════════════════════════════════════════════════
   AUTH | USERNAME | FRIENDS — LinuxTutor Social System
   All data is stored in localStorage (simulated backend).
   OAuth buttons simulate the flow since there's no real backend.
══════════════════════════════════════════════════════════════════ */

// ─── Blocked word list (hate / racist / offensive) ───────────────
// NOTE: usernames only allow [a-zA-Z0-9_] (see getUsernameError), so matching
// is done against whole underscore-delimited segments, not raw substrings.
// This avoids false positives like "ClassyCoder" or "GrassHopper" being
// rejected because they merely *contain* a banned substring.
const BANNED_WORDS = [
    // Slurs / hate speech
    "nigger","nigga","faggot","fag","retard","spic","chink","kike","wetback",
    "tranny","dyke","cracker","honky","nazi","kkk","hitler","pedo","pedophile",
    "gook","raghead","towelhead","zipperhead","sandnigger","coon","sambo",
    "beaner","greaser","spook","slope","nonce",
    // Profanity / slurs used as insults
    "cunt","bitch","whore","slut","bastard","asshole","dick","cock","pussy",
    "twat","prick","jackass","dumbass","shithead","motherfucker","fuckface",
    "fucker","wanker","tosser","shit","fuck","piss","rape",
];

function containsBannedWord(str) {
    // Split on underscores/digits so each alphabetic segment is checked as a
    // whole word rather than doing a raw substring search across the string.
    const segments = str.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return segments.some(seg => BANNED_WORDS.includes(seg));
}

// ─── Random username generator ───────────────────────────────────
const ADJECTIVES = [
    "Stellar","Turbo","Neon","Cosmic","Shadow","Quantum","Hyper","Storm",
    "Silent","Brave","Swift","Clever","Blazing","Frozen","Electric","Pixel",
    "Lunar","Solar","Ninja","Cyber","Dark","Wild","Ice","Fire","Flux","Echo",
];
const NOUNS = [
    "Penguin","Coder","Kernel","Shell","Sudo","Hacker","Wizard","Archer",
    "Ranger","Rogue","Spark","Byte","Core","Daemon","Ghost","Cipher","Pixel",
    "Fox","Wolf","Falcon","Dragon","Phantom","Titan","Nexus","Blade","Orbit",
];

function generateRandomUsername() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return `${adj}${noun}${num}`;
}

// ─── Flask Backend API Client ──────────────────────────────────────────
// Uses whatever domain the page is currently loaded from, so this works
// both locally (http://127.0.0.1:5000) and on the live Render URL,
// without needing to hardcode either one.
const API_BASE = `${window.location.origin}/api`;

async function apiCall(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { "Content-Type": "application/json", ...options.headers },
            credentials: "include", // send session cookies
            ...options
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP error ${res.status}`);
        return data;
    } catch (err) {
        console.warn(`API call to ${endpoint} failed:`, err.message);
        throw err;
    }
}

// Backend progress & leaderboard sync functions
async function syncProgressToBackend(lessonId, lessonTitle) {
    if (!authState.isLoggedIn || authState.provider === "guest") return;
    try {
        await apiCall("/progress/lessons", {
            method: "POST",
            body: JSON.stringify({ lesson_id: lessonId, lesson_title: lessonTitle })
        });
    } catch (e) { /* ignore offline errors */ }
}

async function syncQuizToBackend(lessonId, score, totalQ, correctAnswers) {
    if (!authState.isLoggedIn || authState.provider === "guest") return;
    try {
        const res = await apiCall("/quiz/submit", {
            method: "POST",
            body: JSON.stringify({
                lesson_id: lessonId,
                score: score,
                total_questions: totalQ,
                correct_answers: correctAnswers
            })
        });
        if (res.total_xp) {
            state.xp = res.total_xp;
            updateXPDisplay();
        }
    } catch (e) { /* ignore offline errors */ }
}

async function loadLeaderboardFromBackend() {
    try {
        const data = await apiCall("/leaderboard/");
        if (data.leaderboard && data.leaderboard.length > 0) {
            return data.leaderboard.map(item => ({
                username: item.username,
                avatar: item.is_me ? (authState.avatar || "") : "",
                online: true,
                xp: item.total_xp,
                rank: getRankForXP(item.total_xp).name
            }));
        }
    } catch (e) { /* fallback to local demo users */ }
    return null;
}

function getRankForXP(xp) {
    let r = RANKS[0];
    for (const rank of RANKS) {
        if (xp >= rank.minXP) r = rank;
    }
    return r;
}

// ─── Auth / Session state ────────────────────────────────────────
const authState = {
    isLoggedIn: false,
    provider: null, // "backend" | "guest"
    username: null,
    email: null,
    avatar: "",
    friends: [], // { username, avatar, online, xp, rank }
    friendRequests: [], // incoming { username, avatar }

    save() {
        try {
            localStorage.setItem("lt_auth", JSON.stringify({
                isLoggedIn: this.isLoggedIn,
                provider: this.provider,
                username: this.username,
                email: this.email,
                avatar: this.avatar,
                friends: this.friends,
                friendRequests: this.friendRequests,
            }));
            return true;
        } catch (err) {
            console.error("Failed to save session:", err);
            return false;
        }
    },

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem("lt_auth") || "null");
            if (saved?.isLoggedIn) {
                Object.assign(this, saved);
                return true;
            }
        } catch (err) {
            console.error("Failed to load saved session:", err);
        }
        return false;
    }
};

// ─── Auth Screen Setup ───────────────────────────────────────────
async function setupAuthScreen() {
    const authScreen = document.getElementById("auth-screen");

    // Profile chip — if the user is a guest (or not logged in), clicking it
    // reopens the sign-in/register screen so they can create a real account.
    // Attached FIRST, before any early returns below, so it always works
    // regardless of whether a session is already saved.
    document.getElementById("btn-user-profile")?.addEventListener("click", () => {
        if (!authState.isLoggedIn || authState.provider === "guest") {
            if (authScreen) {
                authScreen.style.display = "flex";
                authScreen.classList.remove("fade-out");
            }
        }
    });

    // Check if backend session is active first
    try {
        const meData = await apiCall("/auth/me");
        if (meData.user) {
            authState.isLoggedIn = true;
            authState.provider = "backend";
            authState.username = meData.user.username;
            authState.email = meData.user.email;
            authState.avatar = "";
            state.xp = meData.user.total_xp || 0;
            authState.save();
            if (authScreen) authScreen.style.display = "none";
            updateNavbarProfile();
            loadAndRenderFriends();
            return;
        }
    } catch (e) {
        // Not logged into backend session yet
    }

    // Check local storage saved session
    if (authState.load()) {
        if (authScreen) authScreen.style.display = "none";
        updateNavbarProfile();
        loadAndRenderFriends();
        return;
    }

    // Tab switcher between Login and Register
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("form-backend-login");
    const formReg = document.getElementById("form-backend-register");

    tabLogin?.addEventListener("click", () => {
        tabLogin.classList.add("active");
        tabLogin.style.background = "var(--amber,#fe8019)";
        tabLogin.style.color = "#111";
        tabRegister.classList.remove("active");
        tabRegister.style.background = "transparent";
        tabRegister.style.color = "#ebdbb2";
        if (formLogin) formLogin.style.display = "flex";
        if (formReg) formReg.style.display = "none";
    });

    tabRegister?.addEventListener("click", () => {
        tabRegister.classList.add("active");
        tabRegister.style.background = "var(--amber,#fe8019)";
        tabRegister.style.color = "#111";
        tabLogin.classList.remove("active");
        tabLogin.style.background = "transparent";
        tabLogin.style.color = "#ebdbb2";
        if (formReg) formReg.style.display = "flex";
        if (formLogin) formLogin.style.display = "none";
    });

    // Handle Login submission
    formLogin?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email")?.value.trim();
        const password = document.getElementById("login-password")?.value;
        const errDiv = document.getElementById("auth-error-msg");
        const btn = document.getElementById("btn-login-submit");

        if (errDiv) errDiv.style.display = "none";
        if (btn) { btn.textContent = "⏳ Signing in..."; btn.disabled = true; }

        try {
            const data = await apiCall("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            authState.isLoggedIn = true;
            authState.provider = "backend";
            authState.username = data.user.username;
            authState.email = data.user.email;
            authState.avatar = "";
            state.xp = data.user.total_xp || 0;
            authState.save();

            dismissAuthScreen();
            updateNavbarProfile();
            loadAndRenderFriends();
            triggerConfetti();
            sfx.playLevelUp();
        } catch (err) {
            if (errDiv) {
                errDiv.textContent = err.message || "Failed to sign in.";
                errDiv.style.display = "block";
            }
        } finally {
            if (btn) { btn.textContent = "Sign In "; btn.disabled = false; }
        }
    });

    // Handle Register submission
    formReg?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("reg-username")?.value.trim();
        const email = document.getElementById("reg-email")?.value.trim();
        const password = document.getElementById("reg-password")?.value;
        const errDiv = document.getElementById("register-error-msg");
        const btn = document.getElementById("btn-register-submit");

        if (errDiv) errDiv.style.display = "none";
        if (btn) { btn.textContent = "⏳ Creating account..."; btn.disabled = true; }

        try {
            const data = await apiCall("/auth/register", {
                method: "POST",
                body: JSON.stringify({ username, email, password })
            });

            authState.isLoggedIn = true;
            authState.provider = "backend";
            authState.username = data.user.username;
            authState.email = data.user.email;
            authState.avatar = "";
            state.xp = data.user.total_xp || 0;
            authState.save();

            dismissAuthScreen();
            updateNavbarProfile();
            loadAndRenderFriends();
            triggerConfetti();
            sfx.playLevelUp();
        } catch (err) {
            if (errDiv) {
                errDiv.textContent = err.message || "Failed to register account.";
                errDiv.style.display = "block";
            }
        } finally {
            if (btn) { btn.textContent = "Create Account "; btn.disabled = false; }
        }
    });

    // Guest Auth Button
    document.getElementById("btn-auth-guest")?.addEventListener("click", () => {
        beginGuestAuth();
    });
}

function beginGuestAuth() {
    sfx.playClick();
    authState.provider = "guest";
    authState.username = "Guest_" + Math.floor(Math.random() * 9000 + 1000);
    authState.avatar = "";
    authState.isLoggedIn = true;
    authState.friends = [];
    authState.friendRequests = [];
    authState.save();
    dismissAuthScreen();
    updateNavbarProfile();
    loadAndRenderFriends();
}

async function loadAndRenderFriends() {
    const backendLeaderboard = await loadLeaderboardFromBackend();
    if (backendLeaderboard) {
        authState.friends = backendLeaderboard;
    } else {
        renderFriendsList();
    }
    renderFriendsList();
}

function dismissAuthScreen() {
    const authScreen = document.getElementById("auth-screen");
    if (!authScreen) return;
    authScreen.classList.add("fade-out");
    setTimeout(() => { authScreen.style.display = "none"; }, 400);
}

// ─── Username Modal ──────────────────────────────────────────────
function showUsernameModal() {
    const modal = document.getElementById("username-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    // Set default random username
    const input = document.getElementById("username-input");
    if (input) {
        const rand = generateRandomUsername();
        input.value = rand;
        validateUsername(rand);
    }

    document.getElementById("btn-randomize-username")?.addEventListener("click", () => {
        sfx.playClick();
        const u = generateRandomUsername();
        if (input) { input.value = u; validateUsername(u); }
    });

    input?.addEventListener("input", () => validateUsername(input.value));

    document.getElementById("btn-confirm-username")?.addEventListener("click", () => {
        sfx.playClick();
        const val = input?.value.trim();
        const err = getUsernameError(val);
        if (err) return;

        authState.username = val;
        authState.isLoggedIn = true;
        authState.friends = [];
        authState.friendRequests = [];
        authState.save();

        // Dismiss modal
        const modal = document.getElementById("username-modal");
        if (modal) {
            modal.style.opacity = "0"; modal.style.transform = "scale(0.96)";
            modal.style.transition = "all 0.3s";
            setTimeout(() => modal.classList.add("hidden"), 300);
        }

        updateNavbarProfile();
        renderFriendsList();
        simulateIncomingRequests();
        triggerConfetti();
        sfx.playLevelUp();
    });
}

function getUsernameError(val) {
    if (!val || val.length < 3) return "Username must be at least 3 characters.";
    if (val.length > 24) return "Username must be 24 characters or fewer.";
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return "Only letters, numbers and underscores allowed.";
    if (containsBannedWord(val)) return " That username contains offensive language. Please choose another.";
    return null;
}

function validateUsername(val) {
    const feedback = document.getElementById("uname-feedback");
    const confirmBtn = document.getElementById("btn-confirm-username");
    const input = document.getElementById("username-input");
    const err = getUsernameError(val);
    if (!val) {
        if (feedback) { feedback.textContent = ""; feedback.className = "uname-feedback"; }
        if (input) { input.className = "uname-input"; }
        if (confirmBtn) confirmBtn.disabled = true;
        return;
    }
    if (err) {
        if (feedback) { feedback.textContent = " " + err; feedback.className = "uname-feedback error"; }
        if (input) { input.className = "uname-input is-error"; }
        if (confirmBtn) confirmBtn.disabled = true;
    } else {
        if (feedback) { feedback.textContent = " Looks great!"; feedback.className = "uname-feedback ok"; }
        if (input) { input.className = "uname-input is-ok"; }
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

// ─── Navbar Profile Update ────────────────────────────────────────
// Small badge label shown next to the username based on how they signed in.
const PROVIDER_LABELS = {
    guest: "Guest",
    backend: "", // Registered account — no extra badge needed
};

function updateNavbarProfile() {
    const avatarEl = document.getElementById("navbar-avatar");
    const unameEl = document.getElementById("navbar-username");
    const provBadge = document.getElementById("navbar-provider-badge");

    if (avatarEl) avatarEl.textContent = authState.avatar || "";
    if (unameEl) unameEl.textContent = authState.username || "Guest";
    if (provBadge && authState.provider) {
        provBadge.textContent = PROVIDER_LABELS[authState.provider] || "";
    }
}

// ─── Friends Panel ────────────────────────────────────────────────
function setupFriendsPanel() {
    document.getElementById("btn-open-friends")?.addEventListener("click", openFriendsPanel);
    document.getElementById("btn-close-friends")?.addEventListener("click", closeFriendsPanel);
    document.getElementById("friends-panel-backdrop")?.addEventListener("click", closeFriendsPanel);
    document.getElementById("btn-send-friend-req")?.addEventListener("click", handleAddFriend);

    // Also allow Enter in search box
    document.getElementById("friend-search-input")?.addEventListener("keydown", e => {
        if (e.key === "Enter") handleAddFriend();
    });
}

function openFriendsPanel() {
    sfx.playClick();
    document.getElementById("friends-panel")?.classList.add("is-open");
    document.getElementById("friends-panel-backdrop")?.classList.remove("hidden");
    // Clear notif dot
    document.getElementById("friends-notif-dot")?.classList.add("hidden");
}

function closeFriendsPanel() {
    document.getElementById("friends-panel")?.classList.remove("is-open");
    document.getElementById("friends-panel-backdrop")?.classList.add("hidden");
}

function handleAddFriend() {
    sfx.playClick();
    const input = document.getElementById("friend-search-input");
    const feedback = document.getElementById("friend-req-feedback");
    const query = input?.value.trim();
    if (!feedback || !input) return;

    if (!query) { showFriendFeedback(feedback, "error", "Please enter a username to search."); return; }
    if (query.toLowerCase() === authState.username?.toLowerCase()) {
        showFriendFeedback(feedback, "error", "You can't add yourself as a friend!"); return;
    }
    if (authState.friends.some(f => f.username.toLowerCase() === query.toLowerCase())) {
        showFriendFeedback(feedback, "error", `${query} is already your friend.`); return;
    }

    // Search demo users
    const found = DEMO_USERS.find(u => u.username.toLowerCase() === query.toLowerCase());
    if (!found) {
        showFriendFeedback(feedback, "error", `No user found with username "${query}".`); return;
    }

    // Add as friend
    authState.friends.push({ ...found });
    authState.save();
    renderFriendsList();
    showFriendFeedback(feedback, "ok", ` ${found.username} added as a friend!`);
    if (input) input.value = "";
}

function showFriendFeedback(el, type, msg) {
    el.textContent = msg;
    el.className = `friend-req-feedback ${type}`;
    setTimeout(() => { el.textContent = ""; el.className = "friend-req-feedback"; }, 3500);
}

function renderFriendsList() {
    const onlineList = document.getElementById("friends-online-list");
    const offlineList = document.getElementById("friends-offline-list");
    const reqList = document.getElementById("friend-requests-list");
    const emptyState = document.getElementById("friends-empty-state");
    const reqBadge = document.getElementById("req-count-badge");

    if (!onlineList || !offlineList || !reqList) return;

    const friends = authState.friends || [];
    const requests = authState.friendRequests || [];
    // ponytail: inline; ceiling = no i18n
    const emptyHtml = msg => `<div style="font-size:.8rem;color:var(--text-dim);padding:.2rem .2rem">${msg}</div>`;

    // Render friend requests
    reqList.innerHTML = "";
    if (requests.length > 0) {
        if (reqBadge) { reqBadge.textContent = requests.length; reqBadge.classList.remove("hidden"); }
        requests.forEach(req => {
            const row = buildFriendRow(req, "request");
            reqList.appendChild(row);
        });
    } else {
        if (reqBadge) reqBadge.classList.add("hidden");
        reqList.innerHTML = emptyHtml("No pending requests.");
    }

    // Render friends
    onlineList.innerHTML = "";
    offlineList.innerHTML = "";
    const online = friends.filter(f => f.online);
    const offline = friends.filter(f => !f.online);

    if (online.length === 0) onlineList.innerHTML = emptyHtml("No friends online right now.");
    if (offline.length === 0) offlineList.innerHTML = emptyHtml("—");

    online.forEach(f => onlineList.appendChild(buildFriendRow(f, "friend")));
    offline.forEach(f => offlineList.appendChild(buildFriendRow(f, "friend")));

    // Empty state
    if (emptyState) {
        if (friends.length === 0 && requests.length === 0) {
            emptyState.classList.remove("hidden");
        } else {
            emptyState.classList.add("hidden");
        }
    }
}

function buildFriendRow(person, type) {
    const row = document.createElement("div");
    row.className = "friend-row";

    if (type === "friend") {
        row.innerHTML = `
            <div class="friend-avatar">
                ${person.avatar}
                <span class="friend-status-dot ${person.online ? "online" : "offline"}"></span>
            </div>
            <div class="friend-info">
                <div class="friend-name">${escapeHTML(person.username)}</div>
                <div class="friend-meta">${person.rank || "Learner"} · ${person.xp || 0} XP</div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn friend-action-btn--remove" title="Remove friend"></button>
            </div>
        `;
        row.querySelector(".friend-action-btn--remove")?.addEventListener("click", () => {
            sfx.playClick();
            authState.friends = authState.friends.filter(f => f.username !== person.username);
            authState.save();
            renderFriendsList();
        });
    } else if (type === "request") {
        row.innerHTML = `
            <div class="friend-avatar">${person.avatar}</div>
            <div class="friend-info">
                <div class="friend-name">${escapeHTML(person.username)}</div>
                <div class="friend-meta">Sent you a friend request</div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn friend-action-btn--accept" title="Accept">Accept</button>
                <button class="friend-action-btn friend-action-btn--decline" title="Decline">Decline</button>
            </div>
        `;
        row.querySelector(".friend-action-btn--accept")?.addEventListener("click", () => {
            sfx.playClick();
            authState.friendRequests = authState.friendRequests.filter(r => r.username !== person.username);
            authState.friends.push({ ...person, online: Math.random() > 0.5, xp: Math.floor(Math.random() * 800 + 50), rank: "Shell Explorer" });
            authState.save();
            renderFriendsList();
        });
        row.querySelector(".friend-action-btn--decline")?.addEventListener("click", () => {
            sfx.playClick();
            authState.friendRequests = authState.friendRequests.filter(r => r.username !== person.username);
            authState.save();
            renderFriendsList();
        });
    }
    return row;
}

// ─── Simulate an incoming friend request after a delay ───────────
function simulateIncomingRequests() {
    setTimeout(() => {
        if (authState.friendRequests.length === 0) {
            const sender = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
            // Don't duplicate
            if (!authState.friends.some(f => f.username === sender.username)) {
                authState.friendRequests.push({ username: sender.username, avatar: sender.avatar });
                authState.save();
                renderFriendsList();
                // Show notification dot
                document.getElementById("friends-notif-dot")?.classList.remove("hidden");
                // Show notification dot on req badge
                const reqBadge = document.getElementById("req-count-badge");
                if (reqBadge) { reqBadge.textContent = "1"; reqBadge.classList.remove("hidden"); }
            }
        }
    }, 8000); // simulate a friend request 8 seconds after login
}

// ponytail: class collapsed to plain object; ceiling = no AudioContext pooling across instances
const sfx = {
    enabled: true, ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    playSequence(notes, type = "sine", dur = 0.08) {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + i * dur);
            gain.gain.setValueAtTime(0.1, now + i * dur);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * dur + 0.2);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(now + i * dur); osc.stop(now + i * dur + 0.2);
        });
    },
    playClick() { this.playSequence([400, 120], "sine", 0.03); },
    playSuccess() { this.playSequence([523.25, 659.25, 783.99, 1046.50], "sine", 0.07); },
    playLevelUp() { this.playSequence([440, 554.37, 659.25, 880, 1108.73, 1318.51], "triangle", 0.06); }
};

function triggerConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#06b6d4", "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];
    const pieces = Array.from({ length: 70 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.3 - 40,
        w: Math.random() * 8 + 4,
        h: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 3,
        rot: Math.random() * 360
    }));

    let start = null;
    function render(ts) {
        if (!start) start = ts;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.rot += 5;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        if (ts - start < 2200) requestAnimationFrame(render);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(render);
}

// ponytail: classplain object; ceiling = no prototype reuse if multiple instances needed
const vfs = {
    root: null, cwdPath: null,
    reset() {
        this.root = { name: "/", type: "dir", children: { home: { name: "home", type: "dir", children: { user: { name: "user", type: "dir", children: {
            documents: { name: "documents", type: "dir", children: { "report.txt": { name: "report.txt", type: "file", content: "Linux Progress Report: OK" } } },
            logs: { name: "logs", type: "dir", children: { "system.log": { name: "system.log", type: "file", content: "2026-07-21 INFO System booted\n2026-07-21 WARNING Memory high\n2026-07-21 ERROR Database connection failed" } } },
            projects: { name: "projects", type: "dir", children: { "script.sh": { name: "script.sh", type: "file", content: "#!/bin/bash\necho 'Script running...'", perm: "644" } } },
            "notes.txt": { name: "notes.txt", type: "file", content: "Welcome to Linux Tutor!\nPractice pwd, ls, cd, mkdir, touch, cp, mv, rm, cat, grep." },
            "duplicates.txt": { name: "duplicates.txt", type: "file", content: "banana\napple\ncherry\napple\nbanana\nbanana\ndate\ncherry\ncherry" }
        }}}}}};
        this.cwdPath = ["home", "user"];
        this.env = { HOME: "/home/user", USER: "user", SHELL: "/bin/bash" };
        this.aliases = {};
    },
    getCwdString() { return "/" + this.cwdPath.join("/"); },
    getPromptPath() {
        const f = this.getCwdString();
        return f === "/home/user" ? "~" : f.startsWith("/home/user/") ? "~/" + f.replace("/home/user/", "") : f;
    },
    resolvePath(pathStr) {
        if (!pathStr || pathStr === ".") return [...this.cwdPath];
        let base = pathStr.startsWith("/") ? [] : [...this.cwdPath];
        let parts = pathStr.split("/").filter(Boolean);
        if (pathStr === "~" || pathStr.startsWith("~/")) { base = ["home","user"]; parts = pathStr.replace(/^~\/?/,"").split("/").filter(Boolean); }
        for (const p of parts) { if (p === "..") base.pop(); else if (p !== ".") base.push(p); }
        return base;
    },
    getNodeAtPath(parts) {
        let curr = this.root;
        for (const p of parts) { if (curr?.children?.[p]) curr = curr.children[p]; else return null; }
        return curr;
    }
};
vfs.reset();

const RANKS = [
    { name: "Command Cadet", icon: "", minXP: 0 },
    { name: "Shell Explorer", icon: "", minXP: 100 },
    { name: "Directory Artisan", icon: "", minXP: 250 },
    { name: "Terminal Specialist", icon: "", minXP: 500 },
    { name: "System Guardian", icon: "", minXP: 850 },
    { name: "Linux Wizard", icon: "", minXP: 1250 },
    { name: "Master SysAdmin", icon: "", minXP: 1800 },
    { name: "Kernel Sage", icon: "", minXP: 2400 },
    { name: "Root Overlord", icon: "", minXP: 3200 },
    { name: "Linux Legend", icon: "", minXP: 4000 }
];

const ACHIEVEMENTS = [
    { id: "first_step", title: "First Step ", desc: "Execute your 1st command.", icon: "", unlocked: false },
    { id: "folder_master", title: "Folder Architect ", desc: "Create a directory with mkdir.", icon: "", unlocked: false },
    { id: "grep_detective", title: "Grep Detective ", desc: "Filter logs with grep.", icon: "", unlocked: false },
    { id: "chmod_security", title: "Security Specialist ", desc: "Set permissions with chmod.", icon: "", unlocked: false },
    { id: "pipe_wizard", title: "Pipe Wizard ", desc: "Pipeline commands with |.", icon: "", unlocked: false },
    { id: "mission_hero", title: "Mission Hero ", desc: "Complete a tactical mission.", icon: "", unlocked: false },
    { id: "quiz_whiz", title: "Quiz Genius ", desc: "Score correctly on quizzes.", icon: "", unlocked: false },
    { id: "linux_graduate", title: "Terminal Graduate ", desc: "Reach Level 5 (System Guardian).", icon: "", unlocked: false },
    { id: "env_master", title: "Variable Virtuoso ", desc: "Set an environment variable with export.", icon: "", unlocked: false },
    { id: "alias_ace", title: "Alias Ace ", desc: "Create your own command alias.", icon: "", unlocked: false },
    { id: "data_sorter", title: "Data Sorter ", desc: "Sort or deduplicate text with sort/uniq.", icon: "", unlocked: false },
    { id: "time_traveler", title: "Time Traveler ", desc: "Check your command history.", icon: "", unlocked: false }
];

const state = {
    xp: 0, rankIndex: 0, currentModuleIdx: 0, currentStepIdx: 0,
    commandHistory: [], historyIdx: -1, activeTab: "trainer",
    commandsRunCount: 0, unlockedBadges: new Set()
};

const lessons = [
    {
        title: "Module 1: Getting Your Bearings",
        steps: [
            { desc: "The <code>pwd</code> command displays your exact working directory location.", task: "Type <code>pwd</code> in the terminal.", expectedPattern: /^pwd$/, hint: "Type <code>pwd</code> and press Enter." },
            { desc: "The <code>ls</code> command lists visible files and directories.", task: "Type <code>ls</code> to list files.", expectedPattern: /^ls$/, hint: "Type <code>ls</code>." },
            { desc: "The <code>ls -la</code> command lists all files including hidden ones.", task: "Type <code>ls -la</code> to list detailed files.", expectedPattern: /^ls\s+-la$/, hint: "Type <code>ls -la</code>." },
            { desc: "Use <code>cd &lt;dir&gt;</code> to move into a directory.", task: "Type <code>cd logs</code> to enter logs folder.", expectedPattern: /^cd\s+logs$/, hint: "Type <code>cd logs</code>." },
            { desc: "Use <code>cd ..</code> to step back to parent directory.", task: "Type <code>cd ..</code> to return up.", expectedPattern: /^cd\s+\.\.$/, hint: "Type <code>cd ..</code>." },
            { desc: "Type <code>cd ~</code> to jump to home folder.", task: "Type <code>cd ~</code>.", expectedPattern: /^cd\s*~?$/, hint: "Type <code>cd ~</code>." }
        ]
    },
    {
        title: "Module 2: Creating & Organizing Files",
        steps: [
            { desc: "Use <code>mkdir &lt;foldername&gt;</code> to build a folder.", task: "Type <code>mkdir workspace</code>.", expectedPattern: /^mkdir\s+workspace$/, hint: "Type <code>mkdir workspace</code>." },
            { desc: "Use <code>mkdir -p</code> for nested folders.", task: "Type <code>mkdir -p projects/2026/code</code>.", expectedPattern: /^mkdir\s+-p\s+projects\/2026\/code$/, hint: "Type <code>mkdir -p projects/2026/code</code>." },
            { desc: "Use <code>touch &lt;file&gt;</code> to create a empty file.", task: "Type <code>touch workspace/todo.txt</code>.", expectedPattern: /^touch\s+workspace\/todo\.txt$/, hint: "Type <code>touch workspace/todo.txt</code>." },
            { desc: "Use <code>cp &lt;src&gt; &lt;dst&gt;</code> to copy files.", task: "Type <code>cp notes.txt workspace/backup.txt</code>.", expectedPattern: /^cp\s+notes\.txt\s+workspace\/backup\.txt$/, hint: "Type <code>cp notes.txt workspace/backup.txt</code>." },
            { desc: "Use <code>mv &lt;old&gt; &lt;new&gt;</code> to rename or move.", task: "Type <code>mv workspace/todo.txt workspace/tasks.txt</code>.", expectedPattern: /^mv\s+workspace\/todo\.txt\s+workspace\/tasks\.txt$/, hint: "Type <code>mv workspace/todo.txt workspace/tasks.txt</code>." },
            { desc: "Use <code>rm &lt;file&gt;</code> to delete files.", task: "Type <code>rm workspace/backup.txt</code>.", expectedPattern: /^rm\s+workspace\/backup\.txt$/, hint: "Type <code>rm workspace/backup.txt</code>." }
        ]
    },
    {
        title: "Module 3: Reading & Inspecting Text",
        steps: [
            { desc: "The <code>cat</code> command displays file contents.", task: "Type <code>cat notes.txt</code>.", expectedPattern: /^cat\s+notes\.txt$/, hint: "Type <code>cat notes.txt</code>." },
            { desc: "The <code>head -n 2</code> shows top 2 lines.", task: "Type <code>head -n 2 logs/system.log</code>.", expectedPattern: /^head\s+-n\s+2\s+logs\/system\.log$/, hint: "Type <code>head -n 2 logs/system.log</code>." },
            { desc: "The <code>tail -n 2</code> shows bottom 2 lines.", task: "Type <code>tail -n 2 logs/system.log</code>.", expectedPattern: /^tail\s+-n\s+2\s+logs\/system\.log$/, hint: "Type <code>tail -n 2 logs/system.log</code>." },
            { desc: "The <code>wc -l</code> counts lines.", task: "Type <code>wc -l logs/system.log</code>.", expectedPattern: /^wc\s+-l\s+logs\/system\.log$/, hint: "Type <code>wc -l logs/system.log</code>." }
        ]
    },
    {
        title: "Module 4: Searching & Filtering",
        steps: [
            { desc: "The <code>grep</code> command searches text patterns.", task: "Type <code>grep ERROR logs/system.log</code>.", expectedPattern: /^grep\s+ERROR\s+logs\/system\.log$/, hint: "Type <code>grep ERROR logs/system.log</code>." },
            { desc: "Add <code>-i</code> for case-insensitive search.", task: "Type <code>grep -i warning logs/system.log</code>.", expectedPattern: /^grep\s+-i\s+warning\s+logs\/system\.log$/, hint: "Type <code>grep -i warning logs/system.log</code>." },
            { desc: "Add <code>-n</code> for line numbers.", task: "Type <code>grep -n Database logs/system.log</code>.", expectedPattern: /^grep\s+-n\s+Database\s+logs\/system\.log$/, hint: "Type <code>grep -n Database logs/system.log</code>." },
            { desc: "Use <code>find . -name '*.txt'</code> to search files.", task: "Type <code>find . -name '*.txt'</code>.", expectedPattern: /^find\s+\.\s+-name\s+['"]?\.?\*\.txt['"]?$/, hint: "Type <code>find . -name '*.txt'</code>." }
        ]
    },
    {
        title: "Module 5: Security & Permissions",
        steps: [
            { desc: "Inspect file permissions using <code>ls -l</code>.", task: "Type <code>ls -l projects/script.sh</code>.", expectedPattern: /^ls\s+-l\s+projects\/script\.sh$/, hint: "Type <code>ls -l projects/script.sh</code>." },
            { desc: "Make a script executable using <code>chmod +x</code>.", task: "Type <code>chmod +x projects/script.sh</code>.", expectedPattern: /^chmod\s+\+x\s+projects\/script\.sh$/, hint: "Type <code>chmod +x projects/script.sh</code>." },
            { desc: "Set octal permissions using <code>chmod 755</code>.", task: "Type <code>chmod 755 projects/script.sh</code>.", expectedPattern: /^chmod\s+755\s+projects\/script\.sh$/, hint: "Type <code>chmod 755 projects/script.sh</code>." }
        ]
    },
    {
        title: "Module 6: Input/Output & Pipes",
        steps: [
            { desc: "Redirect output to a file using <code>&gt;</code>.", task: "Type <code>echo 'Status OK' > status.txt</code>.", expectedPattern: /^echo\s+['"].*['"]\s+>\s+status\.txt$/, hint: "Type <code>echo 'Status OK' > status.txt</code>." },
            { desc: "Append output without overwriting using <code>&gt;&gt;</code>.", task: "Type <code>echo 'Passed' >> status.txt</code>.", expectedPattern: /^echo\s+['"].*['"]\s+>>\s+status\.txt$/, hint: "Type <code>echo 'Passed' >> status.txt</code>." },
            { desc: "Feed command output into another using pipe <code>|</code>.", task: "Type <code>cat logs/system.log | grep ERROR</code>.", expectedPattern: /^cat\s+logs\/system\.log\s+\|\s+grep\s+ERROR$/, hint: "Type <code>cat logs/system.log | grep ERROR</code>." }
        ]
    },
    {
        title: "Module 7: System Monitoring",
        steps: [
            { desc: "Check logged-in username with <code>whoami</code>.", task: "Type <code>whoami</code>.", expectedPattern: /^whoami$/, hint: "Type <code>whoami</code>." },
            { desc: "List running processes with <code>ps aux</code>.", task: "Type <code>ps aux</code>.", expectedPattern: /^ps\s+aux$/, hint: "Type <code>ps aux</code>." },
            { desc: "Check disk usage with <code>df -h</code>.", task: "Type <code>df -h</code>.", expectedPattern: /^df\s+-h$/, hint: "Type <code>df -h</code>." },
            { desc: "Check memory health with <code>free -h</code>.", task: "Type <code>free -h</code>.", expectedPattern: /^free\s+-h$/, hint: "Type <code>free -h</code>." }
        ]
    },
    {
        title: "Module 8: Shell Scripting Basics",
        steps: [
            { desc: "Inspect script contents with <code>cat</code>.", task: "Type <code>cat projects/script.sh</code>.", expectedPattern: /^cat\s+projects\/script\.sh$/, hint: "Type <code>cat projects/script.sh</code>." },
            { desc: "Run a bash script using <code>bash &lt;script&gt;</code>.", task: "Type <code>bash projects/script.sh</code>.", expectedPattern: /^(bash|\.\/)\s*projects\/script\.sh$/, hint: "Type <code>bash projects/script.sh</code>." }
        ]
    },
    {
        title: "Module 9: Environment Variables",
        steps: [
            { desc: "Environment variables store reusable values. <code>$HOME</code> holds your home folder path.", task: "Type <code>echo $HOME</code>.", expectedPattern: /^echo\s+\$HOME$/, hint: "Type <code>echo $HOME</code>." },
            { desc: "Use <code>export &lt;NAME&gt;=&lt;value&gt;</code> to create your own variable.", task: "Type <code>export CITY=Bengaluru</code>.", expectedPattern: /^export\s+CITY=Bengaluru$/, hint: "Type <code>export CITY=Bengaluru</code>." },
            { desc: "Reference your new variable with a <code>$</code> prefix.", task: "Type <code>echo $CITY</code>.", expectedPattern: /^echo\s+\$CITY$/, hint: "Type <code>echo $CITY</code>." },
            { desc: "The <code>env</code> command lists every variable currently set.", task: "Type <code>env</code>.", expectedPattern: /^env$/, hint: "Type <code>env</code>." }
        ]
    },
    {
        title: "Module 10: History & Aliases",
        steps: [
            { desc: "The <code>history</code> command replays every command you've typed this session.", task: "Type <code>history</code>.", expectedPattern: /^history$/, hint: "Type <code>history</code>." },
            { desc: "An <code>alias</code> gives a command a shorter nickname.", task: "Type <code>alias ll=\"ls -la\"</code>.", expectedPattern: /^alias\s+ll=['"]ls\s+-la['"]$/, hint: "Type <code>alias ll=\"ls -la\"</code>." },
            { desc: "Now your new nickname runs the full command it points to.", task: "Type <code>ll</code>.", expectedPattern: /^ll$/, hint: "Type <code>ll</code>." },
            { desc: "The <code>man &lt;command&gt;</code> command shows a quick manual page.", task: "Type <code>man grep</code>.", expectedPattern: /^man\s+grep$/, hint: "Type <code>man grep</code>." }
        ]
    },
    {
        title: "Module 11: Sorting & Deduplicating Text",
        steps: [
            { desc: "The <code>sort</code> command arranges file lines alphabetically.", task: "Type <code>sort duplicates.txt</code>.", expectedPattern: /^sort\s+duplicates\.txt$/, hint: "Type <code>sort duplicates.txt</code>." },
            { desc: "Add <code>-r</code> to sort in reverse order.", task: "Type <code>sort -r duplicates.txt</code>.", expectedPattern: /^sort\s+-r\s+duplicates\.txt$/, hint: "Type <code>sort -r duplicates.txt</code>." },
            { desc: "The <code>uniq</code> command removes adjacent duplicate lines, so sort first.", task: "Type <code>sort duplicates.txt | uniq</code>.", expectedPattern: /^sort\s+duplicates\.txt\s+\|\s+uniq$/, hint: "Type <code>sort duplicates.txt | uniq</code>." },
            { desc: "Add <code>-c</code> to uniq to count how many times each line repeats.", task: "Type <code>sort duplicates.txt | uniq -c</code>.", expectedPattern: /^sort\s+duplicates\.txt\s+\|\s+uniq\s+-c$/, hint: "Type <code>sort duplicates.txt | uniq -c</code>." }
        ]
    },
    {
        title: "Module 12: System Utilities",
        steps: [
            { desc: "The <code>date</code> command prints the current date and time.", task: "Type <code>date</code>.", expectedPattern: /^date$/, hint: "Type <code>date</code>." },
            { desc: "The <code>uname -a</code> command shows kernel and system info.", task: "Type <code>uname -a</code>.", expectedPattern: /^uname\s+-a$/, hint: "Type <code>uname -a</code>." },
            { desc: "The <code>du -h</code> command reports disk usage for your files.", task: "Type <code>du -h</code>.", expectedPattern: /^du\s+-h$/, hint: "Type <code>du -h</code>." },
            { desc: "The <code>kill &lt;PID&gt;</code> command stops a running process by its ID.", task: "Type <code>kill 405</code>.", expectedPattern: /^kill\s+405$/, hint: "Type <code>kill 405</code>." }
        ]
    }
];

const quizQuestions = [
    { q: "What does 'pwd' stand for?", opts: ["Path Working Directory", "Print Working Directory", "Process Directory", "Program Path"], ans: 1, explain: "'pwd' prints current directory path." },
    { q: "Which flag shows hidden files?", opts: ["ls -h", "ls -l", "ls -a", "ls -x"], ans: 2, explain: "The '-a' flag shows hidden dotfiles." },
    { q: "Which command searches line-by-line for text?", opts: ["find", "grep", "search", "cat"], ans: 1, explain: "'grep' searches text inside files." },
    { q: "Which command creates a new directory?", opts: ["touch", "newdir", "mkdir", "create"], ans: 2, explain: "'mkdir' creates directories." },
    { q: "How do you navigate up to parent folder?", opts: ["cd /", "cd ..", "cd ~", "cd -"], ans: 1, explain: "'cd ..' goes up one level." },
    { q: "What makes a script executable?", opts: ["chmod +x", "chmod -x", "chmod 000", "chmod read"], ans: 0, explain: "'chmod +x' grants execution rights." },
    { q: "Which operator appends text without overwriting?", opts: [">", ">>", "<", "|"], ans: 1, explain: "'>>' appends text to a file." },
    { q: "Which command creates a reusable shell variable?", opts: ["set", "export", "var", "env"], ans: 1, explain: "'export' creates and exports a shell variable." },
    { q: "Which command lists all currently set environment variables?", opts: ["ls -e", "env", "vars", "printenv -a"], ans: 1, explain: "'env' prints all currently set environment variables." },
    { q: "Which command replays commands you've already run?", opts: ["log", "past", "history", "replay"], ans: 2, explain: "'history' lists your previously typed commands." },
    { q: "What does 'alias ll=\"ls -la\"' do?", opts: ["Deletes ls", "Creates a shortcut for ls -la", "Runs ls immediately", "Renames a file"], ans: 1, explain: "It creates 'll' as a shortcut for 'ls -la'." },
    { q: "Which command arranges file lines alphabetically?", opts: ["sort", "order", "arrange", "seq"], ans: 0, explain: "'sort' arranges lines alphabetically by default." },
    { q: "Which command removes adjacent duplicate lines?", opts: ["dedupe", "uniq", "distinct", "rmdup"], ans: 1, explain: "'uniq' collapses adjacent duplicate lines (sort first for best results)." },
    { q: "Which command shows how much disk space files use?", opts: ["df", "du", "space", "size"], ans: 1, explain: "'du' reports disk usage of files and folders." },
    { q: "Which command stops a running process by its PID?", opts: ["stop", "kill", "end", "halt"], ans: 1, explain: "'kill <PID>' sends a signal to terminate a process." }
];

const cheatSheetData = [
    { category: " Navigation", cmds: [{ cmd: "pwd", desc: "Print current location path" }, { cmd: "ls", desc: "List directory files" }, { cmd: "ls -la", desc: "List hidden files with details" }, { cmd: "cd <dir>", desc: "Change folder" }, { cmd: "cd ..", desc: "Move up to parent folder" }, { cmd: "cd ~", desc: "Jump to home folder" }] },
    { category: " File Operations", cmds: [{ cmd: "mkdir <dir>", desc: "Create new directory" }, { cmd: "mkdir -p <a/b>", desc: "Create nested folders" }, { cmd: "touch <file>", desc: "Create empty file" }, { cmd: "cp <src> <dst>", desc: "Copy file" }, { cmd: "mv <old> <new>", desc: "Move/rename file" }, { cmd: "rm <file>", desc: "Delete file" }] },
    { category: " Reading & Searching", cmds: [{ cmd: "cat <file>", desc: "Read file text" }, { cmd: "head -n 5 <file>", desc: "View top 5 lines" }, { cmd: "tail -n 5 <file>", desc: "View bottom 5 lines" }, { cmd: "grep 'pat' <file>", desc: "Search matching text" }, { cmd: "find . -name '*.txt'", desc: "Find files by name" }] },
    { category: " Security & System", cmds: [{ cmd: "chmod +x <file>", desc: "Make script executable" }, { cmd: "chmod 755 <file>", desc: "Set owner & public permissions" }, { cmd: "whoami", desc: "Check logged-in username" }, { cmd: "ps aux", desc: "List running processes" }, { cmd: "df -h", desc: "Check disk storage health" }, { cmd: "free -h", desc: "Check RAM memory health" }] },
    { category: " Variables & Shell", cmds: [{ cmd: "echo $VAR", desc: "Print a variable's value" }, { cmd: "export NAME=value", desc: "Create a shell variable" }, { cmd: "env", desc: "List all environment variables" }, { cmd: "history", desc: "Show past commands" }, { cmd: "alias ll='ls -la'", desc: "Create a command shortcut" }, { cmd: "man <cmd>", desc: "Show a quick manual page" }] },
    { category: " Sorting & Utilities", cmds: [{ cmd: "sort <file>", desc: "Sort lines alphabetically" }, { cmd: "sort -r <file>", desc: "Sort lines in reverse" }, { cmd: "sort <file> | uniq", desc: "Remove duplicate lines" }, { cmd: "uniq -c", desc: "Count repeated lines" }, { cmd: "date", desc: "Show current date & time" }, { cmd: "du -h", desc: "Show disk usage" }, { cmd: "kill <PID>", desc: "Stop a running process" }] }
];

const tacticalMissions = [
    { id: "m1", title: "Mission 1: Missing Log Investigator ", icon: "", desc: "Search `logs/system.log` for ERROR entries and write to `error_report.txt`.", task: "grep ERROR logs/system.log > error_report.txt", xp: 150 },
    { id: "m2", title: "Mission 2: Cyber Fortress Cleanup ", icon: "", desc: "Create `backups` folder and copy `notes.txt` into `backups/notes_copy.txt`.", task: "mkdir backups && cp notes.txt backups/notes_copy.txt", xp: 200 },
    { id: "m3", title: "Mission 3: Security Hardening ", icon: "", desc: "Make `projects/script.sh` executable with `chmod +x` and run it with `bash`.", task: "chmod +x projects/script.sh && bash projects/script.sh", xp: 250 },
    { id: "m4", title: "Mission 4: System Audit ", icon: "", desc: "Check running processes with `ps aux` and storage with `df -h`.", task: "ps aux", xp: 180 },
    { id: "m5", title: "Mission 5: Pipeline Mastermind ", icon: "", desc: "Pipe `logs/system.log` into grep INFO.", task: "cat logs/system.log | grep INFO", xp: 220 },
    { id: "m6", title: "Mission 6: The Variable Vault ", icon: "", desc: "Set a `SECRET` variable to `1337` and print it back out.", task: "export SECRET=1337 && echo $SECRET", xp: 200 },
    { id: "m7", title: "Mission 7: Duplicate Purge ", icon: "", desc: "Sort `duplicates.txt` and collapse repeated lines with `uniq`.", task: "sort duplicates.txt | uniq -c", xp: 230 }
];

// Helper shorthand for DOM querying
const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
    setupAuthScreen(); // Auth system (runs first)
    setupFriendsPanel(); // Friends slide-in panel
    setupWelcomeScreen();
    setupNavigation();
    setupControls();
    setupTerminal();
    renderModuleDropdown();
    renderLesson();
    renderFileTree();
    renderRanksAndBadges();
    renderCheatSheet();
    renderQuiz();
    renderMissions();
    setupCertificate();
    updateUserRankUI();
    setupInstallGuide();
    setupDistroCommands();
});

// ═══════════════════════════════════════════════════════════════
// WELCOME SCREEN & INSTALLATION GUIDE
// ═══════════════════════════════════════════════════════════════

const DISTROS = [
    { id: "mint", logo: "", name: "Linux Mint", tag: "Best for beginners", badge: " Recommended", url: "https://linuxmint.com/download.php", videos: ["mint"] },
    { id: "ubuntu", logo: "", name: "Ubuntu", tag: "Huge community/support", badge: " Recommended", url: "https://ubuntu.com/download/desktop", videos: ["ubuntu"] },
    { id: "popos", logo: "", name: "Pop!_OS", tag: "Gaming & Nvidia GPUs", badge: null, url: "https://pop.system76.com/", videos: ["popos"] },
    { id: "zorin", logo: "", name: "Zorin OS", tag: "Closest to Windows look", badge: null, url: "https://zorin.com/os/download/", videos: ["zorin"] },
    { id: "fedora", logo: "", name: "Fedora", tag: "Newer software/devs", badge: null, url: "https://fedoraproject.org/workstation/download",videos: ["fedora"] },
    { id: "debian", logo: "", name: "Debian", tag: "Stability & servers", badge: null, url: "https://www.debian.org/distrib/", videos: ["debian"] },
    { id: "elementary",logo: "", name: "elementary OS", tag: "Mac-like clean design", badge: null, url: "https://elementary.io/", videos: ["elementary"] },
    { id: "manjaro", logo: "", name: "Manjaro", tag: "Arch-based, up-to-date", badge: null, url: "https://manjaro.org/download/", videos: ["manjaro"] },
    { id: "opensuse", logo: "", name: "openSUSE", tag: "Enterprise-style stable", badge: null, url: "https://get.opensuse.org/", videos: ["opensuse"] },
];

const INSTALL_STEPS = [
    {
        num: 1,
        title: "Before You Start — Things to Check",
        body: `
            <p>Before installing, run through this quick checklist:</p>
            <ul>
                <li><strong>UEFI or Legacy BIOS?</strong> — Press <code>Win + R</code>, type <code>msinfo32</code>, hit Enter. Look at "BIOS Mode". Most PCs made after ~2012 use UEFI.</li>
                <li><strong>Secure Boot</strong> — Most modern distros support it. If you hit issues, disabling it in BIOS is the fallback.</li>
                <li><strong>Back up your data</strong> — Installing Linux touches your partitions. Back up important files first — no exceptions.</li>
            </ul>
            <p><strong>What you'll need:</strong></p>
            <ul>
                <li>A USB drive (8 GB minimum, 16 GB+ recommended)</li>
                <li>Another working computer to create the USB</li>
                <li>At least 25 GB free disk space</li>
                <li>Your Wi-Fi password handy (if not using Ethernet)</li>
            </ul>
            <div class="step-warn"> Always back up your personal data before proceeding — partitioning is irreversible!</div>
        `
    },
    {
        num: 2,
        title: "Download Your Distro's ISO",
        body: `DISTRO_DOWNLOAD_PLACEHOLDER`
    },
    {
        num: 3,
        title: "Create a Bootable USB with Rufus (Windows)",
        body: `
            <p>Rufus is a free tool that writes the ISO onto your USB so your PC can boot from it.</p>
            <ol style="padding-left:1.2rem;margin:0.6rem 0;">
                <li>Download Rufus from <a href="https://rufus.ie" target="_blank" rel="noopener">rufus.ie</a> (only ever download it from here).</li>
                <li>Plug in your USB drive — <strong>it will be fully erased</strong>.</li>
                <li>Open Rufus. Under <strong>Device</strong>, select your USB drive.</li>
                <li>Under <strong>Boot selection</strong>, click SELECT and choose your downloaded <code>.iso</code> file.</li>
                <li>Check settings:<br>
                    &nbsp;• <strong>Partition scheme:</strong> <code>GPT</code> for UEFI (most modern PCs) / <code>MBR</code> for Legacy BIOS<br>
                    &nbsp;• <strong>Target system:</strong> auto-sets correctly after you choose GPT/MBR</li>
                <li>Click <strong>START</strong> and wait a few minutes.</li>
                <li>If prompted about "ISOHybrid image," choose <strong>Write in ISO Image mode</strong>.</li>
            </ol>
            <div class="step-tip"> On Mac or Linux, use <a href="https://etcher.balena.io/" target="_blank" rel="noopener">balenaEtcher</a> instead — simpler and cross-platform. <a href="https://www.ventoy.net" target="_blank" rel="noopener">Ventoy</a> is great if you want multiple ISOs on one USB.</div>
        `
    },
    {
        num: 4,
        title: "Change Your Boot Order / Enter the Boot Menu",
        body: `
            <p>Tell your PC to boot from the USB instead of your hard drive.</p>
            <ol style="padding-left:1.2rem;margin:0.6rem 0;">
                <li>Restart your PC.</li>
                <li>Tap the boot menu key repeatedly as it powers on. Common keys:
                    <ul>
                        <li><strong>F12</strong> — Dell, Lenovo</li>
                        <li><strong>F9 / Esc</strong> — HP</li>
                        <li><strong>F2 / Del</strong> — ASUS, MSI, Gigabyte desktops</li>
                        <li><strong>F10</strong> — some HP/Compaq</li>
                        <li>Unsure? Search "[your PC brand/model] boot menu key"</li>
                    </ul>
                </li>
                <li>Select your USB drive from the boot menu and hit Enter.</li>
            </ol>
            <div class="step-tip"> If the USB doesn't appear: disable Secure Boot and Fast Boot in BIOS, then try a different partition scheme (GPT vs MBR) in Rufus.</div>
        `
    },
    {
        num: 5,
        title: "Install Linux",
        body: `
            <p>Once you boot from the USB, most distros show a <strong>live desktop</strong> you can try before committing.</p>
            <ol style="padding-left:1.2rem;margin:0.6rem 0;">
                <li>Select <strong>"Try Linux"</strong> or <strong>"Install Linux"</strong> from the boot menu.</li>
                <li>Double-click <strong>"Install [Distro Name]"</strong> on the desktop if you chose "Try" first.</li>
                <li>Choose your language and keyboard layout.</li>
                <li>Connect to Wi-Fi if needed.</li>
                <li><strong>Installation type</strong> (most important step):
                    <ul>
                        <li><strong>Erase disk and install</strong> — wipes the whole drive. Simplest for a dedicated Linux machine.</li>
                        <li><strong>Install alongside Windows (dual boot)</strong> — keeps Windows, lets you choose at startup. Safer if you're unsure.</li>
                        <li><strong>Manual partitioning</strong> — for advanced users.</li>
                    </ul>
                </li>
                <li>Set your timezone, create username & password, optionally enable disk encryption.</li>
                <li>Click <strong>Install</strong> and wait 10–20 minutes.</li>
                <li>Restart and remove the USB when prompted.</li>
            </ol>
            <div class="step-warn"> "Erase disk" will delete everything on that drive. Double-check you've backed up first!</div>
        `
    },
    {
        num: 6,
        title: "First Boot & After Install",
        body: `
            <p>You're in! Here's what to do right after booting into your new Linux install:</p>
            <ul>
                <li>If you dual-booted, you'll see a <strong>GRUB menu</strong> at startup to choose between Linux and Windows.</li>
                <li>Run your distro's <strong>update tool</strong> right away to get the latest security patches (e.g., "Update Manager" in Mint/Ubuntu).</li>
                <li>Install drivers if needed — Ubuntu/Mint have a built-in "Additional Drivers" tool, especially useful for Nvidia GPUs.</li>
                <li>Explore! Try opening a terminal and typing <code>ls</code>, <code>pwd</code>, and <code>uname -a</code> </li>
            </ul>
            <div class="step-tip"> Done installing? Head to the <strong>Playground</strong> tab to start learning Linux commands interactively!</div>
        `
    }
];

const VIDEOS = {
    mint: [
        { label: "Linux Mint full install walkthrough", url: "https://www.youtube.com/watch?v=osNwuKB-AWM" },
        { label: "Linux Mint beginner's guide (start to finish)", url: "https://www.youtube.com/watch?v=tWBB1mxDogg" }
    ],
    ubuntu: [
        { label: "Ubuntu 24.04 Desktop full install walkthrough", url: "https://www.youtube.com/watch?v=26gV_3Secs0" },
        { label: "Ubuntu 24.04 complete beginner's guide", url: "https://www.youtube.com/watch?v=zE7OYNkuQ1w" }
    ],
    popos: [
        { label: "Pop!_OS complete install guide (2026)", url: "https://www.youtube.com/watch?v=nc79w1Tvm2M" },
        { label: "Pop!_OS beginner's step-by-step guide", url: "https://www.youtube.com/watch?v=TL0kWjSsdpA" }
    ],
    zorin: [
        { label: "Zorin OS installation tutorial for beginners", url: "https://www.youtube.com/watch?v=qwkbPcNHXUw" },
        { label: "Zorin OS 18 step-by-step install guide", url: "https://www.youtube.com/watch?v=zEIvVpgPsco" }
    ],
    fedora: [
        { label: "Fedora Workstation install guide, step-by-step", url: "https://www.youtube.com/watch?v=XZlKIky5Qgc" },
        { label: "Fedora Workstation full walkthrough (latest)", url: "https://www.youtube.com/watch?v=RnfzMwY-l7g" }
    ],
    debian: [
        { label: "Debian 12 tutorial for beginners", url: "https://www.youtube.com/watch?v=zOZEkzwhThc" },
        { label: "Debian 12 UEFI install, step-by-step", url: "https://www.youtube.com/watch?v=Owr-PGxFBQE" }
    ],
    elementary: [
        { label: "elementary OS beginner walkthrough", url: "https://www.youtube.com/watch?v=MJeCyc4BgCA" },
        { label: "How to install elementary OS", url: "https://www.youtube.com/watch?v=VYfG_b8gA1w" }
    ],
    manjaro: [
        { label: "Manjaro Linux install guide for beginners", url: "https://www.youtube.com/watch?v=lqRY8RGPsqg" },
        { label: "Manjaro complete beginner's tutorial", url: "https://www.youtube.com/watch?v=by4qqhgx-Sc" }
    ],
    opensuse: [
        { label: "openSUSE Leap 15.6 install guide, step-by-step", url: "https://www.youtube.com/watch?v=fq0hxOokUr4" },
        { label: "openSUSE Tumbleweed install tutorial", url: "https://www.youtube.com/watch?v=xHJQQcKdFrw" }
    ]
};

const TROUBLESHOOT_ITEMS = [
    "<strong>USB not booting</strong> re-check GPT vs MBR in Rufus, disable Secure Boot/Fast Boot in BIOS.",
    "<strong>Black screen after install (Nvidia GPUs)</strong> boot into &quot;safe graphics&quot; mode from the boot menu, then install proprietary Nvidia drivers after install.",
    "<strong>Windows disappeared from GRUB menu</strong> usually just needs <code>sudo update-grub</code> run from a live USB or terminal.",
    "<strong>Wi-Fi not detected</strong> boot with Ethernet first if possible, then install driver packages once online."
];

function setupWelcomeScreen() {
    const overlay = document.getElementById("welcome-screen");
    const appRoot = document.getElementById("app-root");
    const btnInstall = document.getElementById("btn-choice-install");
    const btnGrind = document.getElementById("btn-choice-grind");

    if (!overlay) return;

    function dismissWelcome(targetTab) {
        overlay.classList.add("fade-out");
        setTimeout(() => {
            overlay.style.display = "none";
            appRoot.style.display = "";
            // Navigate to the chosen tab
            const navBtn = document.querySelector(`[data-tab="${targetTab}"]`);
            if (navBtn) navBtn.click();
        }, 450);
    }

    btnInstall?.addEventListener("click", () => dismissWelcome("install"));
    btnGrind?.addEventListener("click", () => dismissWelcome("trainer"));
}

function setupInstallGuide() {
    renderDistroGrid();
}

function renderDistroGrid() {
    const grid = document.getElementById("distro-grid");
    if (!grid) return;
    grid.innerHTML = "";
    DISTROS.forEach(d => {
        const card = document.createElement("button");
        card.className = "distro-card";
        card.setAttribute("aria-label", `Select ${d.name}`);
        card.innerHTML = `
            <span class="distro-card-logo">${d.logo}</span>
            <span class="distro-card-name">${d.name}</span>
            <span class="distro-card-tag">${d.tag}</span>
            ${d.badge ? `<span class="distro-card-badge">${d.badge}</span>` : ""}
        `;
        card.addEventListener("click", () => {
            sfx.playClick();
            grid.querySelectorAll(".distro-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            showInstallSteps(d);
        });
        grid.appendChild(card);
    });
}

function showInstallSteps(distro) {
    const container = document.getElementById("install-steps-container");
    if (!container) return;
    container.classList.remove("hidden");

    // Build HTML for all steps
    let html = `
        <div class="selected-distro-banner">
            <span>${distro.logo}</span>
            <span>Installing: <strong>${distro.name}</strong></span>
            <button class="btn-change-distro" id="btn-change-distro"> Change Distro</button>
        </div>
    `;

    INSTALL_STEPS.forEach(step => {
        let body = step.body;
        // Inject the distro-specific download button into Step 2
        if (body.includes("DISTRO_DOWNLOAD_PLACEHOLDER")) {
            body = `
                <p>Download the official <code>.iso</code> file for <strong>${distro.name}</strong> from its official website:</p>
                <a class="distro-download-btn" href="${distro.url}" target="_blank" rel="noopener">
                    Download ${distro.name} ISO
                </a>
                <div class="step-tip"> Always download from the <strong>official website</strong> — never from third-party mirrors you don't trust.</div>
            `;
        }
        html += `
            <div class="install-step-card">
                <div class="install-step-header">
                    <div class="step-number">${step.num}</div>
                    <h4>${step.title}</h4>
                </div>
                <div class="install-step-body">${body}</div>
            </div>
        `;
    });

    // Troubleshooting
    html += `
        <div class="install-troubleshoot-card">
            <h4> Quick Troubleshooting Cheatsheet</h4>
            <ul>
                ${TROUBLESHOOT_ITEMS.map(t => `<li>${t}</li>`).join("")}
            </ul>
        </div>
    `;

    // Video resources (if available for this distro)
    const videoKeys = distro.videos || [];
    const videoLinks = videoKeys.flatMap(k => VIDEOS[k] || []);
    if (videoLinks.length > 0) {
        html += `
            <div class="install-video-card">
                <h4> Video Walkthroughs</h4>
                ${videoLinks.map(v => `
                    <div class="video-link-row">
                        <span>▶</span>
                        <a href="${v.url}" target="_blank" rel="noopener">${v.label}</a>
                    </div>
                `).join("")}
            </div>
        `;
    }

    container.innerHTML = html;
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    // "Change Distro" resets to grid view
    document.getElementById("btn-change-distro")?.addEventListener("click", () => {
        sfx.playClick();
        container.classList.add("hidden");
        container.innerHTML = "";
        const grid = document.getElementById("distro-grid");
        if (grid) grid.querySelectorAll(".distro-card").forEach(c => c.classList.remove("selected"));
    });
}

function setupNavigation() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            sfx.playClick();
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            const tabId = "tab-" + btn.dataset.tab;
            $(tabId).classList.add("active");
            state.activeTab = btn.dataset.tab;
            if (state.activeTab === "trainer" && $("terminal-input")) $("terminal-input").focus();
        });
    });
}

function setupControls() {
    $("btn-toggle-sound")?.addEventListener("click", () => {
        sfx.enabled = !sfx.enabled;
        $("btn-toggle-sound").textContent = sfx.enabled ? "" : "";
        if (sfx.enabled) sfx.playClick();
    });

    $("btn-toggle-font")?.addEventListener("click", () => {
        sfx.playClick();
        document.body.classList.toggle("large-text-mode");
    });
}

function renderModuleDropdown() {
    const select = $("module-select");
    if (!select) return;
    select.innerHTML = lessons.map((m, i) => `<option value="${i}">${m.title}</option>`).join("");
    select.addEventListener("change", e => { sfx.playClick(); state.currentModuleIdx = +e.target.value; state.currentStepIdx = 0; renderLesson(); });
}

function renderLesson() {
    const mod = lessons[state.currentModuleIdx];
    const step = mod.steps[state.currentStepIdx];
    if ($("module-select")) $("module-select").value = state.currentModuleIdx;
    if ($("current-module-title")) $("current-module-title").textContent = mod.title;
    if ($("module-progress-badge")) $("module-progress-badge").textContent = `Step ${state.currentStepIdx + 1} of ${mod.steps.length}`;
    if ($("lesson-description")) $("lesson-description").innerHTML = step.desc;
    if ($("task-instruction")) $("task-instruction").innerHTML = step.task;
    if ($("hint-text")) {
        $("hint-text").innerHTML = step.hint;
        $("hint-text").classList.add("hidden");
    }
}

$("btn-hint")?.addEventListener("click", () => {
    sfx.playClick();
    $("hint-text")?.classList.toggle("hidden");
});

function setupTerminal() {
    const input = $("terminal-input");
    if (!input) return;
    input.addEventListener("keydown", e => {
        sfx.playClick();
        if (e.key === "Enter") {
            const cmdText = input.value.trim();
            if (cmdText) {
                state.commandHistory.push(cmdText);
                state.historyIdx = state.commandHistory.length;
                processCommand(cmdText);
            }
            input.value = "";
        } else if (e.key === "ArrowUp" && state.historyIdx > 0) {
            state.historyIdx--;
            input.value = state.commandHistory[state.historyIdx];
        } else if (e.key === "ArrowDown") {
            if (state.historyIdx < state.commandHistory.length - 1) {
                state.historyIdx++;
                input.value = state.commandHistory[state.historyIdx];
            } else {
                state.historyIdx = state.commandHistory.length;
                input.value = "";
            }
        } else if (e.key === "Tab") {
            e.preventDefault();
            autoCompleteCommand();
        }
    });

    $("btn-clear-term")?.addEventListener("click", () => {
        sfx.playClick();
        const welcome = $("terminal-output")?.querySelector(".terminal-welcome");
        if ($("terminal-output")) $("terminal-output").innerHTML = "";
        if (welcome && $("terminal-output")) $("terminal-output").appendChild(welcome);
        const inputLine = document.createElement("div");
        inputLine.className = "input-line";
        inputLine.innerHTML = `<span class="prompt-user">user@linux-sandbox</span>:<span class="prompt-path" id="prompt-path">${escapeHTML(vfs.getPromptPath())}</span>$&nbsp;<input type="text" id="terminal-input" autocomplete="off" spellcheck="false">`;
        $("terminal-output")?.appendChild(inputLine);
        setupTerminal();
    });

    $("btn-reset-fs")?.addEventListener("click", () => {
        sfx.playClick();
        vfs.reset();
        updatePromptPath();
        renderFileTree();
        printToTerminal("Virtual filesystem reset.", "info");
    });
}

// ponytail: updatePromptPath inlined at call sites below
function updatePromptPath() { if ($("prompt-path")) $("prompt-path").textContent = vfs.getPromptPath(); }

function printToTerminal(text, type = "normal", promptStr = null) {
    const line = document.createElement("div");
    line.className = "terminal-line";
    if (promptStr) line.innerHTML = `<span class="prompt-user">user@linux-sandbox</span>:<span class="prompt-path">${escapeHTML(promptStr)}</span>$ ${escapeHTML(text)}`;
    else if (type === "error") line.innerHTML = `<span style="color: var(--accent-red)">${escapeHTML(text)}</span>`;
    else if (type === "success") line.innerHTML = `<span style="color: var(--accent-green); font-weight: 600;">${escapeHTML(text)}</span>`;
    else if (type === "info") line.innerHTML = `<span style="color: var(--accent-cyan)">${escapeHTML(text)}</span>`;
    else line.innerHTML = escapeHTML(text).replace(/\n/g, "<br>");

    const term = $("terminal-output");
    const inputLine = term?.querySelector(".input-line");
    if (term && inputLine) term.insertBefore(line, inputLine);
    if (term) term.scrollTop = term.scrollHeight;
}

function escapeHTML(str) { return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function processCommand(cmdStr) {
    state.commandsRunCount++;
    if (state.commandsRunCount === 1) unlockBadge("first_step");

    const originalCmdStr = cmdStr;
    // Expand a leading alias (e.g. "ll" "ls -la") before anything else runs.
    const firstToken = cmdStr.trim().split(/\s+/)[0];
    if (vfs.aliases[firstToken]) {
        cmdStr = cmdStr.trim().replace(firstToken, vfs.aliases[firstToken]);
    }

    printToTerminal(originalCmdStr, "normal", vfs.getPromptPath());

    if (cmdStr.includes("|")) {
        unlockBadge("pipe_wizard");
        handlePipeCommand(cmdStr);
        checkLessonAndMissions(originalCmdStr);
        renderFileTree(); updatePromptPath(); return;
    }
    if (cmdStr.includes(">")) {
        handleRedirectionCommand(cmdStr);
        checkLessonAndMissions(originalCmdStr);
        renderFileTree(); updatePromptPath(); return;
    }

    const parts = cmdStr.split(/\s+/);
    const mainCmd = parts[0];
    const args = parts.slice(1);

    switch (mainCmd) {
        case "pwd": printToTerminal(vfs.getCwdString()); break;
        case "ls": handleLs(args); break;
        case "cd": handleCd(args[0]); break;
        case "mkdir": handleMkdir(args); break;
        case "touch": handleTouch(args[0]); break;
        case "cp": handleCp(args); break;
        case "mv": handleMv(args); break;
        case "rm": handleRm(args); break;
        case "cat": handleCat(args[0]); break;
        case "head": handleHead(args); break;
        case "tail": handleTail(args); break;
        case "wc": handleWc(args); break;
        case "grep": handleGrep(args); break;
        case "find": handleFind(args); break;
        case "chmod": handleChmod(args); break;
        case "whoami": printToTerminal("user"); break;
        case "ps": printToTerminal("PID TTY TIME CMD\n101 pts/0 00:00:01 bash\n405 pts/0 00:00:03 python3"); break;
        case "df": printToTerminal("Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 50G 14G 34G 30% /"); break;
        case "free": printToTerminal(" total used free\nMem: 7.8Gi 2.1Gi 4.2Gi"); break;
        case "echo": printToTerminal(expandVariables(args.join(" ")).replace(/['"]/g, "")); break;
        case "export": handleExport(args); break;
        case "env": printToTerminal(Object.entries(vfs.env).map(([k, v]) => `${k}=${v}`).join("\n")); break;
        case "history": unlockBadge("time_traveler"); printToTerminal(state.commandHistory.map((c, i) => `${i + 1} ${c}`).join("\n") || "(no commands yet)"); break;
        case "alias": handleAlias(cmdStr, args); break;
        case "man": handleMan(args[0]); break;
        case "sort": handleSort(args); break;
        case "uniq": handleUniq(args); break;
        case "date": printToTerminal(new Date().toString().replace(/GMT.*/, "").trim()); break;
        case "uname": printToTerminal(args.includes("-a") ? "Linux linux-sandbox 6.9.0-tutor #1 SMP x86_64 GNU/Linux" : "Linux"); break;
        case "du": printToTerminal(handleDu(args)); break;
        case "kill": printToTerminal(args[0] ? `Process ${args[0]} terminated.` : "kill: usage: kill <PID>", args[0] ? "success" : "error"); break;
        case "bash":
        case "./projects/script.sh": printToTerminal("Script running... OK", "success"); break;
        case "clear": $("btn-clear-term")?.click(); return;
        case "help": printToTerminal("Commands: pwd, ls, cd, mkdir, touch, cp, mv, rm, cat, head, tail, wc, grep, find, chmod, echo, whoami, ps, df, free, export, env, history, alias, man, sort, uniq, date, uname, du, kill, clear, help", "info"); break;
        default: printToTerminal(`bash: ${mainCmd}: command not found. Type 'help'.`, "error"); break;
    }

    checkLessonAndMissions(originalCmdStr);
    renderFileTree();
    updatePromptPath();
}

function handleLs(args) {
    const isLong = args.includes("-la") || args.includes("-l") || args.includes("-a");
    const targetPathStr = args.find(a => !a.startsWith("-")) || ".";
    const node = vfs.getNodeAtPath(vfs.resolvePath(targetPathStr));
    if (!node) return printToTerminal(`ls: cannot access '${targetPathStr}': No such file`, "error");
    if (node.type === "file") return printToTerminal(node.name);
    if (isLong) {
        let out = "total " + Object.keys(node.children).length * 4 + "\n";
        for (const name in node.children) {
            const child = node.children[name];
            const perm = child.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
            out += `${perm} 1 user user 4096 Jul 21 10:00 ${name}\n`;
        }
        printToTerminal(out.trim());
    } else {
        printToTerminal(Object.keys(node.children).join(" ") || "(empty directory)");
    }
}

function handleCd(target) {
    if (!target || target === "~") { vfs.cwdPath = ["home", "user"]; return; }
    const resolved = vfs.resolvePath(target);
    const node = vfs.getNodeAtPath(resolved);
    if (!node) printToTerminal(`bash: cd: ${target}: No such file or directory`, "error");
    else if (node.type !== "dir") printToTerminal(`bash: cd: ${target}: Not a directory`, "error");
    else vfs.cwdPath = resolved;
}

function handleMkdir(args) {
    const isRecursive = args.includes("-p");
    const folderName = args.find(a => !a.startsWith("-"));
    if (!folderName) return printToTerminal("mkdir: missing operand", "error");
    if (/[<>&"]/.test(folderName)) return printToTerminal(`mkdir: cannot create directory '${escapeHTML(folderName)}': invalid character`, "error");

    if (isRecursive) {
        let curr = vfs.getNodeAtPath(vfs.cwdPath);
        folderName.split("/").forEach(p => {
            if (!curr.children[p]) curr.children[p] = { name: p, type: "dir", children: {} };
            curr = curr.children[p];
        });
        printToTerminal(`Created tree '${folderName}'`, "success");
        unlockBadge("folder_master");
        return;
    }
    const curr = vfs.getNodeAtPath(vfs.cwdPath);
    if (curr.children[folderName]) printToTerminal(`mkdir: '${folderName}': File exists`, "error");
    else {
        curr.children[folderName] = { name: folderName, type: "dir", children: {} };
        printToTerminal(`Created directory '${folderName}'`, "success");
        unlockBadge("folder_master");
    }
}

function handleTouch(fileName) {
    if (!fileName) return printToTerminal("touch: missing operand", "error");
    if (/[<>&"]/.test(fileName)) return printToTerminal(`touch: cannot touch '${escapeHTML(fileName)}': invalid character`, "error");
    const parts = fileName.split("/");
    const name = parts.pop();
    const dirNode = vfs.getNodeAtPath(parts.length ? vfs.resolvePath(parts.join("/")) : vfs.cwdPath);
    if (dirNode && dirNode.type === "dir" && !dirNode.children[name]) {
        dirNode.children[name] = { name: name, type: "file", content: "" };
    }
}

function handleCp(args) {
    if (args.length < 2) return printToTerminal("cp: missing operand", "error");
    const srcNode = vfs.getNodeAtPath(vfs.resolvePath(args[0]));
    if (!srcNode) return printToTerminal(`cp: cannot stat '${args[0]}'`, "error");
    const destParts = args[1].split("/");
    const name = destParts.pop();
    const destDir = vfs.getNodeAtPath(destParts.length ? vfs.resolvePath(destParts.join("/")) : vfs.cwdPath);
    if (destDir && destDir.type === "dir") {
        destDir.children[name] = JSON.parse(JSON.stringify(srcNode));
        destDir.children[name].name = name;
        printToTerminal(`Copied '${args[0]}' to '${args[1]}'`, "success");
    }
}

function handleMv(args) {
    if (args.length < 2) return printToTerminal("mv: missing operand", "error");
    const srcPath = vfs.resolvePath(args[0]);
    const srcName = srcPath[srcPath.length - 1];
    const srcParent = vfs.getNodeAtPath(srcPath.slice(0, -1));
    const srcNode = vfs.getNodeAtPath(srcPath);
    if (!srcNode || !srcParent) return printToTerminal(`mv: cannot stat '${args[0]}'`, "error");

    delete srcParent.children[srcName];
    const destParts = args[1].split("/");
    const name = destParts.pop();
    const destDir = vfs.getNodeAtPath(destParts.length ? vfs.resolvePath(destParts.join("/")) : vfs.cwdPath);
    if (destDir) {
        destDir.children[name] = srcNode;
        srcNode.name = name;
        printToTerminal(`Moved '${args[0]}' to '${args[1]}'`, "success");
    }
}

function handleRm(args) {
    if (!args.length) return printToTerminal("rm: missing operand", "error");
    const resolved = vfs.resolvePath(args[args.length - 1]);
    const name = resolved[resolved.length - 1];
    const parent = vfs.getNodeAtPath(resolved.slice(0, -1));
    if (parent && parent.children && parent.children[name]) {
        delete parent.children[name];
        printToTerminal(`Removed '${args[args.length - 1]}'`, "success");
    } else printToTerminal(`rm: cannot remove '${args[args.length - 1]}'`, "error");
}

function handleCat(fileName) {
    if (!fileName) return printToTerminal("cat: missing file operand", "error");
    const node = vfs.getNodeAtPath(vfs.resolvePath(fileName));
    if (!node) printToTerminal(`cat: ${fileName}: No such file`, "error");
    else if (node.type === "dir") printToTerminal(`cat: ${fileName}: Is a directory`, "error");
    else printToTerminal(node.content || "");
}

// ponytail: head+tail merged; ceiling = no -c (byte) flag support
function handleHead(args, tail = false) {
    const n = args.includes("-n") ? parseInt(args[args.indexOf("-n") + 1]) : 10;
    const node = vfs.getNodeAtPath(vfs.resolvePath(args[args.length - 1]));
    if (!node || node.type !== "file") return printToTerminal((tail ? "tail" : "head") + ": invalid file", "error");
    const lines = node.content.split("\n");
    printToTerminal((tail ? lines.slice(Math.max(lines.length - n, 0)) : lines.slice(0, n)).join("\n"));
}
function handleTail(args) { handleHead(args, true); }

function handleWc(args) {
    const file = args[args.length - 1];
    const node = vfs.getNodeAtPath(vfs.resolvePath(file));
    if (!node || node.type !== "file") return printToTerminal(`wc: ${file}: No such file`, "error");
    printToTerminal(`${node.content.split("\n").length} ${file}`);
}

function handleGrep(args) {
    if (args.length < 2) return printToTerminal("grep: usage: grep PATTERN FILE", "error");
    const isIgnoreCase = args.includes("-i");
    const isShowLineNum = args.includes("-n");
    const pattern = args.find(a => !a.startsWith("-"));
    const fileName = args[args.length - 1];
    const node = vfs.getNodeAtPath(vfs.resolvePath(fileName));
    if (!node || node.type !== "file") return printToTerminal(`grep: ${fileName}: No such file`, "error");

    unlockBadge("grep_detective");
    const matches = node.content.split("\n").filter((l, idx) => {
        const match = isIgnoreCase ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern);
        return match;
    }).map((l, i) => isShowLineNum ? `${i + 1}:${l}` : l);

    printToTerminal(matches.length ? matches.join("\n") : `No matches for '${pattern}'`);
}

function handleFind(args) {
    const nameIdx = args.indexOf("-name");
    const pattern = nameIdx !== -1 ? args[nameIdx + 1].replace(/['"]/g, "").replace("*", "") : "";
    function searchTree(node, currPath) {
        let results = [];
        if (node.name.includes(pattern)) results.push(currPath);
        if (node.type === "dir" && node.children) {
            for (const c in node.children) results = results.concat(searchTree(node.children[c], `${currPath}/${c}`));
        }
        return results;
    }
    const userNode = vfs.getNodeAtPath(["home", "user"]);
    printToTerminal(searchTree(userNode, ".").join("\n") || "No files found.");
}

function handleChmod(args) {
    if (args.length < 2) return printToTerminal("chmod: missing operand", "error");
    const node = vfs.getNodeAtPath(vfs.resolvePath(args[1]));
    if (!node) return printToTerminal(`chmod: cannot access '${args[1]}'`, "error");
    node.perm = args[0];
    printToTerminal(`Changed permissions of '${args[1]}' to ${args[0]}`, "success");
    unlockBadge("chmod_security");
}

function handleRedirectionCommand(cmdStr) {
    const isAppend = cmdStr.includes(">>");
    const parts = cmdStr.split(isAppend ? ">>" : ">");
    const leftCmd = parts[0].trim();
    const fileName = parts[1].trim();

    let outputText = "";
    if (leftCmd.startsWith("echo")) outputText = leftCmd.replace(/^echo\s+/, "").replace(/['"]/g, "");
    else if (leftCmd.startsWith("cat")) {
        const node = vfs.getNodeAtPath(vfs.resolvePath(leftCmd.split(/\s+/)[1]));
        outputText = node ? node.content : "";
    }

    const resolved = vfs.resolvePath(fileName);
    const name = resolved[resolved.length - 1];
    const parentNode = vfs.getNodeAtPath(resolved.slice(0, -1));

    if (parentNode && parentNode.type === "dir") {
        if (!parentNode.children[name]) parentNode.children[name] = { name: name, type: "file", content: "" };
        if (isAppend) parentNode.children[name].content += "\n" + outputText;
        else parentNode.children[name].content = outputText;
        printToTerminal(`Wrote output into '${fileName}'`, "success");
    }
}

function handlePipeCommand(cmdStr) {
    const segments = cmdStr.split("|").map(s => s.trim());
    printToTerminal(`[Pipe Pipeline: ${segments.join(" ")}]`, "info");

    // First segment establishes the starting text (cat/sort file, or echo text).
    const firstParts = segments[0].split(/\s+/);
    const firstCmd = firstParts[0];
    let lines = [];
    if (firstCmd === "cat") {
        const node = vfs.getNodeAtPath(vfs.resolvePath(firstParts[1]));
        if (!node) return printToTerminal(`cat: ${firstParts[1]}: No such file`, "error");
        lines = node.content.split("\n");
    } else if (firstCmd === "sort") {
        const isRev = firstParts.includes("-r");
        const file = firstParts.find((a, i) => i > 0 && !a.startsWith("-"));
        const node = vfs.getNodeAtPath(vfs.resolvePath(file));
        if (!node) return printToTerminal(`sort: ${file}: No such file`, "error");
        unlockBadge("data_sorter");
        lines = node.content.split("\n").sort();
        if (isRev) lines.reverse();
    } else if (firstCmd === "echo") {
        lines = [expandVariables(firstParts.slice(1).join(" ")).replace(/['"]/g, "")];
    } else {
        return printToTerminal(`bash: ${firstCmd}: unsupported at start of pipeline`, "error");
    }

    // Apply each subsequent stage as a filter over the running "lines" array.
    for (let i = 1; i < segments.length; i++) {
        const parts = segments[i].split(/\s+/);
        const cmd = parts[0];
        if (cmd === "grep") {
            unlockBadge("grep_detective");
            const isIgnoreCase = parts.includes("-i");
            const pattern = parts.find((a, idx) => idx > 0 && !a.startsWith("-"));
            lines = lines.filter(l => isIgnoreCase ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern));
        } else if (cmd === "sort") {
            unlockBadge("data_sorter");
            lines = [...lines].sort();
            if (parts.includes("-r")) lines.reverse();
        } else if (cmd === "uniq") {
            unlockBadge("data_sorter");
            const withCount = parts.includes("-c");
            const collapsed = [];
            for (const l of lines) {
                if (collapsed.length && collapsed[collapsed.length - 1].line === l) collapsed[collapsed.length - 1].count++;
                else collapsed.push({ line: l, count: 1 });
            }
            lines = collapsed.map(c => withCount ? `${String(c.count).padStart(4)} ${c.line}` : c.line);
        } else if (cmd === "head") {
            const n = parts.includes("-n") ? parseInt(parts[parts.indexOf("-n") + 1]) : 10;
            lines = lines.slice(0, n);
        } else if (cmd === "tail") {
            const n = parts.includes("-n") ? parseInt(parts[parts.indexOf("-n") + 1]) : 10;
            lines = lines.slice(Math.max(lines.length - n, 0));
        } else if (cmd === "wc") {
            printToTerminal(`${lines.length}`);
            return;
        } else {
            printToTerminal(`bash: ${cmd}: unsupported in pipeline`, "error");
            return;
        }
    }
    printToTerminal(lines.join("\n"));
}

function expandVariables(text) {
    return text.replace(/\$(\w+)/g, (match, name) => (name in vfs.env ? vfs.env[name] : match));
}

function handleExport(args) {
    const assignment = args.join(" ");
    const match = assignment.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return printToTerminal("export: usage: export NAME=value", "error");
    vfs.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    printToTerminal(`Exported ${match[1]}=${vfs.env[match[1]]}`, "success");
    unlockBadge("env_master");
}

function handleAlias(cmdStr, args) {
    if (!args.length) {
        return printToTerminal(Object.entries(vfs.aliases).map(([k, v]) => `alias ${k}='${v}'`).join("\n") || "(no aliases set)");
    }
    const match = cmdStr.match(/^alias\s+([A-Za-z_][A-Za-z0-9_]*)=['"](.+)['"]$/);
    if (!match) return printToTerminal("alias: usage: alias name=\"command\"", "error");
    vfs.aliases[match[1]] = match[2];
    printToTerminal(`Alias created: ${match[1]} ${match[2]}`, "success");
    unlockBadge("alias_ace");
}

const MAN_PAGES = {
    ls: "ls - list directory contents",
    grep: "grep - print lines matching a pattern",
    cd: "cd - change the current working directory",
    chmod: "chmod - change file access permissions",
    sort: "sort - sort lines of text files",
    uniq: "uniq - report or omit repeated lines",
    export: "export - set an exported shell variable"
};
function handleMan(cmdName) {
    if (!cmdName) return printToTerminal("What manual page do you want? Type 'man <command>'.", "error");
    printToTerminal(MAN_PAGES[cmdName] || `No manual entry for ${cmdName}`, MAN_PAGES[cmdName] ? "info" : "error");
}

function handleSort(args) {
    const isRev = args.includes("-r");
    const file = args.find(a => !a.startsWith("-"));
    const node = vfs.getNodeAtPath(vfs.resolvePath(file));
    if (!node || node.type !== "file") return printToTerminal(`sort: ${file}: No such file`, "error");
    unlockBadge("data_sorter");
    const lines = node.content.split("\n").sort();
    if (isRev) lines.reverse();
    printToTerminal(lines.join("\n"));
}

function handleUniq(args) {
    const withCount = args.includes("-c");
    const file = args.find(a => !a.startsWith("-"));
    const node = vfs.getNodeAtPath(vfs.resolvePath(file));
    if (!node || node.type !== "file") return printToTerminal(`uniq: ${file}: No such file`, "error");
    unlockBadge("data_sorter");
    const lines = node.content.split("\n");
    const collapsed = [];
    for (const l of lines) {
        if (collapsed.length && collapsed[collapsed.length - 1].line === l) collapsed[collapsed.length - 1].count++;
        else collapsed.push({ line: l, count: 1 });
    }
    printToTerminal(collapsed.map(c => withCount ? `${String(c.count).padStart(4)} ${c.line}` : c.line).join("\n"));
}

function handleDu(args) {
    function sizeOf(node) {
        if (node.type === "file") return (node.content || "").length + 32;
        return Object.values(node.children || {}).reduce((sum, c) => sum + sizeOf(c), 0) + 64;
    }
    const node = vfs.getNodeAtPath(vfs.cwdPath);
    const kb = Math.max(4, Math.round(sizeOf(node) / 100));
    return args.includes("-h") ? `${kb}K\t.` : `${kb}\t.`;
}

function autoCompleteCommand() {
    const val = $("terminal-input")?.value;
    const cmds = ["pwd", "ls", "cd", "mkdir", "touch", "cp", "mv", "rm", "cat", "head", "tail", "wc", "grep", "find", "chmod", "echo", "whoami", "ps", "df", "free", "export", "env", "history", "alias", "man", "sort", "uniq", "date", "uname", "du", "kill", "clear", "help"];
    const matches = cmds.filter(c => c.startsWith(val));
    if (matches.length === 1 && $("terminal-input")) $("terminal-input").value = matches[0] + " ";
}

function checkLessonAndMissions(userCmd) {
    const mod = lessons[state.currentModuleIdx];
    const step = mod.steps[state.currentStepIdx];

    if (step.expectedPattern.test(userCmd.trim())) {
        sfx.playSuccess();
        addXP(25);
        printToTerminal(" Task Completed! +25 XP", "success");

        if (state.currentStepIdx < mod.steps.length - 1) {
            state.currentStepIdx++;
        } else {
            triggerConfetti();
            sfx.playLevelUp();
            const completedTitle = lessons[state.currentModuleIdx]?.title || `Module ${state.currentModuleIdx + 1}`;
            syncProgressToBackend(`module_${state.currentModuleIdx + 1}`, completedTitle);
            addXP(100);
            printToTerminal(` Module ${state.currentModuleIdx + 1} Mastered! Bonus +100 XP!`, "success");
            if (state.currentModuleIdx < lessons.length - 1) {
                state.currentModuleIdx++;
                state.currentStepIdx = 0;
            }
        }
        renderLesson();
    }
}

function addXP(amount) {
    state.xp += amount;
    if ($("user-xp")) $("user-xp").textContent = state.xp;
    updateUserRankUI();
    syncQuizToBackend("general_xp", amount, 1, 1);
}

function updateUserRankUI() {
    let idx = 0;
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (state.xp >= RANKS[i].minXP) { idx = i; break; }
    }
    if (idx > state.rankIndex) {
        state.rankIndex = idx;
        sfx.playLevelUp();
        triggerConfetti();
        printToTerminal(` RANK UP! You are now a ${RANKS[idx].name}!`, "success");
    }

    const currentRank = RANKS[idx];
    if ($("user-rank")) $("user-rank").textContent = currentRank.name;
    if ($("rank-icon")) $("rank-icon").textContent = currentRank.icon;

    const nextRank = RANKS[idx + 1];
    if (nextRank && $("xp-progress-fill")) {
        const pct = Math.min(100, Math.max(0, ((state.xp - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100));
        $("xp-progress-fill").style.width = pct + "%";
    }

    if (state.rankIndex >= 4) unlockBadge("linux_graduate");
    if ($("cert-display-rank")) $("cert-display-rank").textContent = currentRank.name;
    if ($("cert-display-xp")) $("cert-display-xp").textContent = state.xp + " XP";
    renderRanksAndBadges();
}

function unlockBadge(badgeId) {
    const badge = ACHIEVEMENTS.find(b => b.id === badgeId);
    if (badge && !state.unlockedBadges.has(badgeId)) {
        state.unlockedBadges.add(badgeId);
        badge.unlocked = true;
        sfx.playLevelUp();
        printToTerminal(` UNLOCKED BADGE: ${badge.title}!`, "success");
        renderRanksAndBadges();
    }
}

function renderFileTree() {
    const container = $("file-tree-view");
    if (!container) return;
    container.innerHTML = "";
    
    function buildTreeHTML(node, pathArr) {
        let html = "";
        const isCurrentDir = vfs.cwdPath.join("/") === pathArr.join("/");
        const activeClass = isCurrentDir ? "active-dir" : "";
        
        if (node.type === "dir") {
            const icon = pathArr.length === 2 ? "" : "";
            html += `<div class="tree-item folder ${activeClass}" style="padding-left: ${(pathArr.length - 2) * 14}px">
                        <span>${icon} ${node.name}/</span>
                     </div>`;
            if (node.children) {
                for (const childName in node.children) html += buildTreeHTML(node.children[childName], [...pathArr, childName]);
            }
        } else {
            const icon = node.perm ? "" : "";
            html += `<div class="tree-item file" style="padding-left: ${(pathArr.length - 2) * 14}px">
                        <span>${icon} ${node.name}</span>
                     </div>`;
        }
        return html;
    }

    const homeUserNode = vfs.getNodeAtPath(["home", "user"]);
    if (homeUserNode) container.innerHTML = buildTreeHTML(homeUserNode, ["home", "user"]);
}

function renderRanksAndBadges() {
    const timeline = $("ranks-timeline");
    if (timeline) {
        timeline.innerHTML = "";
        RANKS.forEach((r, idx) => {
            const isUnlocked = state.xp >= r.minXP;
            const isCurrent = state.rankIndex === idx;
            const node = document.createElement("div");
            node.className = `rank-node ${isUnlocked ? "unlocked" : ""} ${isCurrent ? "current" : ""}`;
            node.innerHTML = `<div class="rank-icon-bubble">${r.icon}</div><div class="rank-node-title">${r.name}</div><div class="rank-node-xp">${r.minXP} XP</div>`;
            timeline.appendChild(node);
        });
    }

    const badgesGrid = $("badges-grid");
    if (badgesGrid) {
        badgesGrid.innerHTML = "";
        if ($("unlocked-badges-count")) $("unlocked-badges-count").textContent = state.unlockedBadges.size;
        ACHIEVEMENTS.forEach(b => {
            const card = document.createElement("div");
            card.className = `badge-card ${b.unlocked ? "unlocked" : ""}`;
            card.innerHTML = `<div class="badge-card-icon">${b.icon}</div><div class="badge-card-info"><h4>${b.title} ${b.unlocked ? "(Unlocked)" : "(Locked)"}</h4><p>${b.desc}</p></div>`;
            badgesGrid.appendChild(card);
        });
    }
}

function renderMissions() {
    const grid = $("missions-grid");
    if (!grid) return;
    grid.innerHTML = "";
    tacticalMissions.forEach(m => {
        const card = document.createElement("div");
        card.className = "mission-card";
        card.innerHTML = `
            <div>
                <div class="mission-icon">${m.icon}</div>
                <h3 class="mission-title">${m.title}</h3>
                <p class="mission-desc">${m.desc}</p>
            </div>
            <div>
                <div class="mission-rewards">
                    <span>Task Objective:</span>
                    <span style="color: var(--accent-gold); font-weight: bold;">+${m.xp} XP</span>
                </div>
                <button class="btn-start-mission">Accept Quest </button>
            </div>
        `;
        card.querySelector(".btn-start-mission").addEventListener("click", () => {
            sfx.playClick();
            document.querySelector('[data-tab="trainer"]').click();
            printToTerminal(`=== ACCEPTED MISSION: ${m.title} ===`, "info");
            printToTerminal(` Goal: ${m.task}`, "info");
            unlockBadge("mission_hero");
        });
        grid.appendChild(card);
    });
}

let currentQuizIdx = 0;
function renderQuiz() {
    const q = quizQuestions[currentQuizIdx];
    if (!($("quiz-q-num"))) return;
    $("quiz-q-num").textContent = currentQuizIdx + 1;
    $("quiz-total-q").textContent = quizQuestions.length;
    $("quiz-question-text").textContent = q.q;
    $("quiz-options-container").innerHTML = "";
    $("quiz-feedback")?.classList.add("hidden");
    $("btn-next-question")?.classList.add("hidden");

    q.opts.forEach((opt, idx) => {
        const btn = document.createElement("button");
        btn.className = "quiz-option-btn";
        btn.textContent = opt;
        btn.addEventListener("click", () => handleQuizAnswer(idx, q));
        $("quiz-options-container").appendChild(btn);
    });
}

function handleQuizAnswer(selectedIdx, q) {
    const buttons = $("quiz-options-container")?.querySelectorAll(".quiz-option-btn");
    buttons?.forEach(b => b.style.pointerEvents = "none");
    if (selectedIdx === q.ans) {
        sfx.playSuccess();
        buttons[selectedIdx].classList.add("correct");
        if ($("quiz-feedback")) {
            $("quiz-feedback").className = "quiz-feedback correct";
            $("quiz-feedback").textContent = ` Correct! ${q.explain}`;
        }
        addXP(20);
        unlockBadge("quiz_whiz");
    } else {
        buttons[selectedIdx].classList.add("wrong");
        buttons[q.ans].classList.add("correct");
        if ($("quiz-feedback")) {
            $("quiz-feedback").className = "quiz-feedback wrong";
            $("quiz-feedback").textContent = ` Not quite. ${q.explain}`;
        }
    }
    $("quiz-feedback")?.classList.remove("hidden");
    $("btn-next-question")?.classList.remove("hidden");
}

$("btn-next-question")?.addEventListener("click", () => {
    sfx.playClick();
    currentQuizIdx = (currentQuizIdx + 1) % quizQuestions.length;
    renderQuiz();
});

function renderCheatSheet() {
    const grid = $("cheatsheet-grid");
    if (!grid) return;
    grid.innerHTML = "";
    cheatSheetData.forEach(cat => {
        const card = document.createElement("div");
        card.className = "cs-category-card";
        let html = `<h3>${cat.category}</h3>`;
        cat.cmds.forEach(item => {
            html += `<div class="cs-item"><div class="cs-cmd">${item.cmd}</div><div class="cs-desc">${item.desc}</div></div>`;
        });
        card.innerHTML = html;
        grid.appendChild(card);
    });

    $("cheatsheet-search")?.addEventListener("input", e => {
        const query = e.target.value.toLowerCase();
        grid.querySelectorAll(".cs-item").forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(query) ? "block" : "none";
        });
    });
}

function setupCertificate() {
    $("cert-user-name")?.addEventListener("input", e => {
        if ($("cert-display-name")) $("cert-display-name").textContent = e.target.value || "Linux Learner";
    });
    $("btn-print-cert")?.addEventListener("click", () => {
        sfx.playClick();
        window.print();
    });
}

const DC_UNIVERSAL = {
    beginner: [
        { cmd: "pwd", desc: "Show current directory" },
        { cmd: "ls", desc: "List files" },
        { cmd: "ls -la", desc: "List all files, detailed" },
        { cmd: "cd foldername", desc: "Change directory" },
        { cmd: "cd ..", desc: "Go up one directory" },
        { cmd: "mkdir newfolder", desc: "Create a folder" },
        { cmd: "touch file.txt", desc: "Create an empty file" },
        { cmd: "cp file1 file2", desc: "Copy a file" },
        { cmd: "mv file1 file2", desc: "Move / rename a file" },
        { cmd: "rm file.txt", desc: "Delete a file" },
        { cmd: "clear", desc: "Clear the terminal" },
    ],
    intermediate: [
        { cmd: "cat file.txt", desc: "Print file contents" },
        { cmd: "nano file.txt", desc: "Edit file (simple editor)" },
        { cmd: 'grep "text" file.txt', desc: "Search text inside a file" },
        { cmd: 'find / -name "file.txt"',desc: "Search for a file system-wide" },
        { cmd: "chmod +x script.sh", desc: "Make a file executable" },
        { cmd: "chown user:group file", desc: "Change file owner" },
        { cmd: "ps aux", desc: "List running processes" },
        { cmd: "kill PID", desc: "Stop a process by ID" },
        { cmd: "df -h", desc: "Disk space usage" },
        { cmd: "du -sh folder/", desc: "Size of a folder" },
    ],
    advanced: [
        { cmd: "tar -czvf archive.tar.gz folder/", desc: "Compress a folder" },
        { cmd: "tar -xzvf archive.tar.gz", desc: "Extract archive" },
        { cmd: "systemctl status servicename", desc: "Check service status" },
        { cmd: "systemctl restart servicename", desc: "Restart a service" },
        { cmd: "journalctl -xe", desc: "View system logs" },
        { cmd: "crontab -e", desc: "Schedule recurring tasks" },
        { cmd: "ssh user@ip_address", desc: "Remote login" },
        { cmd: "rsync -avh source/ dest/", desc: "Sync files / folders" },
        { cmd: "awk '{print $1}' file.txt", desc: "Text processing" },
        { cmd: "sed 's/old/new/g' file.txt", desc: "Find & replace in a file" },
    ]
};

// ponytail: distros field removed — stored but never read
const DC_FAMILIES = {
    debian: {
        logo: "", name: "Debian / Ubuntu", pm: "APT",
        beginner: [
            { cmd: "sudo apt update", desc: "Refresh package list" },
            { cmd: "sudo apt upgrade", desc: "Upgrade installed packages" },
            { cmd: "sudo apt install packagename", desc: "Install a package" },
            { cmd: "sudo apt remove packagename", desc: "Remove a package" },
            { cmd: "apt search packagename", desc: "Search for a package" },
        ],
        intermediate: [
            { cmd: "sudo apt full-upgrade", desc: "Upgrade, allowing removals if needed" },
            { cmd: "sudo apt autoremove", desc: "Remove unneeded dependencies" },
            { cmd: "sudo apt autoclean", desc: "Clear old downloaded package files" },
            { cmd: "dpkg -l", desc: "List installed packages" },
            { cmd: "dpkg -i package.deb", desc: "Install a local .deb file" },
            { cmd: "apt-cache policy packagename", desc: "Check installed vs available version" },
        ],
        advanced: [
            { cmd: "sudo add-apt-repository ppa:name/ppa", desc: "Add a third-party repository (PPA)" },
            { cmd: "sudo dpkg --configure -a", desc: "Fix broken package configuration" },
            { cmd: "sudo apt-mark hold packagename", desc: "Prevent a package from updating" },
            { cmd: "sudo apt-get build-dep packagename", desc: "Install build dependencies for source compiling" },
            { cmd: "sudo dpkg --get-selections > pkglist.txt", desc: "Export installed package list (backup/migration)" },
        ]
    },
    fedora: {
        logo: "", name: "Fedora / RHEL", pm: "DNF",
        beginner: [
            { cmd: "sudo dnf check-update", desc: "Check for updates" },
            { cmd: "sudo dnf upgrade", desc: "Upgrade all packages" },
            { cmd: "sudo dnf install packagename", desc: "Install a package" },
            { cmd: "sudo dnf remove packagename", desc: "Remove a package" },
            { cmd: "dnf search packagename", desc: "Search for a package" },
        ],
        intermediate: [
            { cmd: "dnf list installed", desc: "List installed packages" },
            { cmd: "dnf info packagename", desc: "Show package details" },
            { cmd: "sudo dnf autoremove", desc: "Remove unused dependencies" },
            { cmd: "sudo rpm -i package.rpm", desc: "Install a local .rpm file" },
            { cmd: "dnf history", desc: "View transaction history" },
        ],
        advanced: [
            { cmd: "sudo dnf history undo <id>", desc: "Roll back a transaction" },
            { cmd: "sudo dnf config-manager --add-repo url", desc: "Add a repository" },
            { cmd: "sudo dnf module list", desc: "List application streams (modules)" },
            { cmd: "sudo dnf mark install packagename", desc: "Mark package as manually installed" },
            { cmd: "sudo dnf builddep packagename", desc: "Install build dependencies" },
        ]
    },
    arch: {
        logo: "", name: "Arch Linux", pm: "Pacman",
        beginner: [
            { cmd: "sudo pacman -Syu", desc: "Sync + update all packages" },
            { cmd: "sudo pacman -S packagename", desc: "Install a package" },
            { cmd: "sudo pacman -R packagename", desc: "Remove a package" },
            { cmd: "pacman -Ss packagename", desc: "Search for a package" },
        ],
        intermediate: [
            { cmd: "pacman -Q", desc: "List installed packages" },
            { cmd: "pacman -Qi packagename", desc: "Show package info" },
            { cmd: "sudo pacman -Rs packagename", desc: "Remove package + unused dependencies" },
            { cmd: "sudo pacman -Sc", desc: "Clear package cache" },
            { cmd: "pacman -Qdt", desc: "List orphaned packages" },
        ],
        advanced: [
            { cmd: "yay -S packagename", desc: "Install from AUR (with AUR helper)" },
            { cmd: "sudo pacman -Syyu", desc: "Force refresh all repos + upgrade" },
            { cmd: "sudo pacman -U /path/to/package.pkg.tar.zst", desc: "Install a local package file" },
            { cmd: "sudo pacman -Rns $(pacman -Qdtq)", desc: "Remove all orphaned packages recursively" },
            { cmd: "sudo reflector --latest 20 --save /etc/pacman.d/mirrorlist", desc: "Optimize mirror list" },
        ]
    },
    opensuse: {
        logo: "", name: "openSUSE", pm: "Zypper",
        beginner: [
            { cmd: "sudo zypper refresh", desc: "Refresh repositories" },
            { cmd: "sudo zypper update", desc: "Update all packages" },
            { cmd: "sudo zypper install packagename", desc: "Install a package" },
            { cmd: "sudo zypper remove packagename", desc: "Remove a package" },
            { cmd: "zypper search packagename", desc: "Search for a package" },
        ],
        intermediate: [
            { cmd: "zypper info packagename", desc: "Package details" },
            { cmd: "zypper list-updates", desc: "List available updates" },
            { cmd: "sudo zypper install --oldpackage packagename=version", desc: "Install a specific version" },
            { cmd: "zypper packages --installed-only", desc: "List installed packages" },
        ],
        advanced: [
            { cmd: "sudo zypper dup", desc: "Distribution upgrade (across versions)" },
            { cmd: "sudo zypper addrepo url reponame", desc: "Add a repository" },
            { cmd: "sudo zypper lr", desc: "List configured repositories" },
            { cmd: "sudo zypper install -t pattern patternname", desc: "Install a software pattern/group" },
            { cmd: "sudo zypper rollback", desc: "Roll back using snapper snapshots (Btrfs)" },
        ]
    }
};

const DC_COMPARE = [
    { task: "Install a package", deb: "sudo apt install pkg", fed: "sudo dnf install pkg", arch: "sudo pacman -S pkg", suse: "sudo zypper install pkg" },
    { task: "Remove a package", deb: "sudo apt remove pkg", fed: "sudo dnf remove pkg", arch: "sudo pacman -R pkg", suse: "sudo zypper remove pkg" },
    { task: "Update package list", deb: "sudo apt update", fed: "sudo dnf check-update", arch: "sudo pacman -Sy", suse: "sudo zypper refresh" },
    { task: "Upgrade all packages", deb: "sudo apt upgrade", fed: "sudo dnf upgrade", arch: "sudo pacman -Syu", suse: "sudo zypper update" },
    { task: "Search for a package", deb: "apt search pkg", fed: "dnf search pkg", arch: "pacman -Ss pkg", suse: "zypper search pkg" },
    { task: "List installed packages", deb: "dpkg -l", fed: "dnf list installed", arch: "pacman -Q", suse: "zypper packages --installed-only" },
    { task: "Remove unused deps", deb: "sudo apt autoremove", fed: "sudo dnf autoremove", arch: "sudo pacman -Rns $(pacman -Qdtq)", suse: "sudo zypper rm --clean-deps" },
    { task: "Install local package file", deb: "dpkg -i file.deb", fed: "sudo rpm -i file.rpm", arch: "sudo pacman -U file.pkg.zst", suse: "sudo zypper install file.rpm" },
    { task: "Add a repository", deb: "add-apt-repository ppa:x/y", fed: "dnf config-manager --add-repo url",arch: "edit /etc/pacman.conf", suse: "zypper addrepo url name" },
    { task: "Show package info", deb: "apt-cache show pkg", fed: "dnf info pkg", arch: "pacman -Qi pkg", suse: "zypper info pkg" },
];

function dcShowView(id) {
    document.querySelectorAll(".dc-view").forEach(v => v.classList.add("hidden"));
    document.getElementById(id)?.classList.remove("hidden");
}

// ponytail: tab-activate extracted to avoid 3× identical querySelectorAll+classList pattern
function dcActivateTab(scope, level) {
    document.querySelectorAll(`${scope} .dc-level-tab`).forEach(t => t.classList.remove("active"));
    document.querySelector(`${scope} .dc-level-tab[data-level='${level}']`)?.classList.add("active");
}

function dcRenderCmds(containerId, cmds, label) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="dc-cmd-card">
            <div class="dc-cmd-card-header">
                <span>${label}</span>
                <button class="dc-copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(cmds.map(c=>c.cmd).join('\n'))}).then(()=>{this.textContent=' Copied';setTimeout(()=>this.textContent='Copy all',1500)})">Copy all</button>
            </div>
            <table class="dc-cmd-table"><tbody>${cmds.map(c=>`
                <tr class="dc-cmd-row">
                    <td class="dc-cmd-code">${c.cmd}</td>
                    <td class="dc-cmd-desc"># ${c.desc}</td>
                </tr>`).join("")}
            </tbody></table>
        </div>`;
}

function dcRenderCompare() {
    const tbl = document.getElementById("dc-compare-table");
    if (!tbl) return;
    tbl.innerHTML = `
        <thead><tr>
            <th>Task</th>
            <th class="th-deb"> Debian/Ubuntu<br><small>apt</small></th>
            <th class="th-fed"> Fedora/RHEL<br><small>dnf</small></th>
            <th class="th-arch"> Arch<br><small>pacman</small></th>
            <th class="th-suse"> openSUSE<br><small>zypper</small></th>
        </tr></thead>
        <tbody>${DC_COMPARE.map(r=>`
            <tr>
                <td>${r.task}</td>
                <td><code>${r.deb}</code></td>
                <td><code>${r.fed}</code></td>
                <td><code>${r.arch}</code></td>
                <td><code>${r.suse}</code></td>
            </tr>`).join("")}
        </tbody>`;
}

function setupDistroCommands() {
    let currentFamily = "debian";

    document.querySelectorAll(".dc-family-card").forEach(card => {
        card.addEventListener("click", () => {
            sfx.playClick();
            currentFamily = card.dataset.family;
            const fam = DC_FAMILIES[currentFamily];
            document.getElementById("dc-fam-logo").textContent = fam.logo;
            document.getElementById("dc-fam-heading").textContent = fam.name;
            dcActivateTab("#dc-family-view", "beginner");
            dcRenderCmds("dc-level-content", fam.beginner, `${fam.pm} — Beginner`);
            dcShowView("dc-family-view");
        });
    });

    document.querySelectorAll("#dc-family-view .dc-level-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            sfx.playClick();
            dcActivateTab("#dc-family-view", tab.dataset.level);
            const fam = DC_FAMILIES[currentFamily];
            dcRenderCmds("dc-level-content", fam[tab.dataset.level], `${fam.pm} — ${tab.dataset.level.charAt(0).toUpperCase()+tab.dataset.level.slice(1)}`);
        });
    });

    document.querySelectorAll("#dc-universal-view .dc-level-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            sfx.playClick();
            dcActivateTab("#dc-universal-view", tab.dataset.level);
            const key = tab.dataset.level.replace("uni-","");
            dcRenderCmds("dc-uni-content", DC_UNIVERSAL[key], `Universal — ${key.charAt(0).toUpperCase()+key.slice(1)}`);
        });
    });

    ["dc-link-universal-landing","dc-link-universal-landing2","dc-fam-universal"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => {
            sfx.playClick();
            dcActivateTab("#dc-universal-view", "uni-beginner");
            dcRenderCmds("dc-uni-content", DC_UNIVERSAL.beginner, "Universal — Beginner");
            dcShowView("dc-universal-view");
        });
    });

    ["dc-link-compare-landing","dc-fam-compare"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => { sfx.playClick(); dcRenderCompare(); dcShowView("dc-compare-view"); });
    });

    // ponytail: 3 identical back-btn handlers loop
    [["dc-back-btn","dc-landing"],["dc-universal-back","dc-landing"],["dc-compare-back","dc-landing"]].forEach(([id,view]) => {
        document.getElementById(id)?.addEventListener("click", () => { sfx.playClick(); dcShowView(view); });
    });
}
