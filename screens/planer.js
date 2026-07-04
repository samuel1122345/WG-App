import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db } from '../firebaseConfig'; 
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, getDocs, writeBatch } from 'firebase/firestore';

export default function PlanerScreen({ currentUser, currentWg }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]); 

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [detailViewMode, setDetailViewMode] = useState('details'); 
  const [showArchived, setShowArchived] = useState(false); 

  // NEU: States für die Haken-Animation
  const [animatingTaskId, setAnimatingTaskId] = useState(null);
  const checkAnim = useRef(new Animated.Value(0)).current;

  const [editId, setEditId] = useState(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [desc, setDesc] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTargetTask, setSelectedTargetTask] = useState(null); 

  useEffect(() => {
    if (!currentWg?.id) return;

    const unsubMembers = onSnapshot(query(collection(db, "users"), where("wgId", "==", currentWg.id)), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubTasks = onSnapshot(query(collection(db, "tasks"), where("wgId", "==", currentWg.id), orderBy("fullDate", "asc")), (snap) => {
      const allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTasks(allTasks.filter(t => showArchived ? t.status === 'archived' : (t.status !== 'archived')));
    });

    const unsubSwaps = onSnapshot(query(collection(db, "swapRequests"), where("wgId", "==", currentWg.id), where("status", "==", "pending")), (snap) => {
      setSwapRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubMembers(); unsubTasks(); unsubSwaps(); };
  }, [currentWg, showArchived]);

  const formatDate = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });

  const resetForm = () => {
    setEditId(null); setTitle(''); setDate(new Date()); setDesc(''); setIsAddModalVisible(false);
  };

  const toggleTaskStatus = async (task) => {
    try {
      const newStatus = task.status === 'archived' ? 'active' : 'archived';
      await updateDoc(doc(db, "tasks", task.id), { status: newStatus });
    } catch (e) {
      Alert.alert("Fehler", "Status konnte nicht aktualisiert werden.");
    }
  };

  // NEU: Interceptor-Funktion startet die Haken-Animation vor dem Archivieren
  const handleCheckTask = (task) => {
    if (task.status === 'archived') {
      // Wenn wir im Archiv sind, ohne Animation direkt zurückholen
      toggleTaskStatus(task);
    } else {
      // Wenn wir in der Inbox sind, erst Animation abspielen
      setAnimatingTaskId(task.id);
      Animated.timing(checkAnim, {
        toValue: 1,
        duration: 400, // Animationsdauer in ms
        useNativeDriver: true,
      }).start(async () => {
        // Nach Beendigung der Animation: In Firestore updaten
        await toggleTaskStatus(task);
        setAnimatingTaskId(null);
        checkAnim.setValue(0); // Reset des Animationswerts für die nächste Aufgabe
      });
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Titel an.');
      return;
    }
    const taskData = {
      title: title.trim(),
      dateDisplay: formatDate(date),
      fullDate: date.toISOString(),
      userId: editId ? selectedTask.userId : currentUser.id,
      userName: editId ? selectedTask.userName : currentUser.name,
      userColor: editId ? selectedTask.userColor : (currentUser.color || '#007AFF'),
      userBg: editId ? selectedTask.userBg : (currentUser.avatarBg || '#EBF4FF'),
      desc: desc.trim() || 'Keine Beschreibung.',
      wgId: currentWg.id,
      type: editId ? (selectedTask?.type || "manuell") : "manuell",
      status: editId ? (selectedTask?.status || 'active') : 'active'
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "tasks", editId), taskData);
      } else {
        await addDoc(collection(db, "tasks"), { ...taskData, createdAt: new Date() });
      }
      resetForm();
    } catch (e) { Alert.alert("Fehler", "Speichern fehlgeschlagen."); }
  };

  const handleDelete = (id) => {
    Alert.alert("Aufgabe entfernen", "Möchtest du diesen Eintrag permanent löschen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "tasks", id));
            setIsDetailModalVisible(false); setSelectedTask(null);
          } catch (e) { Alert.alert("Fehler", "Löschen fehlgeschlagen."); }
      }}
    ]);
  };

  const createSwapRequest = async () => {
    if (!selectedTask || !selectedTargetTask) {
      Alert.alert("Fehler", "Bitte wähle einen Job aus.");
      return;
    }
    try {
      const swapDocRef = await addDoc(collection(db, "swapRequests"), {
        wgId: currentWg.id, fromTaskId: selectedTask.id, fromTaskTitle: selectedTask.title,
        fromUserId: selectedTask.userId, fromUserName: selectedTask.userName,
        toTaskId: selectedTargetTask.id, toTaskTitle: selectedTargetTask.title,
        toUserId: selectedTargetTask.userId, toUserName: selectedTargetTask.userName,
        status: "pending", createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, "notifications"), {
        wgId: currentWg.id, userId: selectedTargetTask.userId,
        title: "Neue Tauschanfrage 🔄",
        message: `${selectedTask.userName} möchte den Dienst "${selectedTask.title}" gegen deinen Job "${selectedTargetTask.title}" eintauschen.`,
        type: "swap_request", status: "unread", createdAt: new Date().toISOString(),
        extraData: {
          swapRequestId: swapDocRef.id, fromTaskId: selectedTask.id, fromTaskTitle: selectedTask.title,
          fromUserId: selectedTask.userId, fromUserName: selectedTask.userName,
          toTaskId: selectedTargetTask.id, toTaskTitle: selectedTargetTask.title,
          toUserId: selectedTargetTask.userId, toUserName: selectedTargetTask.userName
        }
      });

      setIsDetailModalVisible(false); setSelectedTargetTask(null);
      Alert.alert("Anfrage gesendet", `${selectedTargetTask.userName} hat eine Tauschanfrage erhalten.`);
    } catch (e) { Alert.alert("Fehler", "Anfrage failed."); }
  };

  const acceptSwapRequest = async (request) => {
    try {
      const batch = writeBatch(db);
      const taskRefA = doc(db, "tasks", request.fromTaskId);
      const taskRefB = doc(db, "tasks", request.toTaskId);
      const requestRef = doc(db, "swapRequests", request.id);

      const userA = members.find(m => m.id === request.fromUserId);
      const userB = members.find(m => m.id === request.toUserId);
      if (!userA || !userB) return;

      batch.update(taskRefA, { userId: userB.id, userName: userB.name, userColor: userB.color || '#000', userBg: userB.avatarBg || '#F2F2F7' });
      batch.update(taskRefB, { userId: userA.id, userName: userA.name, userColor: userA.color || '#000', userBg: userA.avatarBg || '#F2F2F7' });
      batch.update(requestRef, { status: "accepted" });

      const notifRef = doc(collection(db, "notifications"));
      batch.set(notifRef, {
        wgId: currentWg.id, userId: request.fromUserId,
        title: "Tausch akzeptiert! ✅",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" angenommen.`,
        type: "swap_accepted", status: "unread", createdAt: new Date().toISOString()
      });

      const resolvedSwapIds = [request.id];

      const allSwapsSnap = await getDocs(query(collection(db, "swapRequests"), where("wgId", "==", currentWg.id), where("status", "==", "pending")));
      allSwapsSnap.forEach((subDoc) => {
        const data = subDoc.data();
        if (subDoc.id !== request.id && (
          data.fromTaskId === request.fromTaskId || data.toTaskId === request.fromTaskId ||
          data.fromTaskId === request.toTaskId || data.toTaskId === request.toTaskId
        )) {
          batch.update(doc(db, "swapRequests", subDoc.id), { status: "invalidated" });
          resolvedSwapIds.push(subDoc.id);
        }
      });

      const notifQuery = query(collection(db, "notifications"), where("wgId", "==", currentWg.id), where("type", "==", "swap_request"));
      const notifSnap = await getDocs(notifQuery);
      notifSnap.forEach((nDoc) => {
        if (resolvedSwapIds.includes(nDoc.data().extraData?.swapRequestId)) {
          batch.delete(doc(db, "notifications", nDoc.id));
        }
      });

      await batch.commit();
      setIsDetailModalVisible(false); setSelectedTask(null);
      Alert.alert("Tausch erfolgreich", `Dienst getauscht mit ${request.fromUserName}.`);
    } catch (e) { Alert.alert("Fehler", "Tausch failed."); }
  };

  const declineSwapRequest = async (request) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "swapRequests", request.id), { status: "declined" });

      const notifRef = doc(collection(db, "notifications"));
      batch.set(notifRef, {
        wgId: currentWg.id, userId: request.fromUserId,
        title: "Tausch abgelehnt ❌",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" abgelehnt.`,
        type: "swap_declined", status: "unread", createdAt: new Date().toISOString()
      });

      const notifQuery = query(collection(db, "notifications"), where("wgId", "==", currentWg.id), where("type", "==", "swap_request"));
      const notifSnap = await getDocs(notifQuery);
      notifSnap.forEach((nDoc) => {
        if (nDoc.data().extraData?.swapRequestId === request.id) {
          batch.delete(doc(db, "notifications", nDoc.id));
        }
      });

      await batch.commit();
      setIsDetailModalVisible(false); setSelectedTask(null);
      Alert.alert("Abgelehnt", "Tauschanfrage wurde verworfen.");
    } catch (e) { Alert.alert("Fehler", "Aktion failed."); }
  };

  const renderTaskAvatar = (task) => {
    const member = members.find(m => m.id === task.userId);
    const actualMember = task.userId === currentUser.id ? currentUser : member;
    const type = actualMember?.avatarType || 'initials';
    
    if (type === 'emoji') {
      return (
        <View style={[styles.avatar, { backgroundColor: actualMember?.avatarBg || '#F2F2F7' }]}>
          <Text style={{ fontSize: 20 }}>{actualMember?.avatarEmoji || '👤'}</Text>
        </View>
      );
    }

    const avatarUrl = actualMember?.avatarUrl || '';
    const isValidUrl = avatarUrl && (
      avatarUrl.startsWith('http://') || 
      avatarUrl.startsWith('https://') || 
      avatarUrl.startsWith('file://') || 
      avatarUrl.startsWith('data:')
    );

    if (type === 'image' && isValidUrl) { 
      return <Image source={{ uri: avatarUrl }} style={styles.avatar} />; 
    }

    return (
      <View style={[styles.avatar, { backgroundColor: task.userBg }]}>
        <Text style={{ color: task.userColor, fontWeight: 'bold' }}>{task.userName ? task.userName.slice(0, 2).toUpperCase() : '??'}</Text>
      </View>
    );
  };

  const availableSwaps = tasks.filter(t => t.userId !== currentUser.id && t.status !== 'archived');

  if (!currentWg) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="home-outline" size={64} color="#C7C7CC" />
        <Text style={styles.centerText}>Du bist noch keiner WG beigetreten.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        
        {/* Apple-Style Archiv Umschalter ganz oben */}
        <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived(!showArchived)}>
          <Ionicons name={showArchived ? "list-outline" : "archive-outline"} size={20} color="#007AFF" />
          <Text style={styles.archiveToggleText}>{showArchived ? "Zurück zur Übersicht" : "Zum Archiv"}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{showArchived ? "Archivierte Aufgaben" : "Anstehende To-Dos"}</Text>
        
        {tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cafe-outline" size={50} color="#C7C7CC" />
            <Text style={styles.emptyText}>{showArchived ? "Das Archiv ist leer." : "Keine Aufgaben."}</Text>
          </View>
        ) : (
          tasks.map(task => {
            const isInitiatorOfSwap = swapRequests.some(r => r.fromTaskId === task.id);
            const isAnimating = animatingTaskId === task.id; // Prüft Animations-Status
            const isArchived = task.status === 'archived';

            return (
              <TouchableOpacity 
                key={task.id} 
                style={[styles.taskCard, isInitiatorOfSwap && styles.taskCardPending]} 
                onPress={() => { setSelectedTask(task); setDetailViewMode('details'); setIsDetailModalVisible(true); }}
              >
                {renderTaskAvatar(task)}
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskSub}>
                    {task.dateDisplay} • {task.userName} {isInitiatorOfSwap && <Text style={{color: '#FF9500', fontWeight: 'bold'}}> (🔄 Tausch läuft)</Text>}
                  </Text>
                </View>

                {/* KORRIGIERT: Überlappender, nativer Animations-Wrapper für die Checkbox */}
                <TouchableOpacity style={styles.checkboxContainer} onPress={() => handleCheckTask(task)}>
                  <View style={styles.checkboxWrapper}>
                    {/* Basis-Kreis */}
                    <Ionicons 
                      name={isArchived ? "checkmark-circle" : "ellipse-outline"} 
                      size={26} 
                      color={isArchived ? "#34C759" : "#C7C7CC"} 
                    />
                    {/* Animierter grüner Haken, der sich dynamisch vergrößert */}
                    {isAnimating && (
                      <Animated.View 
                        style={[
                          styles.animatedCheckOverlay, 
                          { 
                            transform: [{ scale: checkAnim }],
                            opacity: checkAnim 
                          }
                        ]}
                      >
                        <Ionicons name="checkmark-circle" size={26} color="#34C759" />
                      </Animated.View>
                    )}
                  </View>
                </TouchableOpacity>

                <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 110 }} />
      </ScrollView>

      {!showArchived && (
        <TouchableOpacity style={styles.fab} onPress={() => setIsAddModalVisible(true)}>
          <Ionicons name="add" size={40} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* MODAL: ADD / EDIT */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>{editId ? "Aufgabe editieren" : "Neue Aufgabe"}</Text>
              <TouchableOpacity onPress={resetForm}><Text style={styles.cancelLink}>Abbrechen</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Was ist zu tun?" value={title} onChangeText={setTitle} />
            <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)}><Text>📅 {formatDate(date)}</Text></TouchableOpacity>
            {showPicker && <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(e, d) => { setShowPicker(Platform.OS === 'ios'); if(d) setDate(d); }} />}
            <TextInput style={[styles.input, {height: 80, paddingTop: 12}]} placeholder="Notizen / Beschreibung..." multiline value={desc} onChangeText={setDesc} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}><Text style={styles.primaryBtnText}>Speichern</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: DETAILS */}
      <Modal visible={isDetailModalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          {selectedTask && (() => {
            const activeSwap = swapRequests.find(r => r.fromTaskId === selectedTask.id);
            const amITheTarget = activeSwap?.toUserId === currentUser.id;

            if (detailViewMode === 'details') {
              return (
                <View style={styles.modalSheet}>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.hugeTitle}>{selectedTask.title}</Text>
                    <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}><Ionicons name="close-circle" size={32} color="#C7C7CC" /></TouchableOpacity>
                  </View>
                  <Text style={styles.hugeSub}>{selectedTask.dateDisplay} • {selectedTask.userName}</Text>
                  <View style={styles.divider} />
                  
                  <View style={[styles.typeBadge, selectedTask.type === 'system' ? styles.badgeWeekly : styles.badgeSingle]}>
                    <Text style={[styles.badgeText, { color: selectedTask.type === 'system' ? '#34C759' : '#007AFF' }]}>
                      {selectedTask.type === 'system' ? "Weekly" : "Single"}
                    </Text>
                  </View>

                  <Text style={styles.labelTitle}>Beschreibung</Text>
                  <Text style={styles.descriptionBody}>{selectedTask.desc}</Text>
                  
                  {activeSwap && (
                    <View style={styles.infoBoxActiveSwap}>
                      <Text style={{fontWeight: '700', color: '#FF9500'}}>🔄 Tausch-Informationen</Text>
                      <Text style={{fontSize: 14, color: '#1C1C1E', marginTop: 4}}>
                        <Text style={{fontWeight: '700'}}>{activeSwap.fromUserName}</Text> möchte den Dienst <Text style={{fontWeight: '700'}}>"{activeSwap.fromTaskTitle}"</Text> gegen deinen Job <Text style={{fontWeight: '700'}}>"{activeSwap.toTaskTitle}"</Text> eintauschen.
                      </Text>
                    </View>
                  )}

                  {activeSwap && amITheTarget ? (
                    <View style={styles.requestActionRow}>
                      <TouchableOpacity style={[styles.reqBtn, { backgroundColor: '#34C759' }]} onPress={() => acceptSwapRequest(activeSwap)}>
                        <Text style={styles.reqBtnText}>Tausch annehmen</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.reqBtn, { backgroundColor: '#FF3B30' }]} onPress={() => declineSwapRequest(activeSwap)}>
                        <Text style={styles.reqBtnText}>Tausch ablehnen</Text>
                      </TouchableOpacity>
                    </View>
                  ) : activeSwap ? (
                    <View style={[styles.swapBtnMain, { backgroundColor: '#C7C7CC' }]}>
                      <Text style={styles.swapBtnText}>Warten auf Bestätigung...</Text>
                    </View>
                  ) : (
                    selectedTask.userId === currentUser.id && selectedTask.status !== 'archived' ? (
                      <TouchableOpacity style={styles.swapBtnMain} onPress={() => setDetailViewMode('swap')}>
                        <Ionicons name="swap-horizontal" size={22} color="#FFF" />
                        <Text style={styles.swapBtnText}>Job tauschen</Text>
                      </TouchableOpacity>
                    ) : null
                  )}

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center'}} onPress={() => { setEditId(selectedTask.id); setTitle(selectedTask.title); setDesc(selectedTask.desc); setDate(new Date(selectedTask.fullDate)); setIsDetailModalVisible(false); setIsAddModalVisible(true); }}>
                      <Ionicons name="create-outline" size={20} color="#007AFF" /><Text style={{color: '#007AFF', marginLeft: 5, fontWeight: '600'}}>Bearbeiten</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center'}} onPress={() => handleDelete(selectedTask.id)}>
                      <Ionicons name="trash-outline" size={20} color="#FF3B30" /><Text style={{color: '#FF3B30', marginLeft: 5, fontWeight: '600'}}>Löschen</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            return (
              <View style={[styles.modalSheet, { height: '75%' }]}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.modalTitle}>Dienst zum Tauschen wählen</Text>
                  <TouchableOpacity onPress={() => setDetailViewMode('details')}><Text style={{ color: '#007AFF', fontWeight: 'bold', fontSize: 16 }}>Zurück</Text></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {availableSwaps.map(item => {
                    const isSelected = selectedTargetTask?.id === item.id;
                    return (
                      <TouchableOpacity key={item.id} style={[styles.swapCard, isSelected && { borderColor: '#FF9500', borderWidth: 1.5 }]} onPress={() => setSelectedTargetTask(item)}>
                        {renderTaskAvatar(item)}
                        <View style={{ flex: 1, marginLeft: 5 }}>
                          <Text style={{ fontWeight: '600', fontSize: 16 }}>{item.title}</Text>
                          <Text style={{ fontSize: 13, color: '#8E8E93' }}>{item.dateDisplay} • {item.userName}</Text>
                        </View>
                        <Ionicons name={isSelected ? "radio-button-on" : "radio-button-off"} size={20} color={isSelected ? "#FF9500" : "#C7C7CC"} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {selectedTargetTask && (
                  <TouchableOpacity style={[styles.swapBtnMain, { marginTop: 15 }]} onPress={createSwapRequest}>
                    <Text style={styles.swapBtnText}>Tausch-Anfrage absenden</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { paddingHorizontal: 20, paddingTop: 10 }, 
  sectionTitle: { fontSize: 24, fontWeight: '800', marginVertical: 15, color: '#1C1C1E' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { textAlign: 'center', marginTop: 15, color: '#8E8E93' },
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', padding: 18, borderRadius: 22, marginBottom: 12, borderWidth: 1.5, borderColor: 'transparent' },
  taskCardPending: { borderColor: '#FF9500', backgroundColor: '#FFF9F2' }, 
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' }, 
  taskTitle: { fontSize: 17, fontWeight: '600' },
  taskSub: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 64, height: 64, backgroundColor: '#000', borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },
  cancelLink: { color: '#FF3B30', fontSize: 17 },
  input: { backgroundColor: '#F2F2F7', padding: 16, borderRadius: 15, marginBottom: 12, fontSize: 16, color: '#000' },
  label: { fontWeight: 'bold', marginBottom: 10 },
  primaryBtn: { backgroundColor: '#000', padding: 18, borderRadius: 18, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  hugeTitle: { fontSize: 28, fontWeight: 'bold', flex: 1 },
  hugeSub: { fontSize: 16, color: '#8E8E93', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 15 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 15 },
  badgeWeekly: { backgroundColor: '#EBFCEF' },
  badgeSingle: { backgroundColor: '#EBF4FF' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  labelTitle: { fontSize: 14, fontWeight: 'bold', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 5 },
  descriptionBody: { fontSize: 16, color: '#333', lineHeight: 22, marginBottom: 25 },
  swapBtnMain: { backgroundColor: '#FF9500', padding: 18, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  swapBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 10, fontSize: 16 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 30 },
  swapCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F2F2F7', borderRadius: 16, marginBottom: 10, borderWidth: 1.5, borderColor: 'transparent' },
  closeBtn: { marginTop: 20, alignItems: 'center' },
  infoSubtext: { fontSize: 14, color: '#8E8E93', marginBottom: 15, lineHeight: 18 },
  requestBoxApple: { backgroundColor: '#F2F2F7', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E5E5EA', marginBottom: 10 },
  requestBoxTitle: { fontSize: 16, fontWeight: 'bold', color: '#FF9500', marginBottom: 4 },
  requestBoxSub: { fontSize: 14, color: '#1C1C1E', lineHeight: 18, marginBottom: 12 },
  requestActionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  reqBtn: { flex: 0.48, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  reqBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  infoBoxActiveSwap: { backgroundColor: '#FFF9F2', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FFE2B8', marginBottom: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { color: '#8E8E93', textAlign: 'center', marginHorizontal: 40, marginTop: 15, fontSize: 16 },
  
  archiveToggle: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F2F2F7', 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 14, 
    justifyContent: 'center', 
    marginTop: 10, 
    marginBottom: 5 
  },
  archiveToggleText: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#007AFF', 
    marginLeft: 8 
  },
  checkboxContainer: { 
    paddingHorizontal: 10, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  
  // NEU: Absolute Positionierung schichtet den Haken über den Kreis für die Skalierungs-Animation
  checkboxWrapper: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  animatedCheckOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center'
  }
});