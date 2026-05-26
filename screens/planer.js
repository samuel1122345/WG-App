// screens/PlanerScreen.js
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PlanerScreen({ allTasks, onAddTask }) {
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

  const handleSave = () => {
    if (!title || !user) {
      Alert.alert('Fehler', 'Bitte gib mindestens einen Titel und eine zuständige Person an.');
      return;
    }

    const newUserObj = {
      id: Date.now(),
      title,
      day: 'Mi', 
      dateNum: 20,
      time: time || 'Ganztägig',
      user,
      userInit: user.slice(0, 2).toUpperCase(),
      color: '#007AFF',
      bg: '#EBF4FF',
      desc: desc || 'Keine zusätzliche Beschreibung.',
    };

    onAddTask(newUserObj);
    
    // Reset Form & Close
    setTitle('');
    setTime('');
    setUser('');
    setDesc('');
    setIsAddModalVisible(false);
  };

  const openDetails = (task) => {
    setSelectedTask(task);
    setSwapRequested(false); // Reset Tauschstatus bei jedem Öffnen
    setIsDetailModalVisible(true);
  };

  const handleSwapRequest = () => {
    setSwapRequested(true);
    Alert.alert('Anfrage gesendet', `Deine Tauschanfrage für "${selectedTask.title}" wurde an die WG übermittelt.`);
  };

  return (
    <View style={styles.container}>
      {/* INBOX CONTENT */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <Text style={styles.sectionTitle}>Wochenübersicht</Text>
        
        {allTasks.map(task => (
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
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* PLUS BUTTON UNTEN LINKS */}
      <TouchableOpacity style={styles.fabButton} onPress={() => setIsAddModalVisible(true)}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL 1: NEUES TO-DO HINZUFÜGEN */}
      <Modal animationType="slide" transparent={true} visible={isAddModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalContentTitle}>Neues To-Do</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                <Text style={styles.closeText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={styles.input} placeholder="Titel der Aufgabe (z.B. Bad putzen)" placeholderTextColor="#8E8E93" value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Uhrzeit (z.B. 18:00)" placeholderTextColor="#8E8E93" value={time} onChangeText={setTime} />
            <TextInput style={styles.input} placeholder="Wer erledigt es? (z.B. Tim)" placeholderTextColor="#8E8E93" value={user} onChangeText={setUser} />
            <TextInput style={[styles.input, { height: 80, paddingTop: 12 }]} placeholder="Beschreibung (optional)" placeholderTextColor="#8E8E93" multiline={true} value={desc} onChangeText={setDesc} />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Hinzufügen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: ERWEITERTE DETAILANSICHT & TAUSCHOPTIONEN */}
      <Modal animationType="slide" transparent={true} visible={isDetailModalVisible}>
        <View style={styles.modalOverlay}>
          {selectedTask && (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalContentTitle}>Details</Text>
                <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}>
                  <Text style={styles.closeTextText}>Fertig</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.detailCard}>
                <View style={[styles.detailAvatar, { backgroundColor: selectedTask.bg }]}>
                  <Text style={[styles.detailAvatarText, { color: selectedTask.color }]}>{selectedTask.userInit}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailMainTitle}>{selectedTask.title}</Text>
                  <Text style={styles.detailSubTitle}>{selectedTask.time} Uhr • Zuständig: {selectedTask.user}</Text>
                </View>
              </View>

              <Text style={styles.descHeadline}>Beschreibung</Text>
              <Text style={styles.descText}>{selectedTask.desc || 'Keine zusätzliche Beschreibung hinterlegt.'}</Text>

              {/* ACTION BUTTONS */}
              <View style={styles.actionContainer}>
                <TouchableOpacity 
                  style={[styles.swapButton, swapRequested && styles.swapButtonActive]} 
                  onPress={handleSwapRequest}
                  disabled={swapRequested}
                >
                  <Ionicons name={swapRequested ? "checkmark-circle" : "swap-horizontal"} size={18} color={swapRequested ? "#34C759" : "#007AFF"} style={{ marginRight: 8 }} />
                  <Text style={[styles.swapButtonText, swapRequested && styles.swapButtonTextActive]}>
                    {swapRequested ? 'Tauschanfrage aktiv' : 'Dienst tauschen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { flex: 1, paddingHorizontal: 25 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#000' },
  taskItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  avatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 13, fontWeight: 'bold' },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  taskTime: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  fabButton: { position: 'absolute', bottom: 20, left: 25, width: 56, height: 56, backgroundColor: '#007AFF', borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.2)' },
  
  // Hier wurde paddingStyle korrigiert zu paddingTop / paddingBottom
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 50, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10 },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 25 },
  modalContentTitle: { fontSize: 20, fontWeight: 'bold' },
  closeText: { fontSize: 16, color: '#FF3B30', fontWeight: '500' },
  closeTextText: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  input: { backgroundColor: '#F2F2F7', borderRadius: 10, paddingHorizontal: 16, height: 48, fontSize: 16, color: '#000', marginBottom: 16 },
  saveButton: { backgroundColor: '#007AFF', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  detailCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', padding: 16, borderRadius: 16, marginBottom: 25 },
  detailAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  detailAvatarText: { fontSize: 16, fontWeight: 'bold' },
  detailMainTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  detailSubTitle: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  descHeadline: { fontSize: 14, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 8 },
  descText: { fontSize: 16, color: '#3A3A3C', lineHeight: 22, marginBottom: 30 },
  actionContainer: { borderTopWidth: 0.5, borderTopColor: '#E5E5EA', paddingTop: 20 },
  swapButton: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#007AFF' },
  swapButtonActive: { borderColor: '#34C759', backgroundColor: '#EBFCEF' },
  swapButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  swapButtonTextActive: { color: '#34C759' }
});