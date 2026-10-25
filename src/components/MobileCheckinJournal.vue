<template>
  <div class="mobile-learning-journal mobile-member-journal">
    <div v-if="!visibleRows.length" class="empty">{{ emptyMessage }}</div>
    <details v-for="row in visibleRows" :key="row.date" class="mobile-history-day" :open="row.isToday || undefined">
      <summary>
        <strong>{{ formatDate(row.date) }}</strong>
        <span class="status" :class="row.checkedIn ? 'ok' : 'missed'">{{ row.checkedIn ? '已打卡' : '未打卡' }}</span>
      </summary>
      <div v-if="!columns.length" class="empty">暂无学习主题。</div>
      <div v-for="column in columns" :key="column.id" class="mobile-history-entry">
        <strong>{{ column.name }}</strong>
        <p>{{ row.cells[column.id]?.content || '未记录' }}</p>
        <div v-if="row.cells[column.id]?.images?.length" class="cell-thumb-grid">
          <div v-for="image in row.cells[column.id].images" :key="image.id" class="cell-thumb">
            <button class="thumb-preview" type="button" :aria-label="`查看${image.name || '图片'}大图`" @click="$emit('preview-image', image)">
              <img :src="image.previewUrl || image.dataUrl || image.url" :alt="image.name || '图片'" />
            </button>
          </div>
        </div>
        <span class="cell-time">{{ cellTime(row.cells[column.id]) }}</span>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatClock, formatDate } from '../utils.js';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  emptyMessage: { type: String, default: '这个月份没有可显示的日期。' }
});

defineEmits(['preview-image']);

const visibleRows = computed(() => props.rows.filter((row) => !row.isFuture));

function cellTime(cell) {
  return cell?.updated_at ? `最后修改 ${formatClock(cell.updated_at)}` : '未修改';
}
</script>
