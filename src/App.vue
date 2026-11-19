<template>
    <div class="app">
        <TopBar />
        <main
            class="main"
            :class="{ stacked: chatLayout === 'bottom' || videoHidden, noVideo: videoHidden }"
        >
            <StagePanel />
            <ChatPanel />
        </main>
        <!-- 没有勾选「使用后台」时不显示后台日志 -->
        <BackendLogs v-if="useBackend" />
        <AppFooter />
    </div>
    <ResendDialog />
    <SettingsDialog />
</template>

<script setup lang="ts">
// 页面只负责组合各个部分；采集、推送、礼物等逻辑在 src/live 下
import { onBeforeUnmount, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import StagePanel from '@/components/StagePanel.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import BackendLogs from '@/components/BackendLogs.vue'
import AppFooter from '@/components/AppFooter.vue'
import ResendDialog from '@/components/ResendDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useBackend } from '@/live/settings'
import { chatLayout, videoHidden } from '@/live/player'
import { checkDouyinLoginOnce } from '@/live/login'
import { initGiftCatalog } from '@/live/gifts'
import { initBackendLogs, watchBackendRunning } from '@/live/backend'
import { initTikTokListener } from '@/live/tiktok'
import { installHotkeys } from '@/live/appWindow'

const cleanups: Array<() => void> = []

onMounted(async () => {
    cleanups.push(installHotkeys())
    // 定时确认后台是否在运行，没运行时不推送消息
    cleanups.push(watchBackendRunning())
    checkDouyinLoginOnce()
    // 某一项失败不影响其他项
    const results = await Promise.allSettled([
        initGiftCatalog(),
        initBackendLogs(),
        initTikTokListener(),
    ])
    results.forEach((r) => {
        if (r.status === 'fulfilled') cleanups.push(r.value)
        else console.error('初始化失败:', r.reason)
    })
})

onBeforeUnmount(() => {
    cleanups.forEach((cleanup) => cleanup())
})
</script>

<style scoped lang="scss">
.app {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--c-text);
    background-color: var(--c-bg);
    font-size: 13px;
}

.main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;

    // 弹幕在画面下方：上面画面，下面弹幕
    &.stacked {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(180px, 48%) minmax(0, 1fr);

        .chat {
            border-left: none;
            border-top: 1px solid var(--c-border);
        }
    }

    // 隐藏了画面：上面只剩主播信息，弹幕占满剩下的空间
    &.noVideo {
        grid-template-rows: auto minmax(0, 1fr);
    }
}
</style>
