<template>
    <div class="streamer-box" v-if="streamer" :id="'streamer_' + streamer.login">
        <div :class="{ 'streamer-title': true, 'is-live': streamer.is_live }">
            <div class="streamer-title-avatar" :style="'background-image: url(' + avatarUrl + ')'"></div>
            <div class="streamer-title-text">
                <h2>
                    <a :href="'https://twitch.tv/' + streamer.login" rel="noreferrer" target="_blank">
                        {{ streamer.display_name }}
                        <template v-if="streamer.login.toLowerCase() != streamer.display_name.toLowerCase()"> ({{ streamer.login }})</template>
                    </a>
                    <span v-if="streamer.is_live" class="streamer-live">live</span>
                </h2>
                <span class="streamer-title-subtitle">
                    <span class="streamer-vods-quality help" title="Quality">{{ quality }}</span
                    ><!-- quality -->
                    &middot;
                    <span class="streamer-vods-amount" title="Total vod amount">{{ $tc("vods", streamer.vods_list.length) }}</span
                    ><!-- vods -->
                    &middot;
                    <span class="streamer-vods-size" title="Total vod size">{{ formatBytes(streamer.vods_size) }}</span
                    ><!-- total size -->
                    &middot;
                    <span class="streamer-subbed-status">
                        <span v-if="streamer.api_getSubscriptionStatus">{{ $t("messages.subscribed") }}</span>
                        <span class="is-error" title="Could just be that subscriptions were made before this feature was implemented." v-else>
                            {{ $t('streamer.one-or-more-subscriptions-missing') }}
                        </span></span
                    ><!-- sub status -->
                    &middot;
                    <span class="streamer-type" title="Broadcaster type">
                        <span v-if="streamer.broadcaster_type">{{ streamer.broadcaster_type }}</span>
                        <span v-else>Free</span>
                    </span>
                    &middot;
                    <span class="streamer-sxe" title="Season and episode">
                        {{ streamer.current_season }}/{{ streamer.current_stream_number }}
                    </span>
                    <span class="streamer-title-tools">

                        <!-- edit -->
                        <router-link class="icon-button white" :to="{ name: 'Settings', params: { tab: 'channels' }, hash: '#channel_' + streamer.login }" title="Edit channel">
                            <span class="icon"><fa icon="pencil"></fa></span>
                        </router-link>

                        <span v-if="canAbortCapture">
                            <!-- abort recording -->
                            <button class="icon-button white" @click="abortCapture" title="Abort record">
                                <span class="icon"><fa icon="video-slash"></fa></span>
                            </button>
                        </span>

                        <span v-else>
                            <!-- force recording -->
                            <button class="icon-button white" @click="forceRecord" title="Force record">
                                <span class="icon"><fa icon="video"></fa></span>
                            </button>
                        </span>

                        <!-- dump playlist -->
                        <button class="icon-button white" @click="playlistRecord" title="Playlist record">
                            <span class="icon"><fa icon="play-circle"></fa></span>
                        </button>

                        <!-- download stuff -->
                        <button class="icon-button white" @click="videoDownloadMenu ? (videoDownloadMenu.show = true) : ''" title="Video download">
                            <span class="icon"><fa icon="download"></fa></span>
                        </button>

                        <!-- run cleanup -->
                        <button class="icon-button white" title="Clean up" @click="doChannelCleanup">
                            <span class="icon"><fa icon="trash"></fa></span>
                        </button>

                        <!-- refresh channel data -->
                        <button class="icon-button white" title="Refresh data" @click="doChannelRefresh">
                            <span class="icon"><fa icon="sync"></fa></span>
                        </button>

                        <!-- expand/collapse all vods -->
                        <button class="icon-button white" title="Expand/collapse all vods" @click="doToggleExpandVods">
                            <span class="icon"><fa :icon="toggleAllVodsExpanded ? 'chevron-up' : 'chevron-down'"></fa></span>
                        </button>
                    </span>
                </span>
            </div>
        </div>

        <div class="streamer-clips" v-if="streamer.clips_list && streamer.clips_list.length > 0">
            <div class="streamer-clips-title"><h3>{{ $t("messages.clips") }}</h3></div>
            <ul>
                <li v-for="clip in streamer.clips_list" :key="clip">
                    <a class="text-overflow" :href="clipLink(clip)" target="_blank">{{ clip }}</a>
                </li>
            </ul>
        </div>

        <div v-if="streamer.vods_list.length == 0" class="notice">{{ $t("messages.no_vods") }}</div>
        <div v-else>
            <vod-item
                v-for="vod in streamer.vods_list"
                :key="vod.basename"
                v-bind:vod="vod"
                @refresh="refresh"
                ref="vodItem"
            />
        </div>
        <modal-box ref="videoDownloadMenu" title="Video download">
            <div class="video-download-menu">
                <p>
                    {{ $t('messages.video_download_help') }}<br />
                    <span v-if="averageVodBitrate">Average bitrate: {{ averageVodBitrate / 1000 }} kbps</span>
                </p>
                <button class="button is-confirm" @click="fetchTwitchVods">
                    <span class="icon"><fa icon="download"></fa></span>
                    <span>{{ $t('vod.fetch-vod-list') }}</span>
                </button>
                <hr />
                <div class="video-download-menu-item" v-for="vod in twitchVods" :key="vod.id">
                    <h2>
                        <a :href="vod.url" rel="nofollow" target="_blank">{{ vod.created_at }}</a> ({{ vod.type }})
                    </h2>
                    <img :src="imageUrl(vod.thumbnail_url, 320, 240)" /><br />
                    <p>{{ vod.title }}</p>
                    <ul>
                        <li>{{ vod.duration }} ({{ parseTwitchDuration(vod.duration) }})</li>
                        <li>{{ formatNumber(vod.view_count, 0) }} views</li>
                        <li v-if="vod.muted_segments && vod.muted_segments.length > 0">
                            <span class="is-error">Muted segments: {{ vod.muted_segments.length }}</span>
                        </li>
                        <li>Estimated size: {{ formatBytes(((averageVodBitrate || 6000000) / 10) * parseTwitchDuration(vod.duration)) }}</li>
                    </ul>
                    <br />
                    <button class="button is-small is-confirm" @click="downloadVideo(vod.id.toString())">
                        <span class="icon"><fa icon="download"></fa></span>
                        <span>{{ $t("buttons.download") }}</span>
                    </button>
                </div>
            </div>
        </modal-box>
    </div>
    <div v-else>Invalid streamer</div>
