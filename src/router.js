import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import HistoryView from './views/HistoryView.vue';
import MembersView from './views/MembersView.vue';
import ProfileView from './views/ProfileView.vue';
import AdminView from './views/AdminView.vue';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: LoginView, meta: { public: true, title: '登录' } },
  { path: '/home', component: DashboardView, meta: { title: '每日表格' } },
  { path: '/history', component: HistoryView, meta: { title: '历史记录' } },
  { path: '/members', component: MembersView, meta: { title: '成员' } },
  { path: '/profile', component: ProfileView, meta: { title: '个人资料' } },
  { path: '/admin', component: AdminView, meta: { admin: true, title: '管理员' } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const raw = localStorage.getItem('dailylog-state-v1');
  let currentUser = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      currentUser = parsed.users?.find((item) => item.id === parsed.sessionUserId) || null;
    } catch {
      currentUser = null;
    }
  }

  if (to.meta.public) return true;
  if (!currentUser) return '/login';
  if (to.meta.admin && currentUser.role !== 'admin') return '/home';
  return true;
});

export default router;
