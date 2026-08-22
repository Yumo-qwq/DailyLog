<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">D</div>
        <div>
          <div class="brand-title">DailyLog</div>
          <div class="brand-subtitle">每日学习记录</div>
        </div>
      </div>

      <nav class="nav">
        <RouterLink class="nav-item" to="/home">每日表格</RouterLink>
        <RouterLink class="nav-item" to="/history">历史记录</RouterLink>
        <RouterLink class="nav-item" to="/members">成员</RouterLink>
        <RouterLink class="nav-item" to="/profile">个人资料</RouterLink>
        <RouterLink v-if="user?.role === 'admin'" class="nav-item" to="/admin">管理员</RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div>跨日锁定由数据库兜底。</div>
        <button v-if="user" class="button-ghost" type="button" @click="handleLogout">退出登录</button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <h1>{{ title }}</h1>
          <p>今天是 {{ todayLabel }}，所有历史记录跨日后只读。</p>
        </div>
        <div v-if="user" class="user-chip">
          <div v-if="user.avatar_url" class="avatar image-avatar">
            <img :src="user.avatar_url" :alt="user.display_name" />
          </div>
          <div v-else class="avatar">{{ initials(user.display_name) }}</div>
          <div>
            <div style="font-weight:700">{{ user.display_name }}</div>
            <div class="muted">{{ user.role }}</div>
          </div>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, watchEffect } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useDailyLog } from './state.js';
import { formatDate, initials, todayKey } from './utils.js';

const { currentUser, logout, clearDraft } = useDailyLog();
const route = useRoute();
const router = useRouter();

const user = computed(() => currentUser());
const title = computed(() => route.meta.title || 'DailyLog');
const todayLabel = computed(() => formatDate(todayKey()));

watchEffect(() => {
  document.title = title.value === 'DailyLog' ? 'DailyLog' : `DailyLog · ${title.value}`;
});

async function handleLogout() {
  clearDraft();
  await logout();
  router.push('/login');
}
</script>
