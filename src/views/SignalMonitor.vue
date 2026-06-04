<template>
  <div class="signal-monitor-page">
    <div class="page-header">
      <h1>实时波形监控</h1>
    </div>

    <div class="content-layout">
      <section class="stat-card chart-card">
        <div class="card-header">
          <div>
            <h2>幅值曲线</h2>
            <span class="header-meta">{{ formattedTimestamp }}</span>
          </div>

          <div class="chart-badges">
            <span class="soft-badge" :class="`badge-${playbackState}`">
              {{ streamBadgeText }}
            </span>
            <span class="soft-badge">
              {{ displayedPointCount.toLocaleString() }} Points
            </span>
          </div>
        </div>

        <transition name="fade-slide">
          <p v-if="errorMessage" class="error-banner">
            {{ errorMessage }}
          </p>
        </transition>

        <div class="chart-shell">
          <WaveformChart
            :waveform="waveform"
            :playback-state="playbackState"
            :transition-ms="40"
          />
        </div>

        <div class="chart-footer">
          <div class="summary-item">
            <span>Visible</span>
            <strong>{{ displayedPointCount.toLocaleString() }}</strong>
          </div>

          <div class="summary-item">
            <span>Peak</span>
            <strong>{{ formatNumber(amplitudeStats.max) }}</strong>
          </div>

          <div class="summary-item">
            <span>Floor</span>
            <strong>{{ formatNumber(amplitudeStats.min) }}</strong>
          </div>

          <div class="summary-item">
            <span>Average</span>
            <strong>{{ formatNumber(amplitudeStats.average) }}</strong>
          </div>
        </div>
      </section>

      <aside class="stat-card monitor-sidebar-card">
        <div class="card-header">
          <h2>信号状态</h2>
          <strong class="status-pill" :class="`status-${playbackState}`">
            {{ playbackStatus.text }}
          </strong>
        </div>

        <div class="status-panel">
          <span class="status-dot" :class="`dot-${playbackState}`"></span>
          <div class="status-main">
            <span class="status-label">当前状态</span>
            <strong>{{ streamBadgeText }}</strong>
          </div>
          <p class="toolbar-meta">{{ formattedTimestamp }}</p>
        </div>

        <div class="stats-row">
          <div v-for="item in compactStats" :key="item.label" class="stat-chip">
            <span>{{ item.label }}</span>
            <strong :title="item.value">{{ item.value }}</strong>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import WaveformChart from '@/components/WaveformChart.vue'
import {
  fetchLatestWaveform,
  fetchSignalParserStatus,
  subscribeWaveform
} from '@/api/signal'

const createEmptyWaveform = () => ({
  real: [],
  imaginary: [],
  amplitudes: [],
  timestamp: null,
  type: 'IDLE'
})

const waveform = ref(createEmptyWaveform())
const playbackState = ref('idle')
const latestTimestamp = ref(null)
const replayFrames = ref(0)
const errorMessage = ref('')

const pendingQueueSize = ref(0)
const activeUploadId = ref('')

let eventSource = null
let parserStatusTimer = null
let reconnectTimer = null

const normalizeWaveform = (payload) => {
  const raw = payload?.data ?? payload ?? {}

  const parseSeries = (series) =>
    Array.isArray(series)
      ? series
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item))
      : []

  return {
    real: parseSeries(raw.real),
    imaginary: parseSeries(raw.imaginary),
    amplitudes: parseSeries(raw.amplitudes),
    timestamp: raw.timestamp ?? Date.now(),
    type: raw.type ?? 'REALTIME'
  }
}

const closeStream = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

const connectStream = () => {
  closeStream()

  eventSource = subscribeWaveform({
    onOpen: () => {
      if (playbackState.value === 'idle') {
        playbackState.value = 'queued'
      }
    },

    onSignal: (payload) => {
      const next = normalizeWaveform(payload)

      waveform.value = next
      latestTimestamp.value = next.timestamp
      replayFrames.value += 1
      errorMessage.value = ''

      playbackState.value = next.type === 'FINAL' ? 'completed' : 'playing'
    },

    onError: () => {
      if (!eventSource) {
        return
      }

      playbackState.value = 'error'
      errorMessage.value = 'SSE stream interrupted, reconnecting...'

      closeStream()
      reconnectTimer = window.setTimeout(connectStream, 1800)
    }
  })
}

