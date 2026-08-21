import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import HistoryView from './views/HistoryView.vue';
import MembersView from './views/MembersView.vue';
import ProfileView from './views/ProfileView.vue';
import AdminView from './views/AdminView.vue';
import { useDailyLog, whenReady } from './state.js';

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

router.beforeEach(async (to) => {
  await whenReady();
  const { currentUser } = useDailyLog();
  const user = currentUser();

  if (to.meta.public) return true;
  if (!user) return '/login';
  if (to.meta.admin && user.role !== 'admin') return '/home';
  return true;
});

export default router;
