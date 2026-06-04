<template>
  <div class="key-negotiation-container">
    <div class="page-header">
      <h1>储能柜密钥协商</h1>
    </div>

    <div class="content-layout">
      <div class="main-content">
        <el-card class="stat-card control-panel-card">
          <div class="card-header">
            <h2>协商控制台</h2>
            <el-tag :type="selectedCabinet ? getStatusType() : 'info'">
              {{ selectedCabinet ? currentStatusText : '等待选择' }}
            </el-tag>
          </div>

          <div class="control-panel-body">
            <div class="cabinet-selector">
              <div class="field-group">
                <span class="field-label">当前储能柜</span>
                <el-select
                  v-model="selectedCabinet"
                  filterable
                  placeholder="请选择储能柜"
                  class="cabinet-select"
                  @change="selectCabinet"
                >
                  <el-option
                    v-for="cabinet in cabinets"
                    :key="cabinet.id"
                    :label="`${cabinet.name} (${cabinet.id})`"
                    :value="cabinet.id"
                  />
                </el-select>
              </div>
              <el-button
                type="primary"
                :disabled="!selectedCabinet"
                :loading="selectedCabinet ? !!negotiatingCabinets[selectedCabinet] : false"
                @click="initiateNegotiation(selectedCabinet)"
              >
                发起密钥协商
              </el-button>
            </div>

            <div class="key-pool-panel" v-loading="keyPoolLoading">
              <div class="key-pool-panel-head">
                <span class="field-label">密钥池状态</span>
                <div class="key-pool-actions">
                  <el-tag :type="keyPoolTagType">
                    {{ keyPoolStatusText }}
                  </el-tag>
                  <el-button
                    :icon="Refresh"
                    circle
                    size="small"
                    :disabled="!selectedCabinet"
                    @click="fetchSelectedKeyPool"
                  />
                </div>
              </div>

              <div v-if="selectedKeyPool" class="key-pool-body">
                <div class="key-pool-metrics">
                  <div class="key-pool-metric">
                    <span class="metric-label">现有</span>
                    <span class="metric-value">{{ selectedKeyPool.remainingKeys ?? 0 }}</span>
                  </div>
                  <div class="key-pool-metric">
                    <span class="metric-label">阈值</span>
                    <span class="metric-value">{{ selectedKeyPool.threshold ?? 0 }}</span>
                  </div>
                  <div class="key-pool-metric">
                    <span class="metric-label">容量</span>
                    <span class="metric-value">{{ selectedKeyPool.capacity ?? 0 }}</span>
                  </div>
                </div>

                <div class="key-pool-progress-wrap">
                  <div class="key-pool-progress">
                    <div
                      class="key-pool-progress-fill"
                      :class="{ warning: isKeyPoolBelowThreshold }"
                      :style="{ width: `${keyPoolFillPercent}%` }"
                    ></div>
                    <div
                      class="key-pool-threshold-marker"
                      :style="{ left: `${keyPoolThresholdPercent}%` }"
                    ></div>
                  </div>
                  <div
                    class="key-pool-threshold-label"
                    :style="keyPoolThresholdLabelStyle"
                  >
                    阈值 {{ selectedKeyPool.threshold ?? 0 }}
                  </div>
                </div>
              </div>

              <div v-else class="key-pool-empty">
                <span>{{ selectedCabinet ? '暂无该储能柜密钥池数据' : '选择储能柜后显示密钥池状态' }}</span>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 协商过程 -->
        <el-card v-if="selectedCabinet" class="stat-card negotiation-process-card">
          <div class="card-header">
            <h2>{{ selectedCabinetName }} 密钥协商过程</h2>
            <el-tag :type="getStatusType()">
              {{ currentStatusText }}
            </el-tag>
          </div>

          <!-- 阶段 -->
          <div class="stage-indicators">
            <div
              class="stage-line"
              :style="{ width: `${(currentStatus + 1) / processSteps.length * 100}%` }"
            ></div>

            <div
              v-for="(step, index) in processSteps"
              :key="index"
              class="stage-indicator"
              :class="{
                completed: currentStatus >= index,
                active: currentStatus === index
              }"
            >
              <div class="stage-icon">
                <el-icon v-if="currentStatus >= index"><Check /></el-icon>
                <el-icon v-else><Loading /></el-icon>
              </div>
              <div class="stage-name">{{ step }}</div>
            </div>
          </div>

          <!-- 图表 -->
          <div class="rssi-chart">
            <el-divider content-position="left">RSSI 数据曲线</el-divider>
            <div ref="chartRef" class="chart-container"></div>
          </div>
        </el-card>

        <div v-else class="no-selection">
          <el-empty description="请选择一个储能柜查看密钥协商过程" />
        </div>
      </div>

      <!-- 右侧边栏：选中储能柜日志 -->
      <el-card class="stat-card cabinet-sidebar-card">
        <div class="card-header">
          <h2>储能柜日志</h2>
        </div>

        <div v-if="selectedCabinet" class="cabinet-sidebar-list">
         

          <el-empty v-if="selectedCabinetLogs.length === 0" description="暂无日志数据" />

          <div v-else class="cabinet-log-list">
            <div
              v-for="log in selectedCabinetLogs"
              :key="`${log.timestamp}-${log.flag ?? 1}-${log.step}-${log.info}`"
              class="cabinet-log-item"
            >
              <div class="cabinet-log-time">{{ formatTimestamp(log.timestamp) }}</div>
              <div class="cabinet-log-step">{{ log.step }}</div>
              <div class="cabinet-log-info">{{ log.info }}</div>
            </div>
          </div>
        </div>

        <div v-else class="sidebar-empty-wrap">
          <el-empty description="请选择左侧储能柜查看日志" />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick
} from 'vue';
import * as echarts from 'echarts';
import { Check, Loading, Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { get, post, getServerUrl } from '../axios/request';

/* ================= 基础数据 ================= */

const cabinets = ref(
  Array.from({ length: 20 }, (_, i) => ({
    id: `CB${i + 1}`,
    name: `储能柜${i + 1}`
  }))
);

const selectedCabinet = ref('');
const cabinetStates = reactive({});
const selectedCabinetLogs = ref([]);
const negotiatingCabinets = reactive({});
const selectedKeyPool = ref(null);
const keyPoolLoading = ref(false);
const LAST_SELECTED_CABINET_KEY = 'key-negotiation:selected-cabinet';
const MAX_VISIBLE_LOGS = 8;
const MAX_RSSI_POINTS = 50;
const RSSI_CACHE_KEY_PREFIX = 'key-negotiation:rssi:';

function normalizeRssiSeries(series) {
  return Array.isArray(series)
    ? series
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
        .slice(-MAX_RSSI_POINTS)
    : [];
}

function getRssiCacheKey(cabinetId) {
  return `${RSSI_CACHE_KEY_PREFIX}${cabinetId}`;
}

function loadCachedRssiData(cabinetId) {
  if (!cabinetId) return [];
  try {
    return normalizeRssiSeries(JSON.parse(localStorage.getItem(getRssiCacheKey(cabinetId)) || '[]'));
  } catch (err) {
    return [];
  }
}

function saveCachedRssiData(cabinetId, values) {
  if (!cabinetId) return;
  localStorage.setItem(getRssiCacheKey(cabinetId), JSON.stringify(normalizeRssiSeries(values)));
}

function setCabinetRssiData(cabinetId, state, values) {
  state.rssiData = normalizeRssiSeries(values);
  saveCachedRssiData(cabinetId, state.rssiData);
}

function appendCabinetRssiData(cabinetId, state, rssi) {
  setCabinetRssiData(cabinetId, state, [...state.rssiData, rssi]);
}

/* ================= 工具：确保状态存在 ================= */
const ensureState = (cabinetId) => {
  if (!cabinetStates[cabinetId]) {
    cabinetStates[cabinetId] = {
      rssiData: loadCachedRssiData(cabinetId),
      status: -1
    };
  }
  return cabinetStates[cabinetId];
};

/* ================= 计算属性 ================= */

const selectedCabinetName = computed(() => {
  return cabinets.value.find((c) => c.id === selectedCabinet.value)?.name || '';
});

const processSteps = ['信道探测', '密钥生成', '密钥分发', '密钥提取'];

const currentStatus = computed(() => {
  return cabinetStates[selectedCabinet.value]?.status ?? -1;
});

const getStatusTextByValue = (status) => {
  if (status === -1) return '未开始';
  if (status >= processSteps.length) return '完成';
  return processSteps[status] || `阶段${status}`;
};

const getStatusTypeByValue = (status) => {
  if (status === -1) return 'info';
  if (status >= processSteps.length) return 'success';
  return 'primary';
};

const currentStatusText = computed(() => getStatusTextByValue(currentStatus.value));

const rssiData = computed(() => {
  return cabinetStates[selectedCabinet.value]?.rssiData || [];
});

const keyPoolScale = computed(() => {
  const pool = selectedKeyPool.value;
  if (!pool) return 1;

  const capacity = Number(pool.capacity);
  const remaining = Number(pool.remainingKeys);
  const threshold = Number(pool.threshold);

  if (Number.isFinite(capacity) && capacity > 0) return capacity;
  return Math.max(
    Number.isFinite(remaining) ? remaining : 0,
    Number.isFinite(threshold) ? threshold : 0,
    1
  );
});

const keyPoolFillPercent = computed(() => {
  const pool = selectedKeyPool.value;
  if (!pool) return 0;
  const remaining = Number(pool.remainingKeys);
  if (!Number.isFinite(remaining)) return 0;
  return Math.min(Math.max((remaining / keyPoolScale.value) * 100, 0), 100);
});

const keyPoolThresholdPercent = computed(() => {
  const pool = selectedKeyPool.value;
  if (!pool) return 0;
  const threshold = Number(pool.threshold);
  if (!Number.isFinite(threshold)) return 0;
  return Math.min(Math.max((threshold / keyPoolScale.value) * 100, 0), 100);
});

const isKeyPoolBelowThreshold = computed(() => {
  const pool = selectedKeyPool.value;
  if (!pool) return false;
  const remaining = Number(pool.remainingKeys);
  const threshold = Number(pool.threshold);
  if (!Number.isFinite(remaining) || !Number.isFinite(threshold)) return false;
  return remaining <= threshold;
});

const keyPoolTagType = computed(() => {
  if (!selectedKeyPool.value) return 'info';
  return isKeyPoolBelowThreshold.value ? 'warning' : 'success';
});

const keyPoolStatusText = computed(() => {
  if (!selectedKeyPool.value) return '未获取';
  return isKeyPoolBelowThreshold.value ? '达到阈值' : '高于阈值';
});

const keyPoolThresholdLabelStyle = computed(() => {
  const percent = keyPoolThresholdPercent.value;
  if (percent < 12) {
    return { left: `${percent}%`, transform: 'translateX(0)' };
  }
  if (percent > 88) {
    return { left: `${percent}%`, transform: 'translateX(-100%)' };
  }
  return { left: `${percent}%`, transform: 'translateX(-50%)' };
});

const normalizeStationValue = (value) => String(value ?? '').trim().toLowerCase();

const getCabinetNumber = (cabinetId) => {
  const matched = String(cabinetId || '').match(/\d+/);
  return matched ? matched[0] : '';
};

const findKeyPoolForCabinet = (pools, cabinetId) => {
  const cabinet = cabinets.value.find((item) => item.id === cabinetId);
  const cabinetIdValue = normalizeStationValue(cabinetId);
  const cabinetNameValue = normalizeStationValue(cabinet?.name);
  const cabinetNumberValue = normalizeStationValue(getCabinetNumber(cabinetId));

  return pools.find((pool) => {
    const stationId = normalizeStationValue(pool.stationId);
    const stationName = normalizeStationValue(pool.stationName);

    return (
      stationId === cabinetIdValue ||
      stationId === cabinetNumberValue ||
      stationName === cabinetIdValue ||
      stationName === cabinetNameValue
    );
  }) || null;
};

/* ================= 图表 ================= */

const chartRef = ref(null);
let chart = null;
let updateTimer = null;

const scheduleUpdate = () => {
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateChart();
    updateTimer = null;
  }, 200);
};

