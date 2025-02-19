import axios from "axios";
import chalk from "chalk";
import chokidar from "chokidar";
import { format, parse, parseJSON } from "date-fns";
import fs from "fs";
import { encode as htmlentities } from "html-entities";
import path from "path";
import { trueCasePathSync } from "true-case-path";
import { ApiVod } from "../../../common/Api/Client";
import type { TwitchComment, TwitchCommentDump } from "../../../common/Comments";
import { VideoQuality } from "../../../common/Config";
import { JobStatus, MuteStatus } from "../../../common/Defs";
import { AudioStream, FFProbe, VideoStream } from "../../../common/FFProbe";
import { AudioMetadata, VideoMetadata } from "../../../common/MediaInfo";
import { MediaInfo } from "../../../common/mediainfofield";
import { Clip, ClipsResponse } from "../../../common/TwitchAPI/Clips";
import { EventSubResponse } from "../../../common/TwitchAPI/EventSub";
import { Video, VideosResponse } from "../../../common/TwitchAPI/Video";
import { VodUpdated } from "../../../common/Webhook";
import { replaceAll } from "../Helpers/ReplaceAll";
import { TwitchVODChapterJSON, TwitchVODJSON } from "../Storage/JSON";
import { AppName, BaseConfigDataFolder } from "./BaseConfig";
import { ClientBroker } from "./ClientBroker";
import { Config } from "./Config";
import { FFmpegMetadata } from "./FFmpegMetadata";
import { Helper } from "./Helper";
import { Job } from "./Job";
import { Log, LOGLEVEL } from "./Log";
import { TwitchChannel } from "./TwitchChannel";
import { TwitchGame } from "./TwitchGame";
import { TwitchVODChapter } from "./TwitchVODChapter";
import { TwitchVODSegment } from "./TwitchVODSegment";
import { Webhook } from "./Webhook";

export class TwitchVOD {

    static vods: TwitchVOD[] = [];

    static filenameIllegalChars = /[:*?"<>|]/g;

    // vod_path = "vods";

    loaded = false;

    capture_id = "";
    filename = "";
    basename = "";
    directory = "";

    json?: TwitchVODJSON;
    meta?: EventSubResponse;

    streamer_name = "";
    streamer_id = "";
    streamer_login = "";

    /**
     * An array of strings containing the file paths of the segments.
     */
    segments_raw: string[] = [];
    segments: TwitchVODSegment[] = [];

    chapters_raw: TwitchVODChapterJSON[] = [];
    chapters: TwitchVODChapter[] = [];

    /**
     * Date for when the VOD was created
     */
    created_at?: Date;

    /**
     * Date for when the stream was started on the provider's end.
     */
    started_at?: Date;
    ended_at?: Date;
    saved_at?: Date;

    /**
     * Date for when the capture process was launched
     */
    capture_started?: Date;

    /**
     * Date for when the capture file was output
     */
    capture_started2?: Date;
    conversion_started?: Date;

    twitch_vod_id?: string;
    twitch_vod_duration?: number;
    twitch_vod_title?: string;
    twitch_vod_date?: string;
    twitch_vod_muted?: MuteStatus;
    // twitch_vod_status?: ExistStatus;
    twitch_vod_neversaved?: boolean;
    twitch_vod_exists?: boolean;
    twitch_vod_attempted?: boolean;

    video_metadata: VideoMetadata | AudioMetadata | undefined;

    is_capturing = false;
    is_converting = false;
    is_finalized = false;

    // game_offset: number | undefined;

    duration = 0;
    total_size = 0;

    path_chat = "";
    path_downloaded_vod = "";
    path_losslesscut = "";
    path_chatrender = "";
    path_chatmask = "";
    path_chatburn = "";
    path_chatdump = "";
    path_adbreak = "";
    path_playlist = "";
    path_ffmpegchapters = "";
    path_vttchapters = "";
    path_kodinfo = "";

    force_record = false;

    stream_resolution: VideoQuality | undefined;
    stream_title = "";

    // duration_live: number | undefined;
    created = false;
    not_started = false;

    webpath = "";

    stream_number?: number;

    comment?: string;

    prevent_deletion = false;

    failed = false;

    /*
    public ?bool $api_hasFavouriteGame = null;
    public ?array $api_getUniqueGames = null;
    public ?string $api_getWebhookDuration = null;
    public ?int $api_getDuration = null;
    public $api_getCapturingStatus = null;
    public ?int $api_getRecordingSize = null;
    public ?int $api_getChatDumpStatus = null;
    public ?int $api_getDurationLive = null;
    */

    /*private*/ public _writeJSON = false;

    fileWatcher?: chokidar.FSWatcher;

    private _updateTimer: NodeJS.Timeout | undefined;

    /**
     * Set up date related data
     * Requires JSON to be loaded
     */
    public setupDates(): void {

        if (!this.json) {
            throw new Error("No JSON loaded for date setup!");
        }

        if (this.json.created_at) this.created_at = parseJSON(this.json.created_at);
        if (this.json.started_at) this.started_at = parseJSON(this.json.started_at);

        if (this.json.ended_at) this.ended_at = parseJSON(this.json.ended_at);
        if (this.json.saved_at) this.saved_at = parseJSON(this.json.saved_at);

        if (this.json.capture_started) this.capture_started = parseJSON(this.json.capture_started);
        if (this.json.capture_started2) this.capture_started2 = parseJSON(this.json.capture_started2);
        if (this.json.conversion_started) this.conversion_started = parseJSON(this.json.conversion_started);

    }

    /**
     * Set up basic data
     * Requires JSON to be loaded
     */
    public setupBasic(): void {

        if (!this.json) {
            throw new Error("No JSON loaded for basic setup!");
        }

        // $this->is_recording = file_exists($this->directory . DIRECTORY_SEPARATOR . $this->basename . '.ts');
        // $this->is_converted = file_exists($this->directory . DIRECTORY_SEPARATOR . $this->basename . '.mp4');

        // $this->is_capturing 	= isset($this->json['is_capturing']) ? $this->json['is_capturing'] : false;
        // $this->is_converting 	= isset($this->json['is_converting']) ? $this->json['is_converting'] : false;
        // $this->is_finalized 	= isset($this->json['is_finalized']) ? $this->json['is_finalized'] : false;
        this.is_capturing = this.json.is_capturing;
        this.is_converting = this.json.is_converting;
        this.is_finalized = this.json.is_finalized;

        // $this->force_record				= isset($this->json['force_record']) ? $this->json['force_record'] : false;
        // $this->automator_fail			= isset($this->json['automator_fail']) ? $this->json['automator_fail'] : false;
        // this.force_record = this.json.force_record == true;
        // this.automator_fail = this.json.automator_fail == true;

        // $this->stream_resolution		= isset($this->json['stream_resolution']) && gettype($this->json['stream_resolution']) == 'string' ? $this->json['stream_resolution'] : '';
        this.stream_resolution = this.json.stream_resolution;

        // $this->duration 			= $this->json['duration'];
        // $this->duration_seconds 	= $this->json['duration_seconds'] ? (int)$this->json['duration_seconds'] : null;

        this.duration = this.json.duration ?? undefined;

        // TODO: what
        // const dur = this.getDurationLive();
        // this.duration_live = dur === false ? -1 : dur;

        this.webpath = `${Config.getInstance().cfg<string>("basepath", "")}/vods/${Config.getInstance().cfg<boolean>("channel_folders") && this.streamer_login ? this.streamer_login : ""}`;

        this.comment = this.json.comment;
        this.prevent_deletion = this.json.prevent_deletion ?? false;
        this.failed = this.json.failed ?? false;

    }

    /**
     * Set up user data
     * Requires JSON to be loaded
     */
    public async setupUserData(): Promise<void> {

        if (!this.json) {
            throw new Error("No JSON loaded for user data setup!");
        }

        this.streamer_id = this.json.streamer_id;
        this.streamer_login = await TwitchChannel.channelLoginFromId(this.streamer_id || "") || "";
        this.streamer_name = await TwitchChannel.channelDisplayNameFromId(this.streamer_id || "") || "";
    }

    /**
     * Set up provider related data
     * Requires JSON to be loaded
     */
    public setupProvider(): void {

        if (!this.json) {
            throw new Error("No JSON loaded for provider setup!");
        }

        this.twitch_vod_id = this.json.twitch_vod_id !== undefined ? this.json.twitch_vod_id : undefined;
        // this.twitch_vod_url = this.json.twitch_vod_url !== undefined ? this.json.twitch_vod_url : undefined;
        this.twitch_vod_duration = this.json.twitch_vod_duration !== undefined ? this.json.twitch_vod_duration : undefined;
        this.twitch_vod_title = this.json.twitch_vod_title !== undefined ? this.json.twitch_vod_title : undefined;
        this.twitch_vod_date = this.json.twitch_vod_date !== undefined ? this.json.twitch_vod_date : undefined;

        this.twitch_vod_exists = this.json.twitch_vod_exists !== undefined ? this.json.twitch_vod_exists : undefined;
        this.twitch_vod_neversaved = this.json.twitch_vod_neversaved !== undefined ? this.json.twitch_vod_neversaved : undefined;
        this.twitch_vod_attempted = this.json.twitch_vod_attempted !== undefined ? this.json.twitch_vod_attempted : undefined;

        this.twitch_vod_muted = this.json.twitch_vod_muted !== undefined ? this.json.twitch_vod_muted : undefined;

        /*
        if (typeof this.json.twitch_vod_muted == "boolean") {
            if (this.json.twitch_vod_muted === false) this.twitch_vod_muted = MUTE_STATUS.UNMUTED;
            else if (this.json.twitch_vod_muted === true) this.twitch_vod_muted = MUTE_STATUS.MUTED;
        } else if (this.json.twitch_vod_muted === null) {
            this.twitch_vod_muted = MUTE_STATUS.UNKNOWN;
        } else if (typeof this.json.twitch_vod_muted == "number") {
            this.twitch_vod_muted = this.json.twitch_vod_muted;
        }

        if (this.json.twitch_vod_status) {
            this.twitch_vod_status = this.json.twitch_vod_status;
        } else if (this.twitch_vod_neversaved) {
            this.twitch_vod_status = EXIST_STATUS.NEVER_EXISTED;
        } else if (this.twitch_vod_exists) {
            this.twitch_vod_status = EXIST_STATUS.EXISTS;
        } else if (!this.twitch_vod_exists) {
            this.twitch_vod_status = EXIST_STATUS.NOT_EXISTS;
        } else {
            this.twitch_vod_status = EXIST_STATUS.UNKNOWN;
        }
        */
        // this.twitch_vod_status = this.json.twitch_vod_status;


        // legacy
        // if (this.meta?.data[0]?.title) {
        //     this.stream_title = this.meta.data[0].title;
        // }
        // 
        // if (this.meta?.title) {
        //     this.stream_title = this.meta.title;
        // }
    }

    /**
     * Set up misc data
     * Requires JSON to be loaded
     */
    public async setupAssoc(): Promise<void> {

        if (!this.json) {
            throw new Error("No JSON loaded for assoc setup!");
        }

        // this.video_fail2 = this.json.video_fail2 !== undefined ? this.json.video_fail2 : false;
        this.video_metadata = this.json.video_metadata !== undefined ? this.json.video_metadata : undefined;
        // this.filterMediainfo();

        // this.ads = this.json.ads !== undefined ? this.json.ads : [];
        if (this.json.chapters && this.json.chapters.length > 0) {
            await this.parseChapters(this.json.chapters);
        } else {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No chapters on ${this.basename}!`);
        }

        this.segments_raw = this.json.segments !== undefined ? this.json.segments : [];

        if (this.segments_raw && this.segments_raw.length > 0) {
            this.parseSegments(this.segments_raw);
        }

        if (this.is_finalized) {
            if (!this.duration) {
                Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `VOD ${this.basename} finalized but no duration, trying to fix`);
                this.getDuration(true);
            }
        }

        if (!this.video_metadata && this.is_finalized && this.segments_raw.length > 0 && Helper.path_mediainfo()) {
            Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `VOD ${this.basename} finalized but no metadata, trying to fix`);
            if (await this.getMediainfo()) {
                await this.saveJSON("fix mediainfo");
            }
        }

        this.stream_number = this.json.stream_number !== undefined ? this.json.stream_number : undefined;

    }


    /**
     * Get duration from the start of the broadcast
     * @returns
     */
    public getDurationLive(): number | false {
        // if (!$this->dt_started_at) return false;
        // $now = new \DateTime();
        // return abs($this->dt_started_at->getTimestamp() - $now->getTimestamp());
        if (!this.started_at) return false;
        const now = new Date();
        return Math.abs((this.started_at.getTime() - now.getTime()) / 1000);
    }

    public getWebhookDuration(): string | undefined {
        if (this.started_at && this.ended_at) {
            // format is H:i:s
            const diff_seconds = (this.ended_at.getTime() - this.started_at.getTime()) / 1000;
            return Helper.formatDuration(diff_seconds);
        } else {
            return undefined;
        }
    }

    public async getDuration(save = false): Promise<number | null> {

        if (this.duration && this.duration > 0) {
            // TwitchHelper.log(LOGLEVEL.DEBUG, "Returning saved duration for " . this.basename . ": " . this.duration_seconds );
            return this.duration;
        }

        const isOldFormat = this.video_metadata && "general" in this.video_metadata;

        if (this.video_metadata && isOldFormat) {
            Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD ${this.basename} has old video metadata format.`);
        }

        if (this.video_metadata && !isOldFormat) {

            if (this.video_metadata.size && this.video_metadata.size == 0) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid video metadata for ${this.basename}!`);
                return null;
            }

            if (this.video_metadata.duration) {
                Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `No duration_seconds but metadata exists for ${this.basename}: ${this.video_metadata.duration}`);
                this.duration = this.video_metadata.duration;
                return this.duration;
            }

            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Video metadata for ${this.basename} does not include duration!`);

            return null;
        }

