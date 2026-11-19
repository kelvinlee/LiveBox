<template>
    <div
        class="splitter"
        :class="[vertical ? 'row' : 'col', { dragging }]"
        :title="vertical ? '拖动调整画面高度，双击恢复默认' : '拖动调整弹幕宽度，双击恢复默认'"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @dblclick="reset"
    ></div>
</template>

<script setup lang="ts">
// 画面和弹幕之间的分隔条：叠在两块交界处，按住拖动修改两边的大小
import { ref } from 'vue'
import {
    CHAT_WIDTH_DEFAULT,
    VIDEO_RATIO_DEFAULT,
    chatWidth,
    clampChatWidth,
    clampVideoRatio,
    videoRatio,
} from '@/live/layout'

// vertical：弹幕在下方，上下拖；否则弹幕在右侧，左右拖
const props = defineProps<{ vertical: boolean }>()
const emit = defineEmits<{ (e: 'dragging', value: boolean): void }>()

const dragging = ref(false)

// 分隔条的父元素就是画面和弹幕所在的区域
const area = (el: HTMLElement) => (el.parentElement as HTMLElement).getBoundingClientRect()

const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    // 捕获指针：拖到视频上也不会丢
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging.value = true
    emit('dragging', true)
}

const onMove = (e: PointerEvent) => {
    if (!dragging.value) return
    const rect = area(e.currentTarget as HTMLElement)
    if (props.vertical) {
        if (rect.height > 0) {
            videoRatio.value = clampVideoRatio(((e.clientY - rect.top) / rect.height) * 100)
        }
    } else {
        chatWidth.value = clampChatWidth(rect.right - e.clientX, rect.width)
    }
}

const onUp = (e: PointerEvent) => {
    if (!dragging.value) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragging.value = false
    emit('dragging', false)
}

const reset = () => {
    if (props.vertical) videoRatio.value = VIDEO_RATIO_DEFAULT
    else chatWidth.value = CHAT_WIDTH_DEFAULT
}
</script>

<style scoped lang="scss">
// 位置用父元素上的 --chat-w / --video-h，和布局用的是同一个值
// 透明的拖动区域，比边框宽一点好抓；中间的细线在鼠标移上或拖动时变色
.splitter {
    position: absolute;
    z-index: 10;
    touch-action: none;

    &::after {
        content: '';
        position: absolute;
        background-color: transparent;
        transition: background-color 0.15s;
    }

    &:hover::after,
    &.dragging::after {
        background-color: var(--el-color-primary);
    }

    &.col {
        top: 0;
        bottom: 0;
        right: var(--chat-w);
        width: 8px;
        margin-right: -4px;
        cursor: col-resize;

        &::after {
            top: 0;
            bottom: 0;
            left: 3px;
            width: 2px;
        }
    }

    &.row {
        left: 0;
        right: 0;
        top: var(--video-h);
        height: 8px;
        margin-top: -4px;
        cursor: row-resize;

        &::after {
            left: 0;
            right: 0;
            top: 3px;
            height: 2px;
        }
    }
}
</style>
