import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const app = initializeApp(firebaseConfig);

/**
 * Phase 8.4: App Check, started in the recommended "Monitor" posture --
 * it attaches a token to every request so the Console's App Check metrics
 * fill in, but nothing is actually REJECTED until enforcement is turned
 * on per-product (Realtime Database / Firestore / Authentication) in the
 * Firebase Console, which only a human with Console access can do (see
 * the Phase 8.4 delivery notes for the exact steps and why that order
 * matters -- turning on enforcement before confirming real traffic has
 * valid tokens would lock out every legitimate player).
 *
 * VITE_RECAPTCHA_SITE_KEY is the public reCAPTCHA v3 site key (safe to
 * ship in the client bundle, same "public by design" tier as the rest of
 * firebaseConfig above -- the matching secret key never leaves the
 * Firebase/reCAPTCHA Console). App Check silently stays off if it's
 * unset, so local dev and any environment that hasn't configured it yet
 * keep working exactly as before -- this is additive, not a hard
 * requirement to run the app.
 *
 * VITE_APPCHECK_DEBUG_TOKEN: for local dev and CI, where reCAPTCHA can't
 * run (no real browser challenge, e.g. this app's own vitest/Playwright
 * runs). Firebase's own debug-token mechanism: set this to "true" to
 * have the SDK print a fresh debug token to the browser console on
 * first load (register that token once in the Console's App Check ->
 * Apps -> ⋮ -> "Manage debug tokens"), or set it to an already-
 * registered token string directly. Never set this in a real
 * deployment's .env -- see the Console steps for why.
 */
if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  // @ts-expect-error -- documented Firebase debug-token global, not a typed SDK export.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
}
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const rtdb = getDatabase(app);
