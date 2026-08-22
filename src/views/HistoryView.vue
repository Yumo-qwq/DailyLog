<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title table-toolbar">
        <div>
          <h2>历史记录</h2>
          <p class="muted">查看自己的以往学习表格，历史内容只读。</p>
        </div>
        <label class="month-picker">
          <span>查看月份</span>
          <input v-model="selectedMonth" type="month" :max="currentMonth" />
        </label>
      </div>

      <MonthlyCheckinTable :rows="historyRows" :columns="columns" @preview-image="openImage" />
    </div>
  </section>
  <ImageLightbox :image="previewImage" @close="previewImage = null" />
</template>

<script setup>
import { computed, ref } from 'vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import MonthlyCheckinTable from '../components/MonthlyCheckinTable.vue';
import { useDailyLog } from '../state.js';
import { normalizeCellRecord } from '../services/model.js';
import { currentMonthKey, isCheckinComplete, monthDates, todayKey } from '../utils.js';

const { state, currentUser, getLearningColumns } = useDailyLog();
const today = todayKey();
const currentMonth = currentMonthKey();
const selectedMonth = ref(currentMonth);
const previewImage = ref(null);

const userId = computed(() => currentUser()?.id || '');
const columns = computed(() => getLearningColumns(userId.value));
const historyRows = computed(() =>
  monthDates(selectedMonth.value).map((date) => {
    const record = state.checkins.find((item) => item.user_id === userId.value && item.date === date);
    const cells = {};
    for (const column of columns.value) {
      cells[column.id] = normalizeCellRecord(record?.entries?.[column.id]);
    }
    return {
      date,
      isToday: date === today,
      isFuture: date > today,
      checkedIn: isCheckinComplete(record),
      cells
    };
  })
);

function openImage(image) {
  const src = image?.previewUrl || image?.dataUrl || image?.url || '';
  if (!src) return;
  previewImage.value = {
    src,
    alt: image.name || '图片',
    name: image.name || ''
  };
}
</script>
