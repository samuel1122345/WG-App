import React from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScreenWrapper({ children, scrollable = false, style }) {
  // Wenn der Screen scrollbar sein soll, nutzen wir eine ScrollView, ansonsten eine normale View
  const Container = scrollable ? ScrollView : View;
  
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <Container 
          style={[styles.innerContainer, style]} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={scrollable ? { flexGrow: 1 } : undefined}
        >
          {children}
        </Container>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Verhindert unschöne farbige Balken an der Notch
  },
  keyboardAvoid: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
});