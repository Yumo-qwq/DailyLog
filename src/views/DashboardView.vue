<template>
  <div class="dashboard-layout">
    <section class="section">
      <div class="section-inner">
        <div class="section-title table-title">
          <div>
            <h2>每日表格</h2>
            <p class="muted">每一列都是你自己定义的学习主题。每个格子都可以写文字、传图片，修改会自动记录时间。</p>
          </div>
          <CompactHeatmap :cells="heatmap" />
        </div>

        <div class="table-actions">
          <div class="autosave-status">{{ autosaveStatus }}</div>
          <form class="add-column-form" @submit.prevent="addColumn">
            <input v-model="newColumnName" placeholder="新列名，例如：数据结构" />
            <button class="button" type="submit">新增列</button>
          </form>
        </div>

        <div class="table-wrap">
          <table class="data-table learning-table">
            <thead>
              <tr>
                <th class="date-column">日期</th>
                <th v-for="column in columns" :key="column.id" class="learning-column">
                  <div class="column-head">
                    <input
                      v-if="renamingId === column.id"
                      v-model="renameValue"
                      class="column-name-input"
                      @keydown.enter.prevent="saveRename(column)"
                      @blur="saveRename(column)"
                    />
                    <span v-else>{{ column.name }}</span>
                    <button v-if="renamingId !== column.id" class="tiny-button" type="button" @click="startRename(column)">改名</button>
                  </div>
                </th>
                <th class="action-column">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.date" :class="{ today: row.isToday }">
                <td class="date-cell">
                  <strong>{{ formatDate(row.date) }}</strong>
                  <span v-if="row.isToday" class="status ok">今天</span>
                  <span v-else class="status muted">锁定</span>
                </td>

                <td v-for="column in columns" :key="column.id" class="learning-cell">
                  <div class="cell-block" :class="{ editable: row.isToday }">
                    <template v-if="row.isToday">
                      <textarea
                        v-model="cellDraft[column.id].content"
                        class="cell-editor"
                        :placeholder="`${column.name} 学了什么`"
                        @input="onTextInput(column.id)"
                      ></textarea>
                      <label class="cell-upload-button">
                        上传图片
                        <input type="file" accept="image/*" multiple @change="onPickImages(column.id, $event)" />
                      </label>
                    </template>

                    <template v-else>
                      <div class="cell-content">{{ row.cells[column.id]?.content || '-' }}</div>
                    </template>

                    <div v-if="!row.isToday && cellImages(row, column.id).length" class="cell-thumb-grid">
                      <div v-for="image in cellImages(row, column.id)" :key="image.id" class="cell-thumb">
                        <img :src="image.previewUrl || image.dataUrl" :alt="image.name || '图片'" />
                      </div>
                    </div>

                    <div class="cell-footer">
                      <span class="cell-time">{{ cellTime(row, column.id) }}</span>
                      <button
                        v-if="row.isToday && cellDraft[column.id].images.length"
                        class="tiny-button"
                        type="button"
                        @click="removeAllImages(column.id)"
                      >
                        清空图
                      </button>
                    </div>

                    <div v-if="row.isToday && cellDraft[column.id].images.length" class="cell-thumb-grid">
                      <div v-for="image in cellDraft[column.id].images" :key="image.id" class="cell-thumb">
                        <img :src="image.previewUrl || image.dataUrl" :alt="image.name || '图片'" />
                        <button type="button" class="cell-thumb-remove" @click="removeDraftImage(column.id, image.id)">×</button>
                      </div>
                    </div>
                  </div>
                </td>

                <td class="action-cell">
                  <button v-if="row.isToday" class="button" type="button" @click="saveToday">立即记录</button>
                  <span v-else class="muted">只读</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="section side-panel">
      <div class="section-inner">
        <div class="section-title">
          <h2>概览</h2>
        </div>
        <div class="metric-list">
          <div class="metric">
            <div class="metric-label">学习列</div>
            <div class="metric-value">{{ columns.length }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">连续</div>
            <div class="metric-value">{{ stats.streak }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">总计</div>
            <div class="metric-value">{{ stats.total }}</div>
          </div>
        </div>

        <div class="log-section">
          <div class="section-title" style="margin-top:18px;">
            <h2>修改日志</h2>
            <span class="status muted">{{ recentLogs.length }}</span>
          </div>
          <div class="log-list">
            <div v-for="log in recentLogs" :key="log.id" class="log-item">
              <div class="log-head">
                <strong>{{ log.column_name || actionLabel(log.action) }}</strong>
                <span class="muted">{{ formatDateTime(log.created_at) }}</span>
              </div>
              <div class="log-summary">{{ log.summary }}</div>
              <div class="log-meta">
                <span>{{ log.date }}</span>
                <span>{{ log.user_name || '未知成员' }}</span>
              </div>
            </div>
            <div v-if="!recentLogs.length" class="empty">还没有修改日志。</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import CompactHeatmap from '../components/CompactHeatmap.vue';
import { useDailyLog } from '../state.js';
import { buildHeatmap, compressImage, createId, formatClock, formatDate, formatDateTime, shiftDate, todayKey } from '../utils.js';
import { notify } from '../toast.js';

const {
  state,
  draft,
  currentUser,
  metricsForUser,
  findTodayCheckin,
  createOrUpdateTodayCheckin,
  getLearningColumns,
  createLearningColumn,
  renameLearningColumn,
  saveDraft
} = useDailyLog();

const user = computed(() => currentUser());
const today = todayKey();
const columns = computed(() => getLearningColumns(user.value?.id));
const todayRecord = computed(() => findTodayCheckin(user.value?.id, today));
const stats = computed(() => metricsForUser(user.value?.id));
const heatmap = computed(() => buildHeatmap(state.checkins, user.value?.id, 28, today));
const recentLogs = computed(() => [...(state.activityLogs || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 14));

const cellDraft = reactive({});
const newColumnName = ref('');
const renamingId = ref('');
const renameValue = ref('');
const autosaveStatus = ref('自动记录已开启');
const pendingSaveTimers = new Map();

function cloneImage(image) {
  if (!image) return null;
  const dataUrl = image.dataUrl || image.previewUrl || image.url || '';
  return {
    id: image.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: image.name || '图片',
    dataUrl,
    previewUrl: image.previewUrl || dataUrl,
    created_at: image.created_at || new Date().toISOString()
  };
}

function normalizeCell(source) {
  if (!source) {
    return {
      content: '',
      images: [],
      created_at: '',
      updated_at: ''
    };
  }

  return {
    content: String(source.content || ''),
    images: Array.isArray(source.images) ? source.images.map(cloneImage).filter(Boolean) : [],
    created_at: source.created_at || '',
    updated_at: source.updated_at || ''
  };
}

function hasCellData(cell) {
  return Boolean((cell?.content || '').trim() || (cell?.images || []).length);
}

function imageSignature(images = []) {
  return images
    .map((item) => item.dataUrl || item.previewUrl || item.url || item.id || '')
    .join('|');
}

function cellSignature(cell) {
  return JSON.stringify({
    content: (cell?.content || '').trim(),
    images: imageSignature(cell?.images || [])
  });
}

function truncate(text, limit = 22) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildContentSummary(entries, columns) {
  return columns
    .map((column) => {
      const cell = normalizeCell(entries[column.id]);
      if (cell.content.trim()) return `${column.name}：${truncate(cell.content.trim(), 14)}`;
      if (cell.images.length) return `${column.name}：图片${cell.images.length}张`;
      return '';
    })
    .filter(Boolean)
    .join('；');
}

function buildLogSummary(column, previousCell, nextCell) {
  const prev = normalizeCell(previousCell);
  const next = normalizeCell(nextCell);
  const prevHas = hasCellData(prev);
  const nextHas = hasCellData(next);

  if (!prevHas && nextHas) {
    const bits = [];
    if (next.content.trim()) bits.push(`文本「${truncate(next.content.trim())}」`);
    if (next.images.length) bits.push(`图片 ${next.images.length} 张`);
    return `新增 ${column.name}：${bits.join('，') || '空内容'}`;
  }

  if (prevHas && !nextHas) {
    return `清空 ${column.name}`;
  }

  const bits = [];
  if ((prev.content || '').trim() !== (next.content || '').trim()) {
    const value = (next.content || '').trim();
    bits.push(value ? `文本改为「${truncate(value)}」` : '文本已清空');
  }
  if ((prev.images || []).length !== (next.images || []).length) {
    const prevCount = (prev.images || []).length;
    const nextCount = (next.images || []).length;
    if (nextCount > prevCount) bits.push(`图片 +${nextCount - prevCount}`);
    else bits.push(`图片 -${prevCount - nextCount}`);
  }

  return `${column.name}：${bits.join('，') || '已更新'}`;
}

function serializeCell(cell, fallbackTimestamp = new Date().toISOString()) {
  const normalized = normalizeCell(cell);
  return {
    content: normalized.content.trim(),
    images: normalized.images.map(cloneImage),
    created_at: normalized.created_at || fallbackTimestamp,
    updated_at: normalized.updated_at || fallbackTimestamp
  };
}

function buildCellChangeLog(column, previousCell, nextCell, timestamp, checkinId) {
  const previous = normalizeCell(previousCell);
  const next = normalizeCell(nextCell);
  const previousHasData = hasCellData(previous);
  const nextHasData = hasCellData(next);

  if (!previousHasData && !nextHasData) return null;
  if (cellSignature(previous) === cellSignature(next)) return null;

  const textChanged = (previous.content || '').trim() !== (next.content || '').trim();
  const imagesChanged = imageSignature(previous.images) !== imageSignature(next.images);
  let action = 'cell-update';
  if (!previousHasData && nextHasData) action = 'cell-create';
  else if (previousHasData && !nextHasData) action = 'cell-clear';
  else if (imagesChanged && !textChanged) action = 'cell-images';

  return {
    user_id: user.value.id,
    user_name: user.value.display_name,
    checkin_id: checkinId,
    date: today,
    column_id: column.id,
    column_name: column.name,
    action,
    summary: buildLogSummary(column, previous, next),
    created_at: timestamp
  };
}

function actionLabel(action) {
  const map = {
    seed: '初始记录',
    'cell-create': '新增格子',
    'cell-update': '修改格子',
    'cell-clear': '清空格子',
    'cell-images': '图片更新',
    'column-create': '新增列',
    'column-rename': '改名',
    'profile-update': '资料更新',
    'user-create': '创建账号',
    'user-enable': '启用账号',
    'user-disable': '禁用账号'
  };
  return map[action] || action || '修改';
}

function hydrateDraft() {
  if (!user.value) return;

  const legacyDraft = draft.value?.[`${user.value.id}:${today}`] || {};
  const stored = legacyDraft.cells || legacyDraft || {};
  const source = todayRecord.value?.entries || {};
  const nextDraft = {};
  const firstColumnId = columns.value[0]?.id;

  for (const column of columns.value) {
    const storedCell = normalizeCell(stored[column.id]);
    const sourceCell = normalizeCell(source[column.id]);
    nextDraft[column.id] = hasCellData(storedCell) || storedCell.updated_at ? storedCell : sourceCell;
  }

  if (firstColumnId && legacyDraft.content && !nextDraft[firstColumnId]?.content) {
    nextDraft[firstColumnId] = {
      ...nextDraft[firstColumnId],
      content: String(legacyDraft.content || ''),
      images: Array.isArray(legacyDraft.images) ? legacyDraft.images.map(cloneImage).filter(Boolean) : nextDraft[firstColumnId]?.images || [],
      updated_at: legacyDraft.updated_at || new Date().toISOString()
    };
  }

  Object.keys(cellDraft).forEach((key) => {
    if (!nextDraft[key]) delete cellDraft[key];
  });

  for (const [key, value] of Object.entries(nextDraft)) {
    cellDraft[key] = value;
  }
}

hydrateDraft();

function snapshotDraft() {
  const cells = {};
  for (const column of columns.value) {
    const cell = normalizeCell(cellDraft[column.id]);
    cells[column.id] = {
      content: cell.content,
      images: cell.images.map(cloneImage),
      created_at: cell.created_at,
      updated_at: cell.updated_at
    };
  }
  return cells;
}

watch([todayRecord, columns], hydrateDraft, { immediate: true, deep: true });

watch(
  cellDraft,
  () => {
    if (!user.value) return;
    saveDraft(`${user.value.id}:${today}`, { cells: snapshotDraft() });
  },
  { deep: true }
);

const rows = computed(() => {
  const dates = Array.from({ length: 12 }, (_, index) => shiftDate(today, -index));
  return dates.map((date) => {
    const record = state.checkins.find((item) => item.user_id === user.value?.id && item.date === date);
    const cells = {};
    for (const column of columns.value) {
      cells[column.id] = normalizeCell(record?.entries?.[column.id]);
    }
    return {
      date,
      isToday: date === today,
      cells
    };
  });
});

function addColumn() {
  try {
    const column = createLearningColumn(user.value.id, newColumnName.value);
    cellDraft[column.id] = {
      content: '',
      images: [],
      created_at: '',
      updated_at: ''
    };
    newColumnName.value = '';
    autosaveStatus.value = `新列已记录 ${formatClock(new Date().toISOString())}`;
    notify('success', '新列已添加');
  } catch (error) {
    notify('error', error.message || '新增列失败');
  }
}

function startRename(column) {
  renamingId.value = column.id;
  renameValue.value = column.name;
}

function saveRename(column) {
  if (renamingId.value !== column.id) return;
  try {
    renameLearningColumn(user.value.id, column.id, renameValue.value);
    autosaveStatus.value = `列名已记录 ${formatClock(new Date().toISOString())}`;
    notify('success', '列名已更新');
  } catch (error) {
    notify('error', error.message || '改名失败');
  } finally {
    renamingId.value = '';
    renameValue.value = '';
  }
}

function touchCell(columnId) {
  if (!cellDraft[columnId]) return;
  const timestamp = new Date().toISOString();
  cellDraft[columnId].updated_at = timestamp;
  if (!cellDraft[columnId].created_at && hasCellData(cellDraft[columnId])) {
    cellDraft[columnId].created_at = timestamp;
  }
  return timestamp;
}

function clearPendingCellSave(columnId) {
  const timer = pendingSaveTimers.get(columnId);
  if (timer) {
    clearTimeout(timer);
    pendingSaveTimers.delete(columnId);
  }
}

function clearAllPendingSaves() {
  for (const columnId of pendingSaveTimers.keys()) {
    clearPendingCellSave(columnId);
  }
}

function setRecordedStatus(timestamp) {
  autosaveStatus.value = `已记录 ${formatClock(timestamp)}`;
}

function onTextInput(columnId) {
  touchCell(columnId);
  queueCellSave(columnId);
}

function queueCellSave(columnId) {
  clearPendingCellSave(columnId);
  autosaveStatus.value = '正在记录修改...';
  const timer = setTimeout(() => {
    pendingSaveTimers.delete(columnId);
    persistCell(columnId, { silent: true });
  }, 650);
  pendingSaveTimers.set(columnId, timer);
}

function persistCell(columnId, options = {}) {
  if (!user.value) return false;
  const column = columns.value.find((item) => item.id === columnId);
  if (!column) return false;

  try {
    const checkinId = todayRecord.value?.id || createId();
    const previousEntries = todayRecord.value?.entries || {};
    const previousCell = normalizeCell(previousEntries[columnId]);
    const draftCell = normalizeCell(cellDraft[columnId]);
    const timestamp = draftCell.updated_at || new Date().toISOString();
    const nextCell = hasCellData(draftCell)
      ? serializeCell(
          {
            ...draftCell,
            created_at: previousCell.created_at || draftCell.created_at || todayRecord.value?.created_at || timestamp,
            updated_at: timestamp
          },
          timestamp
        )
      : {
          content: '',
          images: [],
          created_at: previousCell.created_at || timestamp,
          updated_at: timestamp
        };

    const log = buildCellChangeLog(column, previousCell, nextCell, timestamp, checkinId);
    if (!log) {
      if (!options.keepStatusOnNoChange) {
        autosaveStatus.value = '没有新变化';
      }
      return false;
    }

    const nextEntries = {};
    for (const item of columns.value) {
      const sourceCell = item.id === columnId ? nextCell : normalizeCell(previousEntries[item.id]);
      if (hasCellData(sourceCell)) {
        nextEntries[item.id] = serializeCell(sourceCell, timestamp);
      }
    }

    createOrUpdateTodayCheckin(user.value.id, {
      id: checkinId,
      entries: nextEntries,
      content: buildContentSummary(nextEntries, columns.value),
      study_minutes: Object.values(nextEntries).length,
      logs: [log]
    });

    setRecordedStatus(timestamp);
    if (!options.silent) {
      notify('success', options.message || '修改已记录');
    }
    return true;
  } catch (error) {
    autosaveStatus.value = '记录失败';
    if (!options.silent) {
      notify('error', error.message || '记录失败');
    }
    return false;
  }
}

async function onPickImages(columnId, event) {
  const files = Array.from(event.target.files || []).slice(0, Math.max(0, 5 - (cellDraft[columnId].images?.length || 0)));
  if (!files.length) return;

  try {
    const images = [];
    for (const file of files) {
      const processed = await compressImage(file, 1200, 0.8);
      images.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        dataUrl: processed.dataUrl || processed.previewUrl,
        previewUrl: processed.previewUrl || processed.dataUrl,
        created_at: new Date().toISOString()
      });
    }
    cellDraft[columnId].images = [...(cellDraft[columnId].images || []), ...images];
    touchCell(columnId);
    clearPendingCellSave(columnId);
    persistCell(columnId, { silent: true });
    event.target.value = '';
    notify('success', '图片已加入并记录');
  } catch (error) {
    notify('error', error.message || '图片处理失败');
  }
}

function removeDraftImage(columnId, imageId) {
  if (!cellDraft[columnId]) return;
  cellDraft[columnId].images = (cellDraft[columnId].images || []).filter((item) => item.id !== imageId);
  touchCell(columnId);
  clearPendingCellSave(columnId);
  persistCell(columnId, { silent: true });
}

function removeAllImages(columnId) {
  if (!cellDraft[columnId]) return;
  cellDraft[columnId].images = [];
  touchCell(columnId);
  clearPendingCellSave(columnId);
  persistCell(columnId, { silent: true });
}

function cellImages(row, columnId) {
  return row.cells[columnId]?.images || [];
}

function cellTime(row, columnId) {
  const draftCell = cellDraft[columnId];
  if (row.isToday && draftCell?.updated_at) {
    return `最后修改 ${formatClock(draftCell.updated_at)}`;
  }
  if (row.cells[columnId]?.updated_at) {
    return `最后修改 ${formatClock(row.cells[columnId].updated_at)}`;
  }
  return '未修改';
}

function saveToday() {
  if (!user.value) return;
  clearAllPendingSaves();

  let changed = false;
  for (const column of columns.value) {
    if (persistCell(column.id, { silent: true, keepStatusOnNoChange: true })) changed = true;
  }

  if (!changed) {
    notify('info', '没有检测到变化');
    return;
  }

  notify('success', '今日表格已记录');
}

onBeforeUnmount(() => {
  const pendingColumnIds = [...pendingSaveTimers.keys()];
  clearAllPendingSaves();
  for (const columnId of pendingColumnIds) {
    persistCell(columnId, { silent: true });
  }
});
</script>
