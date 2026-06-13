import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, Image, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { updateDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 

export default function ProfilScreen({ currentUser, onClose }) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(currentUser.name);
  const [birthday, setBirthday] = useState(currentUser.birthday);
  
  // Profilbild-Zustände (wird aus Firebase geladen)
  const [avatarType, setAvatarType] = useState(currentUser.avatarType || 'initials'); 
  const [avatarEmoji, setAvatarEmoji] = useState(currentUser.avatarEmoji || '🦊');
  const [avatarBg, setAvatarBg] = useState(currentUser.avatarBg || '#EBF4FF');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');

  const colors = ['#EBF4FF', '#EBFCEF', '#FFF9F2', '#FBF2FF', '#FFECEB', '#F2F2F7'];

  // Profilbild aus der Galerie auswählen
  const pickProfileImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Berechtigung fehlt', 'Wir benötigen Zugriff auf deine Fotos, um ein Profilbild auszuwählen.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', 
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3, 
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;

        const response = await fetch(localUri);
        const blob = await response.blob();
        
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(blob);
        });

        if (base64Data) {
          setAvatarUrl(base64Data);
          setAvatarType('image');
        }
      }
    } catch (error) {
      Alert.alert('Fehler', 'Bildauswahl fehlgeschlagen: ' + error.message);
    }
  };

  // Speichert die Änderungen im Firebase-System ab
  const handleUpdate = async () => {
    if (!name.trim() || !birthday.trim()) {
      Alert.alert('Fehler', 'Bitte fülle Name und Geburtsdatum aus.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', currentUser.id), {
        name: name.trim(),
        birthday: birthday.trim(),
        avatarType,
        avatarEmoji,
        avatarBg,
        avatarUrl,
      });
      Alert.alert('Erfolg', 'Dein Profil wurde für alle WG-Mitglieder aktualisiert.');
      onClose();
    } catch (e) {
      Alert.alert('Fehler', 'Update fehlgeschlagen.');
    }
  };

  // Rendert die große Vorschau oben
  const renderProfileAvatar = () => {
    if (avatarType === 'emoji') {
      return (
        <View style={[styles.bigAvatar, { backgroundColor: avatarBg }]}> 
          <Text style={{ fontSize: 40 }}>{avatarEmoji}</Text>
        </View>
      );
    }

    const isValidUrl = avatarUrl && (
      avatarUrl.startsWith('http://') || 
      avatarUrl.startsWith('https://') || 
      avatarUrl.startsWith('file://') || 
      avatarUrl.startsWith('data:')
    );

    if (avatarType === 'image' && isValidUrl) {
      return <Image source={{ uri: avatarUrl }} style={styles.bigAvatar} resizeMode="cover" />;
    }

    return (
      <View style={[styles.bigAvatar, { backgroundColor: currentUser.color || '#007AFF' }]}> 
        <Text style={styles.bigAvatarText}>
          {name ? name.slice(0, 2).toUpperCase() : '??'}
        </Text>
      </View>
    );
  };

  const sheetMaxHeight = Math.max(520, Math.round(windowHeight * (Platform.OS === 'web' ? 0.82 : 0.86)));
  const sheetBottomPadding = Math.max(insets.bottom, 16) + 18;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: sheetBottomPadding }]}> 
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Dein Profil</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
            <Text style={styles.close}>Schließen</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
          {/* LIVE AVATAR VORSCHAU */}
          <View style={styles.avatarHeaderContainer}>
            {renderProfileAvatar()}
          </View>

          {/* STAMMDATEN FORMULAR */}
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Geburtsdatum</Text>
          <TextInput style={styles.input} value={birthday} onChangeText={setBirthday} />

          {/* SELEKTOR FÜR DEN PROFILBILD-TYP */}
          <Text style={styles.label}>Profilbild-Typ auswählen</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity style={[styles.typeChip, avatarType === 'initials' && styles.typeChipActive]} onPress={() => setAvatarType('initials')}>
              <Text style={[styles.typeChipText, avatarType === 'initials' && { color: '#FFF' }]}>Kürzel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, avatarType === 'emoji' && styles.typeChipActive]} onPress={() => setAvatarType('emoji')}>
              <Text style={[styles.typeChipText, avatarType === 'emoji' && { color: '#FFF' }]}>Emoji</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, avatarType === 'image' && styles.typeChipActive]} onPress={() => setAvatarType('image')}>
              <Text style={[styles.typeChipText, avatarType === 'image' && { color: '#FFF' }]}>Bild</Text>
            </TouchableOpacity>
          </View>

          {/* HINTERGRUND-CONFIGURATOR FÜR EMOJIS */}
          {avatarType === 'emoji' && (
            <View style={styles.configBox}>
              <Text style={styles.innerLabel}>Wähle ein Emoji:</Text>
              <View style={styles.typeRow}>
                {['🦊', '🐱', '🐸', '🍕', '☕', '🚀'].map(e => (
                  <TouchableOpacity key={e} style={[styles.emojiSelect, avatarEmoji === e && { borderColor: '#000' }]} onPress={() => setAvatarEmoji(e)}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.innerLabel}>Hintergrundfarbe:</Text>
              <View style={styles.typeRow}>
                {colors.map(c => (
                  <TouchableOpacity key={c} style={[styles.colorSelect, { backgroundColor: c }, avatarBg === c && { borderWidth: 2, borderColor: '#000' }]} onPress={() => setAvatarBg(c)} />
                ))}
              </View>
            </View>
          )}

          {/* MEDIATHEK ANSTEUERUNG FÜR BILDER */}
          {avatarType === 'image' && (
            <View style={styles.configBox}>
              <TouchableOpacity style={styles.mockGalleryBtn} onPress={pickProfileImage}>
                <Ionicons name="images-outline" size={18} color="#000" />
                <Text style={{ marginLeft: 8, fontWeight: '500' }}>iPhone Fotomediathek öffnen</Text>
              </TouchableOpacity>
              {avatarUrl ? (
                <Text style={styles.imagePathConfirm} numberOfLines={1}>✓ Bild erfolgreich synchronisiert</Text>
              ) : null}
            </View>
          )}

          {/* AKTIONEN BUTTONS */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
            <Text style={styles.saveText}>Änderungen speichern</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={() => signOut(auth)}>
            <Text style={styles.logoutText}>Vom Gerät abmelden</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D1D6',
    marginBottom: 12,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    flex: 1,
    marginRight: 12,
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
  },
  closeButton: {
    minHeight: 44,
    minWidth: 90,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  close: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
  form: {
    flexGrow: 0,
    backgroundColor: '#FFFFFF',
  },
  formContent: {
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 24,
  },
  avatarHeaderContainer: {
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 15,
  },
  bigAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    borderWidth: 0.5,
    borderColor: '#C6C6C8',
  },
  bigAvatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    marginTop: 10,
  },
  innerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    fontSize: 16,
    color: '#000',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
    marginBottom: 8,
  },
  typeChipActive: {
    backgroundColor: '#000',
  },
  typeChipText: {
    fontWeight: '600',
    color: '#000',
  },
  configBox: {
    backgroundColor: '#F2F2F7',
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },
  emojiSelect: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
  },
  colorSelect: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    marginBottom: 10,
  },
  mockGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E5EA',
    padding: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  imagePathConfirm: {
    color: '#34C759',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  saveText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  logoutText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
