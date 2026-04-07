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
        return;
    }

    const exams = await getUserExams();

    if (exams.includes("ALL")) {
        upgradeBtn.style.display = "none";
    } else {
        upgradeBtn.style.display = "block";
    }
}

export function handleLoggedInUser(user) {
    const emailEl = document.getElementById("account-email");
    const gearBtn = document.getElementById("account-gear");

    if (emailEl) {
        emailEl.textContent = "Logged in as: " + user.email;
    }

    if (gearBtn) {
        gearBtn.style.display = "block";
    }

    const loginBtn = document.getElementById("login-btn");
    const signupBtn = document.getElementById("signup-btn");

    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";
    updateUpgradeButton(user);
}

export function showQuizUI() {
    document.getElementById("quiz-section").style.display = "block";
}

export async function signUp() {
    const email = document.getElementById("email-input").value;
    const password = document.getElementById("password-input").value;

    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        alert(error.message);
        return;
    }

    if (data.session) {
        handleLoggedInUser(data.user);
        showQuizUI();
        loadHistory(data.user.id);
    }
}

export async function login() {
    const email = document.getElementById("email-input").value;
    const password = document.getElementById("password-input").value;

    const { data, error } = await supabase.auth.signInWithPassword({  
        email,
        password
    });

    if (error) {
        alert(error.message);
        return;
    }

    handleLoggedInUser(data.user);
    showQuizUI();
    loadHistory(data.user.id);
}

export async function logout() {
    await supabase.auth.signOut();

    document.getElementById("login-btn").style.display = "inline-block";
    document.getElementById("signup-btn").style.display = "inline-block";
    document.getElementById("account-email").textContent = "";

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
            document.getElementById("email-input").style.display = "none";
            document.getElementById("password-input").style.display = "none";

            // 🔥 HIDE ENTIRE AUTH CARD
            if (authContainer) authContainer.style.display = "none";

        } else {
updateExamLocks();
            const loginBtn = document.getElementById("login-btn");
            const signupBtn = document.getElementById("signup-btn");
updateUpgradeButton(null);
            if (loginBtn) loginBtn.style.display = "inline-block";
            if (signupBtn) signupBtn.style.display = "inline-block";

            const emailEl = document.getElementById("account-email");
            if (emailEl) emailEl.textContent = "";

            document.getElementById("email-input").style.display = "inline-block";
            document.getElementById("password-input").style.display = "inline-block";

            const gear = document.getElementById("account-gear");
            if (gear) gear.style.display = "none";

            // 🔥 SHOW AUTH CARD AGAIN
            if (authContainer) authContainer.style.display = "block";
        }
    });
}

// ACCOUNT MENU (SAFE INIT)
const gearBtn = document.getElementById("account-gear");
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
