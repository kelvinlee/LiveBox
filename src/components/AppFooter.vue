<template>
    <footer class="footer">
        <!-- 推送状态：鼠标移上去看详情 -->
        <span class="pushStatus" :class="pushStatus.level" :title="pushStatus.detail">
            <i class="dot"></i>{{ pushStatus.text }}
        </span>
        <span class="footerVersion">v{{ appVersion }}</span>
    </footer>
</template>

<script setup lang="ts">
import { pushStatus } from '@/live/pusher'
import { appVersion } from '@/live/appWindow'
</script>

<style scoped lang="scss">
.footer {
    flex-shrink: 0;
    height: 26px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--c-border);
    color: var(--c-text-3);
    font-size: 11px;
    user-select: none;

    .pushStatus {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: default;

        .dot {
            flex-shrink: 0;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: var(--c-text-3);
        }

        &.ok {
            color: var(--c-text-2);

            .dot {
                background-color: var(--c-ok);
            }
        }

        &.warn {
            color: var(--c-warn);

            .dot {
                background-color: var(--c-warn);
            }
        }

        &.error {
            color: var(--c-err);

            .dot {
                background-color: var(--c-err);
                animation: pushBlink 1.2s ease-in-out infinite;
            }
        }
    }

    .footerVersion {
        flex-shrink: 0;
        margin-left: auto;
        font-variant-numeric: tabular-nums;
    }
}

@keyframes pushBlink {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.3;
    }
}
</style>
