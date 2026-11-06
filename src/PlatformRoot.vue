<template>
    <div class="platform-root">
        <nav class="platform-nav" aria-label="采集平台">
            <el-button :type="platform === 'douyin' ? 'primary' : 'default'" :disabled="switching" @click="switchTo('douyin')">抖音</el-button>
            <el-button :type="platform === 'tiktok' ? 'primary' : 'default'" :disabled="switching" @click="switchTo('tiktok')">TikTok</el-button>
        </nav>
        <main class="platform-content">
            <DouyinLive v-if="platform === 'douyin'" ref="douyin" />
            <TikTokLive v-else ref="tiktok" />
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import DouyinLive from './App.vue'
import TikTokLive from './components/TikTokLive.vue'

const platform = ref<'douyin' | 'tiktok'>('douyin')
const switching = ref(false)
const douyin = ref<{ stop: () => Promise<void> }>()
const tiktok = ref<{ stop: () => Promise<void> }>()
async function switchTo(next: 'douyin' | 'tiktok') {
    if (next === platform.value || switching.value) return
    switching.value = true
    try {
        await (platform.value === 'douyin' ? douyin.value : tiktok.value)?.stop()
        platform.value = next
    } catch (error) {
        ElMessage.error(`停止采集失败：${String(error)}`)
    } finally {
        switching.value = false
    }
}
</script>

<style scoped>
.platform-root { height: 100%; display: flex; flex-direction: column; }
.platform-nav { padding: 8px 20px; display: flex; gap: 8px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.platform-content { flex: 1; min-height: 0; position: relative; }
</style>
