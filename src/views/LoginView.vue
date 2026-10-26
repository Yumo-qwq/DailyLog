<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <AppIcon name="book" class="login-book" />
        <h2>每一天，<br />都值得记一页。</h2>
        <p>把零散的学习，变成看得见的积累。<br />从今天的一行记录开始。</p>
        <ul class="login-features">
          <li><AppIcon name="table" /><span><strong>按主题记录</strong>文字与图片，放进同一页手账。</span></li>
          <li><AppIcon name="history" /><span><strong>留下真实足迹</strong>今天可以修改，历史只读。</span></li>
          <li><AppIcon name="users" /><span><strong>与伙伴一起坚持</strong>查看成员的打卡与学习记录。</span></li>
        </ul>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <div class="section-title">
          <h2>欢迎回来</h2>

        </div>
        <p class="muted login-intro">登录 DailyLog，查看或记录每天的学习。</p>
        <label class="field">
          <span>邮箱</span>
          <input v-model="email" type="email" placeholder="name@example.com" autocomplete="email" autocapitalize="none" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
        </label>
        <button class="button" type="submit" :disabled="loading">{{ loading ? '登录中…' : '进入 DailyLog' }}</button>
        <p class="login-help"><AppIcon name="lock" />账号由管理员邀请，暂不开放注册。</p>
      </form>
    </div>
  </section>
</template>

<script setup>
import AppIcon from '../components/AppIcon.vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDailyLog } from '../state.js';
import { notify } from '../toast.js';

const { login, currentUser } = useDailyLog();
const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    await login(email.value, password.value);
    router.push(currentUser()?.role === 'admin' ? '/members' : '/home');
  } catch (error) {
    notify('error', error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>
