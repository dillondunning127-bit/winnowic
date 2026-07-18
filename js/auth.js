import { supabase } from './supabase.js';
import { loadHistory } from './quiz.js';
import { getUserExams } from "./subscription.js";
import { updateExamLocks } from "./diagnostics.js";

let cachedUser = null;

export async function getCurrentUser() {
    if (cachedUser) return cachedUser;
    const { data } = await supabase.auth.getUser();
    cachedUser = data.user;
    return cachedUser;
}

// ─────────────────────────────────────────────
// Upgrade button visibility
// ─────────────────────────────────────────────
async function updateUpgradeButton(user) {
    const upgradeBtn = document.getElementById("header-upgrade-btn");
    if (!upgradeBtn) return;

    if (!user) {
        upgradeBtn.style.display = "none";
        return;
    }

    const exams = await getUserExams();
    upgradeBtn.style.display = exams.includes("ALL") ? "none" : "block";
}

// ─────────────────────────────────────────────
// Handle logged-in state UI
// ─────────────────────────────────────────────
export async function handleLoggedInUser(user) {
    const emailEl = document.getElementById("account-email");
    const gearBtn = document.getElementById("account-gear");
    const authBtn = document.getElementById("header-auth-btn");

    if (emailEl) emailEl.textContent = "Logged in as: " + user.email;
    if (gearBtn) gearBtn.style.display = "block";
    if (authBtn) authBtn.style.display = "none";

    const loginBtn = document.getElementById("login-tab");
    const signupBtn = document.getElementById("signup-tab");
    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";

    await updateUpgradeButton(user);
}

// ─────────────────────────────────────────────
// Sign Up
// ─────────────────────────────────────────────
export async function signUp() {
    const agreeCheckbox = document.getElementById("agree-terms-checkbox");
    if (agreeCheckbox && !agreeCheckbox.checked) {
        const msg = document.getElementById("auth-message");
        if (msg) { msg.textContent = "Please agree to the Terms of Use and Privacy Policy."; msg.style.color = "#ff6b6b"; }
        return;
    }

    const email    = document.getElementById("auth-email")?.value;
    const password = document.getElementById("auth-password")?.value;
    // ... rest stays the same

    if (!email || !password) {
        const msg = document.getElementById("auth-message");
        if (msg) { msg.textContent = "Please enter an email and password."; msg.style.color = "#ff6b6b"; }
        return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating Account..."; }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        const msg = document.getElementById("auth-message");
        if (msg) { msg.textContent = error.message; msg.style.color = "#ff6b6b"; msg.style.marginTop = "10px"; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Account"; }
        return;
    }

    if (data.session) {
        handleLoggedInUser(data.user);
        if (document.getElementById('history-container')) loadHistory(data.user.id);
        if (submitBtn) { submitBtn.classList.add("success"); submitBtn.innerHTML = "✓ Account Created!"; }

        setTimeout(() => {
            const returnTo = sessionStorage.getItem('studyPlanReturn')
                ? '/studyplan.html'
                : document.referrer && !document.referrer.includes('auth.html')
                    ? document.referrer
                    : '/quiz.html';
            sessionStorage.removeItem('studyPlanReturn');
            window.location.href = returnTo;
        }, 700);

        const msg = document.getElementById("auth-message");
        if (msg) msg.textContent = "";
    }
}

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────
export async function login() {
    const email    = document.getElementById("auth-email")?.value;
    const password = document.getElementById("auth-password")?.value;

    if (!email || !password) {
        const msg = document.getElementById("auth-message");
        if (msg) { msg.textContent = "Please enter an email and password."; msg.style.color = "#ff6b6b"; }
        return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Logging In..."; }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        const msg = document.getElementById("auth-message");
        if (msg) { msg.textContent = error.message; msg.style.color = "#ff6b6b"; msg.style.marginTop = "10px"; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Login"; }
        return;
    }

    if (submitBtn) { submitBtn.classList.add("success"); submitBtn.textContent = "✓ Logged In!"; }
    handleLoggedInUser(data.user);
    if (document.getElementById('history-container')) loadHistory(data.user.id);

    setTimeout(() => {
        const returnTo = sessionStorage.getItem('studyPlanReturn')
            ? '/studyplan.html'
            : document.referrer && !document.referrer.includes('auth.html')
                ? document.referrer
                : '/quiz.html';
        sessionStorage.removeItem('studyPlanReturn');
        window.location.href = returnTo;
    }, 700);

    const msg = document.getElementById("auth-message");
    if (msg) msg.textContent = "";
}

// ─────────────────────────────────────────────
// Reset Password
// ─────────────────────────────────────────────
export async function resetPassword() {
    const email = document.getElementById("auth-email")?.value;
    if (!email) { alert("Please enter your email first."); return; }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth.html"
    });

    if (error) { alert(error.message); return; }
    alert("Password reset email sent!");
}

// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────
export async function logout() {
    await supabase.auth.signOut();

    ["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    const dropdown = document.getElementById("account-dropdown");
    if (dropdown) dropdown.style.display = "none";

    updateUpgradeButton(null);
}

// ─────────────────────────────────────────────
// Auth state listener
// ─────────────────────────────────────────────
export function initAuthListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        const authContainer = document.getElementById("auth-container");

        if (user) {
            updateExamLocks();
            handleLoggedInUser(user);
            if (document.getElementById('history-container')) loadHistory(user.id);
            updateUpgradeButton(user);

            const emailEl = document.getElementById("auth-email");
            if (emailEl) emailEl.style.display = "none";
            const pwEl = document.getElementById("auth-password");
            if (pwEl) pwEl.style.display = "none";
            if (authContainer) authContainer.style.display = "none";

        } else {
            updateExamLocks();
            updateUpgradeButton(null);

            const authBtn = document.getElementById('header-auth-btn');
            if (authBtn) authBtn.style.display = 'block';

            const upgradeBtn = document.getElementById('header-upgrade-btn');
            if (upgradeBtn) upgradeBtn.style.display = 'none';

            const gear = document.getElementById("account-gear");
            if (gear) gear.style.display = "none";

            const emailEl = document.getElementById("account-email");
            if (emailEl) emailEl.textContent = "";

            const loginBtn = document.getElementById("login-tab");
            const signupBtn = document.getElementById("signup-tab");
            if (loginBtn) loginBtn.style.display = "inline-block";
            if (signupBtn) signupBtn.style.display = "inline-block";

            if (authContainer) authContainer.style.display = "block";
        }
    });
}

// ─────────────────────────────────────────────
// Header buttons (dropdown, logout, nav hiding)
// ─────────────────────────────────────────────
export function initHeaderButtons() {
    // Hide nav link for current page
    

    // Logout
    document.getElementById("logout-btn")
        ?.addEventListener("click", logout);

    // Header auth button
    document.getElementById("header-auth-btn")
        ?.addEventListener("click", () => {
            window.location.href = "/auth.html?mode=signup";
        });

    // Gear dropdown toggle
    const gearBtn  = document.getElementById("account-gear");
    const dropdown = document.getElementById("account-dropdown");

    if (gearBtn && dropdown) {
        gearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.style.display =
                dropdown.style.display === "block" ? "none" : "block";
        });

        document.addEventListener("click", (e) => {
            if (!e.target.closest(".account-menu")) {
                dropdown.style.display = "none";
            }
        });
    }
}

// ─────────────────────────────────────────────
// Auth page tab/submit logic (only runs on auth.html)
// ─────────────────────────────────────────────
const loginTab  = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const submitBtn = document.getElementById("auth-submit-btn");
const authTitle = document.getElementById("auth-title");

let authMode = "login";

function setAuthLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    if (isLoading) {
        submitBtn.textContent = "Loading...";
        submitBtn.style.opacity = "0.7";
        submitBtn.style.cursor = "not-allowed";
    } else {
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
        submitBtn.textContent = authMode === "login" ? "Login" : "Create Account";
    }
}

if (loginTab) loginTab.classList.add("active");

if (loginTab) {
   loginTab.addEventListener("click", () => {
        document.getElementById('signup-legal').style.display = 'none';
        document.getElementById('login-legal').style.display = 'block';
        authMode = "login";
        if (authTitle) authTitle.textContent = "Welcome Back";
        if (submitBtn) submitBtn.textContent = "Login";
        loginTab.classList.add("active");
        signupTab?.classList.remove("active");
    });
}

if (signupTab) {
    signupTab.addEventListener("click", () => {
        document.getElementById('login-legal').style.display = 'none';
        document.getElementById('signup-legal').style.display = 'block';
        authMode = "signup";
        if (authTitle) authTitle.textContent = "Create Account";
        if (submitBtn) submitBtn.textContent = "Create Account";
        signupTab.classList.add("active");
        loginTab?.classList.remove("active");
    });
}

if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
        if (authMode === "login") await login();
        else await signUp();
    });
}

const forgotPasswordLink = document.getElementById("forgot-password-link");
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", async () => {
        await resetPassword();
    });
}

// ─────────────────────────────────────────────
// Auto-init on every page that loads auth.js
// ─────────────────────────────────────────────
initAuthListener();
initHeaderButtons();