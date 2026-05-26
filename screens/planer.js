import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Modal, 
  TextInput, 
  Alert, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// FIREBASE IMPORTE
import { db } from '../firebaseConfig'; 
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';

// Konstante Farben für WG-Mitglieder zur besseren Übersicht
const USER_COLORS = {
  'Sarah': { color: '#FF3B30', bg: '#FFECEB' },
  'Lukas': { color: '#007AFF', bg: '#EBF4FF' },
  'Tim': { color: '#34C759', bg: '#EBFCEF' },
  'Standard': { color: '#8E8E93', bg: '#F2F2F7' }
};

export default function PlanerScreen({ allTasks }) {
  // Modal-Zustände
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [swapRequested, setSwapRequested] = useState(false);

  // Formular-Zustände für neue Aufgaben
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [user, setUser] = useState('');
  const [desc, setDesc] = useState('');

  // Hilfsfunktion: Bestimmt die Farbe basierend auf dem Namen
  const getUserStyle = (userName) => USER_COLORS[userName] || USER_COLORS['Standard'];

  // FUNKTION: Aufgabe in Firebase speichern
  const handleSave = async () => {
    if (!title.trim() || !user.trim()) {
      Alert.alert('Fehler', 'Bitte gib mindestens einen Titel und eine Person an.');
      return;
    }

    const style = getUserStyle(user);

    try {
      await addDoc(collection(db, "tasks"), {
        title: title.trim(),
        time: time.trim() || 'Ganztägig',
        user: user.trim(),
        userInit: user.trim().slice(0, 2).toUpperCase(),
        day: 'Di', // Heute ist Dienstag, 26. Mai 2026
        dateNum: 26, 
        color: style.color,
        bg: style.bg,
        desc: desc.trim() || 'Keine zusätzliche Beschreibung.',
        createdAt: new Date() 
      });

      // Reset & Schließen
      setTitle(''); setTime(''); setUser(''); setDesc('');
      setIsAddModalVisible(false);
    } catch (e) {
      console.error("Fehler beim Speichern: ", e);
      Alert.alert("Fehler", "Die Aufgabe konnte nicht in der Cloud gespeichert werden.");
    }
  };

  // FUNKTION: Aufgabe aus Firebase löschen
  const handleDelete = async (id) => {
    Alert.alert(
      "Aufgabe löschen", 
      "Möchtest du dieses To-Do wirklich permanent entfernen?", 
      [
        { text: "Abbrechen", style: "cancel" },
        { 
          text: "Löschen", 
          style: "destructive", 
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "tasks", id));
              setIsDetailModalVisible(false);
            } catch (e) {
              Alert.alert("Fehler", "Löschen fehlgeschlagen.");
            }
          } 
        }
      ]
    );
  };

  const openDetails = (task) => {
    setSelectedTask(task);
    setSwapRequested(false);
    setIsDetailModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* HAUPT-LISTE */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <Text style={styles.sectionTitle}>WG-Inbox</Text>
        
        {allTasks.length === 0 ? (
          <Text style={styles.emptyText}>Alles erledigt! Keine Aufgaben vorhanden.</Text>
        ) : (
          allTasks.map(task => (
            <TouchableOpacity key={task.id} style={styles.taskItem} onPress={() => openDetails(task)}>
              <View style={[styles.avatar, { backgroundColor: task.bg }]}>
                <Text style={[styles.avatarText, { color: task.color }]}>{task.userInit}</Text>
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskTime}>{task.time} Uhr • {task.user}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* SCHWEBENDER PLUS-BUTTON */}
      <TouchableOpacity style={styles.fabButton} onPress={() => setIsAddModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL 1: NEUE AUFGABE */}
      <Modal animationType="slide" transparent={true} visible={isAddModalVisible}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalContentTitle}>Neue Aufgabe</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                <Text style={styles.closeText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={styles.input} placeholder="Was ist zu tun?" placeholderTextColor="#8E8E93" value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Wann? (z.B. 18:00)" placeholderTextColor="#8E8E93" value={time} onChangeText={setTime} />
            <TextInput style={styles.input} placeholder="Wer? (Name)" placeholderTextColor="#8E8E93" value={user} onChangeText={setUser} />
            <TextInput 
              style={[styles.input, { height: 100, paddingTop: 12 }]} 
              placeholder="Zusätzliche Infos..." 
              placeholderTextColor="#8E8E93" 
              multiline 
              value={desc} 
              onChangeText={setDesc} 
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Hinzufügen</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: DETAILS & LÖSCHEN */}
      <Modal animationType="slide" transparent={true} visible={isDetailModalVisible}>
        <View style={styles.modalOverlay}>
          {selectedTask && (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalContentTitle}>Details</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => handleDelete(selectedTask.id)} style={{ marginRight: 20 }}>
                    <Ionicons name="trash-outline" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}>
                    <Text style={styles.closeTextText}>Fertig</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailCard}>
                <View style={[styles.detailAvatar, { backgroundColor: selectedTask.bg }]}>
                  <Text style={[styles.detailAvatarText, { color: selectedTask.color }]}>{selectedTask.userInit}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailMainTitle}>{selectedTask.title}</Text>
                  <Text style={styles.detailSubTitle}>{selectedTask.time} Uhr • {selectedTask.user}</Text>
                </View>
              </View>

              <Text style={styles.descHeadline}>Beschreibung</Text>
              <Text style={styles.descText}>{selectedTask.desc}</Text>

              <TouchableOpacity 
                style={[styles.swapButton, swapRequested && styles.swapButtonActive]} 
                onPress={() => { setSwapRequested(true); Alert.alert("Anfrage gesendet!", "Die WG wurde informiert."); }}
              >
                <Ionicons name="swap-horizontal" size={18} color={swapRequested ? "#34C759" : "#007AFF"} />
                <Text style={[styles.swapButtonText, swapRequested && styles.swapButtonTextActive]}>
                  {swapRequested ? 'Tauschanfrage läuft' : 'Dienst tauschen'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { flex: 1, paddingHorizontal: 25, paddingTop: 10 },
  sectionTitle: { fontSize: 30, fontWeight: 'bold', marginBottom: 20, color: '#000' },
  emptyText: { color: '#8E8E93', textAlign: 'center', marginTop: 50, fontSize: 16, fontStyle: 'italic' },
  taskItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 14, fontWeight: 'bold' },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 17, fontWeight: '600' },
  taskTime: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  fabButton: { position: 'absolute', bottom: 30, right: 25, width: 60, height: 60, backgroundColor: '#007AFF', borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 25, paddingBottom: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20 },
  modalContentTitle: { fontSize: 22, fontWeight: 'bold' },
  closeText: { fontSize: 17, color: '#FF3B30' },
  closeTextText: { fontSize: 17, color: '#007AFF', fontWeight: 'bold' },
  input: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 15, color: '#000' },
  saveButton: { backgroundColor: '#007AFF', borderRadius: 15, padding: 18, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  detailCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', padding: 20, borderRadius: 20, marginBottom: 25 },
  detailAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  detailAvatarText: { fontSize: 18, fontWeight: 'bold' },
  detailMainTitle: { fontSize: 20, fontWeight: 'bold' },
  detailSubTitle: { fontSize: 15, color: '#8E8E93', marginTop: 4 },
  descHeadline: { fontSize: 13, fontWeight: 'bold', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 10 },
  descText: { fontSize: 16, color: '#333', lineHeight: 24, marginBottom: 35 },
  swapButton: { flexDirection: 'row', borderRadius: 15, padding: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#007AFF' },
  swapButtonActive: { borderColor: '#34C759', backgroundColor: '#EBFCEF' },
  swapButtonText: { color: '#007AFF', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  swapButtonTextActive: { color: '#34C759' }
});