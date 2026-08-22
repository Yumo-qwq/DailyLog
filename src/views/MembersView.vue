<template>
  <div class="members-layout">
    <section class="section">
      <div class="section-inner">
        <div class="section-title">
          <div>
            <h2>成员</h2>
            <p class="muted">这里可以查看每个人的热力图、修改日志和完整表格。</p>
          </div>
          <span class="status muted">{{ members.length }} 人</span>
        </div>

        <div class="member-grid">
          <button
            v-for="member in members"
            :key="member.id"
            type="button"
            class="member-card"
            :class="{ active: member.id === selectedMemberId }"
            @click="selectedMemberId = member.id"
          >
            <div class="member-card-head">
              <div class="avatar member-avatar">
                <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.display_name" />
                <span v-else>{{ initials(member.display_name) }}</span>
              </div>
              <div class="member-card-title">
                <strong>{{ member.display_name }}</strong>
                <span class="muted">{{ member.role }}</span>
              </div>
            </div>

            <div class="member-card-meta">
              <span>连续 {{ metricsForUser(member.id).streak }}</span>
              <span>{{ metricsForUser(member.id).total }} 条</span>
            </div>

            <CompactHeatmap :cells="heatmaps[member.id]" />
          </button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-inner">
        <div class="section-title table-toolbar">
          <div>
            <h2>{{ selectedMember?.display_name || '成员' }} 的表格</h2>
            <p class="muted">选择月份查看整月记录，包含文字和图片内容。</p>
          </div>
          <label class="month-picker">
            <span>查看月份</span>
            <input v-model="selectedMonth" type="month" :max="currentMonth" />
          </label>
        </div>

        <MonthlyCheckinTable :rows="memberRows" :columns="selectedColumns" @preview-image="openImage" />
      </div>
    </section>

    <section class="section">
      <div class="section-inner">
        <div class="section-title">
          <div>
            <h2>{{ selectedMember?.display_name || '成员' }} 的日志</h2>
            <p class="muted">只显示保存后写入的修改记录，范围为所选月份。</p>
          </div>
          <span class="status muted">{{ selectedLogs.length }}</span>
        </div>

        <div class="log-list">
          <div v-for="log in selectedLogs" :key="log.id" class="log-item">
            <div class="log-head">
              <strong>{{ log.column_name || actionLabel(log.action) }}</strong>
              <span class="muted">{{ formatDateTime(log.created_at) }}</span>
            </div>
            <div class="log-summary">{{ log.summary }}</div>
            <div class="log-meta">
              <span>{{ log.date }}</span>
              <span>{{ log.user_name || selectedMember?.display_name || '未知成员' }}</span>
            </div>
          </div>
          <div v-if="!selectedLogs.length" class="empty">还没有日志。</div>
        </div>
      </div>
    </section>
    <ImageLightbox :image="previewImage" @close="previewImage = null" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import CompactHeatmap from '../components/CompactHeatmap.vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import MonthlyCheckinTable from '../components/MonthlyCheckinTable.vue';
import { useDailyLog } from '../state.js';
import { normalizeCellRecord } from '../services/model.js';
import { buildHeatmap, currentMonthKey, formatDateTime, initials, monthDates, todayKey } from '../utils.js';

const { state, currentUser, getLearningColumns, metricsForUser } = useDailyLog();
const today = todayKey();
const currentMonth = currentMonthKey();
const members = computed(() => state.users.filter((item) => item.is_active));
const selectedMemberId = ref('');
const selectedMonth = ref(currentMonth);
const previewImage = ref(null);

watch(
  members,
  (nextMembers) => {
    if (!nextMembers.length) {
      selectedMemberId.value = '';
      return;
    }

    const currentId = currentUser()?.id;
    const stillVisible = nextMembers.some((item) => item.id === selectedMemberId.value);
    if (stillVisible) return;
    selectedMemberId.value = nextMembers.some((item) => item.id === currentId) ? currentId : nextMembers[0].id;
  },
  { immediate: true }
);

const selectedMember = computed(() => members.value.find((item) => item.id === selectedMemberId.value) || null);
const selectedColumns = computed(() => getLearningColumns(selectedMember.value?.id));
const memberRows = computed(() => {
  return monthDates(selectedMonth.value).map((date) => {
    const record = state.checkins.find((item) => item.user_id === selectedMember.value?.id && item.date === date);
    const cells = {};
    for (const column of selectedColumns.value) {
      cells[column.id] = normalizeCellRecord(record?.entries?.[column.id]);
    }
    return {
      date,
      isToday: date === today,
      isFuture: date > today,
      cells
    };
  });
});

const selectedLogs = computed(() =>
  [...(state.activityLogs || [])]
    .filter((item) => item.user_id === selectedMember.value?.id && item.date?.startsWith(selectedMonth.value))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100)
);

const heatmaps = computed(() => {
  const result = {};
  for (const member of members.value) {
    result[member.id] = buildHeatmap(state.checkins, member.id, 21, today);
  }
  return result;
});

function openImage(image) {
  const src = image?.previewUrl || image?.dataUrl || image?.url || '';
  if (!src) return;
  previewImage.value = {
    src,
    alt: image.name || '图片',
    name: image.name || ''
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
</script>
