<template>
    <header class="topbar">
        <!-- 顶栏：地址输入、采集控制、连接状态和工具按钮 -->
        <div class="brand">
            <svg class="brandMark" viewBox="180 180 664 664">
                <path
                    d="M756 512A244 244 0 1 1 662.2 319.7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="96"
                />
                <rect
                    x="540"
                    y="464"
                    width="259"
                    height="96"
                    fill="currentColor"
                />
                <circle cx="721" cy="386" r="42" fill="currentColor" />
            </svg>
            <span class="brandName">GiccooBox</span>
        </div>
        <div class="urlBar">
            <!-- 已保存的直播间 -->
            <el-popover
                v-model:visible="roomPopVisible"
                trigger="click"
                placement="bottom-start"
                :width="340"
                popper-class="roomPopper"
            >
                <template #reference>
                    <button class="btn roomBtn" title="已保存的直播间">
                        <span
                            v-if="activeRoom"
                            class="platformIcon"
                            :class="detectPlatform(activeRoom.url)"
                        >
                            {{ platformGlyph(detectPlatform(activeRoom.url)) }}
                        </span>
                        <span class="roomBtnText">
                            {{ activeRoom ? activeRoom.name : '直播间' }}
                        </span>
                        <el-icon :size="12"><ArrowDown /></el-icon>
                    </button>
                </template>
                <div class="roomPop">
                    <div class="roomPopHead">
                        <span class="roomPopTitle">直播间</span>
                        <span class="roomAct" @click="openRoomForm()">
                            + 新建
                        </span>
                    </div>
                    <div v-if="roomForm" class="roomForm">
                        <el-input
                            v-model="roomForm.name"
                            placeholder="名称，例如主播昵称"
                        />
                        <el-input
                            v-model="roomForm.url"
                            placeholder="直播间地址"
                        />
                        <div class="roomFormBtns">
                            <el-button size="small" @click="roomForm = null">
                                取消
                            </el-button>
                            <el-button
                                size="small"
                                type="primary"
                                @click="saveRoomForm"
                            >
                                保存
                            </el-button>
                        </div>
                    </div>
                    <div class="roomList">
                        <div
                            v-for="room in savedRooms"
                            :key="room.id"
                            class="roomItem"
                            :class="{ active: room.url === inputUrl.trim() }"
                            @click="selectRoom(room)"
                        >
                            <span
                                class="platformIcon"
                                :class="detectPlatform(room.url)"
                                :title="platformName(detectPlatform(room.url))"
                            >
                                {{ platformGlyph(detectPlatform(room.url)) }}
                            </span>
                            <div class="roomInfo">
                                <div class="roomName">
                                    <span class="roomNameText">
                                        {{ room.name }}
                                    </span>
                                    <!-- 是否正在直播 -->
                                    <span
                                        v-if="roomChecking === room.url"
                                        class="roomLive"
                                    >
                                        检查中
                                    </span>
                                    <span
                                        v-else-if="roomLive[room.url]"
                                        class="roomLive"
                                        :class="{ on: roomLive[room.url].live }"
                                    >
                                        {{
                                            roomLive[room.url].live
                                                ? '直播中'
                                                : '未开播'
                                        }}
                                    </span>
                                </div>
                                <div class="roomUrl">{{ room.url }}</div>
                            </div>
                            <span
                                class="roomAct"
                                @click.stop="openRoomForm(room)"
                            >
                                编辑
                            </span>
                            <span
                                class="roomAct"
                                @click.stop="removeRoom(room)"
                            >
                                删除
                            </span>
                        </div>
                        <div v-if="!savedRooms.length" class="roomEmpty">
                            还没有保存的直播间，点「新建」添加
                        </div>
                    </div>
                </div>
            </el-popover>
            <el-autocomplete
                class="urlInput"
                v-model="inputUrl"
                :fetch-suggestions="queryUrlHistory"
                placeholder="请输入直播间地址"
                :trigger-on-focus="true"
                clearable
                @select="(item: any) => (inputUrl = item.value)"
            />
            <!-- 开始采集：右侧下拉切换「开始采集 / 持续采集」，选择会记住 -->
            <div class="startGroup" :class="socketStatus">
                <button
                    class="btn start"
                    :class="socketStatus"
                    :title="
                        startMode === 'persist'
                            ? '主播没开播时持续检查，开播后自动开始采集'
                            : ''
                    "
                    @click="startListen()"
                >
                    {{ startButtonText }}
                </button>
                <el-dropdown
                    trigger="click"
                    placement="bottom-end"
                    @command="onStartCommand"
                >
                    <button class="btn start caret" :class="socketStatus">
                        <el-icon :size="12"><ArrowDown /></el-icon>
                    </button>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="once">
                                <span class="startModeItem">
                                    <b>开始采集</b>
                                    <small>只采集一次，没开播就提示</small>
                                </span>
                            </el-dropdown-item>
                            <el-dropdown-item command="persist">
                                <span class="startModeItem">
                                    <b>持续采集</b>
                                    <small>没开播就一直等，开播后自动开始</small>
                                </span>
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </div>
            <button class="btn" @click="stopCollect()">停止</button>
        </div>
        <div class="tools">
            <span class="status" :class="socketStatus">
                <i class="dot"></i>{{ socketStatusText }}
            </span>
            <!-- 抖音登录状态：点击打开设置 -->
            <span
                class="status login"
                :class="loginState.level"
                :title="loginState.detail"
                @click="settingsVisible = true"
            >
                <i class="dot"></i>{{ loginState.text }}
            </span>
            <!-- 弹幕位置：右侧 / 画面下方(竖屏用) -->
            <button
                class="iconBtn"
                :title="
                    chatLayout === 'side'
                        ? '弹幕放到画面下方(适合竖屏)'
                        : '弹幕放到画面右侧'
                "
                @click="toggleChatLayout"
            >
                <svg
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                >
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                    <line v-if="chatLayout === 'side'" x1="10" y1="2.5" x2="10" y2="13.5" />
                    <line v-else x1="1.5" y1="9" x2="14.5" y2="9" />
                </svg>
            </button>
            <!-- 隐藏/显示直播画面：隐藏时不播放视频 -->
            <button
                class="iconBtn"
                :class="{ off: videoHidden }"
                :title="videoHidden ? '显示直播画面' : '隐藏直播画面(停止播放)'"
                @click="toggleVideo"
            >
                <svg
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linejoin="round"
                >
                    <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
                    <path d="M10.5 7l4-2.2v6.4l-4-2.2" />
                    <line v-if="videoHidden" x1="1.5" y1="2" x2="14.5" y2="14" />
                </svg>
            </button>
            <button
                class="iconBtn"
                :title="isDark ? '切换到浅色' : '切换到深色'"
                @click="toggleTheme"
            >
                <el-icon :size="16">
                    <Sunny v-if="isDark" />
                    <Moon v-else />
                </el-icon>
            </button>
            <button
                class="iconBtn"
                title="设置"
                @click="settingsVisible = true"
            >
                <el-icon :size="16"><Setting /></el-icon>
            </button>
        </div>
    </header>
