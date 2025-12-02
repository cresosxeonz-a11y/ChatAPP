// login.js (single file: Firebase config + auth + UI handlers)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* =========================
   CONFIG & INIT
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCf834zOmx_cZRpGVERQBRKKoz75eQuzQg",
  authDomain: "chautara-chat.firebaseapp.com",
  projectId: "chautara-chat",
  storageBucket: "chautara-chat.firebasestorage.app",
  messagingSenderId: "721377984762",
  appId: "1:721377984762:web:d78febb64826c4ee8a0943",
  measurementId: "G-EJY8WBD90D"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/* =========================
   UI elements & basic toggles
   ========================= */
const container = document.querySelector('.container');
const registerBtnToggle = document.querySelector('.register-btn');
const loginBtnToggle = document.querySelector('.login-btn');

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const googleLoginBtn = document.getElementById("google-login-btn");
const googleRegisterBtn = document.getElementById("google-register-btn");
const loginPage = document.getElementById("login-page");
const chatSystem = document.getElementById("chat-system");

const usernameModal = document.getElementById("username-modal");
const usernameInput = document.getElementById("username-input");
const usernameSaveBtn = document.getElementById("username-save-btn");
const usernameCancelBtn = document.getElementById("username-cancel-btn");
const usernameError = document.getElementById("username-error");

const logoutBtn = document.getElementById("logout-btn");

/* Toggle UI between login and register */
if (registerBtnToggle) registerBtnToggle.addEventListener('click', () => container.classList.add('active'));
if (loginBtnToggle) loginBtnToggle.addEventListener('click', () => container.classList.remove('active'));

/* Helper: username validation */
function validateUsernameRaw(name) {
  if (!name) return "Username required";
  const s = name.trim();
  if (s.length < 3 || s.length > 20) return "Username must be 3–20 characters";
  const re = /^[a-z0-9_.]+$/; // lowercase letters, numbers, underscores, dots
  if (!re.test(s)) return "Use lowercase letters, numbers, underscores or dots only";
  return null;
}

/* Show/hide username modal */
function showUsernameModal() {
  usernameError.textContent = "";
  usernameInput.value = "";
  usernameModal.style.display = "block";
  usernameInput.focus();
}
function hideUsernameModal() {
  usernameModal.style.display = "none";
}

/* =========================
   Firestore transactional username claim
   - Creates users/{uid} and usernames/{usernameLower}
   - Ensures uniqueness via transaction
   ========================= */
async function claimUsernameForUser(uid, email, username) {
  const usernameLower = username.toLowerCase();
  const userDocRef = doc(db, "users", uid);
  const usernameRef = doc(db, "usernames", usernameLower);

  try {
    await runTransaction(db, async (tx) => {
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists()) {
        throw new Error("Username is already taken");
      }
      const userSnap = await tx.get(userDocRef);
      if (userSnap.exists() && userSnap.data().username) {
        throw new Error("User already has a username");
      }
      // create mapping doc (username -> uid)
      tx.set(usernameRef, { uid: uid, createdAt: serverTimestamp() });
      // create user doc (merge)
      tx.set(userDocRef, { username: username, email: email || null, createdAt: serverTimestamp() }, { merge: true });
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || "Failed to claim username" };
  }
}

async function userHasUsername(uid) {
  try {
    const u = await getDoc(doc(db, "users", uid));
    if (!u.exists()) return false;
    const data = u.data();
    return !!data.username;
  } catch (err) {
    console.error("userHasUsername error", err);
    return false;
  }
}

/* =========================
   Username modal actions
   ========================= */
usernameSaveBtn.addEventListener("click", async () => {
  const raw = (usernameInput.value || "").trim();
  const validationErr = validateUsernameRaw(raw);
  if (validationErr) {
    usernameError.textContent = validationErr;
    return;
  }
  usernameSaveBtn.disabled = true;
  usernameError.textContent = "Checking availability...";
  const user = auth.currentUser;
  if (!user) {
    usernameError.textContent = "No user signed in (try signing in again)";
    usernameSaveBtn.disabled = false;
    return;
  }

  const { success, message } = await claimUsernameForUser(user.uid, user.email || null, raw);
  if (!success) {
    usernameError.textContent = message || "Could not claim username";
    usernameSaveBtn.disabled = false;
    return;
  }

  // success
  hideUsernameModal();
  usernameSaveBtn.disabled = false;
});

