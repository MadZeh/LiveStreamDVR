import express, { Express } from "express";
import fs from "fs";
import request from "supertest";
import { DataRoot } from "../src/Core/BaseConfig";
import { Config } from "../src/Core/Config";
import ApiRouter from "../src/Routes/Api";

let app: Express;
beforeEach(async () => {
    await Config.init();
    app = express();

    const baserouter = express.Router();
    baserouter.use("/api/v0", ApiRouter);
    app.use("", baserouter);
});

afterEach(() => {
    Config.destroyInstance();
    // fs.unlinkSync(DataRoot);
});

describe("GET /api/v0/settings", () => {
    it("should return settings", async () => {
        const res = await request(app).get("/api/v0/settings");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data.app_name");
        expect(res.body).toHaveProperty("data.version");
        expect(res.body).toHaveProperty("data.config");
    });
});

describe("GET /api/v0/channels", () => {
    it("should return channels", async () => {
        const res = await request(app).get("/api/v0/channels");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data.streamer_list");
    });
});

describe("Routes", () => {
    it("all get routes should return 200", async () => {
        for (const route of ["/api/v0/settings", "/api/v0/channels"]) {
            const res = await request(app).get(route);
            expect(res.status).toBe(200);
        }
    });
});