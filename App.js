// App.js
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PlanerScreen from './screens/planer';
import KalenderScreen from './screens/kalender';

export default function App() {
  const [activeTab, setActiveTab] = useState('Planer');

  const [allTasks, setAllTasks] = useState([
    { id: 1, title: 'Küche tiefenreinigen', day: 'Mi', dateNum: 20, time: '14:00', user: 'Sarah', userInit: 'S', color: '#FF3B30', bg: '#FFECEB', desc: 'Inklusive Backofen und Kühlschrank auswischen.' },
    { id: 2, title: 'Wocheneinkauf E-Center', day: 'Mi', dateNum: 20, time: '17:30', user: 'Lukas', userInit: 'L', color: '#007AFF', bg: '#EBF4FF', desc: 'Klopapier und Hafermilch nicht vergessen!' },
    { id: 3, title: 'Mülltonnen rausstellen', day: 'Do', dateNum: 21, time: '07:00', user: 'Tim', userInit: 'T', color: '#34C759', bg: '#EBFCEF', desc: 'Diesmal ist die Blaue Tonne (Altpapier) dran.' },
    { id: 4, title: 'Flur & Bad staubsaugen', day: 'Fr', dateNum: 22, time: '12:00', user: 'Lukas', userInit: 'L', color: '#AF52DE', bg: '#F6EFFF', desc: 'Bitte auch hinter der Waschmaschine saugen.' },
    { id: 5, title: 'Gemeinsames WG-Kochen', day: 'Sa', dateNum: 23, time: '19:00', user: 'Alle', userInit: 'WG', color: '#FF9500', bg: '#FFF5EB', desc: 'Es gibt selbstgemachte Lasagne. Zutaten besorgt Tim.' },
  ]);

  const handleAddTask = (newTask) => {
    setAllTasks((prevTasks) => [newTask, ...prevTasks]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>Mai 2026</Text>
          <Text style={styles.greeting}>{activeTab === 'Planer' ? 'Inbox' : activeTab}</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle-outline" size={36} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        {activeTab === 'Planer' && <PlanerScreen allTasks={allTasks} onAddTask={handleAddTask} />}
        {activeTab === 'Kalender' && <KalenderScreen allTasks={allTasks} renderTaskList={() => null} />}
        {activeTab === 'To-Do' && <View style={styles.placeholder}><Text>Hier folgen die Checklisten...</Text></View>}
        {activeTab === 'WG' && <View style={styles.placeholder}><Text>WG-Einstellungen</Text></View>}
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

const NavButton = ({ name, label, active, onPress }) => {
  const isActive = active === label;
  return (
    <TouchableOpacity style={styles.navItem} onPress={() => onPress(label)}>
      <Ionicons name={isActive ? name.replace('-outline', '') : name} size={24} color={isActive ? "#007AFF" : "#8E8E93"} />
      <Text style={[styles.navLabel, { color: isActive ? "#007AFF" : "#8E8E93" }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mainContent: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 15, paddingBottom: 5 },
  dateText: { fontSize: 13, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase' },
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
});