</template>

<script setup lang="ts">
import { ArrowDown, Moon, Setting, Sunny } from '@element-plus/icons-vue'
import { detectPlatform, platformGlyph, platformName } from '@/live/platform'
import { inputUrl, queryUrlHistory, settingsVisible } from '@/live/settings'
import { socketStatus, socketStatusText } from '@/live/state'
import { loginState } from '@/live/login'
import { isDark, toggleTheme } from '@/live/theme'
import { chatLayout, toggleChatLayout, toggleVideo, videoHidden } from '@/live/player'
import {
    activeRoom,
    openRoomForm,
    removeRoom,
    roomChecking,
    roomForm,
    roomLive,
    roomPopVisible,
    saveRoomForm,
    savedRooms,
    selectRoom,
} from '@/live/rooms'
import {
    onStartCommand,
    startButtonText,
    startListen,
    startMode,
    stopCollect,
} from '@/live/collect'
</script>

<style scoped lang="scss">
// ---------- 顶栏 ----------
.topbar {
    flex-shrink: 0;
    height: 56px;
    padding: 0 12px 0 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--c-border);

    .brand {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;

        .brandMark {
            width: 20px;
            height: 20px;
            color: var(--c-text);
        }

        .brandName {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.2px;
        }
    }

    .urlBar {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;

        .urlInput {
            flex: 1;
            min-width: 0;
        }

        .roomBtn {
            max-width: 150px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            gap: 6px;

            .roomBtnText {
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        // 写在外层：el-autocomplete 的根节点上没有 scoped 标记
        & {
            :deep(.el-input__wrapper) {
                height: 32px;
                border-radius: 6px;
                background-color: var(--c-soft);
                box-shadow: none;
                transition: box-shadow 0.15s;

                &.is-focus {
                    box-shadow: 0 0 0 1px var(--c-accent) inset;
                }
            }
        }
    }

    .tools {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 2px;

        .status {
            margin-right: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--c-text-3);
            font-size: 12px;
            white-space: nowrap;
            user-select: none;

            .dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background-color: var(--c-text-3);
            }

            &.connected {
                color: var(--c-text-2);

                .dot {
                    background-color: var(--c-ok);
                }
            }

            &.reconnecting,
            &.connecting {
                color: var(--c-warn);

                .dot {
                    background-color: var(--c-warn);
                }
            }

            &.waiting {
                color: #8b5cf6;

                .dot {
                    background-color: #8b5cf6;
                }
            }

            // 登录状态
            &.login {
                margin-right: 8px;
                cursor: pointer;

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
            }
        }
    }
}

