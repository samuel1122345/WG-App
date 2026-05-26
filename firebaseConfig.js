import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Hier fügst DU deine Daten von Firebase ein
const firebaseConfig = {
  apiKey: "AIzaSyAzZLJSptgDXTCGJVFzJ4GcSKbllGaXnI0",
  authDomain: "wgos-c1102.firebaseapp.com",
  projectId: "wgos-c1102",
  storageBucket: "wgos-c1102.firebasestorage.app",
  messagingSenderId: "322332151267",
  appId: "1:322332151267:web:affbb6314c27d8f758a4d6",
  measurementId: "G-C4WZGE4YHE"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);

// Datenbank-Referenz exportieren
export const db = getFirestore(app);