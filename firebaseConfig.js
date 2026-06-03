
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Deine verifizierten Firebase-Projektdaten
const firebaseConfig = {
  apiKey: "AIzaSyAzZLJSptgDXTCGJVFzJ4GcSKbllGaXnI0",
  authDomain: "wgos-c1102.firebaseapp.com",
  projectId: "wgos-c1102",
  storageBucket: "wgos-c1102.firebasestorage.app",
  messagingSenderId: "322332151267",
  appId: "1:322332151267:web:affbb6314c27d8f758a4d6"
};

// 2. Firebase App mit der Konfiguration initialisieren
const app = initializeApp(firebaseConfig);

// 3. Authentifizierung mit lokalem Speicher (AsyncStorage) starten
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// 4. Firestore Cloud-Datenbank instanziieren
const db = getFirestore(app);

// 5. Alle Module für deine Screens exportieren
export { app, auth, db };