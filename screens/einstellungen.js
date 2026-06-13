import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Image, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker'; 
import { db } from '../firebaseConfig';
import { collection, setDoc, updateDoc, doc, query, where, onSnapshot, getDoc, deleteDoc, addDoc, getDocs } from 'firebase/firestore';
import {
  DEFAULT_TASK_END_TIME,
  DEFAULT_TASK_START_TIME,
  combineDateAndTime,
  datesAreSameDay,
  ensureEndAfterStart,
  formatDateDisplay,
  isUserBlocked,
  normalizeTime,
} from '../utils/calendarHelpers';
import { buildNotificationKey, buildTaskTimeText, createNotificationOnce } from '../utils/notificationHelpers';

import ProfilScreen from './profil';

const TASKS_MODAL_WEB_TOP_OFFSET = 88;

export default function EinstellungenScreen({ currentUser, currentWg }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [viewMode, setViewMode] = useState('menu'); 
  const [isTasksModalVisible, setIsTasksModalVisible] = useState(false);
  const [tasksModalRenderKey, setTasksModalRenderKey] = useState(0);
  const [isWgAvatarModalVisible, setIsWgAvatarModalVisible] = useState(false);
  const [isProfilModalVisible, setIsProfilModalVisible] = useState(false); 
  const [isEditable, setIsEditable] = useState(false); 

  const [wgName, setWgName] = useState(currentWg?.name || '');
  const [wgAddress, setWgAddress] = useState(currentWg?.address || '');
  const [joinId, setJoinId] = useState('');
  
  const [wgAvatarType, setWgAvatarType] = useState(currentWg?.avatarType || 'emoji'); 
  const [wgAvatarEmoji, setWgAvatarEmoji] = useState(currentWg?.avatarEmoji || '🏡');
  const [wgAvatarBg, setWgAvatarBg] = useState(currentWg?.avatarBg || '#F2F2F7');
  const [wgAvatarUrl, setWgAvatarUrl] = useState(currentWg?.avatarUrl || '');

  const [wgMembers, setWgMembers] = useState([]);
  const [recurringTasks, setRecurringTasks] = useState([]);
  
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState(''); 
  const [taskTag, setTaskTag] = useState('weekly'); 
  const [taskStartTime, setTaskStartTime] = useState(DEFAULT_TASK_START_TIME);
  const [taskEndTime, setTaskEndTime] = useState(DEFAULT_TASK_END_TIME);
  const [assignmentMode, setAssignmentMode] = useState('rotierend'); 
  const [selectedMemberIds, setSelectedMemberIds] = useState([]); 
  const [editingTaskId, setEditingTaskId] = useState(null);

  const colors = ['#EBF4FF', '#EBFCEF', '#FFF9F2', '#FBF2FF', '#FFECEB', '#F2F2F7'];

  useEffect(() => {
    if (!isTasksModalVisible) return undefined;

    // React Native Web berechnet das Modal in der iPhone-Vorschau manchmal erst nach
    // dem ersten Layout korrekt. Dieser kleine Re-Layout-Impuls sorgt dafür, dass
    // Header und Fertig-Button sofort an der richtigen Stelle sitzen.
    const timer = setTimeout(() => {
      setTasksModalRenderKey((current) => current + 1);
    }, 0);

    return () => clearTimeout(timer);
  }, [isTasksModalVisible, windowWidth, windowHeight]);

  useEffect(() => {
    if (!currentWg) return;
    setWgName(currentWg.name);
    setWgAddress(currentWg.address || '');
    setWgAvatarType(currentWg.avatarType || 'emoji');
    setWgAvatarEmoji(currentWg.avatarEmoji || '🏡');
    setWgAvatarBg(currentWg.avatarBg || '#F2F2F7');
    setWgAvatarUrl(currentWg.avatarUrl || '');

    const unsubMembers = onSnapshot(query(collection(db, "users"), where("wgId", "==", currentWg.id)), (snap) => {
      setWgMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubRec = onSnapshot(query(collection(db, "recurringTasks"), where("wgId", "==", currentWg.id)), (snap) => {
      setRecurringTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubMembers(); unsubRec(); };
  }, [currentWg]);

  const pickWgImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Berechtigung fehlt", "Wir brauchen Zugriff auf deine Fotos, um ein WG-Bild festzulegen.");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', 
        allowsEditing: true,
        aspect:[1, 1],
        quality: 0.3, 
        base64: true, 
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Data = `data:image/jpeg;base64,${result.assets.base64}`;
        setWgAvatarUrl(base64Data);
        setWgAvatarType('image');
      }
    } catch (e) {
      Alert.alert("Fehler", "Bildauswahl fehlgeschlagen: " + e.message);
    }
  };

  const handleUpdateWgDetails = async () => {
    if (!wgName.trim()) return;
    try {
      await updateDoc(doc(db, "wgs", currentWg.id), {
        name: wgName.trim(), address: wgAddress.trim(),
        avatarType: wgAvatarType, avatarEmoji: wgAvatarEmoji, avatarBg: wgAvatarBg, avatarUrl: wgAvatarUrl
      });
      setIsEditable(false);
      Alert.alert("Erfolg", "WG-Daten wurden erfolgreich für alle aktualisiert.");
    } catch (e) { Alert.alert("Fehler", "Update failed."); }
  };

  const handleCreateWg = async () => {
    if (!wgName.trim()) return;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const customWgId = `${wgName.trim().replace(/[^a-zA-Z0-9]/g, "")}_${rand}`;
    try {
      await setDoc(doc(db, "wgs", customWgId), { name: wgName.trim(), address: wgAddress.trim(), inviteCode: rand.toString(), avatarType: 'emoji', avatarEmoji: '🏡', avatarBg: '#F2F2F7', avatarUrl: '' });
      await updateDoc(doc(db, "users", currentUser.id), { wgId: customWgId });
      setViewMode('menu');
    } catch (e) { Alert.alert("Fehler", "Gründung fehlgeschlagen."); }
  };

  const handleJoinWg = async () => {
    if (!joinId.trim()) return;
    try {
      const wgSnap = await getDoc(doc(db, "wgs", joinId.trim()));
      if (wgSnap.exists()) {
        await updateDoc(doc(db, "users", currentUser.id), { wgId: joinId.trim() });
        setViewMode('menu');
      } else { Alert.alert("Fehler", "ID nicht gefunden."); }
    } catch (e) { Alert.alert("Fehler", "Fehlgeschlagen."); }
  };

  const handleLeaveWg = () => {
    Alert.alert("WG verlassen", "Möchtest du diese WG wirklich verlassen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Verlassen", style: "destructive", onPress: async () => {
          try { await updateDoc(doc(db, "users", currentUser.id), { wgId: null }); } catch (e) { Alert.alert("Fehler", "Aktion failed."); }
      }}
    ]);
  };

  const handleSaveRecurringTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      const payload = { 
        title: taskTitle.trim(), desc: taskDesc.trim(), taskTag: taskTag,
        startTime: normalizeTime(taskStartTime, DEFAULT_TASK_START_TIME),
        endTime: normalizeTime(taskEndTime, DEFAULT_TASK_END_TIME),
        assignmentMode: assignmentMode, fixedMemberIds: assignmentMode === 'fest' ? selectedMemberIds : [], wgId: currentWg.id
      };
      if (editingTaskId) {
        await updateDoc(doc(db, "recurringTasks", editingTaskId), payload);
        setEditingTaskId(null);
      } else {
        await addDoc(collection(db, "recurringTasks"), payload);
      }
      setTaskTitle(''); setTaskDesc(''); setTaskTag('weekly'); setTaskStartTime(DEFAULT_TASK_START_TIME); setTaskEndTime(DEFAULT_TASK_END_TIME); setAssignmentMode('rotierend'); setSelectedMemberIds([]);
    } catch (e) { Alert.alert("Fehler", "Speichern fehlgeschlagen."); }
  };

  const toggleMemberSelection = (id) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(selectedMemberIds.filter(mid => mid !== id));
    } else {
      setSelectedMemberIds([...selectedMemberIds, id]);
    }
  };

  const handleDeleteRecurringTask = async (id) => {
    try { await deleteDoc(doc(db, "recurringTasks", id)); } catch (e) { Alert.alert("Fehler", "Löschen failed."); }
  };

  const distributeTasks = async () => {
    if (recurringTasks.length === 0 || wgMembers.length === 0) return;

    try {
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(0, 0, 0, 0);
      const targetDateDisplay = formatDateDisplay(nextMonday);

      const existingTasksSnap = await getDocs(query(collection(db, "tasks"), where("wgId", "==", currentWg.id)));
      const existingTasks = existingTasksSnap.docs.map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }));

      const calendarEventsSnap = await getDocs(query(collection(db, "calendarEvents"), where("wgId", "==", currentWg.id)));
      const calendarEvents = calendarEventsSnap.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() }));

      let taskCounts = {};
      wgMembers.forEach((m) => { taskCounts[m.id] = 0; });

      let distributionList = [];
      let skippedBlockedTasks = [];

      for (let task of recurringTasks) {
        const alreadyExists = existingTasks.some((existingTask) => {
          const existingDate = existingTask.startAt || existingTask.fullDate;
          return (
            existingTask.title?.toLowerCase?.().trim() === task.title.toLowerCase().trim() &&
            datesAreSameDay(existingDate, nextMonday)
          );
        });

        if (alreadyExists) {
          continue;
        }

        const startTime = normalizeTime(task.startTime, DEFAULT_TASK_START_TIME);
        const endTime = normalizeTime(task.endTime, DEFAULT_TASK_END_TIME);
        const taskStartAt = combineDateAndTime(nextMonday, startTime);
        const taskEndAt = ensureEndAfterStart(taskStartAt, combineDateAndTime(nextMonday, endTime));

        const candidateMembers = task.assignmentMode === 'fest' && task.fixedMemberIds && task.fixedMemberIds.length > 0
          ? wgMembers.filter((member) => task.fixedMemberIds.includes(member.id))
          : wgMembers;

        const availableMembers = candidateMembers.filter((member) => {
          return !isUserBlocked(member.id, taskStartAt, taskEndAt, calendarEvents);
        });

        if (availableMembers.length === 0) {
          skippedBlockedTasks.push(`${task.title} (${startTime}-${endTime})`);
          continue;
        }

        const chosenMember = availableMembers.reduce((best, member) => {
          return taskCounts[member.id] < taskCounts[best.id] ? member : best;
        }, availableMembers[0]);

        taskCounts[chosenMember.id]++;
        distributionList.push({ task, member: chosenMember, taskStartAt, taskEndAt, startTime, endTime });
      }

      if (distributionList.length === 0) {
        setIsTasksModalVisible(false);
        if (skippedBlockedTasks.length > 0) {
          Alert.alert(
            "Keine freie Zuweisung",
            `Für diese Aufgaben war niemand frei:

${skippedBlockedTasks.join('\n')}`
          );
        } else {
          Alert.alert("Up to date", "Alle Aufgaben für die aktuelle Woche sind bereits zugewiesen.");
        }
        return;
      }

      let notificationFailures = [];

      for (let item of distributionList) {
        const createdTask = await addDoc(collection(db, "tasks"), {
          title: item.task.title,
          wgId: currentWg.id,
          userId: item.member.id,
          userName: item.member.name,
          userColor: item.member.color || '#000',
          userBg: item.member.avatarBg || item.member.bg || '#F2F2F7',
          dateDisplay: targetDateDisplay,
          dateNum: item.taskStartAt.getDate(),
          fullDate: item.taskStartAt.toISOString(),
          startAt: item.taskStartAt.toISOString(),
          endAt: item.taskEndAt.toISOString(),
          startTime: item.startTime,
          endTime: item.endTime,
          desc: item.task.desc || "Keine Beschreibung hinterlegt.",
          type: item.task.taskTag === 'single' ? 'manuell' : 'system',
          source: 'recurring_task',
          recurringTaskId: item.task.id,
          createdAt: new Date().toISOString(),
        });

        try {
          const taskTimeText = buildTaskTimeText(item.taskStartAt, item.taskEndAt);
          await createNotificationOnce({
            notificationKey: buildNotificationKey('task_assigned', currentWg.id, item.member.id, createdTask.id),
            wgId: currentWg.id,
            userId: item.member.id,
            title: "Neue Aufgabe bekommen ✅",
            message: taskTimeText
              ? `Dir wurde die Aufgabe "${item.task.title}" zugewiesen. Termin: ${taskTimeText}.`
              : `Dir wurde die Aufgabe "${item.task.title}" zugewiesen.`,
            type: "task_assigned",
            extraData: {
              taskId: createdTask.id,
              taskTitle: item.task.title,
              startAt: item.taskStartAt.toISOString(),
              endAt: item.taskEndAt.toISOString(),
              source: 'recurring_task',
            },
          });
        } catch (notificationError) {
          console.error("Aufgaben-Mitteilung konnte nicht erstellt werden:", notificationError);
          notificationFailures.push(item.task.title);
        }
      }

      setIsTasksModalVisible(false);
      const skippedInfo = skippedBlockedTasks.length > 0
        ? `

Nicht zugewiesen wegen Kalenderblockern:
${skippedBlockedTasks.join('\n')}`
        : '';
      const notificationInfo = notificationFailures.length > 0
        ? `

Hinweis: Für diese Aufgaben konnte keine Mitteilung erstellt werden:
${notificationFailures.join('\n')}`
        : '';
      Alert.alert("Verteilung beendet", `Aufgaben wurden zugewiesen.${skippedInfo}${notificationInfo}`);
    } catch (e) {
      console.error(e);
      Alert.alert("Fehler", "Zuweisung fehlgeschlagen.");
    }
  };

  const renderMemberAvatar = (m) => {
    const actualMember = m.id === currentUser.id ? currentUser : m;
    const type = actualMember?.avatarType || 'initials';
    
    if (type === 'emoji') {
      return (
        <View style={[styles.memberAvatar, { backgroundColor: actualMember.avatarBg || '#EBF4FF' }]}>
          <Text style={{ fontSize: 18 }}>{actualMember.avatarEmoji || '👤'}</Text>
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
      return <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />;
    }

    return (
      <View style={[styles.memberAvatar, { backgroundColor: actualMember?.color || '#007AFF' }]}>
        <Text style={styles.memberAvatarText}>{actualMember?.name ? actualMember.name.slice(0, 2).toUpperCase() : '??'}</Text>
      </View>
    );
  };

  const renderWgAvatar = () => {
    const isValidWgUrl = wgAvatarUrl && (
      wgAvatarUrl.startsWith('http://') || 
      wgAvatarUrl.startsWith('https://') || 
      wgAvatarUrl.startsWith('file://') || 
      wgAvatarUrl.startsWith('data:')
    );

    if (wgAvatarType === 'image' && isValidWgUrl) {
      return <Image source={{ uri: wgAvatarUrl }} style={styles.wgBigAvatar} />;
    }
    return (
      <View style={[styles.wgBigAvatar, { backgroundColor: wgAvatarBg }]}>
        <Text style={{ fontSize: 40 }}>{wgAvatarEmoji}</Text>
      </View>
    );
  };

  if (!currentWg) {
    return (
      <ScrollView contentContainerStyle={styles.containerCenter}>
        {viewMode === 'menu' && (
          <View style={{ width: '100%', paddingHorizontal: 20 }}>
            <TouchableOpacity style={styles.bigMenuBtn} onPress={() => setViewMode('create')}>
              <Ionicons name="add-circle-outline" size={24} color="#000" />
              <Text style={styles.bigMenuText}>WG erstellen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bigMenuBtn, { marginTop: 12 }]} onPress={() => setViewMode('join')}>
              <Ionicons name="enter-outline" size={24} color="#000" />
              <Text style={styles.bigMenuText}>WG beitreten</Text>
            </TouchableOpacity>
          </View>
        )}
        {viewMode === 'create' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>WG gründen 🏠</Text>
            <TextInput style={styles.iOSInput} placeholder="Name der WG" value={wgName} onChangeText={setWgName} />
            <TextInput style={styles.iOSInput} placeholder="Wohnadresse (optional)" value={wgAddress} onChangeText={setWgAddress} />
            <TouchableOpacity style={styles.btnBlack} onPress={handleCreateWg}><Text style={styles.btnTextWhite}>Gründen</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('menu')} style={styles.backLink}><Text style={{ color: '#007AFF' }}>Zurück</Text></TouchableOpacity>
          </View>
        )}
        {viewMode === 'join' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>WG beitreten 🔑</Text>
            <TextInput style={styles.iOSInput} placeholder="Komplette WG-ID eingeben" value={joinId} onChangeText={setJoinId} autoCapitalize="none" />
            <TouchableOpacity style={styles.btnBlack} onPress={handleJoinWg}><Text style={styles.btnTextWhite}>Verbinden</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('menu')} style={styles.backLink}><Text style={{ color: '#007AFF' }}>Zurück</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.wgProfileHeader}>
        <TouchableOpacity onPress={() => isEditable && setIsWgAvatarModalVisible(true)} disabled={!isEditable} style={{ alignItems: 'center' }}>
          {renderWgAvatar()}
          {isEditable && <Text style={styles.editAvatarText}>Bild ändern</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.minimalEditBtn} onPress={() => isEditable ? handleUpdateWgDetails() : setIsEditable(true)}>
          <Text style={[styles.minimalEditText, isEditable && { color: '#34C759', fontWeight: 'bold' }]}>{isEditable ? "Speichern" : "Bearbeiten"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.iosListGroup}>
        <View style={styles.iosListRow}>
          <Text style={styles.iosListLabel}>WG Name</Text>
          <TextInput style={[styles.iosListValue, isEditable && styles.iosValueEditable]} value={wgName} onChangeText={setWgName} editable={isEditable} placeholder="Name eingeben" />
        </View>
        <View style={[styles.iosListRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.iosListLabel}>Adresse</Text>
          <TextInput style={[styles.iosListValue, isEditable && styles.iosValueEditable]} value={wgAddress} onChangeText={setWgAddress} editable={isEditable} placeholder="Noch keine Adresse" />
        </View>
      </View>

      <Text style={styles.iosMetaText}>WG-ID: {currentWg.id}</Text>

      <Text style={styles.iosSectionHeading}>Mitbewohner ({wgMembers.length})</Text>
      <View style={styles.iosListGroup}>
        {wgMembers.map((m, index) => (
          <View key={m.id} style={[styles.iosMemberRow, index === wgMembers.length - 1 && { borderBottomWidth: 0 }]}>
            {renderMemberAvatar(m)}
            <Text style={styles.iosMemberName}>{m.name} {m.id === currentUser.id && <Text style={styles.meTag}>(Du)</Text>}</Text>
            {m.birthday ? <Text style={styles.birthdaySubText}>🎂 {m.birthday}</Text> : null}
          </View>
        ))}
      </View>

      <View style={[styles.iosListGroup, { marginTop: 25 }]}>
        <TouchableOpacity style={styles.iosMenuRow} onPress={() => setIsProfilModalVisible(true)}>
          <View style={[styles.iconContainer, { backgroundColor: '#007AFF' }]}><Ionicons name="person" size={18} color="#FFF" /></View>
          <Text style={styles.iosMenuText}>Profil bearbeiten</Text>
          <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.iosMenuRow, { borderTopWidth: 0.5, borderTopColor: '#E5E5EA' }]} onPress={() => setIsTasksModalVisible(true)}>
          <View style={styles.iconContainer}><Ionicons name="journal" size={18} color="#FFF" /></View>
          <Text style={styles.iosMenuText}>Wochenaufgaben verwalten</Text>
          <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.iosLeaveLink} onPress={handleLeaveWg}><Text style={styles.iosLeaveLinkText}>Diese WG verlassen</Text></TouchableOpacity>

      <Modal
        visible={isProfilModalVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setIsProfilModalVisible(false)}
      >
        <ProfilScreen currentUser={currentUser} onClose={() => setIsProfilModalVisible(false)} />
      </Modal>

      {/* POPUP MODAL: WG AVATAR */}
      <Modal visible={isWgAvatarModalVisible} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>WG Profilbild ändern</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.typeChip, wgAvatarType === 'emoji' && styles.typeChipActive]} onPress={() => setWgAvatarType('emoji')}><Text style={[{ fontWeight: '600' }, wgAvatarType === 'emoji' && { color: '#FFF' }]}>Emoji</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.typeChip, wgAvatarType === 'image' && styles.typeChipActive]} onPress={() => setWgAvatarType('image')}><Text style={[{ fontWeight: '600' }, wgAvatarType === 'image' && { color: '#FFF' }]}>Aus Galerie</Text></TouchableOpacity>
            </View>
            {wgAvatarType === 'emoji' ? (
              <View>
                <View style={styles.typeRow}>
                  {['🏡', '🏢', '🍻', '🍕', '🎉', '🐾', '🥑'].map(e => (
                    <TouchableOpacity key={e} style={[styles.emojiSelect, wgAvatarEmoji === e && { borderColor: '#000' }]} onPress={() => setWgAvatarEmoji(e)}><Text style={{ fontSize: 24 }}>{e}</Text></TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.innerLabel}>Hintergrundfarbe:</Text>
                <View style={styles.typeRow}>
                  {colors.map(c => (
                    <TouchableOpacity key={c} style={[styles.colorSelect, {backgroundColor: c}, wgAvatarBg === c && { borderWidth: 2, borderColor: '#000' }]} onPress={() => setWgAvatarBg(c)} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ marginVertical: 15 }}>
                <TouchableOpacity style={styles.galleryTriggerBtn} onPress={pickWgImage}>
                  <Ionicons name="images" size={20} color="#007AFF" /><Text style={styles.galleryTriggerText}>iPhone Fotomediathek öffnen</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.btnBlack} onPress={() => setIsWgAvatarModalVisible(false)}><Text style={styles.btnTextWhite}>Übernehmen</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL: TASKS POOL */}
      <Modal visible={isTasksModalVisible} animationType="slide" presentationStyle="fullScreen">
        <View key={`tasks-modal-${tasksModalRenderKey}-${windowWidth}-${windowHeight}`} style={styles.tasksModalRoot}>
          <SafeAreaView
            style={styles.tasksModalSafeArea}
            edges={Platform.OS === 'web' ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}
          >
            <View style={styles.modalHeaderExtended}>
            <Text style={styles.modalTitleLarge} numberOfLines={1}>Wochenaufgaben</Text>
            <TouchableOpacity style={styles.iosDoneButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => { setIsTasksModalVisible(false); setEditingTaskId(null); setTaskTitle(''); setTaskDesc(''); setTaskTag('weekly'); setTaskStartTime(DEFAULT_TASK_START_TIME); setTaskEndTime(DEFAULT_TASK_END_TIME); setAssignmentMode('rotierend'); setSelectedMemberIds([]); }}>
              <Text style={styles.iosDoneLink}>Fertig</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.iosListGroupExtended}>
            <TextInput style={styles.modalInputApple} placeholder="Dienst-Name (z.B. Küche putzen)" value={taskTitle} onChangeText={setTaskTitle} />
            <TextInput style={[styles.modalInputApple, { height: 60 }]} placeholder="Beschreibung (Optional)" multiline value={taskDesc} onChangeText={setTaskDesc} />

            <Text style={styles.miniSectionLabel}>Zeitfenster für Kalender-Blocker:</Text>
            <View style={styles.timeInputRow}>
              <View style={styles.timeInputHalf}>
                <Text style={styles.timeInputLabel}>Start</Text>
                <TextInput style={styles.modalInputApple} placeholder="18:00" value={taskStartTime} onChangeText={setTaskStartTime} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={styles.timeInputHalf}>
                <Text style={styles.timeInputLabel}>Ende</Text>
                <TextInput style={styles.modalInputApple} placeholder="19:00" value={taskEndTime} onChangeText={setTaskEndTime} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            
            <Text style={styles.miniSectionLabel}>Typ-Tag festlegen:</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.tagSelectorChip, taskTag === 'weekly' && { backgroundColor: '#34C759' }]} onPress={() => setTaskTag('weekly')}><Text style={[styles.tagSelectorText, taskTag === 'weekly' && { color: '#FFF' }]}>Weekly</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.tagSelectorChip, taskTag === 'single' && { backgroundColor: '#007AFF' }]} onPress={() => setTaskTag('single')}><Text style={[styles.tagSelectorText, taskTag === 'single' && { color: '#FFF' }]}>Single</Text></TouchableOpacity>
            </View>

            <Text style={styles.miniSectionLabel}>Vergabe-Modus:</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.tagSelectorChip, assignmentMode === 'rotierend' && { backgroundColor: '#000' }]} onPress={() => setAssignmentMode('rotierend')}><Text style={[styles.tagSelectorText, assignmentMode === 'rotierend' && { color: '#FFF' }]}>🎲 Rotierend</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.tagSelectorChip, assignmentMode === 'fest' && { backgroundColor: '#FF9500' }]} onPress={() => setAssignmentMode('fest')}><Text style={[styles.tagSelectorText, assignmentMode === 'fest' && { color: '#FFF' }]}>📌 Fest zugewiesen</Text></TouchableOpacity>
            </View>

            {assignmentMode === 'fest' && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.dropdownTitle}>Mitbewohner auswählen:</Text>
                {wgMembers.map(m => {
                  const isSelected = selectedMemberIds.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} style={styles.dropdownRow} onPress={() => toggleMemberSelection(m.id)}>
                      {renderMemberAvatar(m)}
                      <Text style={[styles.dropdownMemberName, isSelected && { fontWeight: '700', color: '#FF9500' }]}>{m.name}</Text>
                      <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={20} color={isSelected ? "#FF9500" : "#C7C7CC"} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity style={styles.btnAppleAdd} onPress={handleSaveRecurringTask}><Text style={styles.btnAppleAddText}>{editingTaskId ? "Dienst aktualisieren" : "Dienst im Pool anlegen"}</Text></TouchableOpacity>
          </View>

          <Text style={styles.iosSectionHeading}>Aufgabenpool ({recurringTasks.length})</Text>
          <ScrollView style={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            <View style={styles.iosListGroup}>
              {recurringTasks.map((t, index) => (
                <View key={t.id} style={[styles.taskManageRowApple, index === recurringTasks.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600' }}>{t.title}</Text>
                    <Text style={{ fontSize: 12, color: t.assignmentMode === 'fest' ? '#FF9500' : '#8E8E93', marginTop: 2 }}>{t.assignmentMode === 'fest' ? `📌 Fest (${t.fixedMemberIds?.length || 0} Personen)` : '🎲 Rotierend'} • {t.startTime || DEFAULT_TASK_START_TIME}-{t.endTime || DEFAULT_TASK_END_TIME} • Tag: {t.taskTag || 'weekly'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setEditingTaskId(t.id); setTaskTitle(t.title); setTaskDesc(t.desc || ''); setTaskTag(t.taskTag || 'weekly'); setTaskStartTime(t.startTime || DEFAULT_TASK_START_TIME); setTaskEndTime(t.endTime || DEFAULT_TASK_END_TIME); setAssignmentMode(t.assignmentMode || 'rotierend'); setSelectedMemberIds(t.fixedMemberIds || []); }} style={{ marginRight: 15 }}><Ionicons name="pencil-outline" size={20} color="#007AFF" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteRecurringTask(t.id)}><Ionicons name="trash-outline" size={20} color="#FF3B30" /></TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={{ padding: 16, backgroundColor: '#F2F2F7' }}>
            <TouchableOpacity style={styles.rollBtnApple} onPress={distributeTasks}>
              <Ionicons name="shuffle" size={20} color="#FFF" />
              <Text style={styles.rollBtnAppleText}>Aufgaben zuweisen</Text>
            </TouchableOpacity>
          </View>
          </SafeAreaView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' }, 
  containerCenter: { flex: 1, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  wgProfileHeader: { alignItems: 'center', marginTop: 25, marginBottom: 15, position: 'relative', width: '100%' },
  wgBigAvatar: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 0.5, borderColor: '#C6C6C8' },
  editAvatarText: { color: '#007AFF', marginTop: 6, fontSize: 13, fontWeight: '600' },
  minimalEditBtn: { position: 'absolute', right: 10, top: 0, padding: 8 },
  minimalEditText: { color: '#007AFF', fontSize: 16, fontWeight: '500' },
  iosListGroup: { backgroundColor: '#FFFFFF', borderRadius: 12, marginHorizontal: 16, paddingLeft: 16, borderWidth: 0.5, borderColor: '#E5E5EA', overflow: 'hidden' },
  iosListRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingRight: 16, borderBottomWidth: 0.5, borderBottomColor: '#C6C6C8' },
  iosListLabel: { fontSize: 16, color: '#1C1C1E', width: 100, fontWeight: '500' },
  iosListValue: { fontSize: 16, color: '#8E8E93', flex: 1, textAlign: 'right' },
  iosValueEditable: { color: '#000000', backgroundColor: '#F2F2F7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, textAlign: 'left' },
  iosMetaText: { textAlign: 'center', color: '#8E8E93', fontSize: 13, marginTop: 10, marginBottom: 25 },
  iosSectionHeading: { fontSize: 13, color: '#8E8E93', textTransform: 'uppercase', fontWeight: '600', marginLeft: 32, marginBottom: 8, marginTop: 15 },
  iosMemberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 16, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  memberAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  iosMemberName: { fontSize: 16, color: '#1C1C1E', fontWeight: '500', flex: 1 },
  meTag: { color: '#8E8E93', fontSize: 14, fontWeight: 'normal' },
  birthdaySubText: { fontSize: 13, color: '#8E8E93' },
  iosMenuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingRight: 16 },
  iconContainer: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#5856D6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  iosMenuText: { fontSize: 16, color: '#1C1C1E', flex: 1, fontWeight: '500' },
  iosLeaveLink: { marginTop: 40, marginBottom: 50, alignItems: 'center' },
  iosLeaveLinkText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, paddingBottom: 45 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, marginTop: 5 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F2F2F7', marginRight: 8 },
  typeChipActive: { backgroundColor: '#000' },
  emojiSelect: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  colorSelect: { width: 32, height: 32, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  galleryTriggerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBF4FF', padding: 16, borderRadius: 12, borderWidth: 0.5, borderColor: '#007AFF' },
  galleryTriggerText: { color: '#007AFF', fontWeight: '600', marginLeft: 8, fontSize: 15 },
  btnBlack: { backgroundColor: '#000', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  bigMenuBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 20, borderRadius: 12, width: '100%', borderWidth: 0.5, borderColor: '#E5E5EA', justifyContent: 'center' },
  bigMenuText: { fontSize: 16, fontWeight: '600', marginLeft: 12 },
  formCard: { width: '100%', paddingHorizontal: 20 },
  formTitle: { fontSize: 26, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  iOSInput: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, fontSize: 16, borderWidth: 0.5, borderColor: '#C6C6C8' },
  backLink: { marginTop: 15, alignItems: 'center' },
  tasksModalRoot: { flex: 1, backgroundColor: '#F2F2F7', paddingTop: Platform.OS === 'web' ? TASKS_MODAL_WEB_TOP_OFFSET : 0 },
  tasksModalSafeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeaderExtended: { minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 0.5, borderBottomColor: '#C6C6C8', zIndex: 20 },
  modalTitleLarge: { flex: 1, marginRight: 12, fontSize: 24, fontWeight: 'bold', color: '#000' },
  iosDoneButton: { minWidth: 72, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  iosDoneLink: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },
  iosListGroupExtended: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, margin: 16, borderWidth: 0.5, borderColor: '#E5E5EA' },
  modalInputApple: { backgroundColor: '#F2F2F7', padding: 14, borderRadius: 10, fontSize: 16, color: '#000', marginBottom: 10 },
  miniSectionLabel: { fontSize: 12, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  tagSelectorChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E5E5EA', marginRight: 10, marginBottom: 5 },
  tagSelectorText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  dropdownContainer: { backgroundColor: '#F2F2F7', borderRadius: 10, padding: 12, marginTop: 10, marginBottom: 10 },
  dropdownTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 8 },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 0.5, borderColor: '#E5E5EA' },
  dropdownMemberName: { fontSize: 15, color: '#000', flex: 1 },
  btnAppleAdd: { backgroundColor: '#1C1C1E', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  btnAppleAddText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  taskManageRowApple: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 16, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  timeInputRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeInputHalf: { width: '48%' },
  timeInputLabel: { fontSize: 12, fontWeight: '700', color: '#8E8E93', marginBottom: 4, marginLeft: 2 },
  rollBtnApple: { backgroundColor: '#34C759', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  rollBtnAppleText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 10 }
});