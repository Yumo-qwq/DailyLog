<template>
  <div class="contribution-heatmap" role="img" :style="{ '--heat-weeks': weekColumns.length }" :aria-label="`近 ${weekColumns.length} 周有 ${activeDays} 天修改了科目，共 ${subjectDays} 科目次。颜色按每天修改的科目数分为 0、1、2、3、4 门及以上`">
    <div class="contribution-months" aria-hidden="true">
      <span
        v-for="marker in monthMarkers"
        :key="marker.column"
        class="contribution-month"
        :style="{ gridColumn: marker.column }"
      >{{ marker.label }}</span>
    </div>
    <div class="contribution-chart" aria-hidden="true">
      <div class="contribution-weekdays"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span></div>
      <div class="contribution-weeks">
        <div v-for="(week, index) in weekColumns" :key="index" class="contribution-week">
          <span
            v-for="cell in week"
            :key="cell.key"
            class="contribution-day"
            :class="{ 'is-today': cell.isToday, 'is-future': cell.isFuture }"
            :data-level="cell.level"
            :title="dayTitle(cell)"
          ></span>
        </div>
      </div>
    </div>
    <div class="contribution-footer" aria-hidden="true">
      <span>近 {{ weekColumns.length }} 周 · {{ activeDays }} 天有修改</span>
      <span class="contribution-legend">少 <span v-for="level in [0, 1, 2, 3, 4]" :key="level" :data-level="level"></span> 多</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate } from '../utils.js';

const props = defineProps({
  cells: { type: Array, default: () => [] }
});

const weekColumns = computed(() => {
  const weeks = [];
  for (let index = 0; index < props.cells.length; index += 7) weeks.push(props.cells.slice(index, index + 7));
  return weeks;
});

const monthMarkers = computed(() => {
  const boundaries = weekColumns.value.flatMap((week, index) => {
    const firstOfMonth = week.find((cell) => cell.key.endsWith('-01'));
    return firstOfMonth ? [{ column: index + 1, label: `${Number(firstOfMonth.key.slice(5, 7))}月` }] : [];
  });
  if (!boundaries.length || boundaries[0].column > 2) {
    const firstDate = weekColumns.value[0]?.[0]?.key;
    if (firstDate) boundaries.unshift({ column: 1, label: `${Number(firstDate.slice(5, 7))}月` });
  }
  return boundaries;
});

const activeDays = computed(() => props.cells.filter((cell) => cell.count > 0).length);
const subjectDays = computed(() => props.cells.reduce((total, cell) => total + cell.count, 0));

function dayTitle(cell) {
  if (cell.isFuture) return `${formatDate(cell.key)} · 未到`;
  return `${formatDate(cell.key)} · ${cell.count ? `修改 ${cell.count} 门科目` : '没有科目修改'}`;
}
</script>
