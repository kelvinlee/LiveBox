<template>
    <el-dialog v-model="resendVisible" title="补发礼物" width="520">
        <!-- 补发礼物 -->
        <div class="resend">
            <!-- 两套礼物：抖音 / TikTok -->
            <div class="platformTabs">
                <span
                    v-for="p in PLATFORMS"
                    :key="p"
                    class="platformTab"
                    :class="{ active: resendPlatform === p }"
                    @click="switchResendPlatform(p)"
                >
                    <span class="platformIcon" :class="p">
                        {{ platformGlyph(p) }}
                    </span>
                    {{ platformName(p) }}礼物
                    <span class="platformCount">
                        {{ giftCatalogs[p].length }}
                    </span>
                </span>
            </div>
            <div class="resendUser">
                <img
                    v-if="resendTarget.avatar"
                    :src="resendTarget.avatar"
                    alt="头像"
                    class="resendAvatar"
                />
                <span class="resendLabel">补发给</span>
                <span class="resendName">{{ resendTarget.name }}</span>
            </div>
            <el-input
                v-model="giftKeyword"
                placeholder="搜索礼物"
                clearable
            />
            <!-- 收到过的礼物种类 -->
            <div class="giftGrid">
                <div
                    v-for="gift in filteredGifts"
                    :key="gift.id"
                    class="giftTile"
                    :class="{ active: gift.id === resendGiftId }"
                    @click="resendGiftId = gift.id"
                >
                    <img
                        v-if="gift.icon"
                        :src="gift.icon"
                        alt=""
                        class="giftIcon"
                    />
                    <div v-else class="giftIcon"></div>
                    <div class="giftName">{{ gift.name }}</div>
                    <div class="giftPrice">{{ gift.diamondCount }} 钻</div>
                </div>
                <div v-if="!filteredGifts.length" class="giftEmpty">
                    {{
                        giftCatalogs[resendPlatform].length
                            ? '没有匹配的礼物'
                            : '还没有收到过礼物，采集到的礼物种类会自动记录在这里'
                    }}
                </div>
            </div>
            <div class="resendCount">
                <span class="resendLabel">数量</span>
                <el-input-number
                    v-model="resendCount"
                    :min="1"
                    :max="9999"
                    :precision="0"
                />
                <span v-if="selectedGift" class="resendTotal">
                    {{ selectedGift.name }} x{{ resendCount }}，合计
                    {{ selectedGift.diamondCount * resendCount }} 钻
                </span>
            </div>
        </div>
        <template #footer>
            <el-button @click="resendVisible = false">取消</el-button>
            <el-button
                type="primary"
                :loading="resendSending"
                :disabled="!selectedGift"
                @click="sendResend"
            >
                补发
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { PLATFORMS, platformGlyph, platformName } from '@/live/platform'
import {
    filteredGifts,
    giftCatalogs,
    giftKeyword,
    resendCount,
    resendGiftId,
    resendPlatform,
    resendSending,
    resendTarget,
    resendVisible,
    selectedGift,
    sendResend,
    switchResendPlatform,
} from '@/live/gifts'
</script>

<style scoped lang="scss">
.platformTabs {
    display: flex;
    gap: 6px;

    .platformTab {
        height: 30px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--c-border);
        border-radius: 6px;
        color: var(--c-text-2);
        font-size: 13px;
        cursor: pointer;
        user-select: none;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            border-color: var(--c-accent);
            color: var(--c-text);
            font-weight: 600;
        }

        .platformCount {
            color: var(--c-text-3);
            font-size: 11px;
            font-weight: 400;
        }
    }
}

// ---------- 补发礼物弹窗 ----------
.resend {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;

    .resendLabel {
        flex-shrink: 0;
        color: var(--c-text-2);
    }

    .resendUser {
        display: flex;
        align-items: center;
        gap: 8px;

        .resendAvatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            object-fit: cover;
            background-color: var(--c-soft);
        }

        .resendName {
            font-size: 14px;
            font-weight: 600;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }

    .giftGrid {
        height: 232px;
        padding: 6px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
        grid-auto-rows: min-content;
        gap: 6px;
        border: 1px solid var(--c-border);
        border-radius: 8px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .giftTile {
        padding: 8px 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            border-color: var(--c-accent);
            background-color: var(--c-soft);
        }

        .giftIcon {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }

        .giftName {
            max-width: 100%;
            margin-top: 6px;
            font-size: 12px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .giftPrice {
            margin-top: 1px;
            color: var(--c-text-3);
            font-size: 11px;
        }
    }

    .giftEmpty {
        grid-column: 1 / -1;
        padding: 80px 12px 0;
        color: var(--c-text-3);
        text-align: center;
    }

    .resendCount {
        display: flex;
        align-items: center;
        gap: 10px;

        .resendTotal {
            color: var(--c-text-2);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }
}
</style>
