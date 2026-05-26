// screens/KalenderScreen.js
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export default function KalenderScreen({ allTasks, renderTaskList }) {
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(20);

  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);
  const blankDays = Array.from({ length: 4 }, (_, i) => i); 

  const calendarTasks = allTasks.filter(task => task.dateNum === selectedCalendarDate);

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
      {/* IOS MONATSRUSTER */}
      <View style={styles.monthContainer}>
        <View style={styles.monthHeaderRow}>
          {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, index) => (
            <Text key={index} style={styles.monthHeaderCell}>{d}</Text>
          ))}
        </View>
        <View style={styles.daysGrid}>
          {blankDays.map(b => <View key={`blank-${b}`} style={styles.gridCellEmpty} />)}
          {daysInMonth.map(date => {
            const isSelected = selectedCalendarDate === date;
            const hasTasks = allTasks.some(t => t.dateNum === date);
            return (
              <TouchableOpacity 
                key={date} 
                style={[styles.gridCell, isSelected && styles.gridCellActive]}
                onPress={() => setSelectedCalendarDate(date)}
              >
                <Text style={[styles.gridCellText, isSelected && styles.gridCellTextActive]}>{date}</Text>
                {hasTasks && !isSelected && <View style={styles.dotIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={styles.sectionTitle}>Aufgaben am {selectedCalendarDate}. Mai</Text>
      {renderTaskList(calendarTasks)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 25 },
  monthContainer: { backgroundColor: '#FFF', marginBottom: 25, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  monthHeaderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  monthHeaderCell: { width: width / 8, textAlign: 'center', fontSize: 11, color: '#8E8E93', fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: (width - 50) / 7, height: 44, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  gridCellEmpty: { width: (width - 50) / 7, height: 44 },
  gridCellText: { fontSize: 16, fontWeight: '400', color: '#000' },
  gridCellActive: { backgroundColor: '#FF3B30', borderRadius: 22 },
  gridCellTextActive: { color: '#FFF', fontWeight: '600' },
  dotIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#8E8E93', position: 'absolute', bottom: 4 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#000' },
});