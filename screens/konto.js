import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'
import { db, auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';

export default function KontoScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Fehler", "Bitte fülle E-Mail und Passwort aus.");
      return;
    }

    try {
      if (isLogin) {
        // Einloggen
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        // Registrieren
        if (!name.trim() || !birthday.trim()) {
          Alert.alert("Fehler", "Bitte fülle alle Profilfelder aus.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        
        // Profildaten im Firestore hinterlegen
        await setDoc(doc(db, "users", userCredential.user.uid), {
          name: name.trim(),
          birthday: birthday.trim(),
          email: email.trim(),
          wgId: null,
          color: "#007AFF",
          bg: "#EBF4FF"
        });
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Authentifizierungs-Fehler", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Text style={styles.title}>{isLogin ? "Willkommen zurück! 🔑" : "Konto erstellen ✨"}</Text>
        <Text style={styles.sub}>{isLogin ? "Logge dich ein, um deine WG zu sehen." : "Gib deine Daten ein, um zu starten."}</Text>

        {!isLogin && (
          <>
            <TextInput style={styles.input} placeholder="Dein vollständiger Name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Geburtsdatum (z.B. 12.05.1999)" value={birthday} onChangeText={setBirthday} />
          </>
        )}

        <TextInput style={styles.input} placeholder="E-Mail-Adresse" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />

        <TouchableOpacity style={styles.btn} onPress={handleAuth}>
          <Text style={styles.btnText}>{isLogin ? "Einloggen" : "Registrieren"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.switchBtn} onPress={() => setIsLogin(!isLogin)}>
          <Text style={styles.switchText}>
            {isLogin ? "Noch kein Konto? Jetzt registrieren" : "Bereits ein Konto? Hier einloggen"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', justifyContent: 'center', paddingHorizontal: 25 },
  title: { fontSize: 30, fontWeight: 'bold', marginBottom: 8 },
  sub: { fontSize: 16, color: '#8E8E93', marginBottom: 30 },
  input: { backgroundColor: '#F2F2F7', padding: 18, borderRadius: 15, marginBottom: 12, fontSize: 16, color: '#000' },
  btn: { backgroundColor: '#000', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 15 },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  switchBtn: { marginTop: 25, alignItems: 'center' },
  switchText: { color: '#007AFF', fontSize: 15, fontWeight: '500' }
});