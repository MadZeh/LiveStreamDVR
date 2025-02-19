import path from "path";
import minimist from "minimist";
import os from "os";

const argv = minimist(process.argv.slice(2));

/**
 * Instead of using relative paths in every file, these paths are always
 * pointing to the correct location. This is of course dependent on where
 * the index.ts/js file is located. That's the bad hack here, but it works. * 
 */

// export const AppRoot = path.join(__dirname, "..", "..", "..");
export const AppName = "LiveStreamDVR";

/**
 * The root directory of the application containing client-vue, public, etc.
 */
export const AppRoot = 
    process.env.NODE_ENV === "test" ? path.join(__dirname, "..", "..", "..") :
        process.env.NODE_ENV === "development" ? path.join(__dirname, "..", "..", "..") : path.join(__dirname, "..", "..");

// let appdata = process.env.APPDATA || (process.platform == "darwin" ? `${process.env.HOME}/Library/Preferences` : `${process.env.HOME}/.local/share`);
/**
 * Home data directory.
 */
export const HomeRoot = path.join(os.homedir(), ".config", "twitch-automator"); // use this maybe?

/**
 * The data directory of the application.
 */
export const DataRoot = 
    process.env.NODE_ENV === "test" ? path.join(__dirname, "..", "..", "tests", "data") :
        argv.home ? HomeRoot :
            (argv.dataroot ? path.resolve(argv.dataroot) : path.join(AppRoot, "data"));

export const BaseConfigFolder = {
    server: path.join(AppRoot, "server"),
    public: path.join(AppRoot, "public"),
    client: path.join(AppRoot, "client-vue", "dist"),
    vodplayer: path.join(AppRoot, "twitch-vod-chat", "dist"),
};

export const BaseConfigDataFolder = {
    config: path.join(DataRoot, "config"),
    cache: path.join(DataRoot, "cache"),
    cron: path.join(DataRoot, "cache", "cron"),
    pids: path.join(DataRoot, "cache", "pids"),
    playlist: path.join(DataRoot, "cache", "playlist"),
    keyvalue: path.join(DataRoot, "cache", "kv"),
    history: path.join(DataRoot, "cache", "history"),
    dotnet: path.join(DataRoot, "cache", "dotnet"),
    logs: path.join(DataRoot, "logs"),
    logs_software: path.join(DataRoot, "logs", "software"),
    payloads: path.join(DataRoot, "payloads"),
    vod: path.join(DataRoot, "storage", "vods"),
    saved_vods: path.join(DataRoot, "storage", "saved_vods"),
    saved_clips: path.join(DataRoot, "storage", "saved_clips"),
    public_cache: path.join(DataRoot, "cache", "public"),
    public_cache_avatars: path.join(DataRoot, "cache", "public", "avatars"),
};

export const BaseConfigPath = {
    config: path.join(BaseConfigDataFolder.config, "config.json"),
    channel: path.join(BaseConfigDataFolder.config, "channels.json"),
    favouriteGames: path.join(BaseConfigDataFolder.config, "favourite_games.json"),
    gameDb: path.join(BaseConfigDataFolder.cache, "games_v2.json"),
    history: path.join(BaseConfigDataFolder.cache, "history.json"),
    streamerCache: path.join(BaseConfigDataFolder.cache, "streamers_v2.json"),
    keyvalue: path.join(BaseConfigDataFolder.keyvalue, "kv.json"),
    notifications: path.join(BaseConfigDataFolder.config, "notifications.json"),
};