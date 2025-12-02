const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');

registerBtn.addEventListener('click', () => {
    container.classList.add('active');
});
loginBtn.addEventListener('click', () => {
    container.classList.remove('active');
});

/* Firebase + Auth + Firestore integration with username-setup + uniqueness enforcement */

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

// UI elements
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

if (!loginForm || !registerForm || !googleLoginBtn) {
  console.warn("Some expected UI elements are missing - ensure your HTML contains login-form, register-form, and google buttons.");
}

/* ----------------------
   Helper: Validate username
   - must be 3..20 chars
   - lowercase letters, numbers, underscore, dot allowed (adjust regex to your rules)
-----------------------*/
function validateUsernameRaw(name) {
  if (!name) return "Username required";
  const s = name.trim();
  if (s.length < 3 || s.length > 20) return "Username must be 3–20 characters";
  // only allow letters, numbers, underscore, dot and no spaces
  const re = /^[a-z0-9_.]+$/;
  if (!re.test(s)) return "Use lowercase letters, numbers, underscores or dots only";
  return null;
}

/* ----------------------
   show / hide username modal
-----------------------*/
function showUsernameModal() {
  usernameError.textContent = "";
  usernameInput.value = "";
  usernameModal.style.display = "flex";
  usernameInput.focus();
}

function hideUsernameModal() {
  usernameModal.style.display = "none";
}

/* ----------------------
   Create username atomically (transaction)
   We create two documents inside a single transaction:
   - users/{uid} with username, email, createdAt
   - usernames/{usernameLower} mapping to uid (document id is usernameLower)
   This prevents duplicates via transaction checking existence of usernames/{usernameLower}
-----------------------*/
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
      // optionally check if userDoc already has a username (avoid reassign)
      const userSnap = await tx.get(userDocRef);
      if (userSnap.exists() && userSnap.data().username) {
        throw new Error("User already has a username");
      }
      // create the mapping doc (username -> uid)
      tx.set(usernameRef, {
        uid: uid,
        createdAt: serverTimestamp()
      });
      // create/merge the user doc
      tx.set(userDocRef, {
        username: username,
        email: email || null,
        createdAt: serverTimestamp()
      }, { merge: true });
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || "Failed to claim username" };
  }
}

/* ----------------------
   Check if a user already has username
-----------------------*/
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

/* ----------------------
   UI: When user clicks Save inside Username modal
-----------------------*/
usernameSaveBtn.addEventListener("click", async () => {
  const raw = (usernameInput.value || "").trim();
  const validationErr = validateUsernameRaw(raw);
  if (validationErr) {
    usernameError.textContent = validationErr;
    return;
  }
  // disable while processing
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

  // success: hide modal and let onAuthStateChanged handle redirect to chat
  hideUsernameModal();
  usernameSaveBtn.disabled = false;
});

/* Cancel -> sign out (optional) or just hide modal
   We'll sign out so user can choose a different account if they wish.
*/
usernameCancelBtn.addEventListener("click", async () => {
  hideUsernameModal();
  try { await signOut(auth); } catch (e) { /* ignore */ }
});

/* ----------------------
   Register with email/password
   The register form has:
   0 -> username input
   1 -> email input
   2 -> password input
   We will attempt to claim username atomically as part of registration.
-----------------------*/
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = e.target[0].value.trim();
  const email = e.target[1].value.trim();
  const password = e.target[2].value;

  const v = validateUsernameRaw(username);
  if (v) { alert(v); return; }

  try {
    // create account first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // now claim username atomically
    const res = await claimUsernameForUser(user.uid, user.email || null, username);
    if (!res.success) {
      // If username claim failed, delete the newly created Firebase Auth user to avoid orphan account
      // WARNING: Deleting the user requires re-auth or admin privileges on client side; so instead, inform user and sign them out.
      alert("Username already taken. We created the account — please choose a different username. Signing out.");
      await signOut(auth);
      return;
    }

    // success -> onAuthStateChanged will show chat
  } catch (err) {
    alert(err.message || "Registration failed");
  }
});

/* ----------------------
   Login with email/password
-----------------------*/
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

/* ----------------------
   Google sign-in
-----------------------*/
async function handleGoogleSignIn() {
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will run and check for username
  } catch (err) {
    alert(err.message || "Google sign-in failed");
  }
}
googleLoginBtn.addEventListener("click", handleGoogleSignIn);
googleRegisterBtn.addEventListener("click", handleGoogleSignIn);

/* ----------------------
   onAuthStateChanged: control flow after sign-in
   - If user logged in:
       - Check if username exists in users/{uid}
         - If yes -> show chat
         - If no -> show username modal
-----------------------*/
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // not signed in
    loginPage.style.display = "block";
    chatSystem.style.display = "none";
    hideUsernameModal();
    return;
  }

  // signed in
  // Check if user has username
  const has = await userHasUsername(user.uid);
  if (has) {
    // go to chat
    loginPage.style.display = "none";
    chatSystem.style.display = "block";
    hideUsernameModal();
    // optionally update UI profile area
    renderUserInUI(user);
  } else {
    // show username modal to force choosing username
    loginPage.style.display = "none";
    chatSystem.style.display = "none";
    showUsernameModal();
  }
});

/* ----------------------
   Basic render of user info in chat UI
-----------------------*/
function renderUserInUI(user) {
  const profileDiv = document.querySelector(".profile-info");
  if (!profileDiv) return;
  profileDiv.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <img src="${user.photoURL || 'images/default.jpg'}" alt="pfp" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
      <div>
        <div style="font-weight:600">${user.displayName || user.email}</div>
        <div style="font-size:12px;color:#666">${user.email || ''}</div>
      </div>
    </div>
  `;
}

/* ----------------------
   Logout
-----------------------*/
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  });
}