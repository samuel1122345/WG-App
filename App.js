import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// FIREBASE IMPORTE
import { db } from './firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// SCREENS
import PlanerScreen from './screens/planer'; 
import KalenderScreen from './screens/kalender';

// --- STYLES ZUERST DEFINIEREN (Löst den ReferenceError) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mainContent: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 25, 
    paddingTop: 15, 
    paddingBottom: 5 
  },
  dateText: { 
    fontSize: 13, 
    color: '#8E8E93', 
    fontWeight: '600', 
    textTransform: 'uppercase' 
  },
  greeting: { fontSize: 34, fontWeight: 'bold', color: '#000' },
  profileButton: { padding: 5 },
  navBar: { 
    flexDirection: 'row', 
    height: 90, 
    backgroundColor: '#F9F9F9', 
    borderTopWidth: 0.5, 
    borderTopColor: '#C6C6C8', 
    paddingBottom: 25, 
    justifyContent: 'space-around', 
    alignItems: 'center' 
  },
  navItem: { alignItems: 'center', justifyContent: 'center', width: 60 },
  navLabel: { fontSize: 10, marginTop: 4, fontWeight: '500' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calendarTaskItem: { 
    paddingLeft: 25, 
    paddingVertical: 10, 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#E5E5EA' 
  },
  calendarTaskTitle: { fontSize: 16, fontWeight: '500' },
  calendarTaskSub: { fontSize: 13, color: '#8E8E93' },
  noTasksText: { paddingLeft: 25, color: '#8E8E93', fontStyle: 'italic', marginTop: 10 }
});

// --- HILFSKOMPONENTE ---
const NavButton = ({ name, label, active, onPress }) => {
  const isActive = active === label;
  const iconName = isActive ? name.replace('-outline', '') : name;
  
  return (
    <TouchableOpacity style={styles.navItem} onPress={() => onPress(label)}>
      <Ionicons 
        name={iconName} 
        size={24} 
        color={isActive ? "#007AFF" : "#8E8E93"} 
      />
      <Text style={[styles.navLabel, { color: isActive ? "#007AFF" : "#8E8E93" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// --- HAUPTKOMPONENTE ---
export default function App() {
  const [activeTab, setActiveTab] = useState('Planer');
  const [allTasks, setAllTasks] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const tasksArray = [];
      querySnapshot.forEach((doc) => {
        tasksArray.push({ 
          ...doc.data(), 
          id: doc.id 
        });
      });
      setAllTasks(tasksArray);
    }, (error) => {
      console.error("Firebase Snapshot Error: ", error);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>Mai 2026</Text>
          <Text style={styles.greeting}>
            {activeTab === 'Planer' ? 'Inbox' : activeTab}
          </Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle-outline" size={36} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        {activeTab === 'Planer' && (
          <PlanerScreen allTasks={allTasks} />
        )}
        
        {activeTab === 'Kalender' && (
          <KalenderScreen 
            allTasks={allTasks} 
            renderTaskList={(tasks) => (
              tasks.length > 0 ? (
                tasks.map(t => (
                  <View key={t.id} style={styles.calendarTaskItem}>
                    <Text style={styles.calendarTaskTitle}>{t.title}</Text>
                    <Text style={styles.calendarTaskSub}>{t.time} Uhr • {t.user}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noTasksText}>Keine Aufgaben an diesem Tag.</Text>
              )
            )} 
          />
        )}

        {activeTab === 'To-Do' && (
          <View style={styles.placeholder}><Text>Hier folgen die Checklisten...</Text></View>
        )}
        
        {activeTab === 'WG' && (
          <View style={styles.placeholder}><Text>WG-Einstellungen</Text></View>
        )}
      </View>

      <View style={styles.navBar}>
        <NavButton name="checkbox-outline" label="Planer" active={activeTab} onPress={setActiveTab} />
        <NavButton name="calendar-outline" label="Kalender" active={activeTab} onPress={setActiveTab} />
        <NavButton name="list" label="To-Do" active={activeTab} onPress={setActiveTab} />
        <NavButton name="people-outline" label="WG" active={activeTab} onPress={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}