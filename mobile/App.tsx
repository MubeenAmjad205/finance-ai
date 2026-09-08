import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { StorageService, SyncLogEntry } from './src/services/storageService';
import { WebhookService } from './src/services/webhookService';
import { SAMPLE_BANK_SMS } from './src/services/smsListener';

export default function App() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [isListenerActive, setIsListenerActive] = useState(true);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loadingBank, setLoadingBank] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const url = await StorageService.getWebhookUrl();
    const secret = await StorageService.getSecretToken();
    const active = await StorageService.isListenerActive();
    const logHistory = await StorageService.getSyncLogs();

    setWebhookUrl(url);
    setSecretToken(secret);
    setIsListenerActive(active);
    setLogs(logHistory);
  };

  const handleSaveSettings = async () => {
    await StorageService.setWebhookUrl(webhookUrl);
    await StorageService.setSecretToken(secretToken);
    Alert.alert('✅ Saved', 'Webhook settings saved successfully!');
  };

  const handleToggleListener = async (val: boolean) => {
    setIsListenerActive(val);
    await StorageService.setListenerActive(val);
  };

  const handleTestSms = async (sample: typeof SAMPLE_BANK_SMS[0]) => {
    setLoadingBank(sample.bank);
    try {
      const entry = await WebhookService.sendAlert(sample.sender, sample.body);
      const updatedLogs = await StorageService.getSyncLogs();
      setLogs(updatedLogs);

      if (entry.status === 'success') {
        Alert.alert('✅ Test Alert Sent', `Successfully logged transaction via Cloudflare Worker!\n\n${entry.responseMsg}`);
      } else {
        Alert.alert('⚠️ Sync Failed', `Error: ${entry.responseMsg}`);
      }
    } finally {
      setLoadingBank(null);
    }
  };

  const handleClearLogs = async () => {
    await StorageService.clearLogs();
    setLogs([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f17" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.brandIcon}>
            <Text style={{ fontSize: 24 }}>⚡</Text>
          </View>
          <View>
            <Text style={styles.title}>Finance AI Sync</Text>
            <Text style={styles.subtitle}>Android SMS & Notification Auto-Parser</Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusCard, { borderColor: isListenerActive ? '#10b981' : '#ef4444' }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isListenerActive ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {isListenerActive ? '🟢 Auto-Listener Active' : '🔴 Auto-Listener Paused'}
            </Text>
          </View>
          <Switch
            value={isListenerActive}
            onValueChange={handleToggleListener}
            trackColor={{ false: '#374151', true: '#059669' }}
            thumbColor={isListenerActive ? '#10b981' : '#9ca3af'}
          />
        </View>

        {/* Configuration Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚙️ Webhook Configuration</Text>
          
          <Text style={styles.inputLabel}>Worker Webhook URL:</Text>
          <TextInput
            style={styles.input}
            value={webhookUrl}
            onChangeText={setWebhookUrl}
            placeholder="https://finance-ai.workers.dev/api/sms/webhook"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.inputLabel}>Secret Token (Optional):</Text>
          <TextInput
            style={styles.input}
            value={secretToken}
            onChangeText={setSecretToken}
            placeholder="Optional secret token"
            placeholderTextColor="#6b7280"
            secureTextEntry
          />

          <TouchableOpacity style={styles.buttonPrimary} onPress={handleSaveSettings}>
            <Text style={styles.buttonText}>💾 Save Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Test / Simulation Buttons */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🧪 Instant Test SMS Webhook</Text>
          <Text style={styles.cardSub}>Tap any Pakistani bank or wallet sample to test real-time AI parsing & Telegram delivery:</Text>

          <View style={styles.bankGrid}>
            {SAMPLE_BANK_SMS.map((sample) => (
              <TouchableOpacity
                key={sample.bank}
                style={styles.bankButton}
                onPress={() => handleTestSms(sample)}
                disabled={loadingBank !== null}
              >
                {loadingBank === sample.bank ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text style={styles.bankButtonText}>📲 Test {sample.bank}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Activity & Sync Logs */}
        <View style={styles.card}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.cardTitle}>📋 Recent Sync History</Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={handleClearLogs}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No transactions synced yet. Tap a test bank button above!</Text>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={styles.logItem}>
                <View style={styles.logItemHeader}>
                  <Text style={styles.logSender}>🏦 {log.sender}</Text>
                  <Text style={[styles.logStatus, log.status === 'success' ? styles.statusSuccess : styles.statusFailed]}>
                    {log.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.logBody}>{log.body}</Text>
                {log.responseMsg && <Text style={styles.logResponse}>➡️ {log.responseMsg}</Text>}
                <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f17'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af'
  },
  statusCard: {
    backgroundColor: '#161f2f',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    marginBottom: 16
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  statusText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14
  },
  card: {
    backgroundColor: '#161f2f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8
  },
  cardSub: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 14
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d1d5db',
    marginTop: 10,
    marginBottom: 4
  },
  input: {
    backgroundColor: '#0b0f17',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    color: '#ffffff',
    padding: 12,
    fontSize: 13
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  bankButton: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  bankButtonText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600'
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  clearText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600'
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 8
  },
  logItem: {
    backgroundColor: '#0b0f17',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6'
  },
  logItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  logSender: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12
  },
  logStatus: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  statusSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399'
  },
  statusFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171'
  },
  logBody: {
    color: '#9ca3af',
    fontSize: 11,
    lineHeight: 15
  },
  logResponse: {
    color: '#60a5fa',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500'
  },
  logTime: {
    color: '#4b5563',
    fontSize: 9,
    marginTop: 4,
    textAlign: 'right'
  }
});