const initChart = () => {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);
};

const updateChart = () => {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);

  const data = rssiData.value;

  chart.setOption({
    grid: { left: 42, right: 18, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map((_, i) => i + 1)
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f7' } } },
    series: [{
      data,
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: '#409eff' },
      areaStyle: { color: 'rgba(64, 158, 255, 0.10)' }
    }]
  });
};

/* ================= SSE（当前选中柜实时） ================= */

let eventSource = null;

const closeEventSource = () => {
  if (!eventSource) return;
  // Avoid stale callbacks from a closed source touching the new active source.
  eventSource.onopen = null;
  eventSource.onerror = null;
  eventSource.onmessage = null;
  eventSource.close();
  eventSource = null;
};

const getCabinetName = (cabinetId) => {
  return cabinets.value.find((c) => c.id === cabinetId)?.name || cabinetId;
};

const connectCabinetSSE = (cabinetId) => {
  if (!cabinetId) return;

  closeEventSource();

  const state = ensureState(cabinetId);
  const serverBase = getServerUrl().replace(/\/$/, '');
  const source = new EventSource(
    `${serverBase}/api/key-negotiate/sse?cabinetId=${encodeURIComponent(cabinetId)}`
  );
  eventSource = source;

  source.addEventListener('rssi', (e) => {
    try {
      const res = JSON.parse(e.data);
      if (res.code !== 0) return;

      const rssi = res.data;
      if (typeof rssi !== 'number') return;

      appendCabinetRssiData(cabinetId, state, rssi);
      scheduleUpdate();
    } catch (err) {
      console.error('RSSI parse failed', err);
    }
  });

  source.addEventListener('status', (e) => {
    try {
      const res = JSON.parse(e.data);
      if (res.code !== 0) return;

      const prevStatus = state.status;
      state.status = res.data;

      if (prevStatus < processSteps.length && state.status >= processSteps.length) {
        ElMessage.success(`${getCabinetName(cabinetId)} 密钥协商完成`);
        fetchSelectedKeyPool();
      }
    } catch (err) {
      console.error('STATUS parse failed', err);
    }
  });

  source.addEventListener('log', (e) => {
    try {
      const res = JSON.parse(e.data);
      if (res.code !== 0) return;
      const logItem = res.data;
      selectedCabinetLogs.value = [...selectedCabinetLogs.value, logItem]
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .slice(-MAX_VISIBLE_LOGS);
    } catch (err) {
      console.error('LOG parse failed', err);
    }
  });

  source.onerror = () => {
    // Firefox may fire error while closing an old source; guard active instance.
    if (eventSource !== source) {
      source.close();
      return;
    }
    closeEventSource();
  };
};

