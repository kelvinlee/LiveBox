<template>
    <section class="stage">
        <!-- 主播信息 + 直播画面 -->
        <div class="anchorBar">
            <img :src="liveInfo.avatar" alt="头像" class="avatar" />
            <div class="anchorText">
                <div class="anchorName">{{ liveInfo.name }}</div>
                <div class="anchorTitle">{{ liveInfo.title }}</div>
            </div>
            <!-- 统计：每一项等宽、居中对齐 -->
            <div class="stats">
                <div class="stat" :title="durationTitle">
                    <span class="statValue">{{ durationText }}</span>
                    <span class="statLabel">
                        {{ liveStartAt && !liveStartKnown ? '已采集' : '开播时长' }}
                    </span>
                </div>
                <div v-for="s in stats" :key="s.label" class="stat" :title="s.title">
                    <span class="statValue">{{ s.value }}</span>
                    <span class="statLabel">{{ s.label }}</span>
                </div>
            </div>
        </div>
        <!-- 直播画面隐藏时只留一条提示 -->
        <div v-if="videoHidden" class="playerHidden">
            <span>
                直播画面已隐藏<template v-if="socketStatus === 'waiting'"
                    >，主播还没开播，等待中(已检查 {{ waitChecks }} 次)</template
                >
            </span>
            <button class="textBtn" @click="toggleVideo">显示画面</button>
        </div>
        <div v-show="!videoHidden" class="player">
            <!-- 视频播放器 -->
            <div id="dplayer" class="dplayer"></div>
            <!-- 清晰度：右上角，鼠标移到画面上时更明显 -->
            <el-dropdown
                v-if="qualities.length"
                class="qualityPicker"
                trigger="click"
                placement="bottom-end"
                :disabled="qualities.length < 2"
                @command="switchQuality"
            >
                <button
                    class="qualityBtn"
                    :title="qualities.length < 2 ? '这场直播只有这一种清晰度' : '切换清晰度'"
                >
                    {{ currentQualityName }}
                    <el-icon v-if="qualities.length > 1" :size="10"><ArrowDown /></el-icon>
                </button>
                <template #dropdown>
                    <el-dropdown-menu>
                        <el-dropdown-item
                            v-for="q in qualities"
                            :key="q.key"
                            :command="q.key"
                            :class="{ activeQuality: q.key === currentQuality }"
                        >
                            {{ q.name }}
                        </el-dropdown-item>
                    </el-dropdown-menu>
                </template>
            </el-dropdown>
            <!-- 持续采集：等待开播 -->
            <div v-if="socketStatus === 'waiting'" class="playerTip waitTip">
                <span class="waitTitle">
                    <i class="dot"></i>主播还没开播，等待中
                </span>
                <span>
                    每 {{ WAIT_LIVE_INTERVAL / 1000 }} 秒检查一次，开播后自动开始采集
                </span>
                <span>已检查 {{ waitChecks }} 次</span>
            </div>
            <div v-else-if="liveInfo.status === 0" class="playerTip">
                输入直播间地址，点击「开始采集」
            </div>
            <!-- 直播结束 -->
            <div v-else-if="liveInfo.status === 4" class="playerTip">
                直播已结束
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatCount, formatDuration } from '@/utils/format'
import {
    diamond,
    liveInfo,
    liveStartAt,
    liveStartKnown,
    socketStatus,
} from '@/live/state'
import { ArrowDown } from '@element-plus/icons-vue'
import {
    currentQuality,
    qualities,
    switchQuality,
    toggleVideo,
    videoHidden,
} from '@/live/player'

const currentQualityName = computed(
    () => qualities.value.find((q) => q.key === currentQuality.value)?.name || '清晰度',
)
import { WAIT_LIVE_INTERVAL, waitChecks } from '@/live/collect'