const refreshParserStatus = async () => {
  try {
    const response = await fetchSignalParserStatus()
    const parser = response?.data?.data ?? {}

    pendingQueueSize.value = Number(parser.pendingQueueSize) || 0
    activeUploadId.value = parser.activeUploadId || ''

    if (playbackState.value === 'queued' && activeUploadId.value) {
      playbackState.value = 'playing'
    }
  } catch (error) {
    console.warn('Failed to fetch parser status:', error)
  }
}

const startParserPolling = () => {
  if (parserStatusTimer) {
    clearInterval(parserStatusTimer)
  }

  parserStatusTimer = setInterval(refreshParserStatus, 1500)
}

const loadWaveformSnapshot = async () => {
  try {
    const response = await fetchLatestWaveform()
    const snapshot = normalizeWaveform(response?.data?.data ?? response?.data)

    if (!snapshot.amplitudes.length) {
      return
    }

    waveform.value = snapshot
    latestTimestamp.value = snapshot.timestamp
    playbackState.value = snapshot.type === 'FINAL' ? 'completed' : 'playing'
  } catch (error) {
    console.warn('Failed to load waveform snapshot:', error)
  }
}

const amplitudeStats = computed(() => {
  const values = waveform.value.amplitudes

  if (!values.length) {
    return {
      min: null,
      max: null,
      average: null
    }
  }

  let min = values[0]
  let max = values[0]
  let sum = 0

  values.forEach((value) => {
    if (value < min) min = value
    if (value > max) max = value
    sum += value
  })

  return {
    min,
    max,
    average: sum / values.length
  }
})

const playbackStatusMap = {
  idle: {
    text: 'Idle'
  },
  queued: {
    text: 'Queued'
  },
  playing: {
    text: 'Parsing'
  },
  completed: {
    text: 'Completed'
  },
  error: {
    text: 'Error'
  }
}

const playbackStatus = computed(() => {
  return playbackStatusMap[playbackState.value] || playbackStatusMap.idle
})

const streamBadgeText = computed(() => {
  if (playbackState.value === 'error') {
    return 'SSE Reconnecting'
  }

  if (playbackState.value === 'idle') {
    return 'SSE Waiting'
  }

  return 'SSE Connected'
})

const formattedTimestamp = computed(() => {
  if (!latestTimestamp.value) {
    return 'Waiting for waveform stream'
  }

  return `Latest frame: ${new Date(latestTimestamp.value).toLocaleString()}`
})

const displayedPointCount = computed(() => {
  return waveform.value.amplitudes.length
})

const compactStats = computed(() => [
  {
    label: 'Visible Points',
    value: displayedPointCount.value.toLocaleString()
  },
  {
    label: 'Replay Frames',
    value: replayFrames.value.toLocaleString()
  },
  {
    label: 'Queue Size',
    value: pendingQueueSize.value.toLocaleString()
  },
  {
    label: 'Active Upload',
    value: activeUploadId.value || '--'
  }
])

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return Number(value).toFixed(4)
}

onMounted(async () => {
  await loadWaveformSnapshot()
  connectStream()
  await refreshParserStatus()
  startParserPolling()
})

