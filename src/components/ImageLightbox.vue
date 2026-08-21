<template>
  <div
    v-if="image?.src"
    ref="frame"
    class="image-lightbox"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    @click.self="$emit('close')"
    @keydown.esc="$emit('close')"
  >
    <button class="image-lightbox-close" type="button" aria-label="关闭大图" @click="$emit('close')">×</button>
    <div class="image-lightbox-stage">
      <img class="image-lightbox-img" :src="image.src" :alt="image.alt || '图片'" />
    </div>
    <div v-if="image.name" class="image-lightbox-caption">{{ image.name }}</div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  image: {
    type: Object,
    default: null
  }
});

defineEmits(['close']);

const frame = ref(null);
const previousOverflow = ref('');

watch(
  () => props.image?.src,
  async (src) => {
    if (!src) {
      document.body.style.overflow = previousOverflow.value;
      return;
    }
    previousOverflow.value = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    frame.value?.focus();
  }
);

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow.value;
});
</script>
