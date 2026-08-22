<template>
  <div class="dashboard-layout">
    <section class="section">
      <div class="section-inner">
        <div class="daily-checkin-bar" :class="todayCheckedIn ? 'complete' : 'missing'">
          <div class="daily-checkin-copy">
            <span class="daily-checkin-label">今日打卡</span>
            <strong>{{ todayCheckedIn ? '今天已完成打卡' : '今天还没有打卡' }}</strong>
            <span>连续打卡 {{ stats.streak }} 天</span>
          </div>
          <button
            v-if="!todayCheckedIn"
            class="button"
            type="button"
            :disabled="checkingIn"
            @click="checkInToday"
          >
            {{ checkingIn ? '打卡中...' : '立即打卡' }}
          </button>
          <span v-else class="status ok">已打卡</span>
        </div>

        <div class="section-title table-title">
          <div>
            <h2>每日表格</h2>
            <p class="muted">只写自己的今日表格。修改先留在本地草稿，点击保存后才会写入数据库并生成日志。</p>
          </div>
        </div>

        <div class="table-actions">
          <div class="autosave-status">{{ saveStatus }}</div>
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
              <tr
                v-for="row in rows"
                :key="row.date"
                :class="{ today: row.isToday, 'checkin-done': row.checkedIn, 'checkin-missed': !row.checkedIn }"
              >
                <td class="date-cell">
                  <strong>{{ formatDate(row.date) }}</strong>
                  <span class="status" :class="row.checkedIn ? 'ok' : 'missed'">
                    {{ row.checkedIn ? (row.isToday ? '今日已打卡' : '已打卡') : (row.isToday ? '今日未打卡' : '未打卡') }}
                  </span>
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
                        <button class="thumb-preview" type="button" @click="openImage(image)">
                          <img :src="image.previewUrl || image.dataUrl" :alt="image.name || '图片'" />
                        </button>
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
                        <button class="thumb-preview" type="button" @click="openImage(image)">
                          <img :src="image.previewUrl || image.dataUrl" :alt="image.name || '图片'" />
                        </button>
                        <button type="button" class="cell-thumb-remove" @click="removeDraftImage(column.id, image.id)">×</button>
                      </div>
                    </div>
                  </div>
                </td>

                <td class="action-cell">
                  <button v-if="row.isToday" class="button" type="button" @click="saveToday">保存</button>
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
        <div class="empty" style="margin-top: 14px;">
          热力图、日志和其他成员的表格在“成员”页查看。
        </div>
      </div>
    </section>
    <ImageLightbox :image="previewImage" @close="previewImage = null" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import { useDailyLog } from '../state.js';
import { compressImage, createId, formatClock, formatDate, isCheckinComplete, shiftDate, todayKey } from '../utils.js';
import { notify } from '../toast.js';

const {
  state,
  draft,
  currentUser,
  metricsForUser,
  findTodayCheckin,
  createOrUpdateTodayCheckin,
  markTodayCheckin,
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
const todayCheckedIn = computed(() => isCheckinComplete(todayRecord.value));

const cellDraft = reactive({});
const newColumnName = ref('');
const renamingId = ref('');
const renameValue = ref('');
const saveStatus = ref('等待修改');
const previewImage = ref(null);
const checkingIn = ref(false);

function cloneImage(image) {
  if (!image) return null;
  const dataUrl = image.dataUrl || image.previewUrl || image.url || '';
  return {
    id: image.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    storage_path: image.storage_path || image.storagePath || (typeof image.id === 'string' && image.id.includes('/') ? image.id : ''),
    name: image.name || '图片',
    content_type: image.content_type || image.contentType || 'image/webp',
    size_bytes: Number(image.size_bytes || image.sizeBytes || 0),
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
    .map((item) => item.storage_path || item.id || item.dataUrl || item.previewUrl || item.url || '')
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
    const storedIsNewer = storedCell.updated_at && (!sourceCell.updated_at || storedCell.updated_at > sourceCell.updated_at);
    nextDraft[column.id] = storedIsNewer || (!hasCellData(sourceCell) && hasCellData(storedCell)) ? storedCell : sourceCell;
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
      checkedIn: isCheckinComplete(record),
      cells
    };
  });
});

