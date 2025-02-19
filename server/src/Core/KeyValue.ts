import chalk from "chalk";
import fs from "fs";
import { replaceAll } from "../Helpers/ReplaceAll";
import path from "path";
import { BaseConfigDataFolder, BaseConfigPath } from "./BaseConfig";
import EventEmitter from "events";
import { Config } from "./Config";

export class KeyValue extends EventEmitter {

    public data: Record<string, string> = {};
    // public static events = new EventEmitter();

    public static instance: KeyValue | undefined;

    static getInstance(): KeyValue {
        if (!this.instance) {
            this.instance = new KeyValue();
        }
        return this.instance;
    }

    static getCleanInstance() {
        return new KeyValue();
    }

    static destroyInstance() {
        this.instance = undefined;
    }

    getAll(): Record<string, string> {
        return this.data;
    }

    /**
     * Check if a key exists in the key-value store.
     * @param key 
     * @returns 
     */
    has(key: string): boolean {
        return key in this.data;
    }

    /**
     * Get a value from the key-value store.
     * @param key
     * @returns {string|false} The value or false if the key does not exist.
     */
    get(key: string): string | false {

        key = replaceAll(key, /\//g, ""); // TODO: replaceAll

        return this.data[key] !== undefined ? this.data[key] : false;

    }

    /**
     * Get a value from the key-value store as an object.
     * @param key 
     * @returns 
     */
    getObject<T>(key: string): T | false {

        key = replaceAll(key, /\//g, ""); // TODO: replaceAll

        if (this.data[key] === undefined) {
            return false;
        }

        try {
            return JSON.parse(this.data[key]);
        } catch (error) {
            return false;
        }

    }

    getBool(key: string): boolean {
        return this.get(key) === "true";
    }

    getInt(key: string): number {
        return parseInt(this.get(key) || "0");
    }

    /**
     * Set a value in the key-value store.
     * @param key
     * @param value
     */
    set(key: string, value: string): void {

        key = replaceAll(key, /\//g, ""); // TODO: replaceAll

        if (Config.debug) console.debug(`Setting key-value pair: ${key} = ${value}`);
        this.data[key] = value;
        this.emit("set", key, value);

        this.save();

    }

    /**
     * Set a value in the key-value store as an object (JSON).
     * @param key
     * @param value
     */
    setObject<T>(key: string, value: T | null): void {

        key = replaceAll(key, /\//g, ""); // TODO: replaceAll

        if (value === null) {
            this.delete(key);
        } else {
            // if (Config.debug) console.debug(`Setting key-value pair object: ${key} = ${JSON.stringify(value)}`);
            // this.data[key] = JSON.stringify(value);
            // this.emit("set", key, value);
            this.set(key, JSON.stringify(value));
        }

        // this.save();

    }

    setBool(key: string, value: boolean) {
        this.set(key, value ? "true" : "false");
    }

    setInt(key: string, value: number) {
        this.set(key, value.toString());
    }

    /**
     * Delete a value from the key-value store.
     * @param key
     */
    delete(key: string) {
        if (this.data[key]) {
            if (Config.debug) console.debug(`Deleting key-value pair: ${key}`);
            delete this.data[key];
            this.emit("delete", key);
            this.save();
        }
    }

    /**
     * Delete all values from the key-value store.
     */
    deleteAll() {
        if (Config.debug) console.debug("Deleting all key-value pairs");
        this.data = {};
        this.emit("delete_all");
        this.save();
    }

    /**
     * Save the key-value store to disk.
     */
    save() {
        fs.writeFileSync(BaseConfigPath.keyvalue, JSON.stringify(this.data, null, 4));
    }

    load() {
        console.log(chalk.blue("Loading key-value pairs..."));
        if (fs.existsSync(BaseConfigPath.keyvalue)) {
            this.data = JSON.parse(fs.readFileSync(BaseConfigPath.keyvalue, "utf8"));
            console.log(chalk.green(`Loaded ${Object.keys(this.data).length} key-value pairs`));
        } else {
            console.log("No key-value pairs found in storage.");
            this.migrateFromFileBasedKeyValue();
        }
    }

    migrateFromFileBasedKeyValue() {
        console.log(chalk.blue("Migrating key-value pairs..."));
        const files = fs.readdirSync(BaseConfigDataFolder.keyvalue).filter(file => !file.endsWith(".json"));
        let migrated = 0;
        for (const file of files) {
            // const key = file.replace(".json", "");
            const value = fs.readFileSync(path.join(BaseConfigDataFolder.keyvalue, file), "utf8");
            this.set(file, value);
            fs.unlinkSync(path.join(BaseConfigDataFolder.keyvalue, file));
            migrated++;
        }
        if (migrated > 0) {
            console.log(chalk.green(`Migrated ${migrated} key-value pairs`));
            this.save();
        } else {
            console.log("No key-value pairs found to migrate.");
        }
    }

}