onUnmounted(() => {
  closeStream()

  if (parserStatusTimer) {
    clearInterval(parserStatusTimer)
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
})
</script>

<style scoped>
.signal-monitor-page {
  position: relative;
  height: calc(100vh - 60px);
  min-height: 0;
  overflow: hidden;
  padding: 12px 16px;
  background:
    radial-gradient(circle at 10% 8%, rgba(64, 158, 255, 0.12), transparent 28%),
    radial-gradient(circle at 90% 0%, rgba(39, 174, 96, 0.10), transparent 26%),
    linear-gradient(180deg, #f7faff 0%, #f3f6fb 100%);
  box-sizing: border-box;
  color: #172033;
  font-size: 14px;
}

.signal-monitor-page * {
  box-sizing: border-box;
}

.page-header {
  height: 36px;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  max-width: 1680px;
  margin-left: auto;
  margin-right: auto;
}

.page-header h1 {
  margin: 0;
  padding-left: 14px;
  position: relative;
  color: #172033;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: 0.5px;
}

.page-header h1::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #409eff, #36cfc9);
}

.content-layout {
  height: calc(100% - 46px);
  max-width: 1680px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}

.stat-card {
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(220, 226, 235, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(29, 53, 87, 0.08);
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.card-header {
  min-height: 42px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #edf1f7;
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(255, 255, 255, 0.88));
}

.card-header h2 {
  margin: 0;
  color: #172033;
  font-size: 15px;
  font-weight: 700;
}

.header-meta {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-family: monospace;
  font-size: 12px;
  white-space: nowrap;
}

.chart-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.monitor-sidebar-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

p {
  margin: 0;
}

.status-panel {
  margin: 14px 12px 0;
  padding: 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e6ebf3;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #94a3b8;
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.2);
}

.dot-playing,
.dot-completed {
  background: #67c23a;
  box-shadow:
    0 0 0 4px rgba(103, 194, 58, 0.18),
    0 0 14px rgba(103, 194, 58, 0.38);
}

.dot-queued {
  background: #409eff;
  box-shadow:
    0 0 0 4px rgba(64, 158, 255, 0.18),
    0 0 14px rgba(64, 158, 255, 0.38);
}

.dot-error {
  background: #f56c6c;
  box-shadow:
    0 0 0 4px rgba(245, 108, 108, 0.18),
    0 0 14px rgba(245, 108, 108, 0.38);
}

.status-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.status-main strong {
  color: #172033;
  font-size: 14px;
  font-weight: 700;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  width: fit-content;
}

.status-idle {
  color: #334155;
  background: rgba(100, 116, 139, 0.12);
}

.status-playing {
  color: #0f7a3d;
  background: rgba(103, 194, 58, 0.14);
}

.status-queued {
  color: #1e40af;
  background: rgba(64, 158, 255, 0.14);
}

.status-completed {
  color: #0f7a3d;
  background: rgba(103, 194, 58, 0.14);
}

.status-error {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.12);
}

.toolbar-meta {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-row {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  align-content: start;
  gap: 8px;
  padding: 12px;
  min-width: 0;
  overflow: hidden;
}

.stat-chip {
  position: relative;
  min-width: 0;
  padding: 11px 12px;
  border-radius: 8px;
  border: 1px solid #e6ebf3;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  display: flex;
  flex-direction: column;
  gap: 7px;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
}

.stat-chip span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.stat-chip strong {
  color: #111827;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  word-break: break-word;
  white-space: normal;
}

.error-banner {
  margin: 10px 14px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(254, 226, 226, 0.96);
  border-left: 4px solid #f56c6c;
  color: #991b1b;
  font-weight: 500;
  font-size: 13px;
}

.chart-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.soft-badge {
  padding: 5px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  background: #f3f8ff;
  border: 1px solid rgba(64, 158, 255, 0.25);
  color: #2563eb;
}

.badge-error {
  color: #b91c1c;
  border-color: rgba(245, 108, 108, 0.3);
  background: rgba(254, 226, 226, 0.8);
}

.badge-idle {
  color: #475569;
  border-color: rgba(100, 116, 139, 0.2);
}

.chart-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 14px 14px 0;
  padding: 8px;
  border-radius: 8px;
  background: #fbfdff;
  border: 1px solid #edf1f7;
  overflow: hidden;
}

.chart-footer {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 12px 14px 14px;
  flex-shrink: 0;
}

.summary-item {
  position: relative;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  border: 1px solid #e6ebf3;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-item span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.summary-item strong {
  color: #111827;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.24s cubic-bezier(0.2, 0.9, 0.4, 1.1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 1000px) {
  .signal-monitor-page {
    padding: 12px;
  }

  .content-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .signal-monitor-page {
    height: auto;
    min-height: calc(100vh - 60px);
    overflow-y: auto;
  }

  .chart-card {
    min-height: 520px;
  }

  .stats-row {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 560px) {
  .signal-monitor-page {
    padding: 10px;
  }

  .card-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .stats-row,
  .chart-footer {
    grid-template-columns: 1fr;
  }

  .chart-shell {
    min-height: 300px;
  }
}
</style>
