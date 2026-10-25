<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <AppIcon name="lock" class="login-book" />
        <h2>新的一页，<br />从这里开始。</h2>
        <p class="muted">设置你自己的登录密码，开启学习手账。密码只由你本人保管。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <div class="section-title">
          <h2>设置密码</h2>
          <span class="status muted">首次登录</span>
        </div>
        <label class="field">
          <span>新密码</span>
          <input v-model="password" type="password" autocomplete="new-password" minlength="6" required />
        </label>
        <label class="field">
          <span>确认密码</span>
          <input v-model="confirmation" type="password" autocomplete="new-password" minlength="6" required />
        </label>
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <button class="button" type="submit" :disabled="loading || !sessionReady">
          {{ loading ? '保存中...' : '保存密码并进入 DailyLog' }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup>
import AppIcon from '../components/AppIcon.vue';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getSession, updatePassword } from '../services/auth.js';
import { notify } from '../toast.js';

const router = useRouter();
const password = ref('');
const confirmation = ref('');
const errorMessage = ref('');
const sessionReady = ref(false);
const loading = ref(false);

onMounted(async () => {
  try {
    sessionReady.value = Boolean(await getSession());
    if (!sessionReady.value) errorMessage.value = '邀请链接已失效，请联系管理员重新发送邀请。';
  } catch (error) {
    errorMessage.value = error.message || '邀请链接无法使用';
  }
});

async function submit() {
  errorMessage.value = '';
  if (password.value.length < 6) {
    errorMessage.value = '密码至少需要 6 位。';
    return;
  }
  if (password.value !== confirmation.value) {
    errorMessage.value = '两次输入的密码不一致。';
    return;
  }

  loading.value = true;
  try {
    await updatePassword(password.value);
    notify('success', '密码已设置，现在可以使用邮箱登录');
    router.push('/home');
  } catch (error) {
    errorMessage.value = error.message || '密码设置失败，请重新打开邀请链接';
  } finally {
    loading.value = false;
  }
}
</script>