const fetchSelectedCabinetLogs = async (cabinetId) => {
  try {
    const resp = await get('/api/key-negotiate/log', { cabinetId });
    if (resp?.data?.code !== 0 || !Array.isArray(resp?.data?.data)) {
      selectedCabinetLogs.value = [];
      return;
    }
    selectedCabinetLogs.value = resp.data.data
      .slice()
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-MAX_VISIBLE_LOGS);
  } catch (err) {
    selectedCabinetLogs.value = [];
    console.error('fetch selected logs failed', err);
  }
};

const fetchCabinetState = async (cabinetId) => {
  const state = ensureState(cabinetId);
  try {
    const resp = await get('/api/key-negotiate/state', { cabinetId });
    const payload = resp?.data;
    if (payload?.code !== 0 || !payload?.data) {
      state.status = -1;
      return;
    }

    const backendState = payload.data;
    const rawStatus = Number(backendState.negotiate_status);
    state.status = Number.isFinite(rawStatus) ? rawStatus : -1;

    const rawRssi = Array.isArray(backendState.rssiData) ? backendState.rssiData : [];
    if (rawRssi.length > 0) {
      setCabinetRssiData(cabinetId, state, rawRssi);
    }
  } catch (err) {
    state.status = -1;
    console.error('fetch cabinet negotiation state failed', err);
  }
};

