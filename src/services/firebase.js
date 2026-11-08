import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBk5MGK6IomPvWAFH7cyI44svqTHYyO1Is",
  authDomain: "first-apk-469d4.firebaseapp.com",
  projectId: "first-apk-469d4",
  storageBucket: "first-apk-469d4.firebasestorage.app",
  messagingSenderId: "382160876662",
  appId: "1:382160876662:web:ee4d9e10a77643f2f9db57",
  measurementId: "G-W7N0JPD915"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export default app;