// 显示成「x.x万」时，鼠标移上去显示完整数字
const stat = (label: string, raw: unknown, unit = '') => {
    const value = formatCount(raw)
    const full = String(raw ?? '').trim()
    const exact = /^\d+$/.test(full) && full !== value
    return {
        label,
        value,
        title: exact ? `${Number(full).toLocaleString('zh-CN')}${unit}` : '',
    }
}
const stats = computed(() => [
    stat('在线观众', liveInfo.value.customer),
    stat('本场点赞', liveInfo.value.totalLike),
    stat('主播粉丝', liveInfo.value.fans),
    stat('主播收益', diamond.value, ' 钻'),
])

// 开播时长：有开播时间时每秒刷新一次
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
watch(
    liveStartAt,
    (start) => {
        if (timer) clearInterval(timer)
        timer = null
        now.value = Date.now()
        if (start) timer = setInterval(() => (now.value = Date.now()), 1000)
    },
    { immediate: true },
)
onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
})
const durationText = computed(() =>
    liveStartAt.value ? formatDuration(now.value - liveStartAt.value) : '--',
)
// 只有拿到了开播时间才显示提示
const durationTitle = computed(() =>
    liveStartAt.value && liveStartKnown.value
        ? `开播时间：${new Date(liveStartAt.value).toLocaleString('zh-CN', { hour12: false })}`
        : '',
)
</script>

<style scoped lang="scss">
@keyframes waitPulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.3;
    }
}

.stage {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;

    .anchorBar {
        flex-shrink: 0;
        height: 60px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        gap: 10px;

        .avatar {
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            object-fit: cover;
            background-color: var(--c-soft);
        }

        .anchorText {
            flex: 1;
            min-width: 0;

            .anchorName {
                font-size: 14px;
                font-weight: 600;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .anchorTitle {
                margin-top: 2px;
                color: var(--c-text-3);
                font-size: 12px;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
        }

        // 每一项等宽、数字和文字都居中，数字变长变短时不会左右跳
        .stats {
            flex-shrink: 0;
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: 76px;
            gap: 4px;
            user-select: none;

            .stat {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
            }

            .statValue {
                max-width: 100%;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.3;
                font-variant-numeric: tabular-nums;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .statLabel {
                margin-top: 1px;
                color: var(--c-text-3);
                font-size: 11px;
            }
        }
    }

    .playerHidden {
        flex-shrink: 0;
        margin: 0 16px 12px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border: 1px dashed var(--c-border);
        border-radius: 8px;
        color: var(--c-text-3);
        font-size: 12px;

        .textBtn {
            flex-shrink: 0;
            border: none;
            background: transparent;
            color: var(--c-text-2);
            font-size: 12px;
            cursor: pointer;

            &:hover {
                color: var(--c-text);
                text-decoration: underline;
            }
        }
    }

    .player {
        position: relative;
        flex: 1;
        min-height: 0;
        margin: 0 16px 16px;
        border-radius: 8px;
        background-color: #000000;
        overflow: hidden;

        .dplayer {
            width: 100%;
            height: 100%;
        }

        // 清晰度按钮：叠在画面右上角，平时半透明
        .qualityPicker {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 5;
            opacity: 0.55;
            transition: opacity 0.15s;
        }

        &:hover .qualityPicker {
            opacity: 1;
        }

        .qualityBtn {
            height: 24px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            gap: 3px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 4px;
            background-color: rgba(0, 0, 0, 0.55);
            color: #ffffff;
            font-size: 12px;
            cursor: pointer;

            &:hover {
                background-color: rgba(0, 0, 0, 0.75);
            }
        }

        .playerTip {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #8a8a8a;
            font-size: 13px;
            user-select: none;
            pointer-events: none;

            // 等待开播
            &.waitTip {
                flex-direction: column;
                gap: 6px;
                font-size: 12px;

                .waitTitle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #d4d4d4;
                    font-size: 14px;
                }

                .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background-color: #8b5cf6;
                    animation: waitPulse 1.6s ease-in-out infinite;
                }
            }
        }
    }
}
</style>
