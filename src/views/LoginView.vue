<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <div class="status ok">内部学习打卡监督系统</div>
        <h2>只允许当天修改，历史永久只读。</h2>
        <p class="muted">登录后可以看到每日表格、成员页里的热力图和日志，以及历史记录。账号由管理员创建，没有公开注册。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <div class="section-title">
          <h2>登录</h2>
          <span class="status muted">无注册入口</span>
        </div>
        <label class="field">
          <span>用户名</span>
          <input v-model="username" type="text" placeholder="username" autocomplete="username" autocapitalize="none" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <button class="button" type="submit" :disabled="loading">{{ loading ? '登录中...' : '登录' }}</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDailyLog } from '../state.js';
import { notify } from '../toast.js';

const { login } = useDailyLog();
const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    await login(username.value, password.value);
    router.push('/home');
  } catch (error) {
    notify('error', error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>
