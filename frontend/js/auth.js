import { supabase } from './supabase.js';
import { loadHistory } from './quiz.js';

export function handleLoggedInUser(user) {
    document.getElementById("user-status").textContent =
        "Logged in as: " + user.email;

    document.getElementById("login-btn").style.display = "none";
    document.getElementById("signup-btn").style.display = "none";
    document.getElementById("logout-btn").style.display = "inline-block";
}

export function showQuizUI() {
    document.getElementById("quiz-section").style.display = "block";
    document.getElementById("auth-required-message").style.display = "none";
}

export function hideQuizUI() {
    document.getElementById("quiz-section").style.display = "none";
    document.getElementById("auth-required-message").style.display = "block";
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

    document.getElementById("user-status").textContent = "";
    document.getElementById("login-btn").style.display = "inline-block";
    document.getElementById("signup-btn").style.display = "inline-block";
    document.getElementById("logout-btn").style.display = "none";

["choice-a", "choice-b", "choice-c", "choice-d"].forEach(id => {
    document.getElementById(id).style.display = "none";
});

    hideQuizUI();
}

export function initAuthListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            handleLoggedInUser(session.user);
            showQuizUI();
            loadHistory(session.user.id);

document.getElementById("email-input").style.display = "none";
document.getElementById("password-input").style.display = "none";
document.getElementById("login-btn").style.display = "none";
document.getElementById("signup-btn").style.display = "none";

        } else {
            document.getElementById("login-btn").style.display = "inline-block";
            document.getElementById("signup-btn").style.display = "inline-block";
            document.getElementById("logout-btn").style.display = "none";
            document.getElementById("user-status").textContent = "";

document.getElementById("email-input").style.display = "inline-block";
document.getElementById("password-input").style.display = "inline-block";

            hideQuizUI();
        }
    });
}