const fetchSelectedKeyPool = async () => {
  const cabinetId = selectedCabinet.value;
  if (!cabinetId) {
    selectedKeyPool.value = null;
    return;
  }

  keyPoolLoading.value = true;
  try {
    const resp = await get('/api/key-management/pools');
    const pools = Array.isArray(resp?.data?.data) ? resp.data.data : [];
    selectedKeyPool.value = findKeyPoolForCabinet(pools, cabinetId);
  } catch (err) {
    selectedKeyPool.value = null;
    console.error('fetch selected key pool failed', err);
    ElMessage.error('获取密钥池状态失败');
  } finally {
    keyPoolLoading.value = false;
  }
};

/* ================= 交互 ================= */

const selectCabinet = async (cabinetId) => {
  selectedCabinet.value = cabinetId;
  localStorage.setItem(LAST_SELECTED_CABINET_KEY, cabinetId);
  ensureState(cabinetId);
  await Promise.all([
    fetchCabinetState(cabinetId),
    fetchSelectedCabinetLogs(cabinetId),
    fetchSelectedKeyPool()
  ]);

  await nextTick();

  initChart();
  updateChart();

  connectCabinetSSE(cabinetId);
};

const initiateNegotiation = async (cabinetId) => {
  if (!cabinetId || negotiatingCabinets[cabinetId]) return;

  negotiatingCabinets[cabinetId] = true;
  try {
    const resp = await post('/api/key-negotiate/initiate', { cabinetId });
    if (resp?.data?.code !== 0) {
      ElMessage.error(resp?.data?.message || '发起密钥协商失败');
      return;
    }

    ElMessage.success(`${getCabinetName(cabinetId)} 已发起密钥协商`);
  } catch (err) {
    console.error('initiate negotiation failed', err);
    ElMessage.error('发起密钥协商失败');
  } finally {
    negotiatingCabinets[cabinetId] = false;
  }
};