usernameCancelBtn.addEventListener("click", async () => {
  hideUsernameModal();
  try { await signOut(auth); } catch (e) { /* ignore */ }
});

/* =========================
   Registration handler (email/password)
   Fields: [0] username, [1] email, [2] password
   ========================= */
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = e.target[0].value.trim();
  const email = e.target[1].value.trim();
  const password = e.target[2].value;

  const v = validateUsernameRaw(username);
  if (v) { alert(v); return; }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const res = await claimUsernameForUser(user.uid, user.email || null, username);
    if (!res.success) {
      // username taken: sign out and ask user to choose another username
      alert("Username already taken. Please choose a different username.");
      await signOut(auth);
      return;
    }
    // onAuthStateChanged will show chat
  } catch (err) {
    alert(err.message || "Registration failed");
  }
});

/* =========================
   Login handler (email/password)
   Fields: [0] email, [1] password
   ========================= */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target[0].value;
  const password = e.target[1].value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles UI
  } catch (err) {
    alert(err.message || "Login failed");
  }
});

/* =========================
   Google sign-in (both register & login buttons use same flow)
   After sign in, onAuthStateChanged checks if username exists and shows modal if not.
   ========================= */
async function handleGoogleSignIn() {
  try {
    await signInWithPopup(auth, provider);
    // popup returns; onAuthStateChanged will run
  } catch (err) {
    alert(err.message || "Google sign-in failed");
  }
}
if (googleLoginBtn) googleLoginBtn.addEventListener("click", handleGoogleSignIn);
if (googleRegisterBtn) googleRegisterBtn.addEventListener("click", handleGoogleSignIn);

/* =========================
   onAuthStateChanged: main control flow
   - If signed in and username exists -> show chat
   - If signed in and username missing -> show username modal
   - If signed out -> show login page
   ========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginPage.style.display = "block";
    chatSystem.style.display = "none";
    hideUsernameModal();
    return;
  }

  // signed in
  const has = await userHasUsername(user.uid);
  if (has) {
    loginPage.style.display = "none";
    chatSystem.style.display = "block";
    hideUsernameModal();
    renderUserInUI(user);
  } else {
    loginPage.style.display = "none";
    chatSystem.style.display = "none";
    showUsernameModal();
  }
});

/* =========================
   Render user info and attach logout
   ========================= */
function renderUserInUI(user) {
  const profileDiv = document.querySelector(".profile-info");
  if (!profileDiv) return;

  // Retrieve username from users/{uid} if you prefer showing app username instead of Google displayName
  getDoc(doc(db, "users", user.uid)).then(snap => {
    const data = snap.exists() ? snap.data() : null;
    const usernameToShow = data && data.username ? data.username : (user.displayName || user.email);
    profileDiv.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; padding:10px;">
        <img src="${user.photoURL || 'images/default.jpg'}" alt="pfp" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
        <div>
          <div style="font-weight:600;">${usernameToShow}</div>
          <div style="font-size:12px; color:#666;">${user.email || ''}</div>
        </div>
      </div>
    `;
  }).catch(err => {
    console.error("Failed to load user doc for display", err);
  });

  // attach logout to top logout button (only attach once)
  if (logoutBtn && !logoutBtn._attached) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (err) {
        console.error(err);
      }
    });
    logoutBtn._attached = true;
  }
}

/* =========================
   Defensive: if an expected element is missing - log it
   ========================= */
if (!loginForm) console.warn("login-form not found");
if (!registerForm) console.warn("register-form not found");
if (!googleLoginBtn) console.warn("google-login-btn not found");
if (!googleRegisterBtn) console.warn("google-register-btn not found");

