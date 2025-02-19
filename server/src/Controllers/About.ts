import { AppRoot, BaseConfigDataFolder } from "../Core/BaseConfig";
import express from "express";
import fs from "fs";
import path from "path";
import { ExecReturn, Helper } from "../Core/Helper";
import { KeyValue } from "../Core/KeyValue";

interface Bins {
    path?: string;
    status?: string;
    version?: string;
}

export async function About(req: express.Request, res: express.Response) {

    const bins: Record<string, Bins> = {};

    const pip_requirements: Record<string, { comparator: string; version: string; }> = {};
    const requirements_file = path.join(AppRoot, "requirements.txt");
    if (fs.existsSync(requirements_file)) {
        const requirements_data = fs.readFileSync(requirements_file, "utf8");
        const lines = requirements_data.split("\n");
        lines.forEach(line => {
            const matches = line.trim().match(/^([a-z_-]+)([=<>]+)([0-9.]+)$/);
            if (matches) {
                pip_requirements[matches[1].trim()] = {
                    comparator: matches[2].trim(),
                    version: matches[3].trim(),
                };
            } else {
                console.log("Failed to parse line:", line);
            }
        });
    } else {
        console.error("requirements.txt not found", requirements_file);
    }

    const bin_args: Record<string, { binary: string | false; version_args: string[]; version_regex: RegExp; }> = {
        ffmpeg: { binary: Helper.path_ffmpeg(), version_args: ["-version"], version_regex: /ffmpeg version ([\w0-9\-_.+]+) Copyright/m },
        mediainfo: { binary: Helper.path_mediainfo(), version_args: ["--Version"], version_regex: /v(\d+\.\d+)/m },
        twitchdownloader: { binary: Helper.path_twitchdownloader(), version_args: ["--version", "2>&1"], version_regex: /TwitchDownloaderCLI (\d+\.\d+\.\d+)/m },
        python: { binary: "python", version_args: ["--version"], version_regex: /Python ([\d.]+)/m },
        python3: { binary: "python3", version_args: ["--version"], version_regex: /Python ([\d.]+)/m },
        node: { binary: Helper.path_node(), version_args: ["--version"], version_regex: /v([\d.]+)/m },
        // php: { binary: "php", version_args: ["-v"], version_regex: /PHP Version ([\d.]+)/m }, // deprecated
    };

    for (const bin_name in bin_args) {
        const bin_data = bin_args[bin_name];
        if (bin_data.binary) {

            let string_out = "";

            let exec_out;
            try {
                exec_out = await Helper.execSimple(bin_data.binary, bin_data.version_args, "about binary check");
            } catch (error) {
                const e = error as ExecReturn;
                if ("code" in e) {
                    console.error("exec error", error);
                }
                if ("stdout" in e) string_out += e.stdout.map(line => line.trim()).join("\n");
                if ("stderr" in e) string_out += e.stderr.map(line => line.trim()).join("\n");
            }

            if (exec_out) {
                string_out += exec_out.stdout.map(line => line.trim()).join("\n");
            }

            if (string_out !== "") {

                const match = string_out.trim().match(bin_data.version_regex);

                if (!match || match.length < 2) {
                    console.error(bin_name, "failed to match", match, string_out.trim());
                }

                bins[bin_name] = {
                    path: bin_data.binary,
                    version: match ? match[1] : "",
                    status: match ? "" : "No match.", // compare versions
                };

            } else {
                bins[bin_name] = {
                    path: bin_data.binary,
                    status: "No console output.",
                };
            }

        } else {
            bins[bin_name] = {
                status: "Not installed.",
            };
        }
    }


    const pip_pkg: Record<string, { binary: string | false; version_args: string[]; version_regex: RegExp; }> = {
        tcd: { binary: Helper.path_tcd(), version_args: ["--version", "--settings-file", path.join(BaseConfigDataFolder.config, "tcd_settings.json")], version_regex: /^Twitch Chat Downloader\s+([0-9.]+)$/m },
        streamlink: { binary: Helper.path_streamlink(), version_args: ["--version"], version_regex: /^streamlink\s+([0-9.]+)$/m },
        "youtubedl": { binary: Helper.path_youtubedl(), version_args: ["--version"], version_regex: /^([0-9.]+)$/m },
        pipenv: { binary: Helper.path_pipenv(), version_args: ["--version"], version_regex: /^pipenv, version ([0-9.]+)$/m },
    };

    for (const pkg_name in pip_pkg) {
        const pkg_data = pip_pkg[pkg_name];
        if (pkg_data.binary) {
            let exec_out;

            try {
                exec_out = await Helper.execSimple(pkg_data.binary, pkg_data.version_args, "about pip check");
            } catch (error) {
                const e = error as ExecReturn;
                if ("code" in e) {
                    console.error("execreturn error", error);
                } else {
                    console.error("generic error", error);
                }
            }

            if (exec_out) {

                const match_data = exec_out.stdout.join("\n") + "\n" + exec_out.stderr.join("\n");
                const match = match_data.trim().match(pkg_data.version_regex);

                bins[pkg_name] = {
                    path: pkg_data.binary,
                    version: match ? match[1] : "",
                    status: match ? "" : "No match.",
                };

            } else {
                bins[pkg_name] = {
                    path: pkg_data.binary,
                    status: "No console output.",
                };
            }
        } else {
            bins[pkg_name] = {
                status: "Not installed.",
            };
        }
    }

    res.send({
        data: {
            bins: bins,
            pip: pip_requirements,
            is_docker: Helper.is_docker(),
            keyvalue: KeyValue.getInstance().data,
        },
        status: "OK",
    });

}