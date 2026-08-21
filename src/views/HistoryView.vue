<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>历史记录</h2>
        <span class="status muted">只读</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>日期</th>
              <th>文字</th>
              <th>图片</th>
              <th>时长</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>{{ item.author }}</td>
              <td>{{ formatDate(item.date) }}</td>
              <td>{{ item.content || '暂无内容' }}</td>
              <td>{{ item.images.length }}</td>
              <td>{{ formatMinutes(item.study_minutes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useDailyLog } from '../state.js';
import { formatDate, formatMinutes } from '../utils.js';

const { state, getProfile } = useDailyLog();
const items = computed(() =>
  [...state.checkins]
    .sort((a, b) => `${b.date}T${b.updated_at}`.localeCompare(`${a.date}T${a.updated_at}`))
    .map((item) => ({
      ...item,
      author: getProfile(item.user_id)?.display_name || '未知'
    }))
);
</script>
