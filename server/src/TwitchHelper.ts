import path from "path";
import fs from "fs";
import { TwitchConfig } from "./TwitchConfig";
import { format } from "date-fns";
import axios, { Axios } from "axios";

export enum LOGLEVEL {
    ERROR = "ERROR",
	WARNING = "WARNING",
	INFO = "INFO",
	DEBUG = "DEBUG",
	FATAL = "FATAL",
	SUCCESS = "SUCCESS",
}

interface LogLine {
    module: string;
    date: number;
    level: LOGLEVEL;
    text: string;
    metadata?: any;
}

interface TwitchGame {
	name: string;
	box_art_url: string;
	added: number; // 1/1000
}

export class TwitchHelper {

	static axios: Axios;

    static readonly config_folder 	= path.join(__dirname, "..", "..", "config");
	static readonly public_folder 	= path.join(__dirname, "..", "..", "public");
	static readonly logs_folder 	= path.join(__dirname, "..", "..", "logs");
	static readonly cache_folder 	= path.join(__dirname, "..", "..", "cache");
	static readonly cron_folder 	= path.join(__dirname, "..", "..", "cache", "cron");
	static readonly pids_folder 	= path.join(__dirname, "..", "..", "cache", "pids");
	static readonly vod_folder 		= path.join(__dirname, "..", "..", "public", "vods");

    static accessToken = "";

	static readonly accessTokenFile = path.join(this.cache_folder, "oauth.bin");

	static readonly accessTokenExpire = 60 * 60 * 24 * 60; // 60 days
	static readonly accessTokenRefresh = 60 * 60 * 24 * 30; // 30 days

	static readonly PHP_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss.SSSSSS";
	static readonly TWITCH_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss'Z'";

	static game_db: Record<number, TwitchGame>;