</template>

<script lang="ts">
// import { TwitchAPI.Video } from "@/twitchapi.d";
import { defineComponent, ref } from "vue";
import VodItem from "@/components/VodItem.vue";
import ModalBox from "@/components/ModalBox.vue";

import { library } from "@fortawesome/fontawesome-svg-core";
import { faVideo, faPlayCircle, faVideoSlash, faDownload, faSync, faPencil } from "@fortawesome/free-solid-svg-icons";
// import { TwitchAPI } from "@/twitchapi";
import { Video } from "@common/TwitchAPI/Video";
import TwitchChannel from "@/core/channel";
import { useStore } from "@/store";
import { ApiResponse } from "@common/Api/Api";
library.add(faVideo, faPlayCircle, faVideoSlash, faDownload, faSync, faPencil);

export default defineComponent({
    name: "StreamerItem",
    emits: ["refresh"],
    props: {
        streamer: Object as () => TwitchChannel,
    },
    data: () => ({
        twitchVods: [] as Video[],
        toggleAllVodsExpanded: false,
    }),
    setup() {
        const videoDownloadMenu = ref<InstanceType<typeof ModalBox>>();
        const vodItem = ref<InstanceType<typeof VodItem>>();
        const store = useStore();
        return { videoDownloadMenu, store, vodItem };
    },
    mounted() {
        this.toggleAllVodsExpanded = this.areMostVodsExpanded;
    },
    methods: {
        refresh() {
            this.$emit("refresh");
        },
        async abortCapture() {
            // href="{{ url_for('api_jobs_kill', { 'job': 'capture_' ~ streamer.current_vod.basename }) }}"

            if (!this.streamer || !this.streamer.current_vod) return;

            if (!confirm("Abort record is unstable. Continue?")) return;

            let response;

            try {
                response = await this.$http.delete(`/api/v0/jobs/capture_${this.streamer.current_vod.basename}`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("abortCapture error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Killed", data);
        },
        async forceRecord() {
            if (!confirm("Force record is unstable. Continue?")) return;

            let response;

            try {
                response = await this.$http.post(`/api/v0/channels/${this.streamer?.login}/force_record`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("forceRecord error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Recorded", data);
        },
        async playlistRecord() {
            // href="{{ url_for('api_channel_dump_playlist', { 'username': streamer.display_name }) }}"

            if (!this.streamer || !this.streamer.current_vod) return;

            let response;

            try {
                response = await this.$http.get(`/api/v0/channels/${this.streamer.login}/dump_playlist`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("abortCapture error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Killed", data);
        },
        async fetchTwitchVods() {
            if (!this.streamer) return;
            let response;

            try {
                response = await this.$http.get(`/api/v0/twitchapi/videos/${this.streamer.login}`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("fetchTwitchVods error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Fetched", data);
            this.twitchVods = data.data;
        },
        async downloadVideo(id: string) {
            if (!this.streamer) return;

            let response;

            try {
                response = await this.$http.get(`/api/v0/channels/${this.streamer.login}/download/${id}`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("downloadVideo error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Downloaded", data);
        },
        async doChannelCleanup() {
            if (!this.streamer) return;

            if (!confirm("Do you want to clean up vods that don't meet your criteria? There is no undo.")) return;

            let response;

            try {
                response = await this.$http.post(`/api/v0/channels/${this.streamer.login}/cleanup`);
            } catch (error) {
                if (this.$http.isAxiosError(error)) {
                    console.error("doChannelCleanup error", error.response);
                    if (error.response && error.response.data && error.response.data.message) {
                        alert(error.response.data.message);
                    }
                }
                return;
            }

            const data = response.data;

            if (data.message) {
                alert(data.message);
            }

            console.log("Cleaned", data);
        },
        async doChannelRefresh() {
            if (!this.streamer) return;
            this.$http
                .post(`/api/v0/channels/${this.streamer.login}/refresh`)
                .then((response) => {
                    const json: ApiResponse = response.data;
                    if (json.message) alert(json.message);
                    console.log(json);
                    this.store.fetchStreamerList();
                })
                .catch((error) => {
                    if (this.$http.isAxiosError(error)) {
                        console.error("doChannelRefresh error", error.response);
                        if (error.response && error.response.data && error.response.data.message) {
                            alert(error.response.data.message);
                        }
                    }
                });
        },
        imageUrl(url: string, width: number, height: number) {
            return url.replace(/%\{width\}/g, width.toString()).replace(/%\{height\}/g, height.toString());
        },
        clipLink(name: string): string {
            return `${this.store.cfg<string>("basepath", "")}/saved_clips/${name}`;
        },
        doToggleExpandVods() {
            // loop through all vods and set the expanded state
            const vods = this.vodItem as unknown as typeof VodItem[];
            if (vods){
                for(const vod of vods) {
                    vod.minimized = this.toggleAllVodsExpanded;
                }
            }
            this.toggleAllVodsExpanded = !this.toggleAllVodsExpanded;
        }
    },
    computed: {
        quality(): string | undefined {
            if (!this.streamer || !this.streamer.quality) return "";
            return this.streamer.quality.join(", ");
        },
        averageVodBitrate(): number | undefined {
            if (!this.streamer) return;
            const vods = this.streamer.vods_list;
            const total = vods.reduce((acc, vod) => {
                if (!vod.video_metadata) return acc;
                return acc + vod.video_metadata.bitrate;
            }, 0);
            return total / vods.length;
        },
        canAbortCapture(): boolean {
            if (!this.streamer) return false;
            return this.streamer.is_live && this.store.jobList.some((job) => this.streamer && job.name.startsWith(`capture_${this.streamer.login}`));
        },
        avatarUrl() {
            if (!this.streamer) return;
            if (this.streamer.channel_data?.cache_avatar) return `${this.store.cfg<string>("basepath", "")}/cache/avatars/${this.streamer.channel_data.cache_avatar}`;
            return this.streamer.profile_image_url;
        },
        areMostVodsExpanded(): boolean {
            if (!this.streamer) return false;
            const vods = this.vodItem as unknown as typeof VodItem[];
            if (!vods) return false;
            return vods.filter((vod) => vod.minimized === false).length >= this.streamer.vods_list.length / 2;
        }
    },
    components: {
        VodItem,
        ModalBox,
    },
});
</script>

<style lang="scss" scoped>
.video-download-menu-item {
    background-color: rgba(0, 0, 0, 0.2);
    padding: 1em;
    &:not(:last-child) {
        margin-bottom: 1em;
    }
}

.streamer-clips {
    background-color: #2b2b2b;
    .streamer-clips-title {
        padding: 5px;
        background: #116d3c;
        color: #fff;
        h3 {
            font-size: 1.2em;
            margin: 0;
            padding: 0;
        }
    }
    ul {
        display: block;
        margin: 0;
        padding: 1em 2em;
    }
}
</style>
