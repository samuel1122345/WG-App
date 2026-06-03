import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, getDoc, addDoc } from 'firebase/firestore';

export default function BenachrichtigungenScreen({ currentUser, currentWg, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!currentWg?.id || !currentUser?.id) return;

    const unsubMembers = onSnapshot(query(collection(db, "users"), where("wgId", "==", currentWg.id)), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(
      collection(db, "notifications"), 
      where("wgId", "==", currentWg.id), 
      where("userId", "==", currentUser.id)
    );

    const unsubNotifs = onSnapshot(q, (snap) => {
      const loadedNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loadedNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setNotifications(loadedNotifs);
    });

    return () => { unsubMembers(); unsubNotifs(); };
  }, [currentWg, currentUser]);

  const handleAccept = async (notification) => {
    const request = notification.extraData;
    if (!request) return;

    try {
      const swapDoc = await getDoc(doc(db, "swapRequests", request.swapRequestId));
      if (!swapDoc.exists() || swapDoc.data().status !== 'pending') {
        Alert.alert("Nicht mehr verfügbar", "Dieser Tausch wurde bereits verarbeitet.");
        // Lokale Cache-Leiche löschen, falls die Anfrage schon tot ist
        const cleanBatch = writeBatch(db);
        cleanBatch.delete(doc(db, "notifications", notification.id));
        await cleanBatch.commit();
        return;
      }

      const batch = writeBatch(db);
      const taskRefA = doc(db, "tasks", request.fromTaskId);
      const taskRefB = doc(db, "tasks", request.toTaskId);
      const requestRef = doc(db, "swapRequests", request.swapRequestId);

      const userA = members.find(m => m.id === request.fromUserId);
      const userB = members.find(m => m.id === request.toUserId);
      if (!userA || !userB) return;

      batch.update(taskRefA, { userId: userB.id, userName: userB.name, userColor: userB.color || '#000', userBg: userB.avatarBg || '#F2F2F7' });
      batch.update(taskRefB, { userId: userA.id, userName: userA.name, userColor: userA.color || '#000', userBg: userA.avatarBg || '#F2F2F7' });
      batch.update(requestRef, { status: "accepted" });

      // FIXIERUNG: Sammelt alle hinfälligen Swap-IDs für die kaskadierende Bereinigung
      const resolvedSwapIds = [request.swapRequestId];

      const allSwapsSnap = await getDocs(query(collection(db, "swapRequests"), where("wgId", "==", currentWg.id), where("status", "==", "pending")));
      allSwapsSnap.forEach((subDoc) => {
        const data = subDoc.data();
        if (subDoc.id !== request.swapRequestId && (
          data.fromTaskId === request.fromTaskId || data.toTaskId === request.fromTaskId ||
          data.fromTaskId === request.toTaskId || data.toTaskId === request.toTaskId
        )) {
          batch.update(doc(db, "swapRequests", subDoc.id), { status: "invalidated" });
          resolvedSwapIds.push(subDoc.id);
        }
      });

      // SENDER INFORMIEREN
      const nextNotifRef = doc(collection(db, "notifications"));
      batch.set(nextNotifRef, {
        wgId: currentWg.id, userId: request.fromUserId,
        title: "Tausch akzeptiert! ✅",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" angenommen.`,
        type: "swap_accepted", status: "unread", createdAt: new Date().toISOString()
      });

      // FIXIERUNG: Löscht ALLE jetzt hinfälligen Notification-Karten in der gesamten WG aus der Datenbank
      const notifsQuery = query(collection(db, "notifications"), where("wgId", "==", currentWg.id), where("type", "==", "swap_request"));
      const notifsSnap = await getDocs(notifsQuery);
      notifsSnap.forEach((nDoc) => {
        if (resolvedSwapIds.includes(nDoc.data().extraData?.swapRequestId)) {
          batch.delete(doc(db, "notifications", nDoc.id));
        }
      });

      await batch.commit();
      Alert.alert("Erfolg", "Dienste wurden erfolgreich getauscht!");
    } catch (e) { Alert.alert("Fehler", "Tausch konnte nicht bestätigt werden."); }
  };

  const handleDecline = async (notification) => {
    const request = notification.extraData;
    if (!request) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "swapRequests", request.swapRequestId), { status: "declined" });

      // FIXIERUNG: Löscht die abgelehnte Notification-Karte sofort im selben Batch aus der DB
      batch.delete(doc(db, "notifications", notification.id));

      // SENDER INFORMIEREN
      const nextNotifRef = doc(collection(db, "notifications"));
      batch.set(nextNotifRef, {
        wgId: currentWg.id, userId: request.fromUserId,
        title: "Tausch abgelehnt ❌",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" abgelehnt.`,
        type: "swap_declined", status: "unread", createdAt: new Date().toISOString()
      });

      await batch.commit();
      Alert.alert("Abgelehnt", "Tauschanfrage wurde abgewiesen.");
    } catch (e) { Alert.alert("Fehler", "Aktion fehlgeschlagen."); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mitteilungen</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.closeLink}>Schließen</Text></TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {notifications.length === 0 ? (
          <Text style={styles.emptyText}>Keine Mitteilungen vorhanden.</Text>
        ) : (
          notifications.map(item => (
            <View key={item.id} style={styles.notificationCard}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons 
                    name={item.type === 'swap_request' ? "swap-horizontal" : item.type === 'swap_accepted' ? "checkmark-circle" : "close-circle"} 
                    size={20} 
                    color={item.type === 'swap_request' ? "#FF9500" : item.type === 'swap_accepted' ? "#34C759" : "#FF3B30"} 
                  />
                  <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
                {item.status === 'unread' && <View style={styles.unreadDot} />}
              </View>
              
              <Text style={styles.cardBodyText}>{item.message}</Text>
              
              {item.type === 'swap_request' && (
                <View style={styles.actionButtonRow}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#34C759' }]} onPress={() => handleAccept(item)}>
                    <Text style={styles.btnText}>Annehmen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]} onPress={() => handleDecline(item)}>
                    <Text style={styles.btnText}>Ablehnen</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#C6C6C8', zIndex: 10 },
  title: { fontSize: 24, fontWeight: 'bold' },
  closeLink: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  emptyText: { textAlign: 'center', color: '#8E8E93', marginVertical: 40, fontStyle: 'italic', fontSize: 15 },
  notificationCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#E5E5EA', width: '100%' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginLeft: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF' },
  cardBodyText: { fontSize: 14, color: '#3A3A3C', lineHeight: 18, marginBottom: 10 },
  actionButtonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  actionBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 }
});