<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <AppIcon name="lock" class="login-book" />
        <h2>找回密码，<br />从邮箱开始。</h2>
        <p>输入账号使用的邮箱。收到邮件后，打开其中的链接设置新密码。</p>
      </div>

      <form class="login-form" @submit.prevent="sendEmail">
        <div class="section-title"><h2>找回密码</h2></div>
        <p class="muted login-intro">验证链接会发送到你的登录邮箱。</p>
        <label class="field">
          <span>登录邮箱</span>
          <input v-model="email" type="email" autocomplete="email" autocapitalize="none" placeholder="name@example.com" required />
        </label>
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <p v-if="emailSent" class="password-feedback" role="status">如果该邮箱对应账号，验证邮件将发送到邮箱。请查看收件箱和垃圾邮件文件夹。</p>
        <button class="button" type="submit" :disabled="sending">{{ sending ? '发送中…' : emailSent ? '重新发送邮件' : '发送验证邮件' }}</button>
        <RouterLink class="auth-text-link" to="/login">返回登录</RouterLink>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { requestPasswordResetEmail } from '../services/auth.js';

const email = ref('');
const sending = ref(false);
const emailSent = ref(false);
const errorMessage = ref('');

async function sendEmail() {
  sending.value = true;
  errorMessage.value = '';
  try {
    await requestPasswordResetEmail(email.value);
    emailSent.value = true;
  } catch (error) {
    errorMessage.value = error.message || '邮件发送失败，请稍后重试';
  } finally {
    sending.value = false;
  }
}
</script>
