import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, ScrollView, 
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

// FIREBASE
import { db } from '../firebaseConfig'; 
import { 
  collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, orderBy 
} from 'firebase/firestore';

export default function PlanerScreen() {
  // Daten-Listen
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);

  // Modals
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isSwapMenuVisible, setIsSwapMenuVisible] = useState(false);

  // Formular-Zustände
  const [editId, setEditId] = useState(null);
  const [title, setTitle] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [date, setDate] = useState(new Date());
  const [desc, setDesc] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Selektierte Aufgabe für Details/Tausch
  const [selectedTask, setSelectedTask] = useState(null);

  // --- 1. ECHTZEIT-DATEN LADEN ---
  useEffect(() => {
    // Mitglieder aus Collection "members" laden
    const qMembers = query(collection(db, "members"), orderBy("name"));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      const mData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMembers(mData);
    }, (err) => console.error("Mitglieder-Fehler:", err));

    // Aufgaben aus Collection "tasks" laden
    const qTasks = query(collection(db, "tasks"), orderBy("fullDate", "asc"));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const tData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTasks(tData);
    }, (err) => console.error("Aufgaben-Fehler:", err));

    return () => { unsubMembers(); unsubTasks(); };
  }, []);

  // --- 2. HILFSFUNKTIONEN ---
  const formatDate = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });

  const resetForm = () => {
    setEditId(null); setTitle(''); setSelectedMember(null); 
    setDate(new Date()); setDesc(''); setIsAddModalVisible(false);
  };

  const openDetails = (task) => {
    setSelectedTask(task);
    setIsDetailModalVisible(true);
  };

  // --- 3. SPEICHERN & BEARBEITEN ---
  const handleSave = async () => {
    console.log("Speichervorgang gestartet...");
    
    if (!title.trim()) {
      Alert.alert('Fehlt etwas?', 'Bitte gib der Aufgabe einen Namen.');
      return;
    }
    if (!selectedMember) {
      Alert.alert('Wer machts?', 'Bitte wähle eine Person aus den Chips unten aus.');
      return;
    }

    const taskData = {
      title: title.trim(),
      dateDisplay: formatDate(date),
      fullDate: date.toISOString(),
      userId: selectedMember.id,
      userName: selectedMember.name,
      userColor: selectedMember.color || '#007AFF',
      userBg: selectedMember.bg || '#EBF4FF',
      desc: desc.trim() || 'Keine Beschreibung.',
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "tasks", editId), taskData);
        console.log("Update erfolgreich");
      } else {
        await addDoc(collection(db, "tasks"), { ...taskData, createdAt: new Date() });
        console.log("Neu-Eintrag erfolgreich");
      }
      resetForm();
    } catch (e) {
      console.error("Firebase Speicherfehler:", e);
      Alert.alert("Fehler", "Die Daten konnten nicht gespeichert werden. Prüfe deine Internetverbindung.");
    }
  };

  // --- 4. LÖSCHEN ---
  const handleDelete = (id) => {
    Alert.alert("Aufgabe löschen", "Möchtest du diesen Eintrag wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "tasks", id));
            setIsDetailModalVisible(false);
          } catch (e) { Alert.alert("Fehler", "Löschen fehlgeschlagen."); }
      }}
    ]);
  };

  // --- 5. TAUSCH-LOGIK (JOB GEGEN JOB) ---
  const executeSwap = async (targetTask) => {
    if (!selectedTask) return;

    Alert.alert(
      "Tausch bestätigen",
      `Tausche "${selectedTask.title}" gegen "${targetTask.title}"?`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Tauschen", onPress: async () => {
          try {
            const refA = doc(db, "tasks", selectedTask.id);
            const refB = doc(db, "tasks", targetTask.id);

            // Daten über Kreuz tauschen
            await updateDoc(refA, {
              userId: targetTask.userId, userName: targetTask.userName,
              userColor: targetTask.userColor, userBg: targetTask.userBg
            });
            await updateDoc(refB, {
              userId: selectedTask.userId, userName: selectedTask.userName,
              userColor: selectedTask.userColor, userBg: selectedTask.userBg
            });

            setIsSwapMenuVisible(false);
            setIsDetailModalVisible(false);
            Alert.alert("Erfolg", "Dienste wurden getauscht!");
          } catch (e) { Alert.alert("Tausch-Fehler", e.message); }
        }}
      ]
    );
  };

  const availableSwaps = tasks.filter(t => t.id !== selectedTask?.id);

  return (
    <View style={styles.container}>
      {/* LISTENANSICHT */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <Text style={styles.sectionTitle}>Wochenaufgaben</Text>
        
        {tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cafe-outline" size={50} color="#C7C7CC" />
            <Text style={styles.emptyText}>Alles erledigt! Keine Aufgaben vorhanden.</Text>
          </View>
        ) : (
          tasks.map(task => (
            <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => openDetails(task)}>
              <View style={[styles.avatar, { backgroundColor: task.userBg }]}>
                <Text style={{ color: task.userColor, fontWeight: 'bold' }}>
                  {task.userName ? task.userName.slice(0, 2).toUpperCase() : '??'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskSub}>{task.dateDisplay} • {task.userName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* PLUS BUTTON */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsAddModalVisible(true)}>
        <Ionicons name="add" size={40} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL: NEU / BEARBEITEN */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>{editId ? "Bearbeiten" : "Neue Aufgabe"}</Text>
              <TouchableOpacity onPress={resetForm}><Text style={styles.cancelLink}>Abbrechen</Text></TouchableOpacity>
            </View>

            <TextInput 
              style={styles.input} 
              placeholder="Was ist zu tun?" 
              value={title} 
              onChangeText={setTitle} 
            />
            
            <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)}>
              <Text style={{fontSize: 16}}>📅 {formatDate(date)}</Text>
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker 
                value={date} 
                mode="date" 
                display={Platform.OS === 'ios' ? 'inline' : 'default'} 
                onChange={(e, d) => { setShowPicker(Platform.OS === 'ios'); if(d) setDate(d); }}
              />
            )}

            <Text style={styles.label}>Wer übernimmt?</Text>
            <View style={styles.memberRow}>
              {members.length === 0 ? (
                <Text style={{color: '#8E8E93', fontStyle: 'italic'}}>Keine Mitglieder in Firebase gefunden.</Text>
              ) : (
                members.map(m => (
                  <TouchableOpacity key={m.id} 
                    style={[styles.memberChip, selectedMember?.id === m.id && { backgroundColor: '#000' }]}
                    onPress={() => setSelectedMember(m)}>
                    <Text style={{ color: selectedMember?.id === m.id ? '#FFF' : '#000', fontWeight: '500' }}>{m.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>{editId ? "Speichern" : "Hinzufügen"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: DETAILS */}
      <Modal visible={isDetailModalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          {selectedTask && (
            <View style={styles.modalSheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.hugeTitle}>{selectedTask.title}</Text>
                <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}>
                  <Ionicons name="close-circle" size={32} color="#C7C7CC" />
                </TouchableOpacity>
              </View>
              <Text style={styles.hugeSub}>{selectedTask.dateDisplay} • {selectedTask.userName}</Text>
              
              <View style={styles.divider} />

              <TouchableOpacity style={styles.swapBtnMain} onPress={() => setIsSwapMenuVisible(true)}>
                <Ionicons name="swap-horizontal" size={22} color="#FFF" />
                <Text style={styles.swapBtnText}>Gegen anderen Job tauschen</Text>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionItem} onPress={() => {
                  setEditId(selectedTask.id); setTitle(selectedTask.title);
                  setDate(new Date(selectedTask.fullDate)); 
                  setSelectedMember(members.find(m => m.id === selectedTask.userId));
                  setIsDetailModalVisible(false); setIsAddModalVisible(true);
                }}>
                  <Ionicons name="create-outline" size={20} color="#007AFF" />
                  <Text style={{color: '#007AFF', marginLeft: 5, fontWeight: '600'}}>Bearbeiten</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={() => handleDelete(selectedTask.id)}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  <Text style={{color: '#FF3B30', marginLeft: 5, fontWeight: '600'}}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* MODAL: TAUSCH-LISTE */}
      <Modal visible={isSwapMenuVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.modalSheet, { height: '70%' }]}>
            <Text style={styles.modalTitle}>Tausch-Partner wählen</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {availableSwaps.length === 0 ? (
                <Text style={styles.emptyTextCenter}>Kein anderer Dienst zum Tauschen verfügbar.</Text>
              ) : (
                availableSwaps.map(item => (
                  <TouchableOpacity key={item.id} style={styles.swapCard} onPress={() => executeSwap(item)}>
                    <View style={[styles.miniAvatar, { backgroundColor: item.userBg }]}>
                       <Text style={{color: item.userColor, fontSize: 10, fontWeight: 'bold'}}>
                         {item.userName ? item.userName.slice(0,2).toUpperCase() : '??'}
                       </Text>
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={{fontWeight: '600'}}>{item.title}</Text>
                      <Text style={{fontSize: 12, color: '#8E8E93'}}>{item.userName}</Text>
                    </View>
                    <Ionicons name="repeat" size={18} color="#007AFF" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsSwapMenuVisible(false)}>
              <Text style={{fontWeight: 'bold', color: '#007AFF', fontSize: 16}}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 34, fontWeight: '800', marginVertical: 20, color: '#1C1C1E' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { textAlign: 'center', marginTop: 15, color: '#8E8E93', fontSize: 16 },
  emptyTextCenter: { textAlign: 'center', marginTop: 40, color: '#8E8E93' },
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', padding: 18, borderRadius: 22, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  taskTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E' },
  taskSub: { fontSize: 14, color: '#8E8E93', marginTop: 3 },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 64, height: 64, backgroundColor: '#000', borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: {width: 0, height: 4} },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, paddingBottom: 50 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  cancelLink: { color: '#FF3B30', fontSize: 17, fontWeight: '500' },
  input: { backgroundColor: '#F2F2F7', padding: 18, borderRadius: 16, marginBottom: 12, fontSize: 16 },
  label: { fontWeight: '700', marginBottom: 12, marginTop: 10, fontSize: 15 },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 25 },
  memberChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25, backgroundColor: '#F2F2F7', marginRight: 10, marginBottom: 10 },
  primaryBtn: { backgroundColor: '#000', padding: 20, borderRadius: 20, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  hugeTitle: { fontSize: 30, fontWeight: 'bold', flex: 1, color: '#1C1C1E' },
  hugeSub: { fontSize: 18, color: '#007AFF', marginTop: 4, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 25 },
  swapBtnMain: { backgroundColor: '#FF9500', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  swapBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 17, marginLeft: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 35 },
  actionItem: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  swapCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F2F2F7', borderRadius: 18, marginBottom: 12 },
  miniAvatar: { width: 34, height: 34, borderRadius: 10, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  closeBtn: { marginTop: 25, alignItems: 'center', padding: 10 }
});