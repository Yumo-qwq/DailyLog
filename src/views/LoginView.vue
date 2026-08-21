<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <div class="status ok">内部学习打卡监督系统</div>
        <h2>只允许当天修改，历史永久只读。</h2>
        <p class="muted">登录后可以看到每日表格、成员状态、热力图和历史记录。没有公开注册。</p>
        <div class="demo-list">
          <div v-for="member in state.users" :key="member.id" class="demo-item">
            <span>{{ member.display_name }}</span>
            <span class="muted">{{ member.email }}</span>
          </div>
        </div>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <div class="section-title">
          <h2>登录</h2>
          <span class="status muted">无注册入口</span>
        </div>
        <label class="field">
          <span>邮箱</span>
          <input v-model="email" type="email" placeholder="admin@dailylog.local" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" placeholder="123456" />
        </label>
        <button class="button" type="submit">登录</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDailyLog } from '../state.js';
import { notify } from '../toast.js';

const { state, login } = useDailyLog();
const router = useRouter();
const email = ref('admin@dailylog.local');
const password = ref('123456');

function submit() {
  try {
    login(email.value, password.value);
    router.push('/home');
  } catch (error) {
    notify('error', error.message || '登录失败');
  }
}
</script>
