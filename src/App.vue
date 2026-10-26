<template>
  <a class="skip-link" href="#main-content">跳转到主要内容</a>
  <div class="app-shell" :class="{ 'auth-shell': isAuth }">
    <aside class="sidebar">
      <RouterLink class="brand" :to="user ? (isAdministrator ? '/members' : '/home') : '/login'" aria-label="DailyLog 首页">
        <div class="brand-mark"><AppIcon name="book" /></div>
        <div><div class="brand-title">DailyLog<span class="brand-dot">.</span></div><div class="brand-subtitle">每天一页，积累成章</div></div>
      </RouterLink>
      <nav v-if="!isAuth" class="nav" aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.to" class="nav-item" :to="item.to">
          <AppIcon :name="item.icon" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div v-if="!isAuth" class="sidebar-note"><AppIcon name="book" /><p v-if="isAdministrator">查看伙伴的每日记录。<br />见证每一步积累。</p><p v-else>记录今天的收获。<br />让每一步都有迹可循。</p></div>
      <div v-if="!isAuth" class="sidebar-footer">
        <RouterLink v-if="user" to="/profile" class="sidebar-user">
          <div class="avatar"><img v-if="user.avatar_url" :src="user.avatar_url" :alt="user.display_name" /><span v-else>{{ initials(user.display_name) }}</span></div>
          <div class="user-details"><strong>{{ user.display_name }}</strong><span>{{ user.role === 'admin' ? '管理员' : '学习成员' }}</span></div>
        </RouterLink>
        <button v-if="user" class="logout-button" type="button" @click="handleLogout"><AppIcon name="logout" /><span>退出登录</span></button>
      </div>
      <span v-else class="auth-nav-note">专注学习 · 认真记录</span>
    </aside>
    <main id="main-content" class="main" tabindex="-1">
      <header v-if="!isAuth" class="topbar">
        <div class="topbar-title"><h1>{{ title }}</h1><p>{{ description }}</p></div>
        <div class="today-label"><AppIcon name="calendar" /><span>{{ todayLabel }}</span></div>
      </header>
      <RouterView />
      <footer class="page-footer"><span>DailyLog · 每日学习记录</span><span>{{ isAdministrator ? '成员记录只读' : '今天可编辑，历史只读' }}</span></footer>
    </main>
  </div>
</template>
<script setup>
import { computed, watchEffect } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import AppIcon from './components/AppIcon.vue';
import { useDailyLog } from './state.js';
import { formatDate, initials, todayKey } from './utils.js';
const { currentUser, logout, clearDraft } = useDailyLog();
const route = useRoute();
const router = useRouter();
const user = computed(() => currentUser());
const isAdministrator = computed(() => user.value?.role === 'admin');
const isAuth = computed(() => Boolean(route.meta.public));
const title = computed(() => route.meta.title || 'DailyLog');
const todayLabel = computed(() => formatDate(todayKey()));
const descriptions = {
  '/home': '把今天学到的，留在今天这一页。',
  '/history': '翻阅过去的积累，看见自己的脚步。',
  '/members': '一起学习，也看见彼此的坚持。',
  '/profile': '管理你的昵称与头像。',
  '/admin': '邀请学习伙伴，管理成员账号。',
  '/forgot-password': '通过登录邮箱找回密码。',
  '/reset-password': '验证邮件链接后设置新密码。'
};
const description = computed(() => isAdministrator.value && route.path === '/members'
  ? '查看学习成员的每日打卡与修改记录。'
  : descriptions[route.path]);
const navigation = computed(() => [
  ...(!isAdministrator.value ? [
    { to: '/home', icon: 'table', label: '每日表格' },
    { to: '/history', icon: 'history', label: '历史记录' }
  ] : []),
  { to: '/members', icon: 'users', label: '学习成员' },
  { to: '/profile', icon: 'profile', label: '个人资料' },
  ...(isAdministrator.value ? [{ to: '/admin', icon: 'shield', label: '成员管理' }] : [])
]);
watchEffect(() => { document.title = title.value === 'DailyLog' ? 'DailyLog' : `DailyLog · ${title.value}`; });
async function handleLogout() {
  await clearDraft();
  await logout();
  router.push('/login');
}
</script>
