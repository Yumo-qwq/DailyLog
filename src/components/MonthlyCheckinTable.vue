<template>
  <div class="table-wrap">
    <table class="data-table learning-table member-table">
      <thead>
        <tr>
          <th class="date-column">日期</th>
          <th v-for="column in columns" :key="column.id" class="learning-column">
            <div class="column-head">
              <span>{{ column.name }}</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.date" :class="{ today: row.isToday, future: row.isFuture }">
          <td class="date-cell">
            <strong>{{ formatDate(row.date) }}</strong>
            <span v-if="row.isToday" class="status ok">今天</span>
            <span v-else-if="row.isFuture" class="status muted">未到</span>
            <span v-else class="status muted">锁定</span>
          </td>

          <td v-for="column in columns" :key="column.id" class="learning-cell">
            <div class="cell-block readonly-cell">
              <div class="cell-content">{{ row.cells[column.id]?.content || '-' }}</div>

              <div v-if="row.cells[column.id]?.images?.length" class="cell-thumb-grid">
                <div v-for="image in row.cells[column.id].images" :key="image.id" class="cell-thumb">
                  <button
                    class="thumb-preview"
                    type="button"
                    :aria-label="`查看${image.name || '图片'}大图`"
                    @click="$emit('preview-image', image)"
                  >
                    <img :src="image.previewUrl || image.dataUrl || image.url" :alt="image.name || '图片'" />
                  </button>
                </div>
              </div>

              <div class="cell-footer">
                <span class="cell-time">{{ cellTime(row, column.id) }}</span>
              </div>
            </div>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="Math.max(columns.length + 1, 1)" class="empty">这个月份没有可显示的日期。</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { formatClock, formatDate } from '../utils.js';

defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    default: () => []
  }
});

defineEmits(['preview-image']);

function cellTime(row, columnId) {
  const cell = row.cells?.[columnId];
  if (cell?.updated_at) return `最后修改 ${formatClock(cell.updated_at)}`;
  return '未修改';
}
</script>