// 窄窗口(竖屏)：顶栏分两行，第一行品牌和工具按钮，第二行直播间地址和采集按钮
// 放在 .topbar 的样式之后，才能覆盖 .urlBar 的 flex: 1
@media (max-width: 860px) {
    .topbar {
        height: auto;
        padding: 8px 12px;
        flex-wrap: wrap;
        row-gap: 8px;

        .brand {
            order: 1;
        }

        .tools {
            order: 2;
            margin-left: auto;
        }

        .urlBar {
            order: 3;
            flex: 1 1 100%;
        }
    }
}

// 开始采集 + 下拉切换采集方式
.startGroup {
    flex-shrink: 0;
    display: flex;

    > .btn.start {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }

    .btn.caret {
        min-width: 0;
        padding: 0 8px;
        border-left-color: rgba(255, 255, 255, 0.35);
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        display: flex;
        align-items: center;
    }
}

// ---------- 直播间列表(弹出层) ----------
.roomPop {
    font-size: 13px;
    color: var(--c-text);

    .roomPopHead {
        height: 38px;
        padding: 0 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--c-border);
        user-select: none;

        .roomPopTitle {
            font-weight: 600;
        }
    }

    .roomAct {
        flex-shrink: 0;
        color: var(--c-text-2);
        font-size: 12px;
        cursor: pointer;

        &:hover {
            color: var(--c-text);
        }
    }

    .roomForm {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-bottom: 1px solid var(--c-border);
        background-color: var(--c-soft);

        .roomFormBtns {
            display: flex;
            justify-content: flex-end;
        }
    }

    .roomList {
        max-height: 300px;
        padding: 6px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .roomItem {
        padding: 7px 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: 6px;
        cursor: pointer;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            background-color: var(--c-soft);
        }

        .roomInfo {
            flex: 1;
            min-width: 0;
        }

        .roomName {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;

            .roomNameText {
                min-width: 0;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
        }

        // 直播标记：直播中绿色，未开播/检查中灰色
        .roomLive {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 4px;
            color: var(--c-text-3);
            font-size: 11px;
            font-weight: 400;

            &::before {
                content: '';
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background-color: var(--c-text-3);
            }

            &.on {
                color: var(--c-ok);

                &::before {
                    background-color: var(--c-ok);
                }
            }
        }

        .roomUrl {
            margin-top: 1px;
            color: var(--c-text-3);
            font-size: 12px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }

    .roomEmpty {
        padding: 18px 8px;
        color: var(--c-text-3);
        text-align: center;
    }
}
</style>
