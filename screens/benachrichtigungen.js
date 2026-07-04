import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, getDoc, addDoc } from 'firebase/firestore';

export default function BenachrichtigungenScreen({ currentUser, currentWg, onClose }) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [members, setMembers] = useState([]);

  const getNotificationVisual = (type) => {
    switch (type) {
      case 'swap_request':
        return { name: 'swap-horizontal', color: '#FF9500' };
      case 'swap_accepted':
        return { name: 'checkmark-circle', color: '#34C759' };
      case 'swap_declined':
        return { name: 'close-circle', color: '#FF3B30' };
      case 'task_assigned':
        return { name: 'checkbox', color: '#007AFF' };
      case 'task_due_soon':
        return { name: 'alarm', color: '#FF9500' };
      case 'birthday_tomorrow':
        return { name: 'gift', color: '#AF52DE' };
      case 'todo_added':
        return { name: 'list-circle', color: '#5856D6' };
      default:
        return { name: 'notifications', color: '#8E8E93' };
    }
  };

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

      const nextNotifRef = doc(collection(db, "notifications"));
      batch.set(nextNotifRef, {
        wgId: currentWg.id,
        userId: request.fromUserId,
        title: "Tausch akzeptiert! ✅",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" angenommen.`,
        type: "swap_accepted",
        status: "unread",
        createdAt: new Date().toISOString()
      });

      const notifsQuery = query(collection(db, "notifications"), where("wgId", "==", currentWg.id), where("type", "==", "swap_request"));
      const notifsSnap = await getDocs(notifsQuery);
      notifsSnap.forEach((nDoc) => {
        if (resolvedSwapIds.includes(nDoc.data().extraData?.swapRequestId)) {
          batch.delete(doc(db, "notifications", nDoc.id));
        }
      });

      await batch.commit();
      Alert.alert("Erfolg", "Dienste wurden erfolgreich getauscht!");
    } catch (e) {
      Alert.alert("Fehler", "Tausch konnte nicht bestätigt werden.");
    }
  };

  const handleDecline = async (notification) => {
    const request = notification.extraData;
    if (!request) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "swapRequests", request.swapRequestId), { status: "declined" });
      batch.delete(doc(db, "notifications", notification.id));

      const nextNotifRef = doc(collection(db, "notifications"));
      batch.set(nextNotifRef, {
        wgId: currentWg.id,
        userId: request.fromUserId,
        title: "Tausch abgelehnt ❌",
        message: `${currentUser.name} hat deine Tauschanfrage für "${request.fromTaskTitle}" abgelehnt.`,
        type: "swap_declined",
        status: "unread",
        createdAt: new Date().toISOString()
      });

      await batch.commit();
      Alert.alert("Abgelehnt", "Tauschanfrage wurde abgewiesen.");
    } catch (e) {
      Alert.alert("Fehler", "Aktion fehlgeschlagen.");
    }
  };

  const sheetMaxHeight = Math.max(360, Math.round(windowHeight * 0.72));
  const sheetBottomPadding = Math.max(insets.bottom, 16) + 18;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: sheetBottomPadding }]}>
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Mitteilungen</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
            <Text style={styles.closeLink}>Schließen</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={34} color="#C7C7CC" />
              <Text style={styles.emptyText}>Keine Mitteilungen vorhanden.</Text>
            </View>
          ) : (
            notifications.map(item => {
              const visual = getNotificationVisual(item.type);
              return (
                <View key={item.id} style={styles.notificationCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardTitleWrap}>
                      <Ionicons name={visual.name} size={20} color={visual.color} />
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
              );
            })
          )}
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
    backgroundColor: '#F2F2F7',
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
  closeLink: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContainer: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyState: {
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 10,
    fontStyle: 'italic',
    fontSize: 15,
  },
  notificationCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
    width: '100%',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginLeft: 7,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  cardBodyText: {
    fontSize: 14,
    color: '#3A3A3C',
    lineHeight: 19,
    marginBottom: 10,
  },
  actionButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionBtn: {
    flex: 0.48,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});