        if (this.is_capturing) {
            Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Can't request duration because ${this.basename} is still recording!`);
            return null;
        }

        if (!this.is_converted || this.is_converting) {
            Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Can't request duration because ${this.basename} is converting!`);
            return null;
        }

        if (!this.is_finalized) {
            Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Can't request duration because ${this.basename} is not finalized!`);
            return null;
        }

        if (!this.segments_raw || this.segments_raw.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No video file available for duration of ${this.basename}`);
            return null;
        }

        Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `No mediainfo for getDuration of ${this.basename}`);

        const file = await this.getMediainfo();

        if (!file) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Could not find duration of ${this.basename}`);
            return null;
        } else {

            // this.duration 			= $file['playtime_string'];
            this.duration = file.duration;

            if (save) {
                Log.logAdvanced(LOGLEVEL.SUCCESS, "vodclass", `Saved duration for ${this.basename}`);
                await this.saveJSON("duration save");
            }

            Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Duration fetched for ${this.basename}: ${this.duration}`);

            return this.duration;
        }

        Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", "Reached end of getDuration for {this.basename}, this shouldn't happen!");
    }

    public async getMediainfo(segment_num = 0): Promise<false | VideoMetadata | AudioMetadata> {

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Fetching mediainfo of ${this.basename}, segment #${segment_num}`);

        if (!this.directory) {
            throw new Error("No directory set!");
        }

        if (!this.segments_raw || this.segments_raw.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No segments available for mediainfo of ${this.basename}`);
            return false;
        }

        const filename = path.join(this.directory, path.basename(this.segments_raw[segment_num]));

        if (!fs.existsSync(filename)) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `File does not exist for mediainfo of ${this.basename} (${filename} @ ${this.directory})`);
            return false;
        }

        let data: MediaInfo | false = false;

        try {
            data = await Helper.mediainfo(filename);
        } catch (th) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Trying to get mediainfo of ${this.basename} returned: ${th}`);
            return false;
        }

        if (data) {
            // console.debug(`Got mediainfo of ${this.basename}`);

            if (!data.general.Format || !data.general.Duration) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid mediainfo for ${this.basename} (missing ${!data.general.Format ? "Format" : ""} ${!data.general.Duration ? "Duration" : ""})`);
                return false;
            }

            // check if even framerate
            if (data.video && parseInt(data.video.FrameRate) % 2 != 0) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Strange framerate for ${this.basename}: ${data.video.FrameRate}`);
                console.debug("mediainfo", data);
            }

            const isAudio = data.video === undefined;

            // use proxy type for mediainfo, can switch to ffprobe if needed
            if (isAudio) {

                if (data.audio) {
                    this.video_metadata = {

                        type: "audio",

                        container: data.general.Format,

                        size: parseInt(data.general.FileSize),
                        duration: parseInt(data.general.Duration),
                        bitrate: parseInt(data.general.OverallBitRate),

                        audio_codec: data.audio.Format,
                        audio_bitrate: parseInt(data.audio.BitRate),
                        audio_bitrate_mode: data.audio.BitRate_Mode as "VBR" | "CBR",
                        audio_sample_rate: parseInt(data.audio.SamplingRate),
                        audio_channels: parseInt(data.audio.Channels),

                    } as AudioMetadata;
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid mediainfo for ${this.basename} (missing audio)`);
                    return false;
                }

            } else {

                if (data.video && data.audio) {
                    this.video_metadata = {

                        type: "video",

                        container: data.general.Format,

                        size: parseInt(data.general.FileSize),
                        duration: parseInt(data.general.Duration),
                        bitrate: parseInt(data.general.OverallBitRate),

                        width: parseInt(data.video.Width),
                        height: parseInt(data.video.Height),

                        fps: parseInt(data.video.FrameRate), // TODO: check if this is correct, seems to be variable
                        fps_mode: data.video.FrameRate_Mode as "VFR" | "CFR",

                        audio_codec: data.audio.Format,
                        audio_bitrate: parseInt(data.audio.BitRate),
                        audio_bitrate_mode: data.audio.BitRate_Mode as "VBR" | "CBR",
                        audio_sample_rate: parseInt(data.audio.SamplingRate),
                        audio_channels: parseInt(data.audio.Channels),

                        video_codec: data.video.Format,
                        video_bitrate: parseInt(data.video.BitRate),
                        video_bitrate_mode: data.video.BitRate_Mode as "VBR" | "CBR",

                    } as VideoMetadata;
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid mediainfo for ${this.basename} (missing video/audio)`);
                    return false;
                }
            }

            return this.video_metadata;
        }

        Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Could not get mediainfo of ${this.basename}`);

        // this.video_fail2 = true;
        return false;
    }

    /** TODO: implement ffprobe for mediainfo */
    public async getFFProbe(segment_num = 0): Promise<false | VideoMetadata> {

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Fetching ffprobe of ${this.basename}, segment #${segment_num}`);

        if (!this.directory) {
            throw new Error("No directory set!");
        }

        if (!this.segments_raw || this.segments_raw.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No segments available for ffprobe of ${this.basename}`);
            return false;
        }

        const filename = path.join(this.directory, path.basename(this.segments_raw[segment_num]));

        if (!fs.existsSync(filename)) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `File does not exist for ffprobe of ${this.basename} (${filename} @ ${this.directory})`);
            return false;
        }

        let data: FFProbe | false = false;

        try {
            data = await Helper.ffprobe(filename);
        } catch (th) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Trying to get ffprobe of ${this.basename} returned: ${(th as Error).message}`);
            return false;
        }

        if (data) {
            // console.debug(`Got ffprobe of ${this.basename}`);

            if (!data.streams || data.streams.length == 0) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid ffprobe for ${this.basename}`);
                return false;
            }

            const video_stream = data.streams.find((stream): stream is VideoStream => stream.codec_type == "video"); // FFProbeStream
            const audio_stream = data.streams.find((stream): stream is AudioStream => stream.codec_type == "audio"); // FFProbeStream[]

            if (!video_stream || !audio_stream) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Invalid ffprobe for ${this.basename}`);
                return false;
            }

            // let fps = 0;
            // if (video_stream?.r_frame_rate) {
            //     const fps_base = parseInt(video_stream.r_frame_rate.split("/")[0]);
            //     const fps_den = parseInt(video_stream.r_frame_rate.split("/")[1]);
            //     fps = fps_base / fps_den;
            // }

            // use proxy type for mediainfo, can switch to ffprobe if needed
            /*
            this.video_metadata = {
                container: data.format.format_name,

                size: parseInt(data.format.size),
                duration: parseInt(data.format.duration),
                bitrate: parseInt(data.format.bit_rate),

                width: video_stream.width,
                height: video_stream.height,

                fps: fps,
                fps_mode: 
                // fps_mode: video_stream.r_frame_rate_mode as "VFR" | "CFR",

                audio_codec: audio_stream.codec_name,
                audio_bitrate: parseInt(audio_stream.bit_rate),
                // audio_bitrate_mode: audio_stream.bit_rate_mode as "VBR" | "CBR",
                audio_sample_rate: audio_stream.sample_rate,
                audio_channels: audio_stream.channels,

                video_codec: video_stream.codec_name,
                video_bitrate: parseInt(video_stream.bit_rate),
                // video_bitrate_mode: video_stream.bit_rate_mode as "VBR" | "CBR",
            };
            */

            // return this.video_metadata;

        } else {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Could not get ffprobe of ${this.basename}`);
        }

        // this.video_fail2 = true;
        return false;
    }

    private realpath(expanded_path: string): string {
        return path.normalize(expanded_path);
    }

    public setupFiles(): void {

        if (!this.directory) {
            throw new Error("No directory set!");
        }

        this.path_chat = this.realpath(path.join(this.directory, `${this.basename}_chat.json`));
        this.path_downloaded_vod = this.realpath(path.join(this.directory, `${this.basename}_vod.mp4`));
        this.path_losslesscut = this.realpath(path.join(this.directory, `${this.basename}-llc-edl.csv`));
        this.path_chatrender = this.realpath(path.join(this.directory, `${this.basename}_chat.mp4`));
        this.path_chatmask = this.realpath(path.join(this.directory, `${this.basename}_chat_mask.mp4`));
        this.path_chatburn = this.realpath(path.join(this.directory, `${this.basename}_burned.mp4`));
        this.path_chatdump = this.realpath(path.join(this.directory, `${this.basename}.chatdump`));
        this.path_adbreak = this.realpath(path.join(this.directory, `${this.basename}.adbreak`));
        this.path_playlist = this.realpath(path.join(this.directory, `${this.basename}.m3u8`));
        this.path_ffmpegchapters = this.realpath(path.join(this.directory, `${this.basename}-ffmpeg-chapters.txt`));
        this.path_vttchapters = this.realpath(path.join(this.directory, `${this.basename}.chapters.vtt`));
        this.path_kodinfo = this.realpath(path.join(this.directory, `${this.basename}.nfo`));

        // just to be sure, remake these
        if (this.is_finalized) {
            try {
                if (!fs.existsSync(this.path_losslesscut)) {
                    this.saveLosslessCut();
                }
                if (!fs.existsSync(this.path_ffmpegchapters)) {
                    this.saveFFMPEGChapters();
                }
                if (!fs.existsSync(this.path_vttchapters)) {
                    this.saveVTTChapters();
                }
                if (!fs.existsSync(this.path_kodinfo) && Config.getInstance().cfg("create_kodi_nfo")) {
                    this.saveKodiNfo();
                }
            } catch (error) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Could not save associated files for ${this.basename}: ${(error as Error).message}`);
            }
        }
    }

    get is_converted(): boolean {
        if (!this.directory) return false;
        if (!this.segments || this.segments.length == 0) return false;
        if (this.is_converting) return false;
        return this.segments.some(segment => segment.filename && fs.existsSync(segment.filename) && fs.statSync(segment.filename).size > 0);
    }

    get is_chat_downloaded(): boolean { return this.path_chat !== "" && fs.existsSync(this.path_chat); }
    get is_vod_downloaded(): boolean { return this.path_downloaded_vod !== "" && fs.existsSync(this.path_downloaded_vod); }
    get is_lossless_cut_generated(): boolean { return this.path_losslesscut !== "" && fs.existsSync(this.path_losslesscut); }
    get is_chatdump_captured(): boolean { return this.path_chatdump !== "" && fs.existsSync(this.path_chatdump); }
    get is_capture_paused(): boolean { return this.path_adbreak !== "" && fs.existsSync(this.path_adbreak); }
    get is_chat_rendered(): boolean { return this.path_chatrender !== "" && fs.existsSync(this.path_chatrender); }
    get is_chat_burned(): boolean { return this.path_chatburn !== "" && fs.existsSync(this.path_chatburn); }

    get current_game(): TwitchGame | undefined {
        if (!this.chapters || this.chapters.length == 0) return undefined;
        // return this.chapters.at(-1)?.game;
        return this.chapters[this.chapters.length - 1].game;
    }

    get associatedFiles(): string[] {

        if (!this.directory) return [];

        const base = [
            `${this.basename}.json`,
            `${this.basename}.chat`,
            `${this.basename}_chat.json`,
            `${this.basename}_vod.mp4`,
            `${this.basename}-llc-edl.csv`,
            `${this.basename}_chat.mp4`,
            `${this.basename}_chat_mask.mp4`,
            `${this.basename}_burned.mp4`,
            `${this.basename}.chatdump`,
            `${this.basename}.chatdump.txt`,
            `${this.basename}.chatdump.line`,
            `${this.basename}.m3u8`,
            `${this.basename}.adbreak`,
            `${this.basename}-ffmpeg-chapters.txt`,
            `${this.basename}.chapters.vtt`,
            `${this.basename}.nfo`,
        ];

        if (this.segments_raw) {
            // for (const seg of this.segments_raw) {
            //     base.push(path.basename(seg));
            // }
            base.push(...this.segments_raw.map(seg => path.basename(seg)));
        }

        return base.filter(f => fs.existsSync(this.realpath(path.join(this.directory || "", f))));

    }

    get stream_season(): string | undefined {
        if (!this.started_at) return undefined;
        return format(this.started_at, Config.SeasonFormat);
    }

    public setupApiHelper() {
        throw new Error("Method apihelper not implemented.");
    }

    public async parseChapters(raw_chapters: TwitchVODChapterJSON[]): Promise<boolean> {

        if (!raw_chapters || raw_chapters.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No chapter data found for ${this.basename}`);
            return false;
        }

        const chapters: TwitchVODChapter[] = [];

        for (const chapter of raw_chapters) {

            if (!this.started_at || !this.ended_at) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Time error for chapter parsing found for ${this.basename} (started_at: ${this.started_at}, ended_at: ${this.ended_at})`);
                return false;
            }

            const new_chapter = await TwitchVODChapter.fromJSON(chapter);

            chapters.push(new_chapter);

        }

        /*
        this.chapters.forEach((chapter, index) => {

            const nextChapter = this.chapters[index + 1];

            // calculate duration from next chapter
            if (nextChapter && nextChapter.started_at && chapter.started_at) {
                chapter.duration = nextChapter.started_at.getTime() - chapter.started_at.getTime();
            } else {
                console.warn(`Could not calculate duration for chapter ${chapter.title}`);
            }

            // can't remember why this is here
            // TODO: investigate
            // if (index == 0) {
            //     this.game_offset = chapter.offset;
            // }

            // final chapter, make duration to end of vod
            if (index == chapters.length - 1 && this.ended_at && chapter.started_at) {
                chapter.duration = this.ended_at.getTime() - chapter.started_at.getTime();
            }
        });
        */

        // console.log("Chapters:", chapters);

        // this.chapters_raw = raw_chapters;
        this.chapters = chapters;

        this.calculateChapters();

        return true;

    }

    // public generateChaptersRaw() {
    //     const raw_chapters: TwitchVODChapterJSON[] = [];
    //     for (const chapter of this.chapters) {
    //         const raw_chapter = chapter.getRawChapter();
    //         if (raw_chapter) raw_chapters.push(raw_chapter);
    //     }
    //     return raw_chapters;
    // }

    public addChapter(chapter: TwitchVODChapter): void {
        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Adding chapter ${chapter.title} (${chapter.game_name}) to ${this.basename}`);
        this.chapters.push(chapter);
        this.chapters_raw.push(chapter.toJSON()); // needed?
        this.calculateChapters();
    }

    /**
     * Calculate offset and duration of chapters, based on the start and end time of the VOD.
     * Call this after adding new chapters and as often as possible.
     * 
     * @returns 
     */
    public calculateChapters(): boolean {

        if (!this.started_at) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No start time found for ${this.basename}, can't calculate chapters`);
            return false;
        }

        if (!this.chapters || this.chapters.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No chapters found for ${this.basename}, can't calculate chapters`);
            return false;
        }

        // console.debug(`Calculating chapters for ${this.basename}, ${this.chapters.length} chapters`);

        this.chapters.forEach((chapter, index) => {

            if (!this.started_at) return; // thanks scoping

            const next_chapter = this.chapters[index + 1];

            chapter.calculateDurationAndOffset(this.started_at, this.ended_at, next_chapter ? next_chapter.started_at : undefined);

        });

        return true;

    }

    /**
     * Remove short chapters and change duration of chapters to match the duration of the VOD.
     * @returns 
     */
    public async removeShortChapters(): Promise<void> {

        if (!this.chapters || this.chapters.length == 0) return;

        const minDuration = Config.getInstance().cfg("min_chapter_duration", 0);

        if (minDuration <= 0) return;

        const longChapters = this.chapters.filter(chapter => {
            if (chapter.duration && chapter.duration > minDuration) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Keeping chapter ${chapter.title} with duration ${chapter.duration} on ${this.basename}`);
                return true;
            } else if (chapter.duration === undefined) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Chapter ${chapter.title} has undefined duration on ${this.basename}`);
                return true;
            } else {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Removing chapter ${chapter.title} with duration ${chapter.duration} on ${this.basename}`);
                return false;
            }
        });

        console.debug(`Removed ${this.chapters.length - longChapters.length} chapters on ${this.basename}`);

        this.chapters = longChapters;

        this.calculateChapters();

        await this.saveJSON("remove short chapters");

    }

    public async generateDefaultChapter(): Promise<void> {
        if (!this.started_at) return;
        const chapter = await TwitchVODChapter.fromJSON({
            "title": this.json?.twitch_vod_title ?? "Unknown title",
            "started_at": this.started_at.toISOString(),
            is_mature: false,
            online: true,
        });

        this.addChapter(chapter);
    }

    public parseSegments(array: string[]): false | undefined {

        if (!this.directory) {
            throw new Error("TwitchVOD.parseSegments: directory is not set");
        }

        if (!array) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No segment data supplied on ${this.basename}`);

            if (!this.segments_raw) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No segment_raw data on ${this.basename}, calling rebuild...`);
                this.rebuildSegmentList();
            }

            return false;
        }

        const segments: TwitchVODSegment[] = [];

        for (const raw_segment of array) {

            if (typeof raw_segment !== "string") {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Segment list containing invalid data for ${this.basename}, rebuilding...`);
                this.rebuildSegmentList();
                return;
            }

            // find invalid characters for windows
            if (raw_segment.match(TwitchVOD.filenameIllegalChars)) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Segment list containing invalid characters for ${this.basename}: ${raw_segment}`);
                return false;
            }

            const segment = new TwitchVODSegment();

            // segment.filename = realpath($this.directory . DIRECTORY_SEPARATOR . basename($v));
            // segment.basename = basename($v);
            segment.filename = path.join(this.directory, path.basename(raw_segment));
            segment.basename = path.basename(raw_segment);

            /*
            if (isset($segment['filename']) && $segment['filename'] != false && file_exists($segment['filename']) && filesize($segment['filename']) > 0) {
                $segment['filesize'] = filesize($segment['filename']);
                $this.total_size += $segment['filesize'];
            } else {
                $segment['deleted'] = true;
            }
            */
            if (segment.filename && fs.existsSync(segment.filename) && fs.statSync(segment.filename).size > 0) {
                segment.filesize = fs.statSync(segment.filename).size;
                this.total_size += segment.filesize;
            } else {
                segment.deleted = true;
            }

            segment.strings = {};
            // $diff = $this.started_at.diff($this.ended_at);
            // $segment['strings']['webhook_duration'] = $diff.format('%H:%I:%S') . '</li>';

            segments.push(segment);
        }

        this.segments = segments;
    }

    /**
     * Add segment
     * TODO basename or full path?
     * @param segment 
     */
    public addSegment(segment: string): void {
        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Adding segment ${segment} to ${this.basename}`);
        this.segments_raw.push(segment);
        this.parseSegments(this.segments_raw);
    }

    /**
     * Rebuild segment list from video files named as basename and parse it
     * @saves
     * @returns 
     */
    public async rebuildSegmentList(): Promise<boolean> {

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Rebuilding segment list for ${this.basename}`);

        const files = fs.readdirSync(this.directory)
            .filter(file =>
                file.startsWith(this.basename) &&
                (
                    file.endsWith(`.${Config.getInstance().cfg("vod_container", "mp4")}`) ||
                    file.endsWith(Config.AudioContainer)
                ) &&
                !file.includes("_vod") && !file.includes("_chat") && !file.includes("_chat_mask") && !file.includes("_burned")
            );

        if (!files || files.length == 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No segments found for ${this.basename}, can't rebuild segment list`);
            return false;
        }

        this.segments_raw = [];
        this.segments = [];

        files.forEach(file => this.addSegment(path.basename(file)));

        // this.parseSegments(this.segments_raw);
        await this.saveJSON("segments rebuild");

        return true;

    }

    /**
     * Finalize the video. Does **NOT** save.
     * TODO save?
     * @returns 
     */
    public async finalize(): Promise<boolean> {
        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Finalize ${this.basename} @ ${this.directory}`);

        if (this.path_playlist && fs.existsSync(this.path_playlist)) {
            fs.unlinkSync(this.path_playlist);
        }

        // generate mediainfo, like duration, size, resolution, etc
        try {
            await this.getMediainfo();
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to get mediainfo for ${this.basename}: ${error}`);
        }

        // generate chapter related files
        try {
            this.saveLosslessCut();
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to save lossless cut for ${this.basename}: ${error}`);
        }

        try {
            this.saveFFMPEGChapters();
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to save ffmpeg chapters for ${this.basename}: ${error}`);
        }

        try {
            this.saveVTTChapters();
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to save vtt chapters for ${this.basename}: ${error}`);
        }

        try {
            this.saveKodiNfo();
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to save kodi nfo for ${this.basename}: ${error}`);
        }

        // match stored vod to online vod
        await this.matchProviderVod();

        // calculate chapter durations and offsets
        this.calculateChapters();

        // this.checkMutedVod(); // initially not muted when vod is published

        this.is_finalized = true;

        return true;
    }

    public async matchProviderVod(force = false): Promise<boolean | undefined> {
        if (this.twitch_vod_id && !force) return;
        if (this.is_capturing || this.is_converting) return;
        if (!this.started_at) return;

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Matching ${this.basename} to provider`);

        const channel_videos = await TwitchVOD.getVideos(this.streamer_id);
        if (!channel_videos) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No videos returned from streamer of ${this.basename}`);
            this.twitch_vod_neversaved = true;
            this.twitch_vod_exists = false;
            this.broadcastUpdate();
            return false;
        }

        for (const video of channel_videos) {
            const video_time = parseJSON(video.created_at);
            if (!video_time) continue;

            if (Math.abs(this.started_at.getTime() - video_time.getTime()) < 1000 * 60 * 5) { // 5 minutes

                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Found matching VOD for ${this.basename}`);

                this.twitch_vod_id = video.id;
                this.twitch_vod_duration = Helper.parseTwitchDuration(video.duration);
                this.twitch_vod_title = video.title;
                this.twitch_vod_date = video.created_at;
                this.twitch_vod_exists = true;

                this.broadcastUpdate();

                return true;

            }

        }

        this.twitch_vod_attempted = true;
        this.twitch_vod_neversaved = true;
        this.twitch_vod_exists = false;

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `No matching VOD for ${this.basename}`);

        this.broadcastUpdate();

        return false;

    }

    public saveLosslessCut(): boolean {

        if (!this.directory) {
            throw new Error("TwitchVOD.saveLosslessCut: directory is not set");
        }

        if (!this.chapters || this.chapters.length == 0) {
            // throw new Error('TwitchVOD.saveLosslessCut: chapters are not set');
            return false;
        }

        // $csv_path = $this->directory . DIRECTORY_SEPARATOR . $this->basename . '-llc-edl.csv';
        const csv_path = path.join(this.directory, `${this.basename}-llc-edl.csv`);

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Saving lossless cut csv for ${this.basename} to ${csv_path}`);

        let data = "";

        this.chapters.forEach((chapter, i) => {
            let offset = chapter.offset;
            if (offset === undefined) return;

            offset -= this.chapters[0].offset || 0;

            data += offset + ","; // offset

            if (i < this.chapters.length - 1) { // not last chapter
                data += (offset + (chapter.duration || 0)) + ",";
            } else { // last chapter
                data += ",";
            }

            data += "\"";
            let label = `${chapter.game_name || chapter.game_id} (${chapter.title})`;
            label = label.replace(/"/g, "\\\"");
            data += label;
            data += "\"";

            data += "\n";
        });

        fs.writeFileSync(csv_path, data);

        this.setPermissions();

        return fs.existsSync(csv_path);
    }

    /**
     * Save chapter data in ffmpeg format for use in remuxing.
     * @see {@link https://ikyle.me/blog/2020/add-mp4-chapters-ffmpeg}
     * @returns Save success
     */
    public saveFFMPEGChapters(): boolean {

        if (!this.directory) {
            throw new Error("TwitchVOD.saveFFMPEGChapters: directory is not set");
        }

        if (!this.chapters || this.chapters.length == 0) {
            // throw new Error('TwitchVOD.saveFFMPEGChapters: chapters are not set');
            return false;
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Saving FFMPEG chapters file for ${this.basename} to ${this.path_ffmpegchapters}`);

        /*
        let data = "";
        data += ";FFMETADATA1\n";
        data += `artist=${this.streamer_name}\n`;
        data += `title=${this.twitch_vod_title ?? this.chapters[0].title}\n`;
        data += "\n";
        // major_brand=isom
        // minor_version=512
        // compatible_brands=isomiso2avc1mp41
        // encoder=Lavf59.20.101

        this.chapters.forEach((chapter) => {
            const offset = chapter.offset || 0;
            const duration = chapter.duration || 0;

            const start = Math.floor(offset * 1000);
            const end = Math.floor((offset + duration) * 1000);

            data += "[CHAPTER]\n";
            data += `# Game ID: ${chapter.game_id}\n`;
            data += `# Game Name: ${chapter.game_name}\n`;
            data += `# Title: ${chapter.title}\n`;
            data += `# Offset: ${offset}\n`;
            data += `# Duration: ${duration}\n`;
            data += `# Viewer count: ${chapter.viewer_count}\n`;
            data += `# Started at: ${chapter.started_at.toISOString()}\n`;
            data += "TIMEBASE=1/1000\n";
            data += `START=${start}\n`;
            data += `END=${end}\n`;
            data += `TITLE=${chapter.title} (${chapter.game_name})\n\n`;

        });
        */

        const meta = new FFmpegMetadata()
            .setArtist(this.streamer_name)
            .setTitle(this.twitch_vod_title ?? this.chapters[0].title);

        if (this.started_at) meta.setDate(this.started_at);

        this.chapters.forEach((chapter) => {
            const offset = chapter.offset || 0;
            const duration = chapter.duration || 0;
            const start = Math.floor(offset * 1000);
            const end = Math.floor((offset + duration) * 1000);
            const title = `${chapter.title} (${chapter.game_name})`;
            meta.addChapter(start, end, title, "1/1000", [
                `Game ID: ${chapter.game_id}`,
                `Game Name: ${chapter.game_name}`,
                `Title: ${chapter.title}`,
                `Offset: ${offset}`,
                `Duration: ${duration}`,
                `Viewer count: ${chapter.viewer_count}`,
                `Started at: ${chapter.started_at.toISOString()}`,
            ]);
        });

        fs.writeFileSync(this.path_ffmpegchapters, meta.getString(), { encoding: "utf8" });

        this.setPermissions();

        return fs.existsSync(this.path_ffmpegchapters);

    }

    public saveVTTChapters(): boolean {

        if (!this.directory) {
            throw new Error("TwitchVOD.saveVTTChapters: directory is not set");
        }

        if (!this.chapters || this.chapters.length == 0) {
            throw new Error("TwitchVOD.saveVTTChapters: chapters are not set");
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Saving VTT chapters file for ${this.basename} to ${this.path_vttchapters}`);

        let data = `WEBVTT - Generated by ${AppName}\n\n`;

        this.chapters.forEach((chapter, i) => {
            const offset = chapter.offset || 0;
            const duration = chapter.duration || 0;

            const start = offset;
            const end = offset + duration;

            const txt_start = Helper.formatSubtitleDuration(start);
            const txt_end = Helper.formatSubtitleDuration(end);

            data += `Chapter ${i + 1}\n`;
            data += `${txt_start} --> ${txt_end}\n`;
            data += `${chapter.title} (${chapter.game_name})\n\n`;

        });

        fs.writeFileSync(this.path_vttchapters, data, { encoding: "utf8" });

        this.setPermissions();

        return fs.existsSync(this.path_vttchapters);

    }

    public saveKodiNfo(): boolean {

        if (!Config.getInstance().cfg("create_kodi_nfo")) return false;

        if (!this.directory) {
            throw new Error("TwitchVOD.saveKodiNfo: directory is not set");
        }

        if (!this.started_at) {
            throw new Error("TwitchVOD.saveKodiNfo: started_at is not set");
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Saving Kodi NFO file for ${this.basename} to ${this.path_kodinfo}`);

        const title = this.twitch_vod_title ?? this.chapters[0].title;

        let data = "";
        data += "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n";
        data += "<episodedetails>\n";
        data += `\t<title>${htmlentities(title)}</title>\n`;
        data += `\t<showtitle>${this.streamer_name}</showtitle>\n`;
        data += `\t<uniqueid type="twitch">${this.twitch_vod_id}</uniqueid>\n`;

        data += `\t<season>${format(this.started_at, Config.SeasonFormat)}</season>\n`;
        data += `\t<episode>${(this.stream_number || 0) + 1}</episode>\n`;

        if (this.chapters && this.chapters.length > 0) {
            let plot = "";
            this.chapters.forEach((chapter, index) => {
                plot += `${index + 1}. ${chapter.title} (${chapter.game_name})\n`;
            });
            data += `\t<plot>${htmlentities(plot)}</plot>\n`;
        }

        if (this.duration) data += `\t<runtime>${Math.ceil(this.duration / 60)}</runtime>\n`;

        data += "\t<actor>\n";
        data += `\t\t<name>${this.streamer_name}</name>\n`;
        data += "\t\t<role>Themselves</role>\n";
        data += "\t</actor>\n";

        if (this.getUniqueGames()) {
            this.getUniqueGames().forEach((game) => {
                data += `\t<tag>${game.name}</tag>\n`;
            });
        }

        data += `\t<premiered>${format(this.started_at, "yyyy-MM-dd")}</premiered>\n`;
        data += `\t<aired>${format(this.started_at, "yyyy-MM-dd")}</aired>\n`;
        data += `\t<dateadded>${format(this.started_at, "yyyy-MM-dd")}</dateadded>\n`;
        data += `\t<year>${format(this.started_at, "yyyy")}</year>\n`;
        data += `\t<studio>${this.streamer_name}</studio>\n`;

        data += `\t<id>${this.twitch_vod_id}</id>\n`;

        data += "</episodedetails>\n";

        fs.writeFileSync(this.path_kodinfo, data, { encoding: "utf8" });

        this.setPermissions();

        return fs.existsSync(this.path_kodinfo);

    }

    public getUniqueGames(): TwitchGame[] {
        const games: TwitchGame[] = [];
        this.chapters.forEach((chapter) => { if (chapter.game && !games.includes(chapter.game)) games.push(chapter.game); });
        return games;
    }

    public async toAPI(): Promise<ApiVod> {
        return {

            basename: this.basename || "",

            stream_title: this.stream_title,
            stream_resolution: this.stream_resolution,

            segments: this.segments.map((s) => s.toAPI()),
            segments_raw: this.segments_raw,

            streamer_name: this.streamer_name || "",
            streamer_id: this.streamer_id || "",
            streamer_login: this.streamer_login || "",

            twitch_vod_duration: this.twitch_vod_duration,
            twitch_vod_muted: this.twitch_vod_muted,
            // twitch_vod_status: this.twitch_vod_status,
            twitch_vod_id: this.twitch_vod_id,
            twitch_vod_date: this.twitch_vod_date,
            twitch_vod_title: this.twitch_vod_title,
            twitch_vod_neversaved: this.twitch_vod_neversaved,
            twitch_vod_exists: this.twitch_vod_exists,
            twitch_vod_attempted: this.twitch_vod_attempted,

            created_at: this.created_at ? this.created_at.toISOString() : "",
            saved_at: this.saved_at ? this.saved_at.toISOString() : "",
            started_at: this.started_at ? this.started_at.toISOString() : "",
            ended_at: this.ended_at ? this.ended_at.toISOString() : undefined,
            capture_started: this.capture_started ? this.capture_started.toISOString() : undefined,
            capture_started2: this.capture_started2 ? this.capture_started2.toISOString() : undefined,
            conversion_started: this.conversion_started ? this.conversion_started.toISOString() : undefined,

            is_converted: this.is_converted,
            is_capturing: this.is_capturing,
            is_converting: this.is_converting,
            is_finalized: this.is_finalized,

            is_chat_downloaded: this.is_chat_downloaded,
            is_vod_downloaded: this.is_vod_downloaded,
            is_chat_rendered: this.is_chat_rendered,
            is_chat_burned: this.is_chat_burned,
            is_lossless_cut_generated: this.is_lossless_cut_generated,
            is_chatdump_captured: this.is_chatdump_captured,
            is_capture_paused: this.is_capture_paused,

            api_hasFavouriteGame: this.hasFavouriteGame(),
            api_getUniqueGames: this.getUniqueGames().map((g) => g.toAPI()),
            api_getWebhookDuration: this.getWebhookDuration(),
            // api_getDuration: this.duration, // this.getDuration(),
            api_getDuration: await this.getDuration(true),
            api_getCapturingStatus: await this.getCapturingStatus(),
            api_getRecordingSize: this.getRecordingSize(),
            api_getChatDumpStatus: await this.getChatDumpStatus(),
            api_getDurationLive: this.getDurationLive(),
            api_getConvertingStatus: await this.getConvertingStatus(),

            path_chat: this.path_chat,
            path_downloaded_vod: this.path_downloaded_vod,
            path_losslesscut: this.path_losslesscut,
            path_chatrender: this.path_chatrender,
            path_chatburn: this.path_chatburn,
            path_chatdump: this.path_chatdump,
            path_chatmask: this.path_chatmask,
            path_adbreak: this.path_adbreak,
            path_playlist: this.path_playlist,

            duration_live: this.getDurationLive(),
            duration: this.duration || 0,

            total_size: this.total_size,

            chapters: this.chapters.map((c) => c.toAPI()),
            // chapters_raw: this.chapters_raw,

            webpath: this.webpath,

            video_metadata: this.video_metadata,

            stream_number: this.stream_number,
            stream_season: this.stream_season,

            comment: this.comment,

            prevent_deletion: this.prevent_deletion,

            failed: this.failed,

            // game_offset: this.game_offset || 0,
            // twitch_vod_url: this.twitch_vod_url,
            // twitch_vod_exists: this.twitch_vod_exists,
            // twitch_vod_attempted: this.twitch_vod_attempted,
            // twitch_vod_neversaved: this.twitch_vod_neversaved,            
            // video_fail2: this.video_fail2,
            // json_hash: this.json_hash,
            // created: this.created,
            // force_record: this.force_record,
            // automator_fail: this.automator_fail,
            // dt_started_at: this.dt_started_at ? TwitchHelper.JSDateToPHPDate(this.dt_started_at) : null,
            // dt_ended_at: this.dt_ended_at ? TwitchHelper.JSDateToPHPDate(this.dt_ended_at) : null,
        };
    }

    public async getChatDumpStatus(): Promise<JobStatus> {
        const job = Job.findJob(`chatdump_${this.basename}`);
        return job ? await job.getStatus() : JobStatus.STOPPED;
    }

    public async getCapturingStatus(use_command = false): Promise<JobStatus> {
        const job = Job.findJob(`capture_${this.basename}`);
        return job ? await job.getStatus(use_command) : JobStatus.STOPPED;
    }

    public async getConvertingStatus(): Promise<JobStatus> {
        const job = Job.findJob(`convert_${this.basename}`);
        return job ? await job.getStatus() : JobStatus.STOPPED;
    }

    public getRecordingSize(): number | false {
        if (!this.is_capturing) return false;
        const filename = path.join(this.directory, `${this.basename}.ts`);
        if (!fs.existsSync(filename)) return false;
        return fs.statSync(filename).size;
    }

    public async saveJSON(reason = ""): Promise<false | TwitchVODJSON> {

        if (!this.filename) {
            throw new Error("Filename not set.");
        }

        if (fs.existsSync(this.filename)) {
            // $tmp = file_get_contents(this.filename);
            // if (md5($tmp) !== this.json_hash) {
            // 	TwitchLog.logAdvanced(LOGLEVEL.WARNING, "vodclass", "JSON has been changed since loading of {this.basename}");
            // }
        }

        // if (!this.created && (this.is_capturing || this.is_converting || !this.is_finalized)) {
        //     TwitchLog.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Saving JSON of ${this.basename} while not finalized!`);
        // }

        if (!this.not_started && (!this.chapters || this.chapters.length == 0)) {
            Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Saving JSON of ${this.basename} with no chapters!!`);
        }

        if (!this.streamer_name && !this.created) {
            Log.logAdvanced(LOGLEVEL.FATAL, "vodclass", `Found no streamer name in class of ${this.basename}, not saving!`);
            return false;
        }

        // clone this.json
        const generated: TwitchVODJSON = this.json && Object.keys(this.json).length > 0 ? JSON.parse(JSON.stringify(this.json)) : {};
        // const generated: TwitchVODJSON = Object.assign({}, this.json || {});

        generated.version = 2;
        generated.type = "twitch";
        generated.capture_id = this.capture_id;
        if (this.meta) generated.meta = this.meta;
        generated.stream_resolution = this.stream_resolution ?? undefined;

        generated.streamer_name = this.streamer_name ?? "";
        generated.streamer_id = this.streamer_id ?? "";
        generated.streamer_login = this.streamer_login ?? "";

        // generated.chapters = this.chapters_raw;
        // generated.segments = this.segments_raw;
        generated.chapters = this.chapters.map((chapter) => chapter.toJSON());
        generated.segments = this.segments.map((segment) => segment.filename || ""); // hack?

        generated.is_capturing = this.is_capturing;
        generated.is_converting = this.is_converting;
        generated.is_finalized = this.is_finalized;

        generated.duration = this.duration ?? undefined;

        generated.video_metadata = this.video_metadata;

        generated.saved_at = new Date().toISOString();

        if (this.created_at) generated.created_at = this.created_at.toISOString();
        if (this.capture_started) generated.capture_started = this.capture_started.toISOString();
        if (this.capture_started2) generated.capture_started2 = this.capture_started2.toISOString();
        if (this.conversion_started) generated.conversion_started = this.conversion_started.toISOString();
        if (this.started_at) generated.started_at = this.started_at.toISOString();
        if (this.ended_at) generated.ended_at = this.ended_at.toISOString();

        if (this.twitch_vod_id) {
            generated.twitch_vod_id = this.twitch_vod_id;
            // generated.twitch_vod_url = this.twitch_vod_url;
            generated.twitch_vod_duration = this.twitch_vod_duration ?? undefined;
            generated.twitch_vod_title = this.twitch_vod_title;
            generated.twitch_vod_date = this.twitch_vod_date;
        }

        generated.twitch_vod_exists = this.twitch_vod_exists;
        generated.twitch_vod_attempted = this.twitch_vod_attempted;
        generated.twitch_vod_neversaved = this.twitch_vod_neversaved;
        generated.twitch_vod_muted = this.twitch_vod_muted;

        generated.not_started = this.not_started;

        generated.stream_number = this.stream_number;

        generated.comment = this.comment;

        generated.prevent_deletion = this.prevent_deletion;

        generated.failed = this.failed;

        // generated.twitch_vod_status = this.twitch_vod_status;

        // generated.video_fail2 = this.video_fail2;
        // generated.force_record = this.force_record;
        // generated.automator_fail = this.automator_fail;

        // if (!is_writable(this.filename)) { // this is not the function i want
        // 	// TwitchHelper::log(TwitchHelper::LOG_FATAL, "Saving JSON of " . this.basename . " failed, permissions issue?");
        // 	// return false;
        // }

        Log.logAdvanced(LOGLEVEL.SUCCESS, "vodclass", `Saving JSON of ${this.basename} ${(reason ? " (" + reason + ")" : "")}`);

        //file_put_contents(this.filename, json_encode(generated));
        this.setPermissions();

        await this.stopWatching();

        this._writeJSON = true;

        try {
            fs.writeFileSync(this.filename, JSON.stringify(generated, null, 4));
        } catch (error) {
            Log.logAdvanced(LOGLEVEL.FATAL, "vodclass", `Failed to save JSON of ${this.basename}: ${(error as Error).message}`);
            console.log(chalk.bgRedBright.whiteBright(`Failed to save JSON of ${this.basename}: ${(error as Error).message}`));
            return false;
        }

        this._writeJSON = false;

        await this.startWatching();

        this.broadcastUpdate(); // should this be here?

        return generated;

    }

    public setPermissions(): void {

        if (
            !Config.getInstance().cfg("file_permissions") ||
            !Config.getInstance().cfg("file_chown_uid") ||
            !Config.getInstance().cfg("file_chown_gid") ||
            !Config.getInstance().cfg("file_chmod")
        ) {
            return;
        }

        for (const file of this.associatedFiles) {
            const fullpath = path.join(this.directory, file);
            if (fs.existsSync(fullpath)) {
                fs.chownSync(fullpath, Config.getInstance().cfg("file_chown_uid"), Config.getInstance().cfg("file_chown_gid"));
                fs.chmodSync(fullpath, Config.getInstance().cfg("file_chmod"));
            }
        }

    }

    public broadcastUpdate(): void {
        if (process.env.NODE_ENV === "test") return;
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = undefined;
        }
        this._updateTimer = setTimeout(async () => {
            const vod = await this.toAPI();
            Webhook.dispatch("vod_updated", {
                vod: vod,
            } as VodUpdated);
            this._updateTimer = undefined;
        }, 3000);
    }

    /**
     * Checks all chapters for games with the favourite flag set
     */
    public hasFavouriteGame(): boolean {
        return this.chapters.some(chapter => chapter.game?.isFavourite());
    }

    public async delete(): Promise<boolean> {

        if (!this.directory) {
            throw new Error("No directory set for deletion");
        }

        if (this.prevent_deletion) {
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Deletion of ${this.basename} prevented`);
            throw new Error("Vod has been marked with prevent_deletion");
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Delete ${this.basename}`);

        await this.stopWatching();

        for (const file of this.associatedFiles) {
            if (fs.existsSync(path.join(this.directory, file))) {
                Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Delete ${file}`);
                fs.unlinkSync(path.join(this.directory, file));
            }
        }

        const channel = this.getChannel();
        if (channel) channel.removeVod(this.basename);

        return fs.existsSync(this.filename);

    }

    public move(newDirectory: string): void {

        if (!this.directory) throw new Error("No directory set for move");

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Move ${this.basename} to ${newDirectory}`);

        for (const file of this.associatedFiles) {
            const file_from = path.join(this.directory, file);
            const file_to = path.join(newDirectory, file);
            if (fs.existsSync(file_from)) {
                Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `Move ${file_from} to ${file_to}`);
                fs.renameSync(file_from, file_to);
            }
        }

    }

    public archive(): void {

        this.move(BaseConfigDataFolder.saved_vods);

        const channel = this.getChannel();
        if (channel) channel.removeVod(this.basename);

    }

    public async checkValidVod(save = false): Promise<boolean | null> {

        const current_status = this.twitch_vod_exists;

        if (!this.is_finalized) {
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Trying to check vod valid while not finalized on ${this.basename}`);
            return null;
        }

        if (this.twitch_vod_exists === undefined && !this.twitch_vod_id) {
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `First time check for vod valid on ${this.basename}`);
            this.matchProviderVod();
        }

        if (!this.twitch_vod_id) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `No twitch VOD id for valid checking on ${this.basename}`);
            if (this.twitch_vod_neversaved) {
                if (save && current_status !== false) {
                    this.twitch_vod_exists = false;
                    await this.saveJSON("vod check neversaved");
                }
            }
            return false;
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Check valid VOD for ${this.basename}`);

        const video = await TwitchVOD.getVideo(this.twitch_vod_id.toString());

        if (video) {
            Log.logAdvanced(LOGLEVEL.SUCCESS, "vodclass", `VOD exists for ${this.basename}`);
            this.twitch_vod_exists = true;
            if (save && current_status !== this.twitch_vod_exists) {
                await this.saveJSON("vod check true");
            }
            return true;
        }

        Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `No VOD for ${this.basename}`);

        this.twitch_vod_exists = false;

        if (save && current_status !== this.twitch_vod_exists) {
            await this.saveJSON("vod check false");
        }

        return false;

    }

    /**
     * Check vod for muted segments
     * @throws
     * @param save
     * @returns
     */
    public async checkMutedVod(save = false): Promise<MuteStatus> {

        if (!this.twitch_vod_id) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `VOD mute check for ${this.basename} canceled, no vod id!`);
            throw new Error("No VOD id");
        }

        if (!this.twitch_vod_exists) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `VOD mute check for ${this.basename} canceled, no vod!`);
            throw new Error("No VOD");
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Check muted VOD for ${this.basename} using ${Config.getInstance().cfg("checkmute_method", "api")}`);

        // since the api doesn't return muted_segments if an app auth token is used,
        // streamlink is used instead, until this is fixed in the api

        // return TwitchConfig.getInstance().cfg("checkmute_method", "api") == "api" ? await this.checkMutedVodAPI(save, force) : await this.checkMutedVodStreamlink(save, force);
        return await this.checkMutedVodStreamlink(save);

    }

    private async checkMutedVodAPI(save = false): Promise<MuteStatus> {

        if (!this.twitch_vod_id) return MuteStatus.UNKNOWN;

        const previous = this.twitch_vod_muted;

        const data = await TwitchVOD.getVideo(this.twitch_vod_id.toString());

        if (!data) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `VOD ${this.basename} is deleted!`);
            throw new Error("VOD is deleted!");
            // return null;
        } else {
            if (data.muted_segments && data.muted_segments.length > 0) {
                this.twitch_vod_muted = MuteStatus.MUTED;
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD ${this.basename} is muted!`, data);
                if (previous !== this.twitch_vod_muted && save) {
                    await this.saveJSON("vod mute true");
                }
                return MuteStatus.MUTED;
            } else {
                this.twitch_vod_muted = MuteStatus.UNMUTED;
                Log.logAdvanced(LOGLEVEL.SUCCESS, "vodclass", `VOD ${this.basename} is not muted!`, data);
                if (previous !== this.twitch_vod_muted && save) {
                    await this.saveJSON("vod mute false");
                }
                return MuteStatus.UNMUTED;
            }
        }
    }

    private async checkMutedVodStreamlink(save = false): Promise<MuteStatus> {

        const previous = this.twitch_vod_muted;

        const slp = Helper.path_streamlink();
        if (!slp) throw new Error("Streamlink not found!");

        const ex = await Helper.execSimple(slp, ["--stream-url", `https://www.twitch.tv/videos/${this.twitch_vod_id}`, "best"], "vod mute check");

        if (!ex) {
            // TwitchLog.logAdvanced(LOGLEVEL.INFO, "vodclass", "VOD ${this.basename} could not be checked for mute status!", ['output' => $output]);
            throw new Error("VOD could not be checked for mute status, no output.");
        }

        const output = ex.stdout.join("\n");

        if (output.includes("index-muted-")) {
            this.twitch_vod_muted = MuteStatus.MUTED;
            Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD ${this.basename} is muted!`);
            if (previous !== this.twitch_vod_muted && save) {
                await this.saveJSON("vod mute true");
            }
            return MuteStatus.MUTED;
        } else if (output.includes("Unable to find video")) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `VOD ${this.basename} is deleted!`);
            throw new Error("VOD is deleted!");
        } else {
            this.twitch_vod_muted = MuteStatus.UNMUTED;
            Log.logAdvanced(LOGLEVEL.SUCCESS, "vodclass", `VOD ${this.basename} is not muted!`);
            if (previous !== this.twitch_vod_muted && save) {
                await this.saveJSON("vod mute false");
            }
            return MuteStatus.UNMUTED;
        }
    }

    /**
     * Download the VOD from Twitch if vod id is set
     * @param quality 
     * @returns 
     * @throws
     */
    public async downloadVod(quality: VideoQuality = "best"): Promise<boolean> {
        if (!this.twitch_vod_id) throw new Error("No VOD id!");
        if (!this.directory) throw new Error("No directory!");

        let filename = "";
        try {
            filename = await TwitchVOD.downloadVideo(this.twitch_vod_id.toString(), quality, path.join(this.directory, `${this.basename}_vod.mp4`));
        } catch (e) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `VOD ${this.basename} could not be downloaded: ${(e as Error).message}`);
            return false;
        }

        return filename !== "";
    }

    public async fixIssues(): Promise<void> {

        if (this.not_started) {
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `VOD ${this.basename} not started yet, skipping fix!`);
            return;
        }

        // fix illegal characters
        if (this.basename.match(TwitchVOD.filenameIllegalChars)) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} contains invalid characters!`));
            const new_basename = replaceAll(this.basename, TwitchVOD.filenameIllegalChars, "_");
            this.changeBaseName(new_basename);
        }

        // if finalized but no segments
        if (this.is_finalized && (!this.segments || this.segments.length === 0)) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} is finalized but no segments found, rebuilding!`));
            if (await this.rebuildSegmentList()) {
                await this.saveJSON("fix rebuild segment list");
            } else {
                console.log(chalk.bgRed.whiteBright(`${this.basename} could not be rebuilt!`));
            }
        }

        // finalize if finished converting and not yet finalized
        if (this.is_converted && !this.is_finalized && this.segments.length > 0) {
            console.log(chalk.bgBlue.whiteBright(`${this.basename} is finished converting but not finalized, finalizing now!`));
            await this.finalize();
            await this.saveJSON("fix finalize");
        }

        // if capturing but process not running
        if (this.is_capturing && await this.getCapturingStatus(true) !== JobStatus.RUNNING) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} is capturing but process not running. Setting to false for fixing.`));
            this.is_capturing = false;
            await this.saveJSON("fix set capturing to false");
        }

        // remux if not yet remuxed
        if (!this.is_capturing && !this.is_converted && !this.is_finalized) {
            if (fs.existsSync(path.join(this.directory, `${this.basename}.ts`))) {
                console.log(chalk.bgBlue.whiteBright(`${this.basename} is not yet remuxed, remuxing now!`));
                this.is_converting = true;

                const channel = this.getChannel();
                const container_ext =
                    channel && channel.quality && channel.quality[0] === "audio_only" ?
                        Config.AudioContainer :
                        Config.getInstance().cfg("vod_container", "mp4");

                const status = await Helper.remuxFile(path.join(this.directory, `${this.basename}.ts`), path.join(this.directory, `${this.basename}.${container_ext}`));
                console.log(chalk.bgBlue.whiteBright(`${this.basename} remux status: ${status.success}`));
                this.addSegment(`${this.basename}.${container_ext}`);
                this.is_converting = false;
                await this.finalize();
                await this.saveJSON("fix remux");
            } else {
                console.log(chalk.bgRed.whiteBright(`${this.basename} is not yet remuxed but no ts file found, skipping!`));
            }
        }

        // if no ended_at set
        if (this.is_finalized && !this.ended_at) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} is finalized but no ended_at found, fixing!`));
            const duration = await this.getDuration();
            if (duration && this.started_at) {
                this.ended_at = new Date(this.started_at.getTime() + (duration * 1000));
                await this.saveJSON("fix set ended_at");
            } else {
                console.log(chalk.bgRed.whiteBright(`${this.basename} has no duration or started_at, skipping!`));
            }
        }

        // add default chapter
        if (this.is_finalized && (!this.chapters || this.chapters.length === 0)) {
            console.log(chalk.bgBlue.whiteBright(`${this.basename} is finalized but no chapters found, fixing now!`));
            await this.generateDefaultChapter();
            await this.saveJSON("fix chapters");
        }

        // if all else fails
        if (this.not_started && !this.is_finalized && !this.is_converted && !this.is_capturing && !this.is_converting && this.segments.length === 0 && !this.failed) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} is not finalized, converting, capturing or converting, failed recording?`));
            this.failed = true;
            await this.saveJSON("fix set failed true");
        }

        // if failed but actually not
        if (this.failed && this.is_finalized && this.segments.length > 0) {
            console.log(chalk.bgRed.whiteBright(`${this.basename} is failed but is finalized, fixing!`));
            this.failed = false;
            await this.saveJSON("fix set failed false");
        }

        // if segments don't begin with login
        if (this.is_finalized && this.segments.length > 0) {
            let error_segments = 0;
            for (const seg of this.segments_raw) {
                if (!path.basename(seg).startsWith(`${this.streamer_login}_`)) {
                    console.log(chalk.bgRed.whiteBright(`${this.basename} segment ${seg} does not start with login ${this.streamer_login}!`));
                    error_segments++;
                    // this.segments_raw[index] = replaceAll(segment, `${this.streamer_login}_`, `${this.streamer_login}_${this.streamer_login}_`);
                }
            }
            if (error_segments == this.segments_raw.length) {
                console.log(chalk.bgRed.whiteBright(`${this.basename} has no segments starting with login ${this.streamer_login}, fixing!`));
                this.rebuildSegmentList();
            }
        }

    }

    public renderChat(chat_width: number, chat_height: number, font: string, font_size: number, use_downloaded: boolean, overwrite: boolean): Promise<boolean> {

        if (use_downloaded && !this.is_chat_downloaded) {
            console.error(chalk.redBright("No chat downloaded"));
            throw new Error("No chat downloaded");
        } else if (!use_downloaded && !this.is_chatdump_captured) {
            console.error(chalk.redBright("No chat dumped"));
            throw new Error("No chat dumped");
        }

        if (!this.video_metadata) {
            console.error(chalk.redBright("No video metadata"));
            throw new Error("No video metadata");
        }

        if (!("height" in this.video_metadata)) {
            console.error(chalk.redBright("No video metadata height"));
            throw new Error("No video metadata height");
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Render chat for ${this.basename}`);

        if (fs.existsSync(this.path_chat) && fs.existsSync(this.path_chatrender) && !overwrite) {
            console.error(chalk.redBright("Chat already rendered"));
            throw new Error("Chat already rendered");
        }

        const bin = Helper.path_twitchdownloader();
        const ffmpeg_bin = Helper.path_ffmpeg();
        const args: string[] = [];

        if (!bin || !fs.existsSync(bin)) {
            console.error(chalk.redBright("TwitchDownloaderCLI not installed"));
            throw new Error("TwitchDownloaderCLI not installed");
        }

        if (!ffmpeg_bin || !fs.existsSync(ffmpeg_bin)) {
            console.error(chalk.redBright("FFmpeg not installed"));
            throw new Error("FFmpeg not installed");
        }

        args.push("--mode", "ChatRender");
        args.push("--temp-path", BaseConfigDataFolder.cache);
        args.push("--ffmpeg-path", ffmpeg_bin);
        args.push("--input", path.normalize(use_downloaded ? this.path_chat : this.path_chatdump));
        args.push("--chat-height", (chat_height ? chat_height : this.video_metadata.height).toString());
        args.push("--chat-width", chat_width.toString());
        args.push("--framerate", Math.round(this.video_metadata.fps).toString());
        args.push("--update-rate", "0");
        args.push("--font", font);
        args.push("--font-size", font_size.toString());
        args.push("--outline");
        args.push("--background-color", "#00000000"); // alpha
        args.push("--generate-mask");
        args.push("--output", this.path_chatrender);

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Running ${bin} ${args.join(" ")}`);

        const env = {
            DOTNET_BUNDLE_EXTRACT_BASE_DIR: BaseConfigDataFolder.dotnet,
            TEMP: BaseConfigDataFolder.cache,
        };

        return new Promise((resolve, reject) => {

            const job = Helper.startJob(`tdrender_${this.basename}`, bin, args, env);

            if (!job) {
                console.error(chalk.redBright("Couldn't start job"));
                reject(new Error("Couldn't start job"));
                throw new Error("Could not start job");
            }

            job.on("stdout", (data: string) => {
                if (data.includes("Fetching ")) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat render fetching: ${data}`);
                } else if (data.includes("Rendering Comments")) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", "Comments now rendering!");
                } else if (data.trim() == "[STATUS] - Rendering Video 0%") {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", "Chat history now rendering!");
                } else if (data.includes("FINISHED")) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", "Chat render finished!");
                }
            });

            job.on("close", (code) => {

                if (job.stdout.join("").includes("Option 'temp-path' is unknown")) {
                    console.error(chalk.redBright("The version of TwitchDownloaderCLI  is too old. Please update to the latest version."));
                    reject(new Error("The version of TwitchDownloaderCLI is too old. Please update to the latest version."));
                    return;
                }

                if (fs.existsSync(this.path_chatrender) && fs.statSync(this.path_chatrender).size > 0) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat rendered for ${this.basename} (code ${code})`);
                    resolve(true);
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Chat couldn't be rendered for ${this.basename} (code ${code})`);
                    reject(new Error("Chat couldn't be rendered"));
                    // reject(false);
                }
            });

        });

    }

    public burnChat(
        burn_horizontal = "left",
        burn_vertical = "top",
        ffmpeg_preset = "slow",
        ffmpeg_crf = 26,
        use_vod = false,
        overwrite = false,
        test_duration = false
    ): Promise<boolean> {

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Burn chat for ${this.basename}`);

        if (this.path_chatburn && fs.existsSync(this.path_chatburn) && !overwrite) {
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat already burned for ${this.basename}`);
            throw new Error(`Chat already burned for ${this.basename}`);
        }

        let video_filename = "";

        if (use_vod) {
            if (!this.is_vod_downloaded) {
                throw new Error(`VOD not downloaded for ${this.basename}`);
            }
            video_filename = this.path_downloaded_vod;
        } else if (this.segments && this.segments.length > 0 && this.segments[0].filename) {
            video_filename = this.segments[0].filename;
        } else {
            throw new Error(`No segments available for ${this.basename}`);
        }

        if (!video_filename) {
            throw new Error(`No video file for ${this.basename}`);
        }

        if (!this.path_chatrender || !fs.existsSync(this.path_chatrender)) {
            throw new Error(`Chat render not found for ${this.basename}`);
        }

        if (!this.path_chatmask || !fs.existsSync(this.path_chatmask)) {
            throw new Error(`Chat mask not found for ${this.basename}`);
        }

        const bin = Helper.path_ffmpeg();
        const args: string[] = [];

        if (!bin) {
            throw new Error("ffmpeg not found");
        }

        const startOffset = this.getStartOffset();

        // chat render offset
        if (startOffset && !use_vod) {
            args.push("-ss", startOffset.toString());
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Using start offset for chat: ${startOffset}`);
        }

        // chat render
        args.push("-i", this.path_chatrender);


        // chat mask offset
        if (startOffset && !use_vod) {
            args.push("-ss", startOffset.toString());
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Using start offset for chat mask: ${startOffset}`);
        }

        // chat mask
        args.push("-i", this.path_chatmask);

        // vod
        args.push("-i", video_filename);

        // alpha mask
        // https://ffmpeg.org/ffmpeg-filters.html#overlay-1
        // https://stackoverflow.com/questions/50338129/use-ffmpeg-to-overlay-a-video-on-top-of-another-using-an-alpha-channel
        const pos_x = burn_horizontal == "left" ? 0 : "main_w-overlay_w";
        const pos_y = burn_vertical == "top" ? 0 : "main_h-overlay_h";
        args.push("-filter_complex", `[0][1]alphamerge[ia];[2][ia]overlay=${pos_x}:${pos_y}`);

        // copy audio stream
        args.push("-c:a", "copy");

        // h264 codec
        args.push("-c:v", "libx264");

        // preset
        args.push("-preset", ffmpeg_preset);

        // crf
        args.push("-crf", ffmpeg_crf.toString());

        // overwrite
        args.push("-y");

        // output
        args.push(this.path_chatburn);

        return new Promise((resolve, reject) => {

            const job = Helper.startJob(`burnchat_${this.basename}`, bin, args);
            if (!job) throw new Error("Job failed");

            job.on("close", (code) => {

                if (fs.existsSync(this.path_chatburn) && fs.statSync(this.path_chatburn).size > 0) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat burned for ${this.basename} (code ${code})`);
                    resolve(true);
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Chat couldn't be burned for ${this.basename} (code ${code})`);
                    reject(false);
                }

            });
        });

    }

    public getStartOffset(): number | false {
        if (!this.twitch_vod_duration) return false;
        // const dur = await this.getDuration();
        // if (!dur) return false;
        return this.twitch_vod_duration - this.duration;
    }

    public async startWatching() {
        if (this.fileWatcher) await this.stopWatching();

        // no blocks in testing
        if (process.env.NODE_ENV === "test") return;

        const files = this.associatedFiles.map((f) => path.join(this.directory, f));

        this.fileWatcher = chokidar.watch(files, {
            ignoreInitial: true,
        }).on("all", (eventType, filename) => {

            const channel = this.getChannel();
            if (channel) {
                if (channel.live_chat && (filename.endsWith(".chatdump.line") || filename.endsWith(".chatdump.txt"))) {
                    return;
                }
            }

            if (Config.debug) console.log(`VOD file ${filename} changed (${this._writeJSON ? "internal" : "external"}/${eventType})!`);

            if (filename === this.filename) {
                if (!fs.existsSync(this.filename)) {
                    Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD JSON ${this.basename} deleted!`);
                    if (TwitchVOD.vods.find(v => v.basename == this.basename)) {
                        Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD ${this.basename} still in memory!`);

                        // const channel = TwitchChannel.getChannelByLogin(this.streamer_login);
                        // if (channel) channel.removeVod(this.basename);
                    }

                    setTimeout(() => {
                        TwitchVOD.cleanLingeringVODs();
                    }, 4000);

                    const channel = this.getChannel();
                    if (channel) {
                        setTimeout(() => {
                            if (!channel) return;
                            channel.checkStaleVodsInMemory();
                        }, 5000);
                    }
                } else {
                    Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `VOD JSON ${this.basename} exists (again?) ${eventType}`);
                }
            } else if (this.segments.some(s => s.filename === filename)) {
                if (Config.debug) console.debug(`VOD segment ${filename} changed (${eventType})!`);
                ClientBroker.notify(
                    "Segment changed externally",
                    path.basename(filename),
                    undefined,
                    "system"
                );
            } else {
                if (Config.debug) console.debug(`VOD file ${filename} changed (${eventType})!`);
                ClientBroker.notify(
                    "VOD file changed externally",
                    path.basename(filename),
                    undefined,
                    "system"
                );
            }

        });
    }

    public async stopWatching() {
        if (this.fileWatcher) await this.fileWatcher.close();
        this.fileWatcher = undefined;
        // console.log(`Stopped watching ${this.basename}`);
    }

    public changeBaseName(new_basename: string) {
        if (this.basename == new_basename) return;
        const old_basename = this.basename;

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Changing basename from ${old_basename} to ${new_basename}`);

        for (const file of this.associatedFiles) {
            const file_path = path.join(this.directory, file);
            if (fs.existsSync(file_path)) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Rename assoc ${file_path} to ${replaceAll(file_path, old_basename, new_basename)}`);
                fs.renameSync(file_path, replaceAll(file_path, old_basename, new_basename));
            } else {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `File assoc ${file_path} not found!`);
            }
        }

        for (const segment of this.segments_raw) {
            const file_path = path.join(this.directory, path.basename(segment));
            if (fs.existsSync(file_path)) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Rename segment ${file_path} to ${replaceAll(file_path, old_basename, new_basename)}`);
                fs.renameSync(file_path, replaceAll(file_path, old_basename, new_basename));
            } else {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Segment ${file_path} not found!`);
            }
        }


        this.basename = new_basename;
        this.filename = replaceAll(this.filename, old_basename, new_basename);
        this.setupFiles();
        this.rebuildSegmentList();
    }

    /**
     * Get the channel of the vod
     * 
     * @returns Channel
     */
    public getChannel(): TwitchChannel | undefined {
        return TwitchChannel.getChannelByLogin(this.streamer_login);
    }

    public downloadChat(method: "td" | "tcd" = "td"): Promise<boolean> {
        // since tcd does not work anymore, twitchdownloadercli is used instead
        if (!this.twitch_vod_id) {
            throw new Error("No twitch_vod_id for chat download");
        }
        return TwitchVOD.downloadChat(method, this.twitch_vod_id, this.path_chat);
    }



    public compareDumpedChatAndDownloadedChat(): void {

        if (!fs.existsSync(this.path_chat)) return;
        if (!fs.existsSync(this.path_chatdump)) return;

        const chat: TwitchCommentDump = JSON.parse(fs.readFileSync(this.path_chat, "utf8"));
        const chatdump: TwitchCommentDump = JSON.parse(fs.readFileSync(this.path_chatdump, "utf8"));

        const compareMessages = (message1: TwitchComment, message2: TwitchComment) => {
            return message1.message.body.trim() == message2.message.body.trim() && message1.commenter.name == message2.commenter.name;
        };

        console.log("chat", this.path_chat);

        // compare chat and chatdump
        let not_found = 0;
        for (const i in chatdump.comments) {
            const comment = chatdump.comments[parseInt(i)];
            const findIndex = chat.comments.findIndex(c => compareMessages(c, comment) && !(c as any).found);
            if (findIndex !== -1) {
                (chat.comments[findIndex] as any).found = true;
                // if (parseInt(i) % 100 == 0) console.log(`found @ d${i}/c${findIndex}`, `${comment.commenter.name}: ${comment.message.body}`);
            } else {
                // console.log(chalk.red("not found", `${i}/${chatdump.comments.length}`, `${comment.commenter.name}: ${comment.message.body}`));
                not_found++;
            }
            // if (parseInt(i) > 1000) break;
        }

        console.log(chalk.red("not found amount", not_found));
        /*
        for (const i in chatdump.comments) {
            const comment = chatdump.comments[i];
            const idx = chat.comments.findIndex(c => c.message.body == comment.message.body && c.commenter.name == comment.commenter.name);
            if (idx == -1) {
                console.log(`Comment not found in chatdump: ${comment.message.body}`);
            } else {
                console.log(`${idx-parseInt(i)} comments mismatch`);
                console.log("first downloaded comment date:", chat.comments[0].created_at);
                console.log("first chatdump comment date:", chatdump.comments[0].created_at);
                console.log("difference:", (parseISO(chat.comments[0].created_at).getTime() - parseISO(chatdump.comments[0].created_at).getTime()) / 1000);

                console.log(comment.commenter.name, comment.message.body);
                console.log(chatdump.comments[idx].commenter.name, chatdump.comments[idx].message.body);
                console.log("");
            }
            return;
        }
        */

    }

    public setupStreamNumber() {
        const channel = this.getChannel();
        if (channel && channel.current_stream_number !== undefined && this.stream_number === undefined) {
            this.stream_number = channel.incrementStreamNumber();
            // this.stream_number = channel.current_stream_number;
            // channel.current_stream_number++;
            this.saveJSON("default stream_number set");
            // KeyValue.getInstance().setInt(`${channel.login}.stream_number`, channel.current_stream_number);
        }
    }

    public postLoad() {
        this.setupStreamNumber();
    }

    /**
     * 
     * STATIC
     * 
     */

    public static async load(filename: string, api = false): Promise<TwitchVOD> {

        const basename = path.basename(filename);

        const cached_vod = this.getVod(basename);
        if (cached_vod) {
            console.log(`[TwitchVOD] Returning cached vod ${basename}`);
            return cached_vod;
        }

        // check if file exists
        if (!fs.existsSync(filename)) {
            throw new Error("VOD JSON does not exist: " + filename);
        }

        // load file
        const data = fs.readFileSync(filename, "utf8");
        if (data.length == 0) {
            throw new Error("File is empty: " + filename);
        }

        // parse file
        let json: TwitchVODJSON = JSON.parse(data);

        if (!("version" in json) || json.version < 2) {
            if (process.env.TCD_MIGRATE_OLD_VOD_JSON == "1") {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Invalid VOD JSON version: ${filename}, trying to migrate...`);
                const { newJson, newBasename } = TwitchVOD.migrateOldJSON(json, path.dirname(filename), path.basename(filename));
                json = newJson;
                if (path.basename(filename) != newBasename) {
                    Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `New basename for ${filename}: ${newBasename}`);
                    fs.renameSync(filename, path.join(path.dirname(filename), newBasename));
                    filename = path.join(path.dirname(filename), newBasename);
                }
            } else {
                throw new Error(`Invalid VOD JSON version for ${filename}, set TCD_MIGRATE_OLD_VOD_JSON to 1 to migrate on load.`);
            }
        }

        // create object
        const vod = new TwitchVOD();

        vod.capture_id = json.capture_id || "";
        vod.filename = filename;
        vod.basename = path.basename(filename, ".json");
        vod.directory = path.dirname(filename);

        vod.json = json;

        vod.setupDates();
        await vod.setupUserData();
        vod.setupBasic();
        vod.setupProvider();
        await vod.setupAssoc();
        vod.setupFiles();

        // $vod.webpath = TwitchConfig.getInstance().cfg('basepath') . '/vods/' . (TwitchConfig.getInstance().cfg("channel_folders") && $vod.streamer_login ? $vod.streamer_login : '');

        // if (api) {
        // 	vod.setupApiHelper();
        // }

        Log.logAdvanced(LOGLEVEL.DEBUG, "vodclass", `VOD Class for ${vod.basename} with api ${api ? "enabled" : "disabled"}!`);

        // vod.saveJSON();

        // add to cache
        this.addVod(vod);

        await vod.startWatching();

        // fs.unwatchFile(vod.filename);

        await vod.fixIssues();

        // console.debug("vod getter check", vod.basename, vod.directory, vod.is_converted, vod.is_finalized, vod.is_capturing, vod.is_converting);

        if (!vod.not_started && !vod.is_finalized) {
            Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Loaded VOD ${vod.basename} is not finalized!`);
        }

        // vod.compareDumpedChatAndDownloadedChat();

        // vod.getFFProbe();

        vod.loaded = true;

        return vod;

    }

    // too much work
    static migrateOldJSON(json: any, basepath: string, basename: string): { newJson: TwitchVODJSON, newBasename: string } {

        Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Migrating old VOD JSON ${basename}`);

        const chapters: TwitchVODChapterJSON[] = [];
        const segments: string[] = (json.segments || json.segments_raw).map((s: string | { filename: string; basename: string; filesize: number; strings: string[]; }) => {
            let name = "";
            if (typeof s === "string") {
                name = path.basename(s);
            } else {
                name = s.basename;
            }

            let newName = "";
            try {
                newName = path.basename(trueCasePathSync(path.join(basepath, name)));
            } catch (error) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Could not find segment ${name} in ${basepath}`);
                return undefined;
            }

            if (newName != name) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Renaming segment ${name} to ${newName}`);
                fs.renameSync(path.join(basepath, name), path.join(basepath, newName));
            } else {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Segment ${name} is already named correctly`);
            }

            return newName;

            /*
            // check if case sensitive file exists
            if (fileExistsWithCaseSync(path.join(basepath, name))) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Found default file: ${name}`);
                return name;
            } else if (fileExistsWithCaseSync(path.join(basepath, name.toLocaleLowerCase()))) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Found lowercase file: ${name.toLocaleLowerCase()}`);
                fs.renameSync(path.join(basepath, name), path.join(basepath, name.toLocaleLowerCase())); // rename to lowercase
                return name.toLocaleLowerCase(); // new format uses lowercase logins
            } else {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Could not find file: ${name} at ${path.join(basepath, name)} or ${path.join(basepath, name.toLocaleLowerCase())}`);
                return undefined;
            }
            */
        }).filter((s: string | undefined) => s !== undefined);

        if (segments.length == 0) {
            throw new Error(`No segments found in ${basename}`);
        }

        Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Migrated segments: ${segments.length}`);
        Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Migrated chapters: ${json.chapters.length}`);

        for (const chapter of json.chapters) {
            let started_at = "";

            if (chapter.dt_started_at) {
                started_at = JSON.stringify(parse(chapter.dt_started_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            } else if (chapter.time) {
                started_at = JSON.stringify(parseJSON(chapter.time));
            }

            const new_chapter: TwitchVODChapterJSON = {
                started_at: started_at,
                game_id: chapter.game_id,
                game_name: chapter.game_name,
                viewer_count: chapter.viewer_count,
                title: chapter.title,
                // offset: chapter.offset,
                box_art_url: chapter.box_art_url,
                is_mature: false,
                online: true,
            };
            chapters.push(new_chapter);
        }

        let saved_at = "";
        // json.saved_at ? JSON.stringify(parse(json.saved_at.date, Helper.PHP_DATE_FORMAT, new Date())) : JSON.stringify(new Date())
        let started_at = "";
        let ended_at = "";

        if (json.saved_at) {
            saved_at = JSON.stringify(parse(json.saved_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated saved_at: ${saved_at}`);
        }

        if (json.started_at) {
            started_at = JSON.stringify(parse(json.started_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated started_at with json.started_at: ${started_at}`);
        } else if (json.dt_started_at) {
            started_at = JSON.stringify(parse(json.dt_started_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated started_at with json.dt_started_at: ${started_at}`);
        }

        if (json.ended_at) {
            ended_at = JSON.stringify(parse(json.ended_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated ended_at with json.ended_at: ${ended_at}`);
        } else if (json.dt_ended_at) {
            ended_at = JSON.stringify(parse(json.dt_ended_at.date, Helper.PHP_DATE_FORMAT, new Date()));
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated ended_at with json.dt_ended_at: ${ended_at}`);
        }

        if (!saved_at || !started_at || !ended_at) {
            throw new Error(`Could not migrate dates for ${basename}`);
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated date saved_at: ${saved_at}`);
        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated date started_at: ${started_at}`);
        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Migrated date ended_at: ${ended_at}`);

        const new_json: TwitchVODJSON = {
            "version": 2,
            meta: undefined,
            twitch_vod_id: json.twitch_vod_id,
            twitch_vod_duration: json.twitch_vod_duration,
            twitch_vod_title: json.twitch_vod_title,
            twitch_vod_date: json.twitch_vod_date,
            twitch_vod_exists: json.twitch_vod_exists,
            twitch_vod_attempted: json.twitch_vod_attempted,
            twitch_vod_neversaved: json.twitch_vod_neversaved,
            twitch_vod_muted: json.twitch_vod_muted === true ? MuteStatus.MUTED : MuteStatus.UNKNOWN,
            stream_resolution: json.stream_resolution,
            streamer_name: json.streamer_name,
            streamer_id: json.streamer_id,
            streamer_login: json.streamer_login,
            chapters: chapters,
            type: "twitch",
            segments: segments,
            is_capturing: json.is_capturing,
            is_converting: json.is_converting,
            is_finalized: json.is_finalized,
            duration: typeof json.duration === "number" ? json.duration : undefined,
            saved_at: saved_at,
            started_at: started_at,
            ended_at: ended_at,
            not_started: false,
            prevent_deletion: false,
        };

        return {
            newJson: new_json,
            newBasename: basename.toLocaleLowerCase(),
        };
    }

    public static addVod(vod: TwitchVOD): boolean {

        if (!vod.basename)
            throw new Error("VOD basename is not set!");

        if (this.hasVod(vod.basename))
            throw new Error(`VOD ${vod.basename} is already in cache!`);

        this.vods.push(vod);

        return this.hasVod(vod.basename);
    }

    public static hasVod(basename: string): boolean {
        return this.vods.findIndex(vod => vod.basename == basename) != -1;
    }

    public static getVod(basename: string): TwitchVOD | undefined {
        if (TwitchVOD.hasVod(basename)) {
            return TwitchVOD.vods.find(vod => vod.basename == basename);
        }
    }

    /**
     * Remove a vod from the vods list
     * 
     * @param basename 
     * @returns 
     */
    public static removeVod(basename: string): boolean {
        if (TwitchVOD.hasVod(basename)) {
            TwitchVOD.vods = TwitchVOD.vods.filter(vod => vod.basename != basename);
            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `VOD ${basename} removed from memory!`);
            Webhook.dispatch("vod_removed", { basename: basename });
            return true;
        }
        return false;
    }

    /**
     * Download a video from Twitch to a file
     * 
     * @param video_id 
     * @param quality 
     * @param filename 
     * @throws
     * @returns 
     */
    public static async downloadVideo(video_id: string, quality: VideoQuality = "best", filename: string): Promise<string> {

        Log.logAdvanced(LOGLEVEL.INFO, "channel", `Download VOD ${video_id}`);

        const video = await TwitchVOD.getVideo(video_id);

        if (!video) {
            Log.logAdvanced(LOGLEVEL.ERROR, "channel", `Failed to get video ${video_id}`);
            throw new Error(`Failed to get video ${video_id}`);
        }

        const basename = path.basename(filename);

        const capture_filename = path.join(BaseConfigDataFolder.cache, `${video_id}.ts`);
        const converted_filename = filename;

        // download vod
        if (!fs.existsSync(capture_filename) && !fs.existsSync(converted_filename)) {

            const video_url = `https://www.twitch.tv/videos/${video_id}`;

            const streamlink_bin = Helper.path_streamlink();
            const ffmpeg_bin = Helper.path_ffmpeg();

            if (!streamlink_bin) {
                Log.logAdvanced(LOGLEVEL.ERROR, "channel", "Failed to find streamlink binary!");
                throw new Error("Failed to find streamlink binary!");
            }

            if (!ffmpeg_bin) {
                Log.logAdvanced(LOGLEVEL.ERROR, "channel", "Failed to find ffmpeg binary!");
                throw new Error("Failed to find ffmpeg binary!");
            }

            const cmd = [];

            cmd.push("--ffmpeg-ffmpeg", ffmpeg_bin);

            cmd.push("-o", capture_filename); // output file

            cmd.push("--hls-segment-threads", "10");

            cmd.push("--url", video_url); // stream url

            cmd.push("--default-stream", quality); // twitch url and quality

            // logging level
            if (Config.debug) {
                cmd.push("--loglevel", "debug");
            } else if (Config.getInstance().cfg("app_verbose", false)) {
                cmd.push("--loglevel", "info");
            }

            Log.logAdvanced(LOGLEVEL.INFO, "channel", `Downloading VOD ${video_id}...`);

            const ret = await Helper.execAdvanced(streamlink_bin, cmd, `download_vod_${video_id}`);

            Log.logAdvanced(LOGLEVEL.INFO, "channel", `Downloaded VOD ${video_id}...}`);

            if (ret.stdout.join("\n").includes("error: Unable to find video:") || ret.stderr.join("\n").includes("error: Unable to find video:")) {
                throw new Error("VOD on Twitch not found, is it deleted?");
            }
        }

        if (!fs.existsSync(converted_filename)) {

            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Starting remux of ${basename}`);

            let chapters_file = "";
            if (Config.getInstance().cfg("create_video_chapters")) {
                chapters_file = path.join(BaseConfigDataFolder.cache, `${video_id}.ffmpeg.txt`);
                const end = Helper.parseTwitchDuration(video.duration);
                const meta = new FFmpegMetadata().setArtist(video.user_name).setTitle(video.title).addChapter(0, end, video.title, "1/1000");
                fs.writeFileSync(chapters_file, meta.getString());
            }

            let ret;
            try {
                ret = await Helper.remuxFile(capture_filename, converted_filename, undefined, chapters_file);
            } catch (error) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to remux ${basename}: ${(error as Error).message}`);
                throw new Error(`Failed to remux ${basename}: ${(error as Error).message}`);
            }

            if (chapters_file) {
                fs.unlinkSync(chapters_file);
            }

            if (ret.success) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Successfully remuxed ${basename}, removing ${capture_filename}`);
                fs.unlinkSync(capture_filename);
            } else {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Failed to remux ${basename}`);
            }
        }

        const successful = fs.existsSync(converted_filename) && fs.statSync(converted_filename).size > 0;

        if (!successful) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to download ${basename}, no file found!`);
            throw new Error(`Failed to download ${basename}, no file found!`);
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Download of ${basename} successful`);

        Webhook.dispatch("video_download", {
            "success": true,
            "path": converted_filename,
        });

        return converted_filename;
    }

    public static getClipId(clip_url: string): string | false {
        const id_match1 = clip_url.match(/\/clip\/([0-9a-zA-Z_-]+)/);
        const id_match2 = clip_url.match(/clip=([0-9a-zA-Z_-]+)/);
        const id_match3 = clip_url.match(/clips\.twitch\.tv\/([0-9a-zA-Z_-]+)/);
        const id_match4 = clip_url.match(/clips\.twitch\.tv\/embed\/([0-9a-zA-Z_-]+)/);
        if (id_match1) return id_match1[1];
        if (id_match2) return id_match2[1];
        if (id_match3) return id_match3[1];
        if (id_match4) return id_match4[1];
        return false;
    }

    public static async downloadClip(clip_id: string, filename: string, quality: VideoQuality = "best"): Promise<string> {

        Log.logAdvanced(LOGLEVEL.INFO, "channel", `Download clip ${clip_id}`);

        const clips = await TwitchVOD.getClips({ id: clip_id });

        if (!clips) {
            Log.logAdvanced(LOGLEVEL.ERROR, "channel", `Failed to get clip ${clip_id}`);
            throw new Error(`Failed to get clip ${clip_id}`);
        }

        const clip = clips[0];

        const basename = path.basename(filename);

        const capture_filename = path.join(BaseConfigDataFolder.cache, `${clip_id}.ts`);
        const converted_filename = filename;

        // download vod
        if (!fs.existsSync(capture_filename) && !fs.existsSync(converted_filename)) {

            const video_url = clip.url;

            const streamlink_bin = Helper.path_streamlink();
            const ffmpeg_bin = Helper.path_ffmpeg();

            if (!streamlink_bin) {
                Log.logAdvanced(LOGLEVEL.ERROR, "channel", "Failed to find streamlink binary!");
                throw new Error("Failed to find streamlink binary!");
            }

            if (!ffmpeg_bin) {
                Log.logAdvanced(LOGLEVEL.ERROR, "channel", "Failed to find ffmpeg binary!");
                throw new Error("Failed to find ffmpeg binary!");
            }

            const cmd = [];

            cmd.push("--ffmpeg-ffmpeg", ffmpeg_bin);

            cmd.push("-o", capture_filename); // output file

            cmd.push("--hls-segment-threads", "10");

            cmd.push("--url", video_url); // stream url

            cmd.push("--default-stream", quality); // twitch url and quality

            // logging level
            if (Config.debug) {
                cmd.push("--loglevel", "debug");
            } else if (Config.getInstance().cfg("app_verbose", false)) {
                cmd.push("--loglevel", "info");
            }

            Log.logAdvanced(LOGLEVEL.INFO, "channel", `Downloading clip ${clip_id}...`);

            const ret = await Helper.execAdvanced(streamlink_bin, cmd, `download_clip_${clip_id}`);

            Log.logAdvanced(LOGLEVEL.INFO, "channel", `Downloaded clip ${clip_id}...}`);

            if (ret.stdout.join("\n").includes("error: Unable to find video:") || ret.stderr.join("\n").includes("error: Unable to find video:")) {
                throw new Error("Clip on Twitch not found, is it deleted?");
            }
        }

        if (!fs.existsSync(converted_filename)) {

            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Starting remux of ${basename}`);

            const metadata = new FFmpegMetadata()
                .setAlbumArtist(clip.creator_name)
                .setArtist(clip.broadcaster_name)
                .setTitle(clip.title)
                .setComment(`Clipped by ${clip.creator_name}.\nSource: ${clip.url}\nClip ID: ${clip.id}`)
                .setDate(parseJSON(clip.created_at))
                .writeToFile(path.join(BaseConfigDataFolder.cache, `${clip_id}.ffmpeg.txt`));

            let ret;
            try {
                ret = await Helper.remuxFile(capture_filename, converted_filename, undefined, metadata);
            } catch (error) {
                Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to remux ${basename}: ${(error as Error).message}`);
                throw new Error(`Failed to remux ${basename}: ${(error as Error).message}`);
            }

            if (ret.success) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Successfully remuxed ${basename}, removing ${capture_filename}`);
                fs.unlinkSync(capture_filename);
            } else {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Failed to remux ${basename}`);
            }
        }

        const successful = fs.existsSync(converted_filename) && fs.statSync(converted_filename).size > 0;

        if (!successful) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Failed to download ${basename}, no file found!`);
            throw new Error(`Failed to download ${basename}, no file found!`);
        }

        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Download of ${basename} successful`);

        Webhook.dispatch("video_download", {
            "success": true,
            "path": converted_filename,
        });

        return converted_filename;

    }

    /**
     * Get video information from Twitch
     * @param video_id 
     * @throws
     * @returns 
     */
    static async getVideo(video_id: string): Promise<false | Video> {
        if (!video_id) throw new Error("No video id");

        if (!Helper.axios) {
            throw new Error("Axios is not initialized");
        }

        let response;

        try {
            response = await Helper.axios.get(`/helix/videos/?id=${video_id}`);
        } catch (err) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Tried to get video id ${video_id} but got error ${(err as Error).message}`);
            if (axios.isAxiosError(err)) {
                if (err.response && err.response.status === 404) {
                    return false;
                }
                throw new Error(`Tried to get video id ${video_id} but got error: ${(err as Error).message}`);
            }
            return false;
        }

        const json: VideosResponse = response.data;

        if (json.data.length === 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Tried to get video id ${video_id} but got no data`);
            return false;
        }

        return json.data[0];

    }

    static async getVideos(channel_id: string): Promise<false | Video[]> {
        if (!channel_id) throw new Error("No channel id");

        if (!Helper.axios) {
            throw new Error("Axios is not initialized");
        }

        let response;

        try {
            response = await Helper.axios.get(`/helix/videos?user_id=${channel_id}`);
        } catch (e) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Tried to get videos for channel id ${channel_id} but got error ${e}`);
            return false;
        }

        const json: VideosResponse = response.data;

        if (json.data.length === 0) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Tried to get videos for channel id ${channel_id} but got no data`);
            return false;
        }

        return json.data;
    }

    static async getClips({ broadcaster_id, game_id, id }: { broadcaster_id?: string; game_id?: string; id?: string[] | string; }): Promise<false | Clip[]> {

        if (!broadcaster_id && !game_id && !id) throw new Error("No broadcaster id, game id or id provided");

        if (!Helper.axios) {
            throw new Error("Axios is not initialized");
        }

        let response;
        const params = new URLSearchParams();
        if (broadcaster_id) params.append("broadcaster_id", broadcaster_id);
        if (game_id) params.append("game_id", game_id);
        if (id && typeof id === "string") params.append("id", id);
        if (id && Array.isArray(id) && id.length > 0) {
            id.forEach((id) => {
                params.append("id", id);
            });
        }

        try {
            response = await Helper.axios.get("/helix/clips", {
                params: params,
            });
        } catch (e) {
            Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Tried to get clips but got error: ${(e as Error).message}`);
            if (axios.isAxiosError(e) && e.response) {
                console.debug("data", e.response.data);
            }
            return false;
        }

        const json: ClipsResponse = response.data;

        if (json.data.length === 0) {
            return false;
        }

        return json.data;

    }

    static cleanLingeringVODs(): void {
        this.vods.forEach((vod) => {
            const channel = vod.getChannel();
            if (!channel) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `Channel ${vod.streamer_login} removed but VOD ${vod.basename} still lingering`);
            }
            if (!fs.existsSync(vod.filename)) {
                Log.logAdvanced(LOGLEVEL.WARNING, "vodclass", `VOD ${vod.basename} in memory but not on disk`);
            }
        });
    }

    public static async downloadChat(method: "td" | "tcd" = "td", vod_id: string, output: string): Promise<boolean> {
        return method == "td" ? await this.downloadChatTD(vod_id, output) : await this.downloadChatTCD(vod_id, output);
    }

    public static downloadChatTD(vod_id: string, output: string): Promise<boolean> {
        return new Promise((resolve, reject) => {

            const bin = Helper.path_twitchdownloader();

            if (!bin || !fs.existsSync(bin)) {
                reject(new Error("twitchdownloadercli not found"));
                return;
            }

            if (!vod_id) {
                reject(new Error("No VOD ID"));
                return;
            }

            if (fs.existsSync(output)) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat already exists for ${vod_id}`);
                resolve(true);
                return;
            }

            const args: string[] = [];
            args.push("--mode", "ChatDownload");
            args.push("--temp-path", BaseConfigDataFolder.cache);
            args.push("--ffmpeg-path", Helper.path_ffmpeg() || "");
            args.push("--id", vod_id);
            args.push("-o", output);

            const env = {
                DOTNET_BUNDLE_EXTRACT_BASE_DIR: BaseConfigDataFolder.dotnet,
                TEMP: BaseConfigDataFolder.cache,
                PWD: BaseConfigDataFolder.dotnet,
            };

            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Downloading chat for ${vod_id}`);

            const job = Helper.startJob(`chatdownload_${vod_id}`, bin, args, env);
            if (!job) {
                reject(new Error("Job failed"));
                return;
            }

            // let lastPercent = -1;
            // [STATUS] - Downloading 10%
            job.on("log", (stream: string, text: string) => {
                const match = text.match(/\[STATUS\] - Downloading (\d+)%/);
                if (match) {
                    const percent = parseInt(match[1]);
                    /*
                    if (percent != lastPercent && percent % 10 == 0) {
                        Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Downloading chat for ${vod_id} (${percent}%)`);
                        lastPercent = percent;
                    }
                    */
                    job.setProgress(percent / 100);
                } else {
                    console.debug("chat download log text", text);
                }
            });

            job.on("close", (code, signal) => {
                if (fs.existsSync(output) && fs.statSync(output).size > 0) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat downloaded for ${vod_id}`);
                    resolve(true);
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Chat couldn't be downloaded for ${vod_id}`);
                    reject(false);
                }
            });

        });
    }

    public static downloadChatTCD(vod_id: string, output: string): Promise<boolean> {

        return new Promise((resolve, reject) => {

            const bin = Helper.path_tcd();

            if (!bin || !fs.existsSync(bin)) {
                reject(new Error("tcd not found"));
                return;
            }

            if (!vod_id) {
                reject(new Error("No VOD ID"));
                return;
            }

            if (fs.existsSync(output)) {
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat already exists for ${vod_id}`);
                resolve(true);
                return;
            }

            const temp_filepath = path.join(BaseConfigDataFolder.cache, `${vod_id}.json`);

            if (fs.existsSync(temp_filepath)) {
                fs.renameSync(temp_filepath, output);
                Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat renamed for ${vod_id}`);
                resolve(true);
            }

            const args: string[] = [];
            args.push("--settings-file", path.join(BaseConfigDataFolder.config, "tcd_settings.json"));
            args.push("--video", vod_id);
            args.push("--client-id", Config.getInstance().cfg("api_client_id"));
            args.push("--client-secret", Config.getInstance().cfg("api_secret"));
            args.push("--format", "json");
            if (Config.debug || Config.getInstance().cfg("app_verbose")) {
                args.push("--verbose");
                args.push("--debug");
            }
            args.push("--output", BaseConfigDataFolder.cache);

            Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Downloading chat for ${vod_id}`);

            const job = Helper.startJob(`chatdownload_${vod_id}`, bin, args);
            if (!job) {
                reject(new Error("Job failed"));
                return;
            }

            job.on("close", (code, signal) => {
                if (fs.existsSync(temp_filepath) && fs.statSync(temp_filepath).size > 0) {
                    Log.logAdvanced(LOGLEVEL.INFO, "vodclass", `Chat downloaded for ${vod_id}`);
                    fs.renameSync(temp_filepath, output);
                    resolve(true);
                } else {
                    Log.logAdvanced(LOGLEVEL.ERROR, "vodclass", `Chat couldn't be downloaded for ${vod_id}`);
                    reject(false);
                }
            });

        });

    }

}