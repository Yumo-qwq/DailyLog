import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import HistoryView from './views/HistoryView.vue';
import MembersView from './views/MembersView.vue';
import ProfileView from './views/ProfileView.vue';
import AdminView from './views/AdminView.vue';
import SetPasswordView from './views/SetPasswordView.vue';
import ForgotPasswordView from './views/ForgotPasswordView.vue';
import ResetPasswordView from './views/ResetPasswordView.vue';
import { useDailyLog, whenReady } from './state.js';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: LoginView, meta: { public: true, title: '登录' } },
  { path: '/set-password', component: SetPasswordView, meta: { public: true, title: '设置密码' } },
  { path: '/forgot-password', component: ForgotPasswordView, meta: { public: true, title: '找回密码' } },
  { path: '/reset-password', component: ResetPasswordView, meta: { public: true, title: '重置密码' } },
  { path: '/home', component: DashboardView, meta: { title: '每日表格' } },
  { path: '/history', component: HistoryView, meta: { title: '历史记录' } },
  { path: '/members', component: MembersView, meta: { title: '学习成员' } },
  { path: '/profile', component: ProfileView, meta: { title: '个人资料' } },
  { path: '/admin', component: AdminView, meta: { admin: true, title: '管理员' } }
];

const router = createRouter({
  history: import.meta.env.MODE === 'android' ? createWebHashHistory('/assets/index.html') : createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  await whenReady();
  const { currentUser } = useDailyLog();
  const user = currentUser();

  if (!user) return '/login';
  if (to.meta.admin && user.role !== 'admin') return '/home';
  if (user.role === 'admin' && (to.path === '/home' || to.path === '/history')) return '/members';
  return true;
});

export default router;
