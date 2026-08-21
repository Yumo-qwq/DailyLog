<template>
  <div class="heatmap-mini">
    <div
      v-for="cell in cells"
      :key="cell.key"
      class="heat-cell-mini"
      :data-level="cell.level"
      :title="`${cell.key} · ${cell.count}`"
    />
  </div>
</template>

<script setup>
defineProps({
  cells: {
    type: Array,
    default: () => []
  }
});
</script>