/* ================= 生命周期 ================= */

const handleResize = () => chart?.resize();

const restoreLastSelectedCabinet = async () => {
  const lastSelected = localStorage.getItem(LAST_SELECTED_CABINET_KEY);
  if (!lastSelected) return;
  const exists = cabinets.value.some((cabinet) => cabinet.id === lastSelected);
  if (!exists) return;
  await selectCabinet(lastSelected);
};

onMounted(async () => {
  window.addEventListener('resize', handleResize);
  await restoreLastSelectedCabinet();
});

onUnmounted(() => {
  closeEventSource();
  chart?.dispose();
  window.removeEventListener('resize', handleResize);
});

watch(rssiData, scheduleUpdate);

/* ================= UI ================= */

const getStatusType = () => getStatusTypeByValue(currentStatus.value);

const formatTimestamp = (timestamp) => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return '--';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};
</script>

<style scoped>
/* 页面整体：锁定在一个视窗内，避免浏览器出现整体滚动条 */
.key-negotiation-container {
  height: calc(100vh - 60px);
  min-height: 0;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: hidden;
  background:
    radial-gradient(circle at 10% 8%, rgba(64, 158, 255, 0.12), transparent 28%),
    radial-gradient(circle at 90% 0%, rgba(39, 174, 96, 0.10), transparent 26%),
    linear-gradient(180deg, #f7faff 0%, #f3f6fb 100%);
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
  font-size: 22px;
  font-weight: 750;
  letter-spacing: 0.5px;
  color: #172033;
  position: relative;
  padding-left: 14px;
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

/* 两栏布局：左侧主流程，右侧日志；整体高度固定 */
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

.main-content {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
}

/* Element Plus 卡片默认 padding 会撑高页面，这里统一收紧 */
.stat-card {
  min-height: 0;
  border: 1px solid rgba(220, 226, 235, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(29, 53, 87, 0.08);
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.stat-card :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}

.card-header {
  min-height: 42px;
  padding: 10px 14px;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #edf1f7;
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(255, 255, 255, 0.88));
}

.card-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #172033;
}

/* 顶部控制台：选择、操作、密钥池状态合并为一个紧凑面板 */
.control-panel-card {
  height: 230px;
}

.control-panel-body {
  height: calc(100% - 42px);
  padding: 16px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.cabinet-selector {
  min-width: 0;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e6ebf3;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.field-group {
  min-width: 0;
}

.field-label {
  display: block;
  margin-bottom: 7px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.cabinet-select {
  width: 100%;
}

.cabinet-selector :deep(.el-button) {
  width: 100%;
  height: 36px;
}

.key-pool-panel {
  min-width: 0;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  border: 1px solid #e6ebf3;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.key-pool-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.key-pool-panel-head .field-label {
  margin-bottom: 0;
}

.key-pool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-pool-actions :deep(.el-button) {
  width: 28px;
  height: 28px;
}

.key-pool-body {
  height: calc(100% - 34px);
  padding: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(260px, 1.1fr);
  gap: 16px;
  align-items: stretch;
}

.key-pool-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  height: 100%;
}

.key-pool-metric {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fff;
}

.metric-label {
  display: block;
  margin-bottom: 9px;
  font-size: 12px;
  color: #6b7280;
}

.metric-value {
  display: block;
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  line-height: 1;
}

.key-pool-progress-wrap {
  position: relative;
  align-self: center;
  padding: 22px 0 24px;
  min-width: 0;
}

.key-pool-progress {
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: #e6ebf3;
  overflow: visible;
}

.key-pool-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #409eff, #36cfc9, #67c23a);
  transition: width 0.3s ease;
}

.key-pool-progress-fill.warning {
  background: linear-gradient(90deg, #f59e0b, #f56c6c);
}

.key-pool-threshold-marker {
  position: absolute;
  top: -5px;
  width: 2px;
  height: 22px;
  background: #1f2937;
  transform: translateX(-1px);
}

.key-pool-threshold-marker::after {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1f2937;
  transform: translateX(-50%);
}

.key-pool-threshold-label {
  position: absolute;
  bottom: 0;
  max-width: 96px;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.key-pool-footer {
  display: none;
}

.key-pool-empty {
  height: calc(100% - 34px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 13px;
}

/* 协商过程：占满剩余高度，内部不撑出页面 */
.negotiation-process-card {
  min-height: 0;
}

.negotiation-process-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.stage-indicators {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-around;
  position: relative;
  margin: 14px 18px 8px;
  padding: 0 8px;
}

.stage-line {
  position: absolute;
  top: 16px;
  left: 40px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #409eff, #36cfc9);
  z-index: 1;
  transition: width 0.3s;
}

.stage-indicators::before {
  content: '';
  position: absolute;
  top: 16px;
  left: 40px;
  right: 40px;
  height: 2px;
  border-radius: 999px;
  background-color: #e6ebf3;
  z-index: 0;
}

.stage-indicator {
  width: 86px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 2;
}

.stage-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #dce3ed;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 7px;
  color: #fff;
  border: 3px solid #fff;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
  transition: all 0.3s;
}

.stage-indicator.completed .stage-icon {
  background-color: #67c23a;
}

.stage-indicator.active .stage-icon {
  background-color: #409eff;
  box-shadow: 0 0 0 5px rgba(64, 158, 255, 0.16);
}

.stage-name {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
  white-space: nowrap;
  transition: all 0.3s;
}

.stage-indicator.completed .stage-name,
.stage-indicator.active .stage-name {
  color: #172033;
  font-weight: 650;
}

/* RSSI 图表：使用剩余空间，避免 400px 固定高度撑出屏幕 */
.rssi-chart {
  flex: 1;
  min-height: 0;
  padding: 0 14px 10px;
  display: flex;
  flex-direction: column;
}

.rssi-chart :deep(.el-divider) {
  margin: 4px 0 8px;
}

.rssi-chart :deep(.el-divider__text) {
  font-size: 12px;
  color: #64748b;
  background: #fff;
}

.chart-container {
  flex: 1;
  min-height: 140px;
  height: auto;
  width: 100%;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fbfdff;
}

/* 未选择状态也保持在一个视窗内 */
.no-selection {
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  box-shadow: 0 14px 34px rgba(29, 53, 87, 0.06);
}

/* 右侧日志：固定占满右栏高度，日志列表在卡片内部收敛 */
.cabinet-sidebar-card {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: static;
}

.cabinet-sidebar-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.cabinet-sidebar-list {
  flex: 1;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.sidebar-empty-wrap {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cabinet-log-list {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.cabinet-log-item {
  padding: 8px 9px;
  border: 1px solid #e6ebf3;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
}

.cabinet-log-time {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 5px;
}

.cabinet-log-step {
  font-size: 13px;
  color: #172033;
  font-weight: 700;
  margin-bottom: 4px;
}

.cabinet-log-info {
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 小屏幕兜底：空间不足时允许页面自然纵向布局 */
@media (max-width: 1100px) {
  .key-negotiation-container {
    height: auto;
    min-height: calc(100vh - 60px);
    overflow: auto;
  }

  .content-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .main-content {
    grid-template-rows: auto 420px;
  }

  .cabinet-sidebar-card {
    height: 360px;
  }

  .cabinet-sidebar-list,
  .cabinet-log-list {
    overflow-y: auto;
  }
}

@media (max-height: 760px) and (min-width: 1101px) {
  .page-header {
    height: 38px;
    margin-bottom: 8px;
  }

  .page-header h1 {
    font-size: 21px;
  }

  .content-layout {
    height: calc(100% - 46px);
    gap: 10px;
  }

  .main-content {
    gap: 10px;
  }

  .control-panel-card {
    height: 190px;
  }

  .card-header {
    min-height: 40px;
    padding: 9px 14px;
  }

  .control-panel-body {
    height: calc(100% - 40px);
    padding: 12px;
    gap: 10px;
  }

  .cabinet-selector,
  .key-pool-panel {
    padding: 12px;
  }

  .key-pool-body {
    height: calc(100% - 32px);
    gap: 10px;
  }

  .metric-value {
    font-size: 22px;
  }

  .key-pool-metric {
    padding: 8px 10px;
  }

  .metric-label {
    margin-bottom: 5px;
  }

  .stage-indicators {
    margin: 10px 18px 6px;
  }

  .stage-icon {
    width: 28px;
    height: 28px;
    margin-bottom: 5px;
  }

  .stage-line,
  .stage-indicators::before {
    top: 14px;
  }

  .chart-container {
    min-height: 120px;
  }

  .cabinet-log-item {
    padding: 7px 9px;
  }
}

@media (max-width: 768px) {
  .control-panel-card {
    height: auto;
  }

  .control-panel-body {
    height: auto;
    grid-template-columns: 1fr;
  }

  .cabinet-selector {
    grid-template-columns: 1fr;
    height: auto;
  }

  .cabinet-selector :deep(.el-button) {
    width: 100%;
  }

  .key-pool-panel {
    min-height: 150px;
  }

  .key-pool-body {
    height: auto;
    grid-template-columns: 1fr;
  }

  .key-pool-metrics {
    grid-template-columns: 1fr;
  }

  .stage-indicators {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .stage-indicators::before,
  .stage-line {
    display: none;
  }

  .stage-indicator {
    flex-direction: row;
    width: 100%;
  }

  .stage-icon {
    margin-bottom: 0;
    margin-right: 10px;
  }

  .stage-name {
    text-align: left;
  }
}
</style>
