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

async function updateUpgradeButton(user) {
    const upgradeBtn = document.getElementById("upgrade-btn");
    if (!upgradeBtn) return;

    if (!user) {
        upgradeBtn.style.display = "block";
        submitBtn.disabled = false;
submitBtn.textContent = "Login";
        return;
    }

    const exams = await getUserExams();

    if (exams.includes("ALL")) {
        upgradeBtn.style.display = "none";
    } else {
        upgradeBtn.style.display = "block";
    }
}

export async function handleLoggedInUser(user) {
    const emailEl = document.getElementById("account-email");
    const gearBtn = document.getElementById("account-gear");

    if (emailEl) {
        emailEl.textContent = "Logged in as: " + user.email;
    }

    if (gearBtn) {
        gearBtn.style.display = "block";
    }

    const loginBtn = document.getElementById("login-tab");
    const signupBtn = document.getElementById("signup-tab");

    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";

    // Upgrade button — after gear so gear always shows regardless
    const headerUpgradeBtn = document.getElementById('header-upgrade-btn');
    if (headerUpgradeBtn) {
        const exams = await getUserExams();
        headerUpgradeBtn.style.display = exams.includes('ALL') ? 'none' : 'block';
    }

    updateUpgradeButton(user);
}

export async function signUp() {
 
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    setAuthLoading(true);
       if (!email || !password) {
    const msg = document.getElementById("auth-message");

    msg.textContent = "Please enter an email and password.";
    msg.style.color = "#ff6b6b";

    return;
}
submitBtn.disabled = true;
submitBtn.textContent = "Creating Account...";


    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        const msg = document.getElementById("auth-message");
setAuthLoading(false);
msg.textContent = error.message;
msg.style.color = "#ff6b6b";
msg.style.marginTop = "10px";
        submitBtn.disabled = false;
submitBtn.textContent = "Create Account";
        return;
    }

submitBtn.textContent = "Creating...";
    if (data.session) {
        handleLoggedInUser(data.user);
        loadHistory(data.user.id);
        submitBtn.classList.add("success");
submitBtn.innerHTML = "✓ Account Created!";

setTimeout(() => {
    setAuthLoading(false);
    const returnTo = document.referrer && !document.referrer.includes('auth.html')
    ? document.referrer
    : '/quiz.html';
window.location.href = returnTo;
}, 700);
document.getElementById("auth-message").textContent = "";
    }
}

export async function login() {
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
     if (!email || !password) {
    const msg = document.getElementById("auth-message");
setAuthLoading(true);
    msg.textContent = "Please enter an email and password.";
    msg.style.color = "#ff6b6b";

    return;
}
submitBtn.disabled = true;
submitBtn.textContent = "Logging In...";
    const { data, error } = await supabase.auth.signInWithPassword({  
        email,
        password
    });

    if (error) {
         setAuthLoading(false);
        const msg = document.getElementById("auth-message");
msg.textContent = error.message;
msg.style.color = "#ff6b6b";
msg.style.marginTop = "10px";
        submitBtn.disabled = false;
submitBtn.textContent = "Login";
        return;
    }
submitBtn.classList.add("success");
submitBtn.textContent = "✓ Logged In!";
    handleLoggedInUser(data.user);
    loadHistory(data.user.id);
    setTimeout(() => {
         setAuthLoading(false);
    const returnTo = document.referrer && !document.referrer.includes('auth.html')
    ? document.referrer
    : '/quiz.html';
window.location.href = returnTo;
}, 700);
    document.getElementById("auth-message").textContent = "";
}

export async function resetPassword() {

    const email =
        document.getElementById("auth-email").value;

    if (!email) {
        alert("Please enter your email first.");
        return;
    }

    const { error } =
        await supabase.auth.resetPasswordForEmail(email, {

            redirectTo:
                window.location.origin + "/auth.html"

        });

    if (error) {
        alert(error.message);
        return;
    }

    alert("Password reset email sent!");
}

export async function logout() {
    await supabase.auth.signOut();

    ["choice-a", "choice-b", "choice-c", "choice-d"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

   const dropdown = document.getElementById("account-dropdown");
if (dropdown) dropdown.style.display = "none"; 
updateUpgradeButton(null);
}

export function initAuthListener() {
    supabase.auth.onAuthStateChange((event, session) => {

        const user = session?.user;
        const authContainer = document.getElementById("auth-container");

        if (user) {
            updateExamLocks();
            handleLoggedInUser(user);
            loadHistory(user.id);
updateUpgradeButton(user);
            // hide inputs
            // Whatever is on line 199, e.g.:
const el = document.getElementById("auth-email");
if (el) el.style.display = "none";  // add the if check
            const pwEl = document.getElementById("auth-password");
if (pwEl) pwEl.style.display = "none";

            // 🔥 HIDE ENTIRE AUTH CARD
            if (authContainer) authContainer.style.display = "none";

        } else {
updateExamLocks();
            const loginBtn = document.getElementById("login-tab");
            const signupBtn = document.getElementById("signup-tab");
updateUpgradeButton(null);
            if (loginBtn) loginBtn.style.display = "inline-block";
            if (signupBtn) signupBtn.style.display = "inline-block";

            const emailEl = document.getElementById("account-email");
            if (emailEl) emailEl.textContent = "";

            const gear = document.getElementById("account-gear");
            if (gear) gear.style.display = "none";
            // Show upgrade button to logged-out users too
const headerUpgradeBtn = document.getElementById('header-upgrade-btn');
if (headerUpgradeBtn) headerUpgradeBtn.style.display = 'block';

            // 🔥 SHOW AUTH CARD AGAIN
            if (authContainer) authContainer.style.display = "block";
        }
    });
}


// AUTH PAGE LOGIC
const loginTab = document.getElementById("login-tab");
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

        submitBtn.textContent =
            authMode === "login"
                ? "Login"
                : "Create Account";
    }
}

if (loginTab) {
    loginTab.classList.add("active");
}
// SWITCH TO LOGIN
if (loginTab) {
    loginTab.addEventListener("click", () => {
        authMode = "login";

        authTitle.textContent = "Welcome Back";
        submitBtn.textContent = "Login";

        loginTab.classList.add("active");
        signupTab.classList.remove("active");
    });
}

// SWITCH TO SIGNUP
if (signupTab) {
    signupTab.addEventListener("click", () => {
        authMode = "signup";

        authTitle.textContent = "Create Account";
        submitBtn.textContent = "Create Account";

        signupTab.classList.add("active");
        loginTab.classList.remove("active");
    });
}

// SUBMIT BUTTON
if (submitBtn) {
    submitBtn.addEventListener("click", async () => {

        if (authMode === "login") {
            await login();
        } else {
            await signUp();
        }

    });
}

const forgotPasswordLink =
    document.getElementById("forgot-password-link");

if (forgotPasswordLink) {

    forgotPasswordLink.addEventListener("click", async () => {

        await resetPassword();

    });

}

export function initHeaderButtons() {
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

// Bottom of auth.js — runs on every page
initAuthListener();
initHeaderButtons();
