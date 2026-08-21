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
        <label class="field">
          <span>头像地址</span>
          <input v-model="form.avatar_url" />
        </label>
        <button class="button" type="submit">保存</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { reactive } from 'vue';
import { useDailyLog } from '../state.js';
import { notify } from '../toast.js';

const { currentUser, updateProfile } = useDailyLog();
const user = currentUser();
const form = reactive({
  display_name: user.display_name,
  avatar_url: user.avatar_url || ''
});

function save() {
  updateProfile(user.id, { ...form });
  notify('success', '资料已保存');
}
</script>
