import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { screenAfterBleSnapshot, startBleOnLaunch, StartupScreen } from './app/startup';
import { BleSnapshot, Nu40BleClient } from './ble/Nu40BleClient';
import { parseNu40Line, shouldForwardToFace } from './ble/protocol';
import { RssiProximityEstimator } from './ble/proximity';
import { BridgeSequencer, parseWebEnvelope, statusPayload } from './bridge/envelope';
import { ExpressionTriggerPayload, expressionForBoardMessage } from './bridge/expression';
import { PWA_BRIDGE_SCRIPT } from './bridge/pwaBridgeScript';
import { LightBucketRow, LightRepository } from './data/LightRepository';

type Screen = StartupScreen;

const PWA_URL = process.env.EXPO_PUBLIC_PWA_URL || 'https://face-production-7605.up.railway.app';
const PWA_ORIGIN = new URL(PWA_URL).origin;
const VERY_NEAR_RSSI = Number(process.env.EXPO_PUBLIC_VERY_NEAR_RSSI || '-45');

const initialBleSnapshot: BleSnapshot = {
  state: 'idle',
  rssi: null,
  droppedLines: 0,
};

export default function SleepPalApp() {
  useKeepAwake();

  const ble = useMemo(() => new Nu40BleClient(), []);
  const repository = useMemo(() => new LightRepository(), []);
  const bridge = useMemo(() => new BridgeSequencer(), []);
  const proximity = useMemo(() => new RssiProximityEstimator(VERY_NEAR_RSSI), []);
  const webView = useRef<WebView>(null);
  const webReady = useRef(false);
  const latestReplayLines = useRef(new Map<string, string>());
  const pendingExpression = useRef<ExpressionTriggerPayload | null>(null);
  const night = useRef(false);

  const [screen, setScreen] = useState<Screen>('connect');
  const [bleSnapshot, setBleSnapshot] = useState(initialBleSnapshot);
  const [filteredRssi, setFilteredRssi] = useState<number | null>(null);
  const [history, setHistory] = useState<LightBucketRow[]>([]);

  const postToWeb = useCallback(
    (type: string, payload: unknown) => {
      if (!webReady.current) return;
      webView.current?.postMessage(JSON.stringify(bridge.create(type, payload)));
    },
    [bridge]
  );

  const refreshHistory = useCallback(async () => {
    await repository.flush();
    setHistory(await repository.recentBuckets());
  }, [repository]);

  const queueExpression = useCallback(
    (payload: ExpressionTriggerPayload) => {
      pendingExpression.current = payload;
      if (!webReady.current || !webView.current) return;
      postToWeb('expr/trigger', payload);
      pendingExpression.current = null;
    },
    [postToWeb]
  );


  useEffect(() => {
    if (screen !== 'face') webReady.current = false;
  }, [screen]);

  useEffect(() => {
    void repository.init();
    const unsubscribeSnapshot = ble.subscribe((snapshot) => {
      setBleSnapshot(snapshot);
      postToWeb('ble/status', statusPayload(snapshot));
      setScreen((current) => screenAfterBleSnapshot(current, snapshot.state));
    });

    const unsubscribeLines = ble.subscribeLines((line, receivedAt) => {
      const message = parseNu40Line(line);
      if (message.kind === 'lux') void repository.recordLux(message.value, receivedAt);
      const expression = expressionForBoardMessage(message);
      if (expression) {
        queueExpression(expression);
        night.current = false;
        setScreen('face');
      }
      if (message.kind === 'sleeping') {
        night.current = true;
        setScreen('standby');
        void repository.endSession('sleeping', receivedAt);
      }
      if (message.kind === 'hello' && night.current) {
        night.current = false;
        void refreshHistory().then(() => setScreen('history'));
      }

      if (message.kind === 'luxBase') latestReplayLines.current.set('luxBase', line);
      else if (message.kind === 'state') latestReplayLines.current.set('state', line);
      else if (message.kind === 'lux') latestReplayLines.current.set('lux', line);
      else if (message.kind === 'hello') latestReplayLines.current.set('hello', line);
      if (shouldForwardToFace(message)) postToWeb('ble/line', { line });
    });

    const appStateSubscription = AppState.addEventListener('change', () => void repository.flush());
    // 구독을 모두 붙인 뒤 자동 scan/connect를 시작한다. connect() 자체가 멱등이라
    // 개발 StrictMode의 중복 effect나 이미 연결된 상태에서도 중복 scan을 만들지 않는다.
    void startBleOnLaunch(ble);
    return () => {
      unsubscribeSnapshot();
      unsubscribeLines();
      appStateSubscription.remove();
      void repository.flush();
      void ble.destroy();
    };
  }, [ble, postToWeb, queueExpression, refreshHistory, repository]);

  useEffect(() => {
    if (bleSnapshot.state !== 'connected') {
      proximity.reset();
      setFilteredRssi(null);
      return;
    }

    const timer = setInterval(() => {
      void ble.readRssi().then((rssi) => {
        if (rssi === null) return;
        const estimate = proximity.update(rssi);
        setFilteredRssi(estimate.filteredRssi);
        if (estimate.veryNear && !night.current) setScreen('face');
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [ble, bleSnapshot.state, proximity]);

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebEnvelope(event.nativeEvent.data);
      if (!message) return;
      if (message.type === 'web/ready') {
        webReady.current = true;
        postToWeb('native/ready', { bridgeVersion: 1, platform: 'android' });
        postToWeb('ble/status', statusPayload(ble.getSnapshot()));
        for (const line of latestReplayLines.current.values()) postToWeb('ble/line', { line });
        if (pendingExpression.current) {
          postToWeb('expr/trigger', pendingExpression.current);
          pendingExpression.current = null;
        }
      } else if (message.type === 'ble/connect') {
        void ble.connect();
      } else if (message.type === 'ble/write') {
        void ble.send(message.payload.line);
      }
    },
    [ble, postToWeb]
  );

  if (screen === 'face') {
    return (
      <View style={styles.fullBlack}>
        <StatusBar hidden />
        <WebView
          ref={webView}
          source={{ uri: PWA_URL }}
          style={styles.webView}
          originWhitelist={[PWA_ORIGIN]}
          injectedJavaScript={PWA_BRIDGE_SCRIPT}
          onLoadStart={() => { webReady.current = false; }}
          onMessage={handleWebMessage}
          onShouldStartLoadWithRequest={(request) =>
            request.url === 'about:blank' || request.url.startsWith(PWA_ORIGIN)
          }
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onRenderProcessGone={() => webView.current?.reload()}
        />
        {__DEV__ ? <DevNav onStandby={() => setScreen('standby')} onHistory={() => void refreshHistory().then(() => setScreen('history'))} /> : null}
      </View>
    );
  }

  if (screen === 'standby') {
    return (
      <Pressable style={styles.fullBlack} onLongPress={() => setScreen('face')}>
        <StatusBar hidden />
        {__DEV__ ? (
          <View style={styles.standbyDebug}>
            <Text style={styles.debugText}>NU40 {bleSnapshot.state}</Text>
            <Text style={styles.debugText}>RSSI {filteredRssi ?? '—'} · VERY_NEAR 추정</Text>
            <Text style={styles.debugText}>{bleSnapshot.lastLine ?? 'BLE line 대기'}</Text>
            <DevNav
              onFace={() => setScreen('face')}
              onStandby={() => undefined}
              onHistory={() => void refreshHistory().then(() => setScreen('history'))}
            />
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (screen === 'history') {
    return (
      <HistoryScreen
        rows={history}
        onBack={() => setScreen(bleSnapshot.state === 'connected' ? 'standby' : 'connect')}
      />
    );
  }

  return (
    <View style={styles.connectScreen}>
      <StatusBar style="light" />
      <View style={styles.connectCard}>
        <Text style={styles.eyebrow}>SLEEPAL</Text>
        <Text style={styles.title}>팰이 얼굴을 기다리고 있어요</Text>
        <Text style={styles.body}>팰은 방의 빛을 읽고 눈으로 천천히 반응해요.</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, bleSnapshot.state === 'connected' && styles.statusDotOn]} />
          <Text style={styles.statusText}>{connectionLabel(bleSnapshot.state)}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={() => void ble.connect()}
          disabled={bleSnapshot.state === 'scanning' || bleSnapshot.state === 'connecting'}
        >
          <Text style={styles.primaryButtonText}>팰과 연결</Text>
        </Pressable>
        {__DEV__ && bleSnapshot.error ? <Text style={styles.devError}>{bleSnapshot.error}</Text> : null}
        <Pressable onPress={() => void refreshHistory().then(() => setScreen('history'))}>
          <Text style={styles.secondaryButtonText}>팰이 본 밤의 빛</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HistoryScreen({ rows, onBack }: { rows: LightBucketRow[]; onBack: () => void }) {
  const chronological = [...rows].reverse();
  const maximum = Math.max(1, ...chronological.map((row) => row.max));
  return (
    <View style={styles.historyScreen}>
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.eyebrow}>MORNING NOTE</Text>
          <Text style={styles.historyTitle}>팰이 밤새 본 빛</Text>
        </View>
        <Pressable onPress={onBack}><Text style={styles.closeText}>닫기</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.timeline}>
        {chronological.length === 0 ? (
          <Text style={styles.emptyText}>아직 팰이 기록한 밤이 없어요.</Text>
        ) : chronological.map((row) => (
          <View key={`${row.sessionId}-${row.minuteAt}`} style={styles.timelineRow}>
            <Text style={styles.timeText}>{formatTime(row.minuteAt)}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(3, (row.mean / maximum) * 100)}%` }]} />
            </View>
            {row.gapMs > 1_000 ? <Text style={styles.gapText}>잠시 못 봄</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function DevNav({
  onFace,
  onStandby,
  onHistory,
}: {
  onFace?: () => void;
  onStandby: () => void;
  onHistory: () => void;
}) {
  return (
    <View style={styles.devNav}>
      {onFace ? <Pressable onPress={onFace}><Text style={styles.devLink}>얼굴</Text></Pressable> : null}
      <Pressable onPress={onStandby}><Text style={styles.devLink}>대기</Text></Pressable>
      <Pressable onPress={onHistory}><Text style={styles.devLink}>기록</Text></Pressable>
    </View>
  );
}

function connectionLabel(state: BleSnapshot['state']): string {
  if (state === 'scanning') return 'NU40을 찾고 있어요…';
  if (state === 'connecting') return '팰과 연결하고 있어요…';
  if (state === 'connected') return '팰과 연결됐어요';
  if (state === 'ended') return '팰이 잠들었어요';
  if (state === 'error') return '팰이 NU40 신호를 찾지 못했어요';
  return '연결할 준비가 됐어요';
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  fullBlack: { flex: 1, backgroundColor: '#000' },
  webView: { flex: 1, backgroundColor: '#000' },
  connectScreen: { flex: 1, backgroundColor: '#08090b', alignItems: 'center', justifyContent: 'center' },
  connectCard: { width: '72%', maxWidth: 680, padding: 36, borderRadius: 28, backgroundColor: '#121418' },
  eyebrow: { color: '#9d8660', fontSize: 12, fontWeight: '700', letterSpacing: 2.4, marginBottom: 12 },
  title: { color: '#f4ead8', fontSize: 32, fontWeight: '700', lineHeight: 42, marginBottom: 12 },
  body: { color: '#a8a39b', fontSize: 16, lineHeight: 24, marginBottom: 28 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#5a5d62' },
  statusDotOn: { backgroundColor: '#b9d38a' },
  statusText: { color: '#c8c4bd', fontSize: 14, flex: 1 },
  primaryButton: { backgroundColor: '#e2c99c', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 18 },
  primaryButtonPressed: { opacity: 0.8 },
  primaryButtonText: { color: '#17130e', fontSize: 16, fontWeight: '800' },
  secondaryButtonText: { color: '#b8a98e', fontSize: 14, textAlign: 'center', padding: 8 },
  devError: { color: '#725d59', fontSize: 10, textAlign: 'center', marginBottom: 4 },
  standbyDebug: { position: 'absolute', right: 16, bottom: 14, alignItems: 'flex-end', gap: 3 },
  debugText: { color: '#34363a', fontSize: 10 },
  devNav: { flexDirection: 'row', gap: 14, marginTop: 6 },
  devLink: { color: '#555960', fontSize: 11, padding: 6 },
  historyScreen: { flex: 1, backgroundColor: '#0c0d10' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 22 },
  historyTitle: { color: '#f1e7d5', fontSize: 28, fontWeight: '700' },
  closeText: { color: '#b9a889', fontSize: 15, padding: 12 },
  timeline: { paddingHorizontal: 32, paddingBottom: 32, gap: 10 },
  timelineRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeText: { color: '#7f7d78', width: 72, fontVariant: ['tabular-nums'] },
  barTrack: { height: 12, flex: 1, borderRadius: 6, backgroundColor: '#1e2025', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: '#b19a72' },
  gapText: { width: 72, color: '#775e59', fontSize: 11 },
  emptyText: { color: '#77746e', textAlign: 'center', marginTop: 80, fontSize: 16 },
});
