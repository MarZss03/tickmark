// Tickmark Hybrid: Firebase setup. One place that starts Firebase, App Check, Authentication, Firestore,
// Remote Config and Firebase AI Logic. Loaded as an ES module straight from Google's CDN (the site has no
// build step). The web config below is a public identifier, not a secret: access is protected by App Check
// and by Firestore security rules. Debug tokens are never written here.
const V = '13.4.0';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;
const [{ initializeApp }, appCheckMod, authMod, firestoreMod, rcMod, aiMod] = await Promise.all([
  import(`${CDN}/firebase-app.js`),
  import(`${CDN}/firebase-app-check.js`),
  import(`${CDN}/firebase-auth.js`),
  import(`${CDN}/firebase-firestore.js`),
  import(`${CDN}/firebase-remote-config.js`),
  import(`${CDN}/firebase-ai.js`),
]);

export const firebaseConfig = {
  apiKey: 'AIzaSyBDmqJeshBteVm_zXoIooq9Sk9WQfyXrVw',
  authDomain: 'tickmark-8531e.firebaseapp.com',
  projectId: 'tickmark-8531e',
  storageBucket: 'tickmark-8531e.firebasestorage.app',
  messagingSenderId: '977283504709',
  appId: '1:977283504709:web:140d407bc220c9007f612c',
};

// reCAPTCHA v3 site key for App Check on the hosted site (a public identifier; the secret stays in Firebase).
export const RECAPTCHA_V3_SITE_KEY = '6LcumzQuAAAAAJA4jOAWmFJ2UVF5HW3Sp7tJGi-Y';

// The AI policy defaults; Remote Config overrides them (see docs/hybrid/CONTRACT.md).
export const POLICY_DEFAULTS = {
  ai_policy_raw_documents: 'device_only',
  ai_policy_redacted_text: 'prefer_device',
  ai_policy_case_history: 'prefer_cloud',
  ai_cloud_model: 'gemini-3.5-flash-lite',
  ai_prompt_version: 'v1',
  ai_enabled: 'true',
};

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// A page can ask for its own Firebase app (and so its own anonymous user) by setting
// self.TICKMARK_APP_NAME before loading this module; the team inbox does, so one person can play both sides.
export const app = self.TICKMARK_APP_NAME ? initializeApp(firebaseConfig, self.TICKMARK_APP_NAME) : initializeApp(firebaseConfig);

// App Check is required by Firebase AI Logic. Locally the debug provider prints a token in the console that is
// registered in the Firebase console once; on the hosted site reCAPTCHA v3 attests the page.
export let appCheckState = 'off';
try {
  // One registered debug token for every local browser (kept in a gitignored file); otherwise Firebase
  // generates a new token per browser that would each need registering.
  if (isLocal) {
    const local = await import('./appcheck-debug.local.js').catch(() => null);
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = local?.APPCHECK_DEBUG_TOKEN || true;
  }
  const siteKey = RECAPTCHA_V3_SITE_KEY || (isLocal ? 'debug-mode' : '');
  if (siteKey) {
    appCheckMod.initializeAppCheck(app, { provider: new appCheckMod.ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    appCheckState = isLocal ? 'debug' : 'recaptcha-v3';
  } else {
    appCheckState = 'missing-site-key';
  }
} catch (e) {
  appCheckState = 'error: ' + e.message;
}

export const auth = authMod.getAuth(app);
export const db = firestoreMod.getFirestore(app);
export const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
export const { InferenceMode, InferenceSource, getGenerativeModel } = aiMod;
export const fs = firestoreMod;
export const authApi = authMod;

// Remote Config: fetched at start, falls back to the defaults offline.
export const remoteConfig = rcMod.getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = isLocal ? 10_000 : 60_000;
remoteConfig.defaultConfig = POLICY_DEFAULTS;
export const configReady = rcMod.fetchAndActivate(remoteConfig).then(() => 'remote', () => 'defaults');
export const policyValue = (key) => rcMod.getValue(remoteConfig, key).asString() || POLICY_DEFAULTS[key];
export const policySource = (key) => rcMod.getValue(remoteConfig, key).getSource();

// Anonymous sign-in: anyone can try the product without an account; the team is chosen in the app.
export const signedIn = new Promise((resolve) => {
  const stop = authMod.onAuthStateChanged(auth, (user) => {
    if (user) { stop(); resolve(user); }
  });
  authMod.signInAnonymously(auth).catch((e) => resolve({ uid: null, error: e.message }));
});

// Real-time policy: when compliance changes a value in the Firebase console, open pages activate it at once
// and the next AI call follows it. fn(updatedKeys) is called after activation.
const policyListeners = new Set();
export function onPolicyChange(fn) { policyListeners.add(fn); return () => policyListeners.delete(fn); }
try {
  rcMod.onConfigUpdate(remoteConfig, {
    next: async (update) => {
      await rcMod.activate(remoteConfig);
      const keys = [...update.getUpdatedKeys()].filter((k) => k in POLICY_DEFAULTS);
      if (keys.length) policyListeners.forEach((fn) => fn(keys));
    },
    error: (e) => console.warn('Remote Config live updates stopped:', e && e.message),
    complete: () => {},
  });
} catch (e) { console.warn('Remote Config live updates unavailable:', e && e.message); }
