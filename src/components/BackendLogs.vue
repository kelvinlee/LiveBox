<template>
    <section class="logs" :class="{ collapsed: logCollapsed }">
        <div class="panelHead">
            <span class="panelTitle">后台日志</span>
            <span class="panelMeta">{{ backendLogs.length }} 行</span>
            <div class="panelActions">
                <span class="textBtn" @click="clearLogs">清空</span>
                <span class="textBtn" @click="stopBackend">停止后台</span>
                <span
                    class="textBtn"
                    :class="{ disabled: backendRestarting }"
                    @click="restartBackend"
                >
                    {{ backendRestarting ? '重启中...' : '重启后台' }}
                </span>
                <span class="textBtn" @click="logCollapsed = !logCollapsed">
                    {{ logCollapsed ? '展开' : '收起' }}
                </span>
            </div>
        </div>
        <div
            v-show="!logCollapsed"
            class="logBody"
            ref="logBody"
            @scroll="onLogScroll"
        >
            <div
                v-for="log in backendLogs"
                :key="log.seq"
                class="logLine"
                :class="log.stream"
            >
                {{ log.line }}
            </div>
            <div v-if="!backendLogs.length" class="logEmpty">
                暂无日志，勾选「使用后台」并开始采集后，后台的输出会显示在这里
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
    backendLogVersion,
    backendLogs,
    backendRestarting,
    clearBackendLogs,
    logCollapsed,
    restartBackend,
    stopBackend,
} from '@/live/backend'

const logBody = ref<HTMLElement | null>(null)
// 是否自动滚动到底部：用户向上翻看时暂停，回到底部后恢复
let stickBottom = true

const onLogScroll = () => {
    const el = logBody.value
    if (!el) return
    stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
}

const clearLogs = () => {
    clearBackendLogs()
    stickBottom = true
}

// 有新日志时滚动到底部
watch(
    backendLogVersion,
    () => {
        if (!stickBottom) return
        nextTick(() => {
            const el = logBody.value
            if (el) el.scrollTop = el.scrollHeight
        })
    },
    { immediate: true },
)
</script>

<style scoped lang="scss">
.logs {
    flex-shrink: 0;
    height: 160px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--c-border);

    &.collapsed {
        height: auto;

        .panelHead {
            border-bottom: none;
        }
    }

    .logBody {
        flex: 1;
        min-height: 0;
        padding: 6px 14px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
        font-family: Consolas, 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.55;
        color: var(--c-text-2);

        .logLine {
            white-space: pre-wrap;
            word-break: break-all;

            &.stderr {
                color: var(--c-err);
            }

            &.system {
                color: var(--c-warn);
            }
        }

        .logEmpty {
            color: var(--c-text-3);
        }
    }
}
</style>