async function checkInToday() {
  if (!user.value || checkingIn.value || todayCheckedIn.value) return;
  checkingIn.value = true;
  try {
    await markTodayCheckin(user.value.id);
    notify('success', '今日打卡成功');
  } catch (error) {
    notify('error', error.message || '打卡失败');
  } finally {
    checkingIn.value = false;
  }
}

async function addColumn() {
  try {
    const column = await createLearningColumn(user.value.id, newColumnName.value);
    cellDraft[column.id] = {
      content: '',
      images: [],
      created_at: '',
      updated_at: ''
    };
    newColumnName.value = '';
    saveStatus.value = `新列已保存 ${formatClock(new Date().toISOString())}`;
    notify('success', '新列已添加');
  } catch (error) {
    notify('error', error.message || '新增列失败');
  }
}

function startRename(column) {
  renamingId.value = column.id;
  renameValue.value = column.name;
}

async function saveRename(column) {
  if (renamingId.value !== column.id) return;
  try {
    await renameLearningColumn(user.value.id, column.id, renameValue.value);
    saveStatus.value = `列名已保存 ${formatClock(new Date().toISOString())}`;
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
  saveStatus.value = '有未保存修改';
  return timestamp;
}

function onTextInput(columnId) {
  touchCell(columnId);
}

function todayImageCount() {
  return Object.values(cellDraft).reduce((total, cell) => total + (cell?.images?.length || 0), 0);
}

async function onPickImages(columnId, event) {
  const remaining = Math.max(0, 5 - todayImageCount());
  if (remaining <= 0) {
    event.target.value = '';
    notify('error', '单次打卡最多上传 5 张图片');
    return;
  }

  const selectedFiles = Array.from(event.target.files || []);
  const files = selectedFiles.slice(0, remaining);
  if (!files.length) return;

  try {
    const images = [];
    for (const file of files) {
      const processed = await compressImage(file, 1600, 0.82, 1024 * 1024);
      images.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        content_type: processed.contentType || 'image/webp',
        size_bytes: processed.sizeBytes || 0,
        dataUrl: processed.dataUrl || processed.previewUrl,
        previewUrl: processed.previewUrl || processed.dataUrl,
        created_at: new Date().toISOString()
      });
    }
    cellDraft[columnId].images = [...(cellDraft[columnId].images || []), ...images];
    touchCell(columnId);
    event.target.value = '';
    notify('success', selectedFiles.length > files.length ? '已按 5 张上限加入' : '图片已加入');
  } catch (error) {
    notify('error', error.message || '图片处理失败');
  }
}

async function removeDraftImage(columnId, imageId) {
  if (!cellDraft[columnId]) return;
  cellDraft[columnId].images = (cellDraft[columnId].images || []).filter((item) => item.id !== imageId);
  touchCell(columnId);
}

async function removeAllImages(columnId) {
  if (!cellDraft[columnId]) return;
  cellDraft[columnId].images = [];
  touchCell(columnId);
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

function openImage(image) {
  const src = image?.previewUrl || image?.dataUrl || image?.url || '';
  if (!src) return;
  previewImage.value = {
    src,
    alt: image.name || '图片',
    name: image.name || ''
  };
}

async function saveToday() {
  if (!user.value) return;
  const previousEntries = todayRecord.value?.entries || {};
  const checkinId = todayRecord.value?.id || createId();
  const timestamp = new Date().toISOString();
  const nextEntries = {};
  const logs = [];

  for (const column of columns.value) {
    const previousCell = normalizeCell(previousEntries[column.id]);
    const draftCell = normalizeCell(cellDraft[column.id]);
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

    if (hasCellData(nextCell)) {
      nextEntries[column.id] = nextCell;
    }

    const log = buildCellChangeLog(column, previousCell, nextCell, timestamp, checkinId);
    if (log) logs.push(log);
  }

  if (!logs.length) {
    saveStatus.value = '没有新变化';
    notify('info', '没有检测到变化');
    return;
  }

  try {
    await createOrUpdateTodayCheckin(user.value.id, {
      id: checkinId,
      entries: nextEntries,
      columns: columns.value,
      content: buildContentSummary(nextEntries, columns.value),
      study_minutes: Object.values(nextEntries).filter((cell) => hasCellData(cell)).length,
      logs
    });
    saveStatus.value = `已保存 ${formatClock(timestamp)}`;
    notify('success', '今日表格已保存');
  } catch (error) {
    saveStatus.value = '保存失败';
    notify('error', error.message || '保存失败');
  }
}
</script>
