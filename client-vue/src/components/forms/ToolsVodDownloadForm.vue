<template>
    <form method="POST" @submit.prevent="submitForm">
        <div class="field">
            <label class="label" for="voddownload_url">VOD URL</label>
            <div class="control">
                <input class="input" type="text" v-model="formData.url" required id="voddownload_url" />
            </div>
        </div>

        <div class="field">
            <label class="label" for="voddownload_quality">Quality</label>
            <div class="control">
                <div class="select">
                    <select required v-model="formData.quality" id="voddownload_quality">
                        <option v-for="quality of VideoQualityArray" :key="quality">{{ quality }}</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="field form-submit">
            <div class="control">
                <button class="button is-confirm" type="submit">
                    <span class="icon"><fa icon="download"></fa></span>
                    <span>{{ $t('buttons.execute') }}</span>
                </button>
            </div>
            <div :class="formStatusClass">{{ formStatusText }}</div>
        </div>

        <div class="field" v-if="fileLink">
            <a :href="fileLink">{{ fileLink }}</a>
        </div>
    </form>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { VideoQualityArray } from "../../../../common/Defs";

import { library } from "@fortawesome/fontawesome-svg-core";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
library.add(faDownload);

export default defineComponent({
    name: "ToolsVodDownloadForm",
    emits: ["formSuccess"],
    setup() {
        return { VideoQualityArray };
    },
    data() {
        return {
            formStatusText: "Ready",
            formStatus: "",
            formData: {
                url: "",
                quality: "best",
            },
            fileLink: "",
        };
    },
    methods: {
        submitForm(event: Event) {
            this.formStatusText = this.$t("messages.loading");
            this.formStatus = "";

            this.$http
                .post(`/api/v0/tools/vod_download`, this.formData)
                .then((response) => {
                    const json = response.data;
                    this.formStatusText = json.message;
                    this.formStatus = json.status;
                    if (json.status == "OK") {
                        this.$emit("formSuccess", json);
                    }
                    if (json.data && json.data.web_path) {
                        this.fileLink = json.data.web_path;
                    }
                })
                .catch((err) => {
                    console.error("form error", err.response);
                    if (this.axios.isAxiosError(err) && err.response) {
                        if (err.response.data.status == "ERROR") {
                            this.formStatusText = err.response.data.message;
                            this.formStatus = err.response.data.status;
                        } else {
                            this.formStatusText = err.response.data;
                            this.formStatus = "ERROR";
                        }
                    }
                });

            /*
            fetch(`api/v0/tools/voddownload`, {
                method: 'POST',
                body: inputs
            })
            .then((response) => response.json())
            .then((json) => {
                this.formStatusText = json.message;
                this.formStatus = json.status;
                if(json.status == 'OK'){
                    this.$emit('formSuccess', json);
                }
                if(json.data && json.data.web_path){
                    this.fileLink = json.data.web_path;
                }
            }).catch((err) => {
                console.error("Error burn form", err);
                this.formStatusText = err;
                this.formStatus = 'ERROR';
            });
            */

            event.preventDefault();
            return false;
        },
    },
    computed: {
        formStatusClass(): Record<string, boolean> {
            return {
                "form-status": true,
                "is-error": this.formStatus == "ERROR",
                "is-success": this.formStatus == "OK",
            };
        },
    },
});
</script>