    static logAdvanced(level: LOGLEVEL, module: string, text: string, metadata?: any) {
        if (!TwitchConfig.cfg("debug") && level == LOGLEVEL.DEBUG) return;

        // check if folder exists
        if (!fs.existsSync(TwitchHelper.logs_folder)) {
            throw new Error("Log folder does not exist!");
        }

        // today's filename in Y-m-d format
        const date = new Date();
        const filename = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.log`;
        const filepath = path.join(TwitchHelper.logs_folder, filename);
        const jsonlinename = filepath + ".jsonline";

        const dateFormat = "yyyy-MM-dd HH:mm:ss.SSS";
        const dateString = format(date, dateFormat);

        // write cleartext
        const textOutput = `${dateString} | ${module} <${level}> ${text}`;
        fs.appendFileSync(filepath, textOutput + "\n");

        // if docker, output to stdout
        if (TwitchConfig.cfg("docker")) {
            console.log(textOutput);
        }

        console.log(textOutput);

        let log_data: LogLine = {
			"module": module,
			"date": Date.now(),
			"level": level,
			"text": text
        };

		if (metadata !== undefined) log_data['metadata'] = metadata;

        // write jsonline
        fs.appendFileSync(jsonlinename, JSON.stringify(log_data) + "\n");

    }

    static async getAccessToken(force = false): Promise<string> {
        // token should last 60 days, delete it after 30 just to be sure
		if (fs.existsSync(this.accessTokenFile)) {
			
            /*
			if (time() > filemtime(this.accessTokenFile) + TwitchHelper::$accessTokenRefresh) {
				this.logAdvanced(LOGLEVEL.INFO, "helper", "Deleting old access token");
				unlink(this.accessTokenFile);
			}
            */
            if (Date.now() > fs.statSync(this.accessTokenFile).mtimeMs + this.accessTokenRefresh) {
                this.logAdvanced(LOGLEVEL.INFO, "helper", "Deleting old access token");
                fs.unlinkSync(this.accessTokenFile);
            }
		}

		if (!force && fs.existsSync(this.accessTokenFile)) {
			this.logAdvanced(LOGLEVEL.DEBUG, "helper", "Fetched access token from cache");
			return fs.readFileSync(this.accessTokenFile, "utf8");
		}

		if (!TwitchConfig.cfg('api_secret') || !TwitchConfig.cfg('api_client_id')) {
			this.logAdvanced(LOGLEVEL.ERROR, "helper", "Missing either api secret or client id, aborting fetching of access token!");
			throw new Error("Missing either api secret or client id, aborting fetching of access token!");
		}


		// oauth2
		const oauth_url = 'https://id.twitch.tv/oauth2/token';

        /*
		try {
			$response = $client->post($oauth_url, [
				'query' => [
					'client_id' => TwitchConfig::cfg('api_client_id'),
					'client_secret' => TwitchConfig::cfg('api_secret'),
					'grant_type' => 'client_credentials'
				],
				'headers' => [
					'Client-ID: ' . TwitchConfig::cfg('api_client_id')
				]
			]);
		} catch (\Throwable $th) {
			this.logAdvanced(LOGLEVEL.FATAL, "helper", "Tried to get oauth token but server returned: " . $th->getMessage());
			sleep(5);
			return false;
		}
        */

        const response = await axios.post(oauth_url, {
            'client_id': TwitchConfig.cfg('api_client_id'),
            'client_secret': TwitchConfig.cfg('api_secret'),
            'grant_type': 'client_credentials'
        }, {
            headers: {
                'Client-ID': TwitchConfig.cfg('api_client_id')
            }
        });

        if (response.status != 200) {
            this.logAdvanced(LOGLEVEL.FATAL, "helper", "Tried to get oauth token but server returned: " + response.statusText);
            throw new Error("Tried to get oauth token but server returned: " + response.statusText);
        }

        const json = response.data;

		if (!json || !json.access_token) {
			this.logAdvanced(LOGLEVEL.ERROR, "helper", `Failed to fetch access token: ${json}`);
			throw new Error(`Failed to fetch access token: ${json}`);
		}

		const access_token = json.access_token;

		this.accessToken = access_token;

		fs.writeFileSync(this.accessTokenFile, access_token);

		this.logAdvanced(LOGLEVEL.INFO, "helper", "Fetched new access token");

		return access_token;
    }

    public static vodFolder(username: string = "")
	{
		return this.vod_folder + (TwitchConfig.cfg("channel_folders") && username !== "" ? path.sep + username : '');
	}

	public static async getGameData(game_id: number): Promise<TwitchGame | false | null> {

		if (!this.game_db && fs.existsSync(TwitchConfig.gameDbPath)) {
			this.game_db = JSON.parse(fs.readFileSync(TwitchConfig.gameDbPath, "utf8"));
		}

		if (!game_id) {
			this.logAdvanced(LOGLEVEL.ERROR, "helper", "No game id supplied for game fetch!");
			return false;
		}

		if (this.game_db && this.game_db[game_id]) {
			if (this.game_db[game_id].added && Date.now() > this.game_db[game_id].added + (60 * 60 * 24 * 60 * 1000)) { // two months?
				this.logAdvanced(LOGLEVEL.INFO, "helper", `Game id ${game_id} needs refreshing.`);
			} else {
				return this.game_db[game_id];
			}
		}

		if (!this.game_db) {
			this.game_db = [];
		}

		this.logAdvanced(LOGLEVEL.DEBUG, "helper", `Game id ${game_id} not in cache, fetching...`);

		let response;
		try {
			response = await TwitchHelper.axios.get(`/helix/games?id=${game_id}`);
		} catch (th) {
			this.logAdvanced(LOGLEVEL.FATAL, "helper", `Tried to get game data for ${game_id} but server returned: ${th}`);
			return false;
		}

		const json = response.data;

		const game_data = json.data[0];

		if (game_data) {
			
			const game = {
				"id": game_id,
				"name": game_data.name,
				"box_art_url": game_data.box_art_url,
				"added": Date.now(),
			} as TwitchGame;

			this.game_db[game_id] = game;

			// $game_db[ $id ] = $game_data["name"];

			fs.writeFileSync(TwitchConfig.gameDbPath, JSON.stringify(this.game_db));

			this.logAdvanced(LOGLEVEL.SUCCESS, "helper", `New game saved to cache: ${game.name}`);

			return game;

		} else {

			this.logAdvanced(LOGLEVEL.ERROR, "helper", `Invalid game returned in query for ${game_id} (${json})`);

			return null;
		}
	}

	public static JSDateToPHPDate(date: Date){
		return {
			date: format(date, this.PHP_DATE_FORMAT),
			timezone_type: 3,
			timezone: 'UTC',
		};
	}

	public static getNiceDuration(duration: number){
		// format 1d 2h 3m 4s

		const days = Math.floor(duration / (60 * 60 * 24));
		const hours = Math.floor((duration - (days * 60 * 60 * 24)) / (60 * 60));
		const minutes = Math.floor((duration - (days * 60 * 60 * 24) - (hours * 60 * 60)) / 60);
		const seconds = duration - (days * 60 * 60 * 24) - (hours * 60 * 60) - (minutes * 60);

		let str = "";

		if (days > 0) str += days + "d ";
		if (hours > 0) str += hours + "h ";
		if (minutes > 0) str += minutes + "m ";
		if (seconds > 0) str += seconds + "s";

		return str.trim();
		
	}

	public static path_mediainfo()
	{

		if (TwitchConfig.cfg('mediainfo_path')) return TwitchConfig.cfg('mediainfo_path');

		// const path = this.whereis("mediainfo", "mediainfo.exe");
		// if (path) {
		// 	TwitchConfig.setConfig('mediainfo_path', path);
		// 	TwitchConfig.saveConfig("path resolver");
		// 	return path;
		// }

		return false;
	}

}