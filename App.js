import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// FIREBASE IMPORTE
import { db, auth } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
// KORRIGIERT: doc, writeBatch und getDocs sind jetzt wieder an ihrem richtigen Platz
import { onSnapshot, collection, query, orderBy, where, doc, writeBatch, getDocs } from 'firebase/firestore';

// SCREENS IMPORTE
import PlanerScreen from './screens/planer'; 
import KalenderScreen from './screens/kalender';
import EinstellungenScreen from './screens/einstellungen';
import KontoScreen from './screens/konto';
import BenachrichtigungenScreen from './screens/benachrichtigungen';

// --- NAV-BUTTON KOMPONENTE ---
const NavButton = ({ name, label, active, onPress }) => {
  const isActive = active === label;
  const iconName = isActive ? name.replace('-outline', '') : name;
  
  return (
    <TouchableOpacity style={styles.navItem} onPress={() => onPress(label)}>
      <Ionicons 
        name={iconName} 
        size={24} 
        color={isActive ? "#000000" : "#8E8E93"} 
      />
      <Text style={[styles.navLabel, { color: isActive ? "#000000" : "#8E8E93" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('Planer');
  const [allTasks, setAllTasks] = useState([]);
  
  const [currentUser, setCurrentUser] = useState(null);
  const [currentWg, setCurrentWg] = useState(null);
  const [isNotificationsVisible, setIsNotificationsVisible] = useState(false); 
  const [unreadCount, setUnreadCount] = useState(0); 
  const [loading, setLoading] = useState(true);

  // Echtzeit-Überwachung des Login-Status (Abgesichert gegen Deadlocks)
  useEffect(() => {
    let unsubUser = () => {};
    let unsubWg = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        unsubUser = onSnapshot(userRef, (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setCurrentUser({ id: userSnap.id, ...userData });

            // Alten WG-Listener kappen, falls vorhanden
            unsubWg();

            if (userData.wgId) {
              const wgRef = doc(db, "wgs", userData.wgId);
              unsubWg = onSnapshot(wgRef, (wgSnap) => {
                if (wgSnap.exists()) {
                  setCurrentWg({ id: wgSnap.id, ...wgSnap.data() });
                } else {
                  setCurrentWg(null);
                }
                setLoading(false);
              }, (err) => {
                console.error("WG Snapshot Error:", err);
                setLoading(false);
              });
            } else {
              setCurrentWg(null);
              setLoading(false);
            }
          } else {
            setCurrentUser(null);
            setCurrentWg(null);
            setLoading(false);
          }
        }, (err) => {
          console.error("User Snapshot Error:", err);
          setLoading(false);
        });
      } else {
        setCurrentUser(null);
        setCurrentWg(null);
        unsubUser();
        unsubWg();
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubUser();
      unsubWg();
    };
  }, []);

  // Globaler Task-Snapshot für den Kalender
  useEffect(() => {
    if (!currentWg?.id) {
      setAllTasks([]);
      return;
    }
    const q = query(collection(db, "tasks"), where("wgId", "==", currentWg.id), orderBy("fullDate", "asc"));
    return onSnapshot(q, (querySnapshot) => {
      const tasksArray = [];
      querySnapshot.forEach((doc) => { tasksArray.push({ ...doc.data(), id: doc.id }); });
      setAllTasks(tasksArray);
    });
  }, [currentWg]);

  // Live-Badge-Zähler für ungelesene Mitteilungen
  useEffect(() => {
    if (!currentUser?.id) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", currentUser.id),
      where("status", "==", "unread")
    );
    return onSnapshot(q, (snap) => {
      setUnreadCount(snap.docs.length);
    });
  }, [currentUser]);

  // Glocke klicken: Öffnet Modal & setzt Badge-Status auf gelesen
  const openNotifications = async () => {
    setIsNotificationsVisible(true);
    if (unreadCount === 0) return;
    try {
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", currentUser.id),
        where("status", "==", "unread")
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => {
        batch.update(doc(db, "notifications", d.id), { status: 'read' });
      });
      await batch.commit();
    } catch (e) {
      console.error("Error marking read:", e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Verbinde mit WG-OS...</Text>
      </View>
    );
  }

  if (!currentUser) return <KontoScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      
      {/* HEADER BEREICH */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>Juni 2026</Text>
          <Text style={styles.greeting}>
            {activeTab === 'Planer' ? 'Inbox' : activeTab}
          </Text>
        </View>
        <TouchableOpacity style={styles.bellButton} onPress={openNotifications}>
          <Ionicons name="notifications-outline" size={26} color="#000" />
          {unreadCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* REITER-INHALTE */}
      <View style={styles.mainContent}>
        {activeTab === 'Planer' && <PlanerScreen currentUser={currentUser} currentWg={currentWg} />}
        {activeTab === 'Kalender' && (
          <KalenderScreen 
            allTasks={allTasks} 
            renderTaskList={(tasks) => (
              tasks.length > 0 ? (
                tasks.map(t => (
                  <View key={t.id} style={styles.calendarTaskItem}>
                    <Text style={styles.calendarTaskTitle}>{t.title}</Text>
                    <Text style={styles.calendarTaskSub}>{t.dateDisplay} • {t.userName || 'Unbekannt'}</Text>
                  </View>
                ))
              ) : <Text style={styles.noTasksText}>Keine Aufgaben an diesem Tag.</Text>
            )} 
          />
        )}
        {activeTab === 'To-Do' && (
          <View style={styles.placeholderContainer}>
            <Ionicons name="list-circle-outline" size={48} color="#C7C7CC" />
            <Text style={styles.placeholderText}>Hier folgen die Checklisten...</Text>
          </View>
        )}
        {activeTab === 'WG' && <EinstellungenScreen currentUser={currentUser} currentWg={currentWg} />}
      </View>

      {/* BOTTOM TAB LEISTE */}
      <View style={styles.navBar}>
        <NavButton name="checkbox-outline" label="Planer" active={activeTab} onPress={setActiveTab} />
        <NavButton name="calendar-outline" label="Kalender" active={activeTab} onPress={setActiveTab} />
        <NavButton name="list" label="To-Do" active={activeTab} onPress={setActiveTab} />
        <NavButton name="people-outline" label="WG" active={activeTab} onPress={setActiveTab} />
      </View>

      {/* BENACHRICHTIGUNGEN MODAL */}
      <Modal visible={isNotificationsVisible} animationType="slide">
        <BenachrichtigungenScreen currentUser={currentUser} currentWg={currentWg} onClose={() => setIsNotificationsVisible(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mainContent: { flex: 1, backgroundColor: '#FFFFFF' }, 
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#8E8E93', fontWeight: '500' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 15, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA', zIndex: 10 },
  dateText: { fontSize: 13, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase' },
  greeting: { fontSize: 34, fontWeight: 'bold', color: '#000' },
  bellButton: { padding: 8, backgroundColor: '#F2F2F7', borderRadius: 20, position: 'relative' }, 
  badgeContainer: { position: 'absolute', right: -4, top: -4, backgroundColor: '#FF3B30', borderRadius: 9, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  navBar: { flexDirection: 'row', height: 90, backgroundColor: '#F9F9F9', borderTopWidth: 0.5, borderTopColor: '#C6C6C8', paddingBottom: 25, justifyContent: 'space-around', alignItems: 'center' },
  navItem: { alignItems: 'center', justifyContent: 'center', width: 60 },
  navLabel: { fontSize: 10, marginTop: 4, fontWeight: '500' },
  placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#8E8E93', marginTop: 10, fontSize: 16 },
  calendarTaskItem: { paddingLeft: 25, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  calendarTaskTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  calendarTaskSub: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  noTasksText: { paddingLeft: 25, color: '#8E8E93', fontStyle: 'italic', marginTop: 12 }
});