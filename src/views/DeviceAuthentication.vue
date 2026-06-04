<template>
  <div class="device-authentication-container">
    <div class="page-header">
      <div class="title-block">
        <h1>{{ texts.pageTitle }}</h1>
        <span>基于物理层特征的储能柜设备身份认证流程监控</span>
      </div>
    </div>

    <div class="content-layout">
      <div class="main-content">
        <!-- 认证控制台 -->
        <el-card class="stat-card cabinet-selector-card">
          <div class="card-header">
            <div class="header-title">
              <h2>认证控制台</h2>
              <span>选择储能柜并发起设备认证</span>
            </div>
            <el-tag :type="selectedCabinet ? getStatusType() : 'info'" effect="light">
              {{ selectedCabinet ? currentStatusText : '等待选择' }}
            </el-tag>
          </div>

          <div class="cabinet-selector">
            <div class="console-overview">
              <div class="cabinet-avatar">柜</div>
              <div class="cabinet-meta">
                <span class="meta-label">当前认证对象</span>
                <strong>{{ selectedCabinetName || '未选择储能柜' }}</strong>
                <span>{{ selectedCabinet || '选择储能柜后可发起设备认证' }}</span>
              </div>
            </div>

            <div class="console-actions">
              <div class="field-group">
                <span class="field-label">储能柜选择</span>
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
                :loading="selectedCabinet ? !!authenticatingCabinets[selectedCabinet] : false"
                @click="initiateAuthentication(selectedCabinet)"
              >
                {{ texts.initiateAuth }}
              </el-button>
            </div>
          </div>
        </el-card>

        <!-- 认证流程 -->
        <el-card v-if="selectedCabinet" class="stat-card authentication-process-card">
          <div class="card-header">
            <div class="header-title">
              <h2>{{ selectedCabinetName }} {{ texts.processTitleSuffix }}</h2>
              <span>实时展示设备认证状态、预测标签与阶段进度</span>
            </div>
            <el-tag :type="getStatusType()" effect="light">
              {{ currentStatusText }}
            </el-tag>
          </div>

          <div class="auth-overview-grid">
            <div class="auth-result-panel" :class="authResultClass">
              <div class="auth-result-icon">
                <el-icon v-if="authResultState === 'success'"><CircleCheckFilled /></el-icon>
                <el-icon v-else-if="authResultState === 'failure'"><CircleCloseFilled /></el-icon>
                <el-icon v-else><Clock /></el-icon>
              </div>
              <div class="auth-result-content">
                <span>本次认证结果</span>
                <strong>{{ authResultText }}</strong>
                <em>{{ authResultDetail }}</em>
              </div>
            </div>

            <div class="auth-metrics-panel">
              <div class="metric-card confidence">
                <span>置信度</span>
                <strong>{{ authMetricText.confidence }}</strong>
              </div>
              <div class="metric-card threshold">
                <span>判定阈值</span>
                <strong>{{ authMetricText.threshold }}</strong>
              </div>
              <div class="metric-card label">
                <span>预测标签</span>
                <strong>{{ authMetricText.predictedLabel }}</strong>
              </div>
            </div>
          </div>

          <div class="process-summary">
            <div class="process-summary-main">
              <span class="summary-label">当前阶段</span>
              <strong>{{ currentStatusText }}</strong>
              <span>{{ currentStepHint }}</span>
            </div>
            <div class="process-summary-side">
              <span>认证进度</span>
              <strong>{{ processProgressIndex }}/{{ processSteps.length }}</strong>
            </div>
          </div>

          <!-- 优化后的底部进度条 -->
          <div class="stage-progress-card">
            <div class="stage-progress-header">
              <div>
                <span>认证阶段进度</span>
                <strong>{{ processProgressPercent.toFixed(0) }}%</strong>
              </div>
              <em>{{ currentStepHint }}</em>
            </div>

            <div class="stage-indicators">
              <div class="stage-track"></div>
              <div
                class="stage-line"
                :style="{ width: `${stageLinePercent}%` }"
              ></div>

              <div
                v-for="(step, index) in processSteps"
                :key="index"
                class="stage-indicator"
                :class="{
                  completed: currentStatus > index,
                  active: currentStatus === index,
                  pending: currentStatus < index
                }"
              >
                <div class="stage-node">
                  <el-icon v-if="currentStatus > index"><Check /></el-icon>
                  <el-icon v-else-if="currentStatus === index"><Loading /></el-icon>
                  <el-icon v-else><Clock /></el-icon>
                </div>

                <div class="stage-info">
                  <div class="stage-index">STEP 0{{ index + 1 }}</div>
                  <div class="stage-name">{{ step }}</div>
                  <div class="stage-desc">
                    {{ currentStatus > index ? '已完成' : currentStatus === index ? '进行中' : '待执行' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <div v-else class="no-selection">
          <el-empty :description="texts.selectProcessEmpty" />
        </div>
      </div>

      <!-- 右侧日志 -->
      <el-card class="stat-card cabinet-sidebar-card">
        <div class="card-header">
          <div class="header-title">
            <h2>{{ texts.logsTitle }}</h2>
            <span>实时认证日志</span>
          </div>
        </div>

        <div v-if="selectedCabinet" class="cabinet-sidebar-list">
          <el-empty v-if="selectedCabinetLogs.length === 0" :description="texts.noLogs" />

          <div v-else class="cabinet-log-list">
            <div
              v-for="log in selectedCabinetLogs"
              :key="`${log.timestamp}-${log.flag ?? 0}-${log.step}-${log.info}`"
              class="cabinet-log-item"
            >
              <div class="cabinet-log-time">{{ formatTimestamp(log.timestamp) }}</div>
              <div class="cabinet-log-step">{{ log.step }}</div>
              <div class="cabinet-log-info">{{ log.info }}</div>
            </div>
          </div>
        </div>

        <div v-else class="sidebar-empty-wrap">
          <el-empty :description="texts.selectLogsEmpty" />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import {
  Check,
  Clock,
  CircleCheckFilled,
  CircleCloseFilled,
  Loading
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { get, post, getServerUrl } from '../axios/request';

const texts = {
  pageTitle: '储能柜设备认证',
  cabinetSelector: '选择储能柜',
  initiateAuth: '发起设备认证',
  processTitleSuffix: '设备认证流程',
  selectProcessEmpty: '请选择一个储能柜查看设备认证流程',
  logsTitle: '储能柜日志',
  latestLogsSuffix: '最近500条日志',
  noLogs: '暂无日志数据',
  selectLogsEmpty: '请选择左侧储能柜查看日志',
  authCompleted: '设备认证完成',
  initiated: '已发起设备认证',
  initiateFailed: '发起设备认证失败',
  notStarted: '未开始',
  completed: '完成'
};

const cabinets = ref(
  Array.from({ length: 20 }, (_, i) => ({
    id: `CB${i + 1}`,
    name: `储能柜${i + 1}`
  }))
);

const selectedCabinet = ref('');
const cabinetStates = reactive({});
const cabinetAuthResults = reactive({});
const selectedCabinetLogs = ref([]);
const authenticatingCabinets = reactive({});
const authenticationStartedAt = reactive({});
const LAST_SELECTED_CABINET_KEY = 'device-authentication:selected-cabinet';
const MAX_VISIBLE_LOGS = 8;

const ensureState = (cabinetId) => {
  if (!cabinetStates[cabinetId]) {
    cabinetStates[cabinetId] = { status: -1 };
  }
  return cabinetStates[cabinetId];
};

const selectedCabinetName = computed(() => {
  return cabinets.value.find((c) => c.id === selectedCabinet.value)?.name || '';
});

const processSteps = [
  '信号采集',
  '信号处理',
  '特征提取',
  '设备认证'
];

const currentStatus = computed(() => cabinetStates[selectedCabinet.value]?.status ?? -1);

const getStatusTextByValue = (status) => {
  if (status === -1) return texts.notStarted;
  if (status >= processSteps.length) return texts.completed;
  return processSteps[status] || `Stage ${status}`;
};

const getStatusTypeByValue = (status) => {
  if (status === -1) return 'info';
  if (status >= processSteps.length) return 'success';
  return 'primary';
};

const currentStatusText = computed(() => getStatusTextByValue(currentStatus.value));

const processProgressIndex = computed(() => {
  if (currentStatus.value < 0) return 0;
  return Math.min(currentStatus.value + 1, processSteps.length);
});

const processProgressPercent = computed(() => {
  if (!processSteps.length) return 0;
  return (processProgressIndex.value / processSteps.length) * 100;
});

/**
 * 底部时间轴进度线：
 * - 未开始：0%
 * - 第 1 阶段进行中：0%
 * - 第 2 阶段进行中：33.33%
 * - 第 3 阶段进行中：66.66%
 * - 完成：100%
 */
const stageLinePercent = computed(() => {
  if (!processSteps.length || currentStatus.value < 0) return 0;
  if (currentStatus.value >= processSteps.length) return 100;
  if (processSteps.length === 1) return 100;
  return (currentStatus.value / (processSteps.length - 1)) * 100;
});

const currentStepHint = computed(() => {
  if (!selectedCabinet.value) return '请选择储能柜后查看认证流程';
  if (currentStatus.value === -1) return '认证尚未开始，请点击右侧按钮发起';
  if (currentStatus.value >= processSteps.length) return '设备认证流程已完成，可查看右侧日志';
  return `正在执行 ${currentStatusText.value} 阶段`;
});

const selectedAuthResult = computed(() => {
  return selectedCabinet.value ? cabinetAuthResults[selectedCabinet.value] || null : null;
});

const normalizePercentValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return NaN;
  return num >= 0 && num <= 1 ? num * 100 : num;
};

const authMetricValues = computed(() => {
  const result = selectedAuthResult.value;

  return {
    confidence: normalizePercentValue(result?.confidence),
    threshold: normalizePercentValue(result?.threshold),
    predictedLabel: result?.predictedLabel || ''
  };
});

const formatMetricPercent = (value, withSign = false) => {
  if (!Number.isFinite(value)) return '--';
  const prefix = withSign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
};

const authMetricText = computed(() => ({
  confidence: formatMetricPercent(authMetricValues.value.confidence),
  threshold: formatMetricPercent(authMetricValues.value.threshold),
  predictedLabel: authMetricValues.value.predictedLabel || '--'
}));

const authResultState = computed(() => {
  if (!selectedCabinet.value || currentStatus.value === -1) return 'pending';
  const result = selectedAuthResult.value?.result?.toLowerCase();
  if (result === 'success') return 'success';
  if (result === 'failure' || result === 'failed' || result === 'error') return 'failure';
  return 'running';
});

const authResultText = computed(() => {
  if (authResultState.value === 'success') return '认证成功';
  if (authResultState.value === 'failure') return '认证失败';
  if (authResultState.value === 'running') return '认证进行中';
  return '等待认证';
});

const authResultDetail = computed(() => {
  const metrics = authMetricValues.value;
  const hasMetrics = Number.isFinite(metrics.confidence) && Number.isFinite(metrics.threshold);

  if (authResultState.value === 'success') {
    if (hasMetrics) {
      const labelText = metrics.predictedLabel ? `，预测标签 ${metrics.predictedLabel}` : '';
      return `置信度 ${authMetricText.value.confidence}，阈值 ${authMetricText.value.threshold}${labelText}`;
    }
    return '设备身份校验通过，认证流程已完成';
  }

  if (authResultState.value === 'failure') {
    const result = selectedAuthResult.value;
    return result?.reason || `设备身份校验未通过，预测标签 ${authMetricText.value.predictedLabel}`;
  }

  if (authResultState.value === 'running') {
    return currentStatus.value >= processSteps.length ? '认证流程已结束，等待A侧上报认证结果' : `当前执行到 ${currentStatusText.value}`;
  }
  return '发起认证后将在这里显示本次结果';
});

const authResultClass = computed(() => ({
  success: authResultState.value === 'success',
  failure: authResultState.value === 'failure',
  running: authResultState.value === 'running',
  pending: authResultState.value === 'pending'
}));

let eventSource = null;

const closeEventSource = () => {
  if (!eventSource) return;
  eventSource.onopen = null;
  eventSource.onerror = null;
  eventSource.onmessage = null;
  eventSource.close();
  eventSource = null;
};

const getCabinetName = (cabinetId) => {
  return cabinets.value.find((c) => c.id === cabinetId)?.name || cabinetId;
};

const setAuthenticationResult = (cabinetId, payload) => {
  if (!cabinetId || !payload) return;
  cabinetAuthResults[cabinetId] = {
    result: payload.result || '',
    predictedLabel: payload.predictedLabel || payload.predicted_label || payload.label || '',
    confidence: payload.confidence ?? payload.similarity,
    threshold: payload.threshold,
    timestamp: payload.timestamp || Date.now(),
    reason: payload.reason || ''
  };
};

const connectCabinetSSE = (cabinetId) => {
  if (!cabinetId) return;

  closeEventSource();

  const state = ensureState(cabinetId);
  const serverBase = getServerUrl().replace(/\/$/, '');
  const source = new EventSource(
    `${serverBase}/api/device-auth/sse?cabinetId=${encodeURIComponent(cabinetId)}`
  );
  eventSource = source;

  source.addEventListener('status', (e) => {
    try {
      const res = JSON.parse(e.data);
      if (res.code !== 0) return;

      const prevStatus = state.status;
      state.status = res.data;

      if (prevStatus < processSteps.length && state.status >= processSteps.length) {
        ElMessage.success(`${getCabinetName(cabinetId)} ${texts.authCompleted}`);
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

  source.addEventListener('result', (e) => {
    try {
      const res = JSON.parse(e.data);
      if (res.code !== 0 || !res.data) return;
      setAuthenticationResult(cabinetId, res.data);
    } catch (err) {
      console.error('RESULT parse failed', err);
    }
  });

  source.onerror = () => {
    if (eventSource !== source) {
      source.close();
      return;
    }
    closeEventSource();
  };
};

const fetchAuthenticationResult = async (cabinetId) => {
  try {
    const resp = await get('/api/device-auth/result', { cabinetId });
    const payload = resp?.data;
    if (payload?.code === 0 && payload?.data) {
      setAuthenticationResult(cabinetId, payload.data);
      return;
    }
    delete cabinetAuthResults[cabinetId];
  } catch (err) {
    delete cabinetAuthResults[cabinetId];
    console.error('fetch authentication result failed', err);
  }
};

const fetchSelectedCabinetLogs = async (cabinetId) => {
  try {
    const resp = await get('/api/device-auth/log', { cabinetId });
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
    const resp = await get('/api/device-auth/state', { cabinetId });
    const payload = resp?.data;
    if (payload?.code !== 0 || !payload?.data) {
      state.status = -1;
      return;
    }
    const rawStatus = Number(payload.data.auth_status);
    state.status = Number.isFinite(rawStatus) ? rawStatus : -1;
  } catch (err) {
    state.status = -1;
    console.error('fetch cabinet authentication state failed', err);
  }
};

const selectCabinet = async (cabinetId) => {
  selectedCabinet.value = cabinetId;
  localStorage.setItem(LAST_SELECTED_CABINET_KEY, cabinetId);
  ensureState(cabinetId);
  await Promise.all([
    fetchCabinetState(cabinetId),
    fetchSelectedCabinetLogs(cabinetId),
    fetchAuthenticationResult(cabinetId)
  ]);
  connectCabinetSSE(cabinetId);
};

const initiateAuthentication = async (cabinetId) => {
  if (!cabinetId || authenticatingCabinets[cabinetId]) return;

  authenticatingCabinets[cabinetId] = true;
  try {
    const resp = await post('/api/device-auth/initiate', { cabinetId });
    if (resp?.data?.code !== 0) {
      ElMessage.error(resp?.data?.message || texts.initiateFailed);
      return;
    }

    const startedAt = Number(resp?.data?.data?.timestamp) || Date.now();
    authenticationStartedAt[cabinetId] = startedAt;
    delete cabinetAuthResults[cabinetId];
    ensureState(cabinetId).status = -1;
    ElMessage.success(`${getCabinetName(cabinetId)} ${texts.initiated}`);
  } catch (err) {
    console.error('initiate authentication failed', err);
    ElMessage.error(texts.initiateFailed);
  } finally {
    authenticatingCabinets[cabinetId] = false;
  }
};

const restoreLastSelectedCabinet = async () => {
  const lastSelected = localStorage.getItem(LAST_SELECTED_CABINET_KEY);
  if (!lastSelected) return;
  const exists = cabinets.value.some((cabinet) => cabinet.id === lastSelected);
  if (!exists) return;
  await selectCabinet(lastSelected);
};

onMounted(async () => {
  await restoreLastSelectedCabinet();
});

onUnmounted(() => {
  closeEventSource();
});

const getStatusType = () => getStatusTypeByValue(currentStatus.value);

const formatTimestamp = (timestamp) => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return '--';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};
</script>

<style scoped>
.device-authentication-container {
  height: calc(100vh - 60px);
  min-height: 720px;
  padding: 14px 18px;
  box-sizing: border-box;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 8%, rgba(64, 158, 255, 0.14), transparent 28%),
    radial-gradient(circle at 92% 4%, rgba(54, 207, 201, 0.12), transparent 30%),
    linear-gradient(180deg, #f7faff 0%, #f2f6fc 100%);
}

.page-header {
  height: 44px;
  max-width: 1680px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.page-header h1 {
  margin: 0;
  padding-left: 14px;
  position: relative;
  font-size: 23px;
  font-weight: 850;
  color: #172033;
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

.title-block span {
  padding-left: 14px;
  font-size: 12px;
  color: #64748b;
}

.content-layout {
  height: calc(100% - 56px);
  max-width: 1680px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  min-height: 0;
}

.main-content {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 150px minmax(0, 1fr);
  gap: 14px;
}

.stat-card {
  min-height: 0;
  border-radius: 16px;
  border: 1px solid rgba(220, 226, 235, 0.95);
  background: rgba(255, 255, 255, 0.96);
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
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf1f7;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-sizing: border-box;
}

.header-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #172033;
}

.header-title span {
  font-size: 12px;
  color: #94a3b8;
}

.cabinet-selector {
  height: calc(100% - 48px);
  padding: 12px 14px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(360px, 1.35fr);
  gap: 12px;
}

.console-overview {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  background:
    linear-gradient(135deg, rgba(64, 158, 255, 0.14), rgba(54, 207, 201, 0.08)),
    #f8fbff;
  border: 1px solid #e2ebf8;
}

.cabinet-avatar {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 22px;
  font-weight: 900;
  background: linear-gradient(135deg, #409eff, #36cfc9);
  box-shadow: 0 12px 22px rgba(64, 158, 255, 0.24);
}

.cabinet-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cabinet-meta .meta-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.cabinet-meta strong {
  color: #172033;
  font-size: 21px;
  font-weight: 850;
  line-height: 1.1;
}

.cabinet-meta span:last-child {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.console-actions {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 14px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 158px;
  gap: 12px;
  align-items: end;
  background: #ffffff;
  border: 1px solid #e8edf5;
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

.cabinet-selector :deep(.el-input__wrapper) {
  min-height: 38px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px #dfe7f2 inset;
}

.cabinet-selector :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #409eff inset, 0 0 0 4px rgba(64, 158, 255, 0.12);
}

.cabinet-selector :deep(.el-button) {
  width: 158px;
  height: 38px;
  border-radius: 10px;
  font-weight: 750;
  box-shadow: 0 10px 20px rgba(64, 158, 255, 0.16);
}

.authentication-process-card {
  min-height: 0;
}

.authentication-process-card :deep(.el-card__body) {
  display: grid;
  grid-template-rows: 48px 104px 72px minmax(0, 1fr);
  row-gap: 12px;
  min-height: 0;
}

.auth-overview-grid {
  margin: 0 14px;
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.35fr);
  gap: 12px;
}

.auth-result-panel {
  min-width: 0;
  padding: 14px;
  border-radius: 14px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  border: 1px solid #e5e7eb;
  background: #ffffff;
}

.auth-result-panel.success {
  border-color: rgba(103, 194, 58, 0.42);
  background: linear-gradient(135deg, #f6fff4, #ffffff);
}

.auth-result-panel.failure {
  border-color: rgba(245, 108, 108, 0.42);
  background: linear-gradient(135deg, #fff7f7, #ffffff);
}

.auth-result-panel.running {
  border-color: rgba(64, 158, 255, 0.34);
  background: linear-gradient(135deg, #f5f9ff, #ffffff);
}

.auth-result-panel.pending {
  background: linear-gradient(135deg, #f8fafc, #ffffff);
}

.auth-result-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  background: #f1f5f9;
  font-size: 22px;
}

.auth-result-panel.success .auth-result-icon {
  color: #52c41a;
  background: rgba(103, 194, 58, 0.12);
}

.auth-result-panel.failure .auth-result-icon {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.12);
}

.auth-result-panel.running .auth-result-icon {
  color: #409eff;
  background: rgba(64, 158, 255, 0.12);
}

.auth-result-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.auth-result-content span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.auth-result-content strong {
  color: #172033;
  font-size: 22px;
  line-height: 1.1;
  font-weight: 850;
}

.auth-result-content em {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
  font-style: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.auth-result-panel.success .auth-result-content strong {
  color: #3f9b22;
}

.auth-result-panel.failure .auth-result-content strong {
  color: #d94b4b;
}

.auth-metrics-panel {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.metric-card {
  min-width: 0;
  padding: 13px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e6ebf3;
}

.metric-card span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.metric-card strong {
  color: #172033;
  font-size: 22px;
  line-height: 1.1;
  font-weight: 850;
  white-space: nowrap;
}

.metric-card.confidence {
  border-color: rgba(64, 158, 255, 0.34);
}

.metric-card.threshold {
  border-color: rgba(148, 163, 184, 0.38);
}

.metric-card.label {
  border-color: rgba(54, 207, 201, 0.38);
}

.metric-card.label strong {
  color: #0f766e;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-card.positive strong {
  color: #3f9b22;
}

.metric-card.negative strong {
  color: #d94b4b;
}

.metric-card.unknown strong {
  color: #94a3b8;
}

.process-summary {
  margin: 0 14px;
  padding: 10px 12px;
  border-radius: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 142px;
  gap: 12px;
  align-items: stretch;
  background: #f8fbff;
  color: #172033;
  border: 1px solid #dbeafe;
}

.process-summary-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.summary-label,
.process-summary-side span {
  font-size: 12px;
  color: #64748b;
}

.process-summary-main strong {
  font-size: 18px;
  line-height: 1.1;
  font-weight: 850;
}

.process-summary-main span:last-child {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.process-summary-side {
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #dbeafe;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

.process-summary-side strong {
  font-size: 20px;
  font-weight: 850;
  color: #2563eb;
}

/* =========================
   优化后的底部进度条
========================= */

.stage-progress-card {
  min-height: 0;
  margin: 0 14px 14px;
  padding: 14px 16px 16px;
  border-radius: 16px;
  border: 1px solid #e4ebf5;
  background:
    linear-gradient(180deg, rgba(248, 251, 255, 0.95), rgba(255, 255, 255, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.stage-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.stage-progress-header div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stage-progress-header span {
  font-size: 13px;
  color: #64748b;
  font-weight: 700;
}

.stage-progress-header strong {
  font-size: 20px;
  color: #2563eb;
  font-weight: 900;
}

.stage-progress-header em {
  max-width: 60%;
  color: #94a3b8;
  font-size: 12px;
  font-style: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-indicators {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: 14px;
  min-height: 118px;
  padding: 0 6px;
}

.stage-track,
.stage-line {
  position: absolute;
  top: 24px;
  left: calc(12.5% + 6px);
  width: calc(75% - 12px);
  height: 7px;
  border-radius: 999px;
}

.stage-track {
  background: #e8eef6;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
  z-index: 0;
}

.stage-line {
  width: 0;
  max-width: calc(75% - 12px);
  background: linear-gradient(90deg, #409eff, #36cfc9);
  z-index: 1;
  transition: width 0.35s ease;
}

.stage-line::after {
  content: '';
  position: absolute;
  right: -4px;
  top: 50%;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: #36cfc9;
  box-shadow: 0 0 0 5px rgba(54, 207, 201, 0.16);
}

.stage-indicator {
  position: relative;
  z-index: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stage-node {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  color: #94a3b8;
  border: 5px solid #e8eef6;
  font-size: 20px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  transition: all 0.25s ease;
}

.stage-info {
  width: 100%;
  margin-top: 10px;
  padding: 10px 8px;
  border-radius: 12px;
  text-align: center;
  background: #ffffff;
  border: 1px solid #edf1f7;
  box-sizing: border-box;
  transition: all 0.25s ease;
}

.stage-index {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.4px;
}

.stage-name {
  margin-top: 4px;
  font-size: 14px;
  color: #172033;
  font-weight: 850;
  white-space: nowrap;
}

.stage-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.stage-indicator.completed .stage-node {
  color: #ffffff;
  background: #67c23a;
  border-color: rgba(103, 194, 58, 0.18);
  box-shadow: 0 10px 22px rgba(103, 194, 58, 0.22);
}

.stage-indicator.completed .stage-info {
  background: linear-gradient(180deg, #ffffff, #f6fff4);
  border-color: rgba(103, 194, 58, 0.35);
}

.stage-indicator.completed .stage-desc {
  color: #67c23a;
  font-weight: 800;
}

.stage-indicator.active .stage-node {
  color: #ffffff;
  background: linear-gradient(135deg, #409eff, #36cfc9);
  border-color: rgba(64, 158, 255, 0.18);
  box-shadow:
    0 12px 26px rgba(64, 158, 255, 0.22),
    0 0 0 8px rgba(64, 158, 255, 0.12);
  animation: stagePulse 1.4s ease-in-out infinite;
}

.stage-indicator.active .stage-info {
  transform: translateY(-2px);
  border-color: rgba(64, 158, 255, 0.45);
  box-shadow: 0 12px 26px rgba(64, 158, 255, 0.12);
}

.stage-indicator.active .stage-index,
.stage-indicator.active .stage-desc {
  color: #409eff;
  font-weight: 800;
}

.stage-indicator.pending .stage-node {
  background: #ffffff;
}

@keyframes stagePulse {
  0% {
    box-shadow:
      0 12px 26px rgba(64, 158, 255, 0.18),
      0 0 0 4px rgba(64, 158, 255, 0.14);
  }
  50% {
    box-shadow:
      0 12px 26px rgba(64, 158, 255, 0.24),
      0 0 0 10px rgba(64, 158, 255, 0.08);
  }
  100% {
    box-shadow:
      0 12px 26px rgba(64, 158, 255, 0.18),
      0 0 0 4px rgba(64, 158, 255, 0.14);
  }
}

/* 未选择状态 */
.no-selection {
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 16px;
  border: 1px dashed #cbd5e1;
  box-shadow: 0 14px 34px rgba(29, 53, 87, 0.06);
}

/* 右侧日志 */
.cabinet-sidebar-card {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.cabinet-sidebar-card :deep(.el-card__body) {
  height: 100%;
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  min-height: 0;
}

.cabinet-sidebar-list {
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.sidebar-empty-wrap {
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
  overflow-y: auto;
  padding-right: 4px;
}

.cabinet-log-list::-webkit-scrollbar {
  width: 6px;
}

.cabinet-log-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd5e1;
}

.cabinet-log-list::-webkit-scrollbar-track {
  background: transparent;
}

.cabinet-log-item {
  border: 1px solid #e6ebf3;
  border-radius: 10px;
  padding: 9px 10px;
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
  font-weight: 750;
  margin-bottom: 4px;
}

.cabinet-log-info {
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(.el-empty) {
  padding: 18px 0;
}

:deep(.el-empty__description) {
  margin-top: 8px;
}

:deep(.el-empty__description p) {
  color: #94a3b8;
  font-size: 13px;
}

/* 响应式 */
@media (max-width: 1280px) {
  .device-authentication-container {
    height: auto;
    min-height: calc(100vh - 60px);
    overflow: auto;
  }

  .content-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .main-content {
    grid-template-rows: auto 560px;
  }

  .cabinet-selector {
    grid-template-columns: 1fr;
  }

  .cabinet-sidebar-card {
    height: 360px;
  }
}

@media (max-width: 768px) {
  .device-authentication-container {
    padding: 10px;
  }

  .page-header {
    height: auto;
    margin-bottom: 10px;
  }

  .page-header h1 {
    font-size: 20px;
  }

  .main-content {
    grid-template-rows: auto auto;
  }

  .console-actions {
    grid-template-columns: 1fr;
  }

  .cabinet-selector :deep(.el-button) {
    width: 100%;
  }

  .authentication-process-card :deep(.el-card__body) {
    display: block;
  }

  .auth-overview-grid {
    grid-template-columns: 1fr;
    margin-top: 12px;
  }

  .process-summary {
    grid-template-columns: 1fr;
    margin-top: 12px;
  }

  .auth-metrics-panel {
    grid-template-columns: 1fr;
  }

  .metric-card {
    min-height: 64px;
  }

  .stage-progress-card {
    margin-top: 12px;
  }

  .stage-progress-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .stage-progress-header em {
    max-width: 100%;
  }

  .stage-indicators {
    grid-template-columns: 1fr;
    gap: 10px;
    min-height: auto;
  }

  .stage-track,
  .stage-line {
    display: none;
  }

  .stage-indicator {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
  }

  .stage-node {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
  }

  .stage-info {
    margin-top: 0;
    text-align: left;
  }

  .cabinet-sidebar-card {
    height: 340px;
  }
}
</style>
