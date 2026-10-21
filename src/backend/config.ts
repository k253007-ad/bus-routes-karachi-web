// Public Firebase client configuration from the original app website.
// This is not an Admin SDK credential; access is enforced by Firebase rules.
const originalFirebaseConfig = {
  "apiKey": "AIzaSyAglpv7Vw8kUpHcnZHrsfVYl9JkiMHZlnE",
  "authDomain": "busprojectmmd.firebaseapp.com",
  "databaseURL": "https://busprojectmmd-default-rtdb.firebaseio.com",
  "projectId": "busprojectmmd",
  "storageBucket": "busprojectmmd.firebasestorage.app",
  "messagingSenderId": "183878356444",
  "appId": "1:183878356444:android:9022a5fa7837d89ada5319"
} as const

// A Web client key for this same project may be supplied without changing the
// public database or copying any administrator credentials into the app.
export const firebaseConfig = {
  ...originalFirebaseConfig,
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || originalFirebaseConfig.apiKey,
}

export const reviewsApiUrl = import.meta.env?.VITE_REVIEWS_API_URL || 'https://api.rungpk.com/api/v1/'
