<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>个人资料</h2>
      </div>

      <form class="profile-form" @submit.prevent="save">
        <label class="field">
          <span>昵称</span>
          <input v-model="form.display_name" />
        </label>

        <div class="field">
          <span>头像</span>
          <div class="profile-avatar-row">
            <div class="profile-avatar-preview">
              <img v-if="previewAvatar" :src="previewAvatar" :alt="form.display_name || '头像'" />
              <span v-else>{{ initials(form.display_name) }}</span>
            </div>

            <div class="profile-avatar-actions">
              <input ref="avatarInput" class="hidden-file-input" type="file" accept="image/*" @change="pickAvatar" />
              <div class="toolbar">
                <button class="button-secondary" type="button" @click="chooseAvatar">上传头像</button>
                <button v-if="form.avatar_url" class="button-ghost" type="button" @click="clearAvatar">移除头像</button>
              </div>
              <p class="muted">不需要填写地址，选图后会自动压缩。</p>
            </div>
          </div>
        </div>

        <button class="button" type="submit">保存</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useDailyLog } from '../state.js';
import { compressImage, initials } from '../utils.js';
import { notify } from '../toast.js';

const { currentUser, updateProfile } = useDailyLog();
const user = computed(() => currentUser());
const avatarInput = ref(null);
const form = reactive({
  display_name: user.value?.display_name || '',
  avatar_url: user.value?.avatar_url || ''
});

watch(
  user,
  (nextUser) => {
    form.display_name = nextUser?.display_name || '';
    form.avatar_url = nextUser?.avatar_url || '';
  },
  { immediate: true }
);

const previewAvatar = computed(() => form.avatar_url || '');

function chooseAvatar() {
  avatarInput.value?.click();
}

async function pickAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const processed = await compressImage(file, 320, 0.82, 200 * 1024);
    form.avatar_url = processed.dataUrl || processed.previewUrl || '';
    notify('success', '头像已选择，保存后生效');
  } catch (error) {
    notify('error', error.message || '头像处理失败');
  } finally {
    event.target.value = '';
  }
}

function clearAvatar() {
  form.avatar_url = '';
  if (avatarInput.value) avatarInput.value.value = '';
}

async function save() {
  if (!user.value) return;
  try {
    await updateProfile(user.value.id, {
      display_name: form.display_name,
      avatar_url: form.avatar_url
    });
    notify('success', '资料已保存');
  } catch (error) {
    notify('error', error.message || '资料保存失败');
  }
}
</script>
