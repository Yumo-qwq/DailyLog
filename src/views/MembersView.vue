<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>成员</h2>
        <span class="status muted">小型内部群体</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>角色</th>
              <th>状态</th>
              <th>连续</th>
              <th>小热力图</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.id">
              <td>{{ member.display_name }}</td>
              <td>{{ member.role }}</td>
              <td>{{ member.is_active ? '启用' : '禁用' }}</td>
              <td>{{ metricsForUser(member.id).streak }}</td>
              <td><CompactHeatmap :cells="heatmaps[member.id]" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import CompactHeatmap from '../components/CompactHeatmap.vue';
import { useDailyLog } from '../state.js';
import { buildHeatmap, todayKey } from '../utils.js';

const { state, metricsForUser } = useDailyLog();
const members = computed(() => state.users.filter((item) => item.is_active));
const heatmaps = computed(() => {
  const result = {};
  for (const member of members.value) {
    result[member.id] = buildHeatmap(state.checkins, member.id, 21, todayKey());
  }
  return result;
});
</script>
