<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name] || paths.book" />
  </svg>
</template>
<script setup>
defineProps({ name: { type: String, default: 'book' } });
const paths = {
  book: 'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm0 14h16M8 3v14M12 7h4M12 11h4',
  table: 'M4 4h16v16H4V4Zm0 5h16M9 9v11',
  history: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  profile: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
  logout: 'M9 4H4v16h5M14 8l4 4-4 4M8 12h12',
  calendar: 'M4 5h16v16H4V5Zm0 5h16M8 3v4M16 3v4M8 14h2M14 14h2',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  check: 'm5 12 4 4L19 6',
  lock: 'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4M12 14v3',
  image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M16 7h.01'
};
</script>
