<template>
  <section class="section login-section">
    <div class="section-inner login-grid">
      <div class="login-copy">
        <AppIcon name="lock" class="login-book" />
        <h2>新密码，<br />新的一页。</h2>
        <p>邮件链接验证通过后，在这里设置新密码。设置完成后请用新密码重新登录。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <div class="section-title"><h2>重置密码</h2></div>
        <p v-if="verifying" class="muted" role="status">正在验证邮件链接…</p>
        <template v-else-if="verified">
          <label class="field">
            <span>新密码</span>
            <input v-model="password" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <label class="field">
            <span>确认新密码</span>
            <input v-model="confirmation" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
          <button class="button" type="submit" :disabled="saving">{{ saving ? '保存中…' : '设置新密码' }}</button>
        </template>
        <p v-else class="form-error" role="alert">{{ errorMessage || '链接已失效，请重新申请验证邮件。' }}</p>
        <RouterLink class="auth-text-link" to="/forgot-password">重新发送验证邮件</RouterLink>
      </form>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { clearPasswordRecovery, getSession, hasVerifiedPasswordRecovery, onPasswordRecovery, signOut, updatePassword } from '../services/auth.js';
import { notify } from '../toast.js';

const router = useRouter();
const password = ref('');
const confirmation = ref('');
const verified = ref(hasVerifiedPasswordRecovery());
const verifying = ref(!verified.value);
const saving = ref(false);
const errorMessage = ref('');
let stopListening = null;
let verificationTimer = null;

onMounted(async () => {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (fragment.has('error') || fragment.has('error_code')) {
    verified.value = false;
    verifying.value = false;
    errorMessage.value = '验证链接已过期或失效，请重新发送邮件。';
    return;
  }

  stopListening = onPasswordRecovery((session) => {
    verified.value = Boolean(session?.user?.id);
    verifying.value = false;
    if (verificationTimer) clearTimeout(verificationTimer);
  });

  if (verified.value) return;
  try {
    const session = await getSession();
    if (!session && !hasVerifiedPasswordRecovery()) {
      verifying.value = false;
      errorMessage.value = '验证链接已过期或失效，请重新发送邮件。';
      return;
    }
  } catch {
    verifying.value = false;
    errorMessage.value = '暂时无法验证链接，请检查网络后重试。';
    return;
  }

  if (!verified.value) {
    verificationTimer = setTimeout(() => {
      verifying.value = false;
      errorMessage.value = '未能验证邮件链接，请重新发送邮件。';
    }, 10000);
  }
});

onUnmounted(() => {
  stopListening?.();
  if (verificationTimer) clearTimeout(verificationTimer);
});

async function submit() {
  errorMessage.value = '';
  if (!hasVerifiedPasswordRecovery()) {
    verified.value = false;
    errorMessage.value = '请先通过邮件链接验证身份。';
    return;
  }
  if (password.value.length < 6) {
    errorMessage.value = '密码至少需要 6 位。';
    return;
  }
  if (password.value !== confirmation.value) {
    errorMessage.value = '两次输入的密码不一致。';
    return;
  }

  saving.value = true;
  try {
    await updatePassword(password.value);
    clearPasswordRecovery();
    await signOut().catch(() => {});
    notify('success', '密码已更新，请使用新密码登录');
    await router.replace('/login');
  } catch (error) {
    errorMessage.value = error.message || '密码修改失败，请稍后重试';
  } finally {
    saving.value = false;
  }
}
</script>
