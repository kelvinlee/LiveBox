<template>
    <aside
        class="chat"
        @scroll.capture="onMsgScroll"
        @wheel.passive="markMsgUserAction"
        @touchmove.passive="markMsgUserAction"
        @keydown="markMsgUserAction"
        @pointerdown="onMsgPointerDown"
    >
        <!-- 消息列表 -->
        <!-- scroll 事件不冒泡，用捕获阶段监听消息列表的滚动 -->
        <!-- 翻看历史消息时，有新消息就提示，点击回到最新 -->
        <button
            v-if="!msgStickBottom"
            class="toLatest"
            @click="scrollToBottom(true)"
        >
            {{
                unreadMsgCount
                    ? `${unreadMsgCount > 99 ? '99+' : unreadMsgCount} 条新消息`
                    : '回到最新'
            }}
            <el-icon :size="12"><ArrowDown /></el-icon>
        </button>
        <div class="panelHead">
            <span class="panelTitle">消息</span>
            <span
                class="panelMeta"
                :title="msgTrimmed ? '消息较多，列表只保留最近的部分' : ''"
            >
                {{ msgCountText }}
            </span>
        </div>
        <!-- 消息筛选：可多选，不选任何类型即显示全部 -->
        <div class="msgFilter">
            <button
                class="chip"
                :class="{ active: !msgFilter.length }"
                @click="toggleMsgFilter(null)"
            >
                全部
            </button>
            <button
                v-for="f in MSG_FILTERS"
                :key="f.key"
                class="chip"
                :class="[f.key, { active: msgFilter.includes(f.key) }]"
                @click="toggleMsgFilter(f.key)"
            >
                {{ f.label }}
            </button>
        </div>
        <!-- 长列表优化 -->
        <DynamicScroller
            :items="visibleMessages"
            :min-item-size="28"
            class="chatList"
            id="liveMsg"
            :ref="setChatScroller"
            v-if="visibleMessages.length"
        >
            <template v-slot="{ item, active }">
                <DynamicScrollerItem
                    :item="item"
                    :active="active"
                    :size-dependencies="[item.name, item.msg]"
                    :data-index="item.id"
                >
                    <div class="msg" :class="item.type">
                        <span
                            class="msgName"
                            :class="{ clickable: item.user }"
                            :title="item.user ? '点击补发礼物' : ''"
                            @click="item.user && openResend(item)"
                        >
                            {{ item.name }}
                        </span>
                        <span class="msgText" v-html="item.msg"></span>
                    </div>
                </DynamicScrollerItem>
            </template>
        </DynamicScroller>
        <div v-else class="chatEmpty">
            {{ msgFilter.length ? '暂无符合筛选的消息' : '暂无消息' }}
        </div>
    </aside>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue'
import {
    MSG_FILTERS,
    markMsgUserAction,
    msgCountText,
    msgFilter,
    msgStickBottom,
    msgTrimmed,
    onMsgPointerDown,
    onMsgScroll,
    scrollToBottom,
    setChatScroller,
    toggleMsgFilter,
    unreadMsgCount,
    visibleMessages,
} from '@/live/messages'
import { openResend } from '@/live/gifts'
</script>

<style scoped lang="scss">
.chat {
    position: relative;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--c-border);

    // 回到最新消息
    .toLatest {
        position: absolute;
        left: 50%;
        bottom: 12px;
        z-index: 10;
        height: 28px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        transform: translateX(-50%);
        border: none;
        border-radius: 14px;
        background-color: var(--c-accent);
        color: var(--c-accent-text);
        font-size: 12px;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

        &:hover {
            background-color: var(--c-accent-hover);
        }
    }

    // 消息筛选
    .msgFilter {
        flex-shrink: 0;
        padding: 6px 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        border-bottom: 1px solid var(--c-border);
        user-select: none;

        .chip {
            height: 22px;
            padding: 0 9px;
            border: 1px solid var(--c-border);
            border-radius: 11px;
            background: transparent;
            color: var(--c-text-2);
            font-size: 12px;
            line-height: 20px;
            cursor: pointer;

            &:hover {
                background-color: var(--c-hover);
                color: var(--c-text);
            }

            &.active {
                border-color: var(--c-accent);
                background-color: var(--c-accent);
                color: var(--c-accent-text);
            }

            // 礼物选中时沿用礼物的琥珀色
            &.gift.active {
                border-color: var(--c-gift-bar);
                background-color: var(--c-gift-bar);
                color: #ffffff;
            }
        }
    }

    .chatEmpty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--c-text-3);
        font-size: 12px;
    }

    .chatList {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .msg {
        padding: 4px 14px;
        line-height: 1.5;
        word-break: break-all;

        .msgName {
            margin-right: 6px;
            color: var(--c-text-3);

            // 可以点击补发礼物
            &.clickable {
                cursor: pointer;

                &:hover {
                    color: var(--c-text);
                    text-decoration: underline;
                }
            }
        }

        .msgText {
            color: var(--c-text);
        }

        // 礼物：整行用独立的琥珀色突出
        &.gift {
            margin: 2px 8px;
            padding: 4px 6px 4px 8px;
            border-radius: 6px;
            border-left: 3px solid var(--c-gift-bar);
            background-color: var(--c-gift-bg);

            .msgName {
                color: var(--c-gift);
                opacity: 0.8;
            }

            .msgText {
                color: var(--c-gift);
                font-weight: 600;
            }
        }

        &.like,
        &.join,
        &.follow {
            .msgText {
                color: var(--c-text-3);
            }
        }
    }
}
</style>
