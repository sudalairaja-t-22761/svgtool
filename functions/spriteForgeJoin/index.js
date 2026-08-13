"use strict";

// Load .env before any constants are evaluated (no-op in production if file is absent)
try { require("dotenv").config(); } catch (_) {}

// ===================================
// SVG Sprite Service — Complete Serverless Code
// Fully server-based (NO localStorage dependency)
// ===================================
//
// SETUP REQUIRED:
// -----------------------------------------------
// 1. Go to Catalyst Console → Data Store
// 2. Create a new table called: SpriteRegistry
// 3. Add these columns:
//    ┌──────────────┬──────────┬────────────┐
//    │ Column Name  │ Type     │ Required   │
//    ├──────────────┼──────────┼────────────┤
//    │ sprite_name  │ TEXT     │ Yes        │
//    │ file_id      │ TEXT     │ Yes        │
//    │ file_name    │ TEXT     │ No         │
//    └──────────────┴──────────┴────────────┘
//    (ROWID, CREATEDTIME, MODIFIEDTIME are auto-created)
//
// 4. Go to Settings → Permission → Add this function
//    to the allowed roles for Data Store access.
//
// 5. Ensure File Store folder exists:
//    FOLDER_ID = "32235000000015888"
// -----------------------------------------------

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const multer = require("multer");
const cheerio = require("cheerio");
const { v4: uuidv4 } = require("uuid");
const fsAsync = require("fs").promises;

// ── Local-dev webfont storage (used when Catalyst runtime is unavailable) ────
const LOCAL_WF_DIR   = path.join(os.tmpdir(), "svgforge-wf");
const LOCAL_WF_INDEX = path.join(LOCAL_WF_DIR, "_index.json");

function localWfRead()  { try { return JSON.parse(fs.readFileSync(LOCAL_WF_INDEX, "utf8")); } catch (_) { return { entries: [] }; } }
function localWfWrite(idx) { fs.mkdirSync(LOCAL_WF_DIR, { recursive: true }); fs.writeFileSync(LOCAL_WF_INDEX, JSON.stringify(idx, null, 2)); }

// ── Catalyst Stratus object storage ──────────────────────────────────────────
const STRATUS_BUCKET = (process.env.STRATUS_BUCKET_URL || "https://svgtool-development.lzstratus.com").replace(/\/$/, "");

// Forward Catalyst runtime credential headers so Stratus trusts this function
function stratusHeaders(req) {
    const fwd = ["x-zc-admin-cred-type","x-zc-admin-cred-token","x-zc-user-cred-type",
                 "x-zc-user-cred-token","x-zc-projectid","x-zc-project-key",
                 "x-zc-project-secret-key","x-zc-environment","x-zcsrf-token","cookie"];
    return Object.fromEntries(fwd.filter(k => req.headers[k]).map(k => [k, req.headers[k]]));
}
async function stratusPut(req, key, buf, ct) {
    const r = await fetch(`${STRATUS_BUCKET}/${key}`, {
        method: "PUT", body: buf,
        headers: { ...stratusHeaders(req), "Content-Type": ct || "application/octet-stream" }
    });
    if (!r.ok) throw new Error(`Stratus PUT [${r.status}]: ${await r.text()}`);
}
async function stratusGet(req, key) {
    const r = await fetch(`${STRATUS_BUCKET}/${key}`, { headers: stratusHeaders(req) });
    if (!r.ok) throw new Error(`Stratus GET [${r.status}]`);
    return Buffer.from(await r.arrayBuffer());
}
async function stratusDelete(req, key) {
    await fetch(`${STRATUS_BUCKET}/${key}`, { method: "DELETE", headers: stratusHeaders(req) }).catch(() => {});
}
async function stratusReadIndex(req, eid) {
    try { return JSON.parse((await stratusGet(req, `${eid}/webfonts/_index.json`)).toString("utf8")); }
    catch (_) { return { entries: [] }; }
}
async function stratusWriteIndex(req, eid, idx) {
    await stratusPut(req, `${eid}/webfonts/_index.json`,
        Buffer.from(JSON.stringify(idx, null, 2), "utf8"), "application/json");
}

const app = express();
app.use(express.json({ limit: "10mb" }));

// Resolved before the CORS middleware so the handler can reference it
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    let isLocalOrigin = false;
    try { const u = new URL(origin); isLocalOrigin = u.hostname === "localhost" || u.hostname === "127.0.0.1"; } catch (_) {}
    if (!origin || isLocalOrigin || ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-session-id");
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});

const FOLDER_ID = process.env.FOLDER_ID || "37672000000012906";
const TABLE_NAME = "SpriteForgeRegistry";

const ZOHO_ACCOUNTS_BASE = "https://accounts.zoho.in";
const ZOHO_AUTH_URL = `${ZOHO_ACCOUNTS_BASE}/oauth/v2/auth`;
const ZOHO_TOKEN_URL = `${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`;
const ZOHO_USERINFO_URL = `${ZOHO_ACCOUNTS_BASE}/oauth/v2/userinfo`;
const ZOHO_FALLBACK_AVATAR_URL = `${ZOHO_ACCOUNTS_BASE}/oauth/user/photo`;

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "";
const ZOHO_REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || "";
const ZOHO_SCOPE = process.env.ZOHO_SCOPE || "openid,email,profile,phone";

// Returns the redirect URI to use: client-supplied origin (if allowlisted) or the env default.
// Always normalises to trailing slash so it matches the URI registered in Zoho exactly.
function resolveRedirectUri(redirectOrigin) {
    const normalise = (uri) => uri ? uri.replace(/\/?$/, "/") : uri;
    if (!redirectOrigin) return normalise(ZOHO_REDIRECT_URI);
    try {
        const parsed = new URL(redirectOrigin);
        const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (isLocal || ALLOWED_ORIGINS.includes(redirectOrigin)) {
            return normalise(redirectOrigin);
        }
    } catch (_) { /* invalid URL — fall through */ }
    return normalise(ZOHO_REDIRECT_URI);
}

const AUTH_ENFORCE = String(process.env.AUTH_ENFORCE || "false").toLowerCase() === "true";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const AVATAR_MAX_BYTES = Number(process.env.AVATAR_MAX_BYTES || 2 * 1024 * 1024);
const ALLOWED_AVATAR_HOST_REGEX = /(^|\.)zoho\.in$/i;

const sessions = new Map();

function decodeJwtPayload(token) {
    if (!token || token.split(".").length < 2) return null;
    try {
        const payload = token.split(".")[1];
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = Buffer.from(normalized, "base64").toString("utf8");
        return JSON.parse(json);
    } catch (error) {
        console.warn("id_token decode failed:", error.message);
        return null;
    }
}

function createSession(payload) {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
        ...payload,
        createdAt: Date.now(),
        lastSeen: Date.now()
    });
    return sessionId;
}

function getSession(req) {
    const headerSessionId = req.headers["x-session-id"];
    const querySessionId = req.query && typeof req.query.session_id === "string"
        ? req.query.session_id
        : "";
    const sessionId = headerSessionId || querySessionId;
    if (!sessionId || typeof sessionId !== "string") return null;

    const session = sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        sessions.delete(sessionId);
        return null;
    }

    session.lastSeen = Date.now();
    return { sessionId, session };
}

function requireSession(req, res, next) {
    const current = getSession(req);
    if (!current) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Missing or invalid session."
        });
    }
    req.auth = current;
    next();
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let json;
    try {
        json = text ? JSON.parse(text) : {};
    } catch {
        json = { raw: text };
    }
    return { response, json, text };
}

async function fetchAvatarDataUri(accessToken, primaryUrl) {
    const candidates = [];
    if (primaryUrl) candidates.push(primaryUrl);
    candidates.push(ZOHO_FALLBACK_AVATAR_URL);

    for (const url of candidates) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== "https:" || !ALLOWED_AVATAR_HOST_REGEX.test(parsed.hostname)) {
                continue;
            }

            const resp = await fetch(parsed.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!resp.ok) continue;

            const contentType = (resp.headers.get("content-type") || "").toLowerCase();
            if (!contentType.startsWith("image/")) continue;

            const buffer = Buffer.from(await resp.arrayBuffer());
            if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) continue;

            return {
                dataUri: `data:${contentType};base64,${buffer.toString("base64")}`,
                hash: crypto.createHash("sha256").update(buffer).digest("hex"),
                contentType,
                byteLength: buffer.length
            };
        } catch (error) {
            console.warn("Avatar fetch failed:", error.message);
        }
    }

    return null;
}

function isProtectedPath(pathname) {
    return pathname === "/save-sprite"
        || pathname.startsWith("/check-sprite/")
        || pathname.startsWith("/find-sprite/")
        || pathname === "/list-sprites"
        || pathname.startsWith("/get-sprite/")
        || pathname.startsWith("/sprite/")
        || pathname.startsWith("/delete-sprite/")
        || pathname === "/svgwebfont";
}

app.use((req, res, next) => {
    if (!AUTH_ENFORCE) return next();
    if (!isProtectedPath(req.path)) return next();
    return requireSession(req, res, next);
});

// ===================================
// AUTH: Build Zoho Login URL
// ===================================
app.get("/api/auth/zoho/url", (req, res) => {
    const hasRedirectOrigin = !!req.query.redirect_origin;
    if (!ZOHO_CLIENT_ID || (!ZOHO_REDIRECT_URI && !hasRedirectOrigin)) {
        return res.status(500).json({
            success: false,
            message: "Missing ZOHO_CLIENT_ID or ZOHO_REDIRECT_URI"
        });
    }

    const authUrl = new URL(ZOHO_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", ZOHO_CLIENT_ID);
    authUrl.searchParams.set("scope", ZOHO_SCOPE);
    authUrl.searchParams.set("redirect_uri", resolveRedirectUri(req.query.redirect_origin));
    authUrl.searchParams.set("access_type", "offline");

    res.status(200).json({ success: true, url: authUrl.toString() });
});

// ===================================
// AUTH: Exchange code and create session
// ===================================
app.post("/api/auth/zoho/callback", async (req, res) => {
    try {
        const { code, redirect_origin } = req.body || {};
        if (!code) {
            return res.status(400).json({ success: false, message: "Missing authorization code" });
        }

        if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Missing Zoho OAuth configuration"
            });
        }

        const form = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            redirect_uri: resolveRedirectUri(redirect_origin),
            code
        });

        const tokenData = await fetchJson(ZOHO_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form
        });

        if (!tokenData.response.ok || !tokenData.json.access_token) {
            return res.status(400).json({
                success: false,
                message: "Token exchange failed",
                details: tokenData.json
            });
        }

        const accessToken = tokenData.json.access_token;
        const idTokenPayload = decodeJwtPayload(tokenData.json.id_token);

        const userInfoData = await fetchJson(ZOHO_USERINFO_URL, {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const userInfo = userInfoData.response.ok ? userInfoData.json : {};

        const mergedProfile = {
            ...idTokenPayload,
            ...userInfo
        };

        const userId = mergedProfile.sub || mergedProfile.user_id || mergedProfile.email;
        const avatarCandidate = mergedProfile.picture || mergedProfile.profile_picture;
        const avatar = await fetchAvatarDataUri(accessToken, avatarCandidate);

        const user = {
            id: userId || null,
            email: mergedProfile.email || null,
            name: mergedProfile.name || mergedProfile.given_name || mergedProfile.email || "Zoho User",
            picture: avatarCandidate || null,
            avatar: avatar ? avatar.dataUri : null,
            avatarHash: avatar ? avatar.hash : null
        };

        const sessionId = createSession({
            user,
            zohoProfile: mergedProfile,
            accessToken,
            refreshToken: tokenData.json.refresh_token || null
        });

        // Persist user profile on first login; deduplicate by userEmail
        let userDataStatus = "not_attempted";
        try {
            const ca    = catalyst.initialize(req);
            const zcql  = ca.zcql();
            const safe  = (user.email || "").replace(/'/g, "''");
            const rows  = await zcql.executeZCQLQuery(
                `SELECT ROWID FROM user_data WHERE userEmail = '${safe}'`
            );
            if (rows && rows.length) {
                userDataStatus = `exists (ROWID ${rows[0].user_data && rows[0].user_data.ROWID})`;
            } else {
                const inserted = await ca.datastore().table(49699000000329011).insertRow({
                    userName:   user.name                            || "",
                    userEmail:  user.email                           || "",
                    userAvatar: user.picture                         || "",
                    userid:     String(mergedProfile.sub || user.id || "")
                });
                userDataStatus = `inserted (ROWID ${inserted && inserted.ROWID})`;
            }
        } catch (dsErr) {
            userDataStatus = `error: ${dsErr.message}`;
            console.error("[user_data] error:", dsErr.message);
        }
        console.log("[user_data] status:", userDataStatus);

        res.status(200).json({
            success: true,
            sessionId,
            user,
            zohoProfile:    mergedProfile,
            userDataStatus  // visible in browser dev tools Network tab
        });
    } catch (error) {
        console.error("ZOHO CALLBACK ERROR:", error);
        res.status(500).json({ success: false, message: error.message || "OAuth callback failed" });
    }
});

// ===================================
// AUTH: Validate session
// ===================================
app.get("/api/auth/session", (req, res) => {
    const current = getSession(req);
    if (!current) {
        return res.status(401).json({ success: false, message: "Invalid session" });
    }

    res.status(200).json({
        success: true,
        sessionId: current.sessionId,
        user: current.session.user,
        zohoProfile: current.session.zohoProfile
    });
});

// ===================================
// AUTH: Logout
// ===================================
app.post("/api/auth/logout", (req, res) => {
    const sessionId = req.headers["x-session-id"];
    if (sessionId && typeof sessionId === "string") {
        sessions.delete(sessionId);
    }
    res.status(200).json({ success: true, message: "Logged out" });
});

// ===================================
// Optional avatar proxy (allowlisted)
// ===================================
app.get("/api/avatar/proxy", async (req, res) => {
    try {
        const encoded = req.query.url;
        if (!encoded || typeof encoded !== "string") {
            return res.status(400).json({ success: false, message: "Missing url query param" });
        }

        const targetUrl = Buffer.from(encoded, "base64").toString("utf8");
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== "https:" || !ALLOWED_AVATAR_HOST_REGEX.test(parsed.hostname)) {
            return res.status(400).json({ success: false, message: "Avatar URL not allowed" });
        }

        const response = await fetch(parsed.toString());
        if (!response.ok) {
            return res.status(400).json({ success: false, message: "Failed to fetch avatar" });
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (!contentType.startsWith("image/")) {
            return res.status(400).json({ success: false, message: "Invalid avatar content type" });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > AVATAR_MAX_BYTES) {
            return res.status(400).json({ success: false, message: "Avatar too large" });
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(buffer);
    } catch (error) {
        console.error("AVATAR PROXY ERROR:", error);
        res.status(500).json({ success: false, message: "Avatar proxy failed" });
    }
});

// ===================================
// DEBUG: full DataStore + header diagnostic (remove after confirming working)
// ===================================
app.get("/api/test-userdata", async (req, res) => {
    const catalystHeaders = ["x-zc-projectid","x-zc-project-key","x-zc-admin-cred-token",
                             "x-zc-admin-cred-type","x-zc-environment"].reduce((acc, k) => {
        acc[k] = req.headers[k] ? "present" : "MISSING";
        return acc;
    }, {});
    try {
        const ca      = catalyst.initialize(req);
        const zcql    = ca.zcql();
        const rows    = await zcql.executeZCQLQuery("SELECT ROWID FROM user_data");
        const inserted = await ca.datastore().table(49699000000329011).insertRow({
            userName: "test", userEmail: "test@test.com", userAvatar: "", userid: "test-sub"
        });
        res.json({ success: true, catalystInit: "ok", catalystHeaders,
                   existingCount: rows && rows.length, insertedROWID: inserted && inserted.ROWID });
    } catch (err) {
        res.json({ success: false, catalystHeaders, error: err.message });
    }
});

// ===================================
// HEALTH CHECK
// ===================================
app.all("/", (req, res) => {
    res.status(200).send("SVG Sprite Service is Live. Endpoints: POST /save-sprite, GET /sprite/:name, GET /find-sprite/:name, GET /get-sprite/:fileId, GET /list-sprites, DELETE /delete-sprite/:name");
});

// ===================================
// CHECK IF SPRITE EXISTS BY NAME
// ===================================
app.get("/check-sprite/:name", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();
        const name = decodeURIComponent(req.params.name).replace(/'/g, "''");

        const result = await zcql.executeZCQLQuery(
            `SELECT sprite_name, file_id, CREATEDTIME FROM ${TABLE_NAME} WHERE sprite_name = '${name}'`
        );

        if (result && result.length > 0) {
            res.status(200).json({ exists: true, sprite: result[0][TABLE_NAME] });
        } else {
            res.status(200).json({ exists: false });
        }
    } catch (error) {
        console.error("CHECK ERROR:", error);
        res.status(500).json({ exists: false, message: error.message });
    }
});

// ===================================
// SAVE SVG SPRITE
// Uploads to File Store + registers name→fileId in Data Store
// Accepts optional `mode` in body: "replace" (default) or "new"
// ===================================
app.post("/save-sprite", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const folder = catalystApp.filestore().folder(FOLDER_ID);
        const table = catalystApp.datastore().table(TABLE_NAME);
        const zcql = catalystApp.zcql();

        const { spriteName, svgContent, mode } = req.body;

        if (!spriteName || !svgContent) {
            return res.status(400).json({
                success: false,
                message: "Missing spriteName or svgContent"
            });
        }

        const saveMode = mode || "replace"; // "replace" or "new"

        // Check for existing sprite
        const escapedName = spriteName.replace(/'/g, "''");
        const existing = await zcql.executeZCQLQuery(
            `SELECT ROWID, file_id FROM ${TABLE_NAME} WHERE sprite_name = '${escapedName}'`
        );

        // If mode is "new" and name exists, generate unique name
        let finalName = spriteName;
        if (saveMode === "new" && existing && existing.length > 0) {
            let counter = 1;
            let candidateName = `${spriteName}(${counter})`;
            let candidateEscaped = candidateName.replace(/'/g, "''");
            let check = await zcql.executeZCQLQuery(
                `SELECT ROWID FROM ${TABLE_NAME} WHERE sprite_name = '${candidateEscaped}'`
            );
            while (check && check.length > 0) {
                counter++;
                candidateName = `${spriteName}(${counter})`;
                candidateEscaped = candidateName.replace(/'/g, "''");
                check = await zcql.executeZCQLQuery(
                    `SELECT ROWID FROM ${TABLE_NAME} WHERE sprite_name = '${candidateEscaped}'`
                );
            }
            finalName = candidateName;
            console.log(`Mode=new: renamed "${spriteName}" → "${finalName}"`);
        }

        // Sanitize file name
        const safeName = finalName.replace(/[^a-zA-Z0-9-_()]/g, "_");
        const fileName = safeName.endsWith(".svg") ? safeName : `${safeName}.svg`;
        const filePath = path.join("/tmp", fileName);

        // Write SVG to temp file and upload
        fs.writeFileSync(filePath, svgContent);

        const uploadResult = await folder.uploadFile({
            code: fs.createReadStream(filePath),
            name: fileName
        });

        // Clean up temp file
        fs.unlinkSync(filePath);

        const fileId = String(uploadResult.id || uploadResult.file_id);
        console.log("Upload result — fileId:", fileId, "fileName:", fileName);

        // Check if this finalName already exists in Data Store (for replace mode)
        const finalEscaped = finalName.replace(/'/g, "''");
        const finalExisting = (saveMode === "new")
            ? [] // new mode already has a unique name
            : (existing || []);

        if (finalExisting.length > 0) {
            // Delete the OLD file from File Store to avoid orphans
            const oldFileId = finalExisting[0][TABLE_NAME].file_id;
            if (oldFileId) {
                try {
                    await folder.deleteFile(oldFileId);
                    console.log(`Deleted old file ${oldFileId} from File Store`);
                } catch (delErr) {
                    console.warn(`Could not delete old file ${oldFileId}:`, delErr.message);
                    // Continue anyway — the old file becomes orphaned but save still works
                }
            }

            // Update existing record with new fileId
            const rowId = finalExisting[0][TABLE_NAME].ROWID;
            await table.updateRow({
                ROWID: rowId,
                file_id: fileId,
                file_name: fileName
            });
            console.log(`Updated existing record ROWID=${rowId} for "${finalName}" (old file ${oldFileId} → new file ${fileId})`);
        } else {
            // Insert new record
            await table.insertRow({
                sprite_name: finalName,
                file_id: fileId,
                file_name: fileName
            });
            console.log(`Inserted new record for "${finalName}"`);
        }

        res.status(200).json({
            success: true,
            message: "Sprite saved successfully",
            fileId: fileId,
            fileName: fileName,
            spriteName: finalName
        });

    } catch (error) {
        console.error("SAVE ERROR:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error saving sprite"
        });
    }
});

// ===================================
// FIND SPRITE BY NAME
// Looks up fileId from Data Store by sprite name
// ===================================
app.get("/find-sprite/:name", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();
        const name = decodeURIComponent(req.params.name);
        const escapedName = name.replace(/'/g, "''");

        console.log("Finding sprite by name:", name);

        const result = await zcql.executeZCQLQuery(
            `SELECT file_id, file_name, sprite_name, CREATEDTIME FROM ${TABLE_NAME} WHERE sprite_name = '${escapedName}'`
        );

        if (result && result.length > 0) {
            const row = result[0][TABLE_NAME];
            res.status(200).json({
                success: true,
                fileId: row.file_id,
                fileName: row.file_name,
                spriteName: row.sprite_name,
                createdAt: row.CREATEDTIME
            });
        } else {
            res.status(404).json({
                success: false,
                message: `Sprite "${name}" not found`
            });
        }

    } catch (error) {
        console.error("FIND ERROR:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error finding sprite"
        });
    }
});

// ===================================
// LIST ALL SPRITES
// Returns all saved sprite names with their fileIds
// ===================================
app.get("/list-sprites", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();

        const result = await zcql.executeZCQLQuery(
            `SELECT sprite_name, file_id, file_name, CREATEDTIME FROM ${TABLE_NAME} ORDER BY CREATEDTIME DESC`
        );

        const sprites = (result || []).map(row => ({
            name: row[TABLE_NAME].sprite_name,
            fileId: row[TABLE_NAME].file_id,
            fileName: row[TABLE_NAME].file_name,
            createdAt: row[TABLE_NAME].CREATEDTIME
        }));

        console.log(`Found ${sprites.length} sprites`);

        res.status(200).json({
            success: true,
            count: sprites.length,
            sprites: sprites
        });

    } catch (error) {
        console.error("LIST ERROR:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error listing sprites"
        });
    }
});

// ===================================
// RETRIEVE SVG SPRITE BY FILE ID
// Downloads actual SVG from File Store
// ===================================
app.get("/get-sprite/:fileId", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const folder = catalystApp.filestore().folder(FOLDER_ID);
        const fileId = req.params.fileId;

        console.log("Downloading file by ID:", fileId);

        const fileContent = await folder.downloadFile(fileId);

        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h

        if (Buffer.isBuffer(fileContent)) {
            res.status(200).send(fileContent);
        } else if (fileContent && typeof fileContent.pipe === "function") {
            fileContent.pipe(res);
        } else {
            res.status(200).send(fileContent);
        }

    } catch (error) {
        console.error("RETRIEVE ERROR:", error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || "Error retrieving sprite"
            });
        }
    }
});

// ===================================
// RETRIEVE SVG SPRITE BY NAME (single URL)
// Looks up name in Data Store → downloads from File Store
// This is the URL you share / use as background-image
// Usage: GET /sprite/icon1  or  GET /sprite/icon1.svg
// ===================================
app.get("/sprite/:name", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();
        const folder = catalystApp.filestore().folder(FOLDER_ID);

        let name = decodeURIComponent(req.params.name);
        // Strip .svg extension if provided for lookup
        const lookupName = name.replace(/\.svg$/i, "");
        const escapedName = lookupName.replace(/'/g, "''");

        console.log("Sprite by name:", lookupName);
        console.log("ZCQL query:", `SELECT file_id FROM ${TABLE_NAME} WHERE sprite_name = '${escapedName}'`);

        // Look up fileId from Data Store
        const result = await zcql.executeZCQLQuery(
            `SELECT file_id FROM ${TABLE_NAME} WHERE sprite_name = '${escapedName}'`
        );

        console.log("ZCQL result:", JSON.stringify(result));

        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Sprite "${lookupName}" not found`
            });
        }

        const fileId = result[0][TABLE_NAME].file_id;
        console.log("Resolved fileId:", fileId, "type:", typeof fileId);

        // Download from File Store — pass as string (same as working /get-sprite endpoint)
        const fileContent = await folder.downloadFile(fileId);

        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "public, max-age=86400");

        if (Buffer.isBuffer(fileContent)) {
            res.status(200).send(fileContent);
        } else if (fileContent && typeof fileContent.pipe === "function") {
            fileContent.pipe(res);
        } else {
            res.status(200).send(fileContent);
        }

    } catch (error) {
        console.error("SPRITE BY NAME ERROR:", error.message, error.stack);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || "Error retrieving sprite by name"
            });
        }
    }
});

// ===================================
// DELETE SPRITE BY NAME
// Removes from both File Store and Data Store
// ===================================
app.delete("/delete-sprite/:name", async (req, res) => {
    try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();
        const name = decodeURIComponent(req.params.name);
        const escapedName = name.replace(/'/g, "''");

        console.log("Deleting sprite:", name);

        // Find the record
        const result = await zcql.executeZCQLQuery(
            `SELECT ROWID, file_id FROM ${TABLE_NAME} WHERE sprite_name = '${escapedName}'`
        );

        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Sprite "${name}" not found`
            });
        }

        const row = result[0][TABLE_NAME];
        const fileId = row.file_id;
        const rowId = row.ROWID;

        // Delete from File Store
        try {
            await catalystApp.filestore().folder(FOLDER_ID).deleteFile(parseInt(fileId));
            console.log("File deleted from File Store:", fileId);
        } catch (e) {
            console.warn("File delete failed (may already be deleted):", e.message);
        }

        // Delete from Data Store
        const table = catalystApp.datastore().table(TABLE_NAME);
        await table.deleteRow(rowId);
        console.log("Record deleted from Data Store:", rowId);

        res.status(200).json({
            success: true,
            message: `Sprite "${name}" deleted successfully`
        });

    } catch (error) {
        console.error("DELETE ERROR:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error deleting sprite"
        });
    }
});

// ===================================
// WEBFONT: SVG files → WOFF2/WOFF/TTF/EOT/CSS icon font
// ===================================

const WEBFONT_FOLDER_ID = process.env.WEBFONT_FOLDER_ID || "";

const WF_SKIP_ID = /^(stop|path\d|gradient|linear|radial|clip|filter|mask|title|defs|layer|svg|metadata|guide|grid|perspective|base|namedview)/i;

let _wfSvgtofont;
async function _getWfSvgtofont() {
    if (!_wfSvgtofont) { const m = await import("svgtofont"); _wfSvgtofont = m.default; }
    return _wfSvgtofont;
}

function wfSanitizeName(raw, fallback) {
    return String(raw || "").replace(/\.svg$/i, "").replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase().replace(/-+/g, "-").replace(/^-+|-+$/g, "") || fallback || "icon";
}

function wfPrepSvg(svgText) {
    try {
        const $d = cheerio.load(svgText, { xmlMode: true });
        const $svg = $d("svg");
        if (!$svg.length) return svgText;
        if (!$svg.attr("viewBox")) {
            const w = parseFloat($svg.attr("width")) || 24;
            const h = parseFloat($svg.attr("height")) || 24;
            $svg.attr("viewBox", `0 0 ${w} ${h}`);
        }
        $svg.removeAttr("width").removeAttr("height");
        if (($svg.attr("fill") || "").toLowerCase() === "none") $svg.removeAttr("fill");
        $svg.removeAttr("stroke");
        return $d.html();
    } catch (_) { return svgText; }
}

async function wfReadBuf(p) {
    try { return await fsAsync.readFile(p); } catch (_) { return null; }
}

function wfParseGlyphs(css, fontName) {
    const glyphs = [];
    const re = new RegExp(`\\.${fontName}-([\\w-]+):before\\s*\\{[^}]*content:\\s*["']\\\\([0-9a-fA-F]+)["']`, "gi");
    let m;
    while ((m = re.exec(css)) !== null) glyphs.push({ name: m[1], cp: m[2].toLowerCase() });
    return glyphs;
}

async function wfUploadFont(folder, fileName, buffer) {
    const tmp = `/tmp/${uuidv4()}-${fileName}`;
    await fsAsync.writeFile(tmp, buffer);
    try {
        const result = await folder.uploadFile({ code: fs.createReadStream(tmp), name: fileName });
        return String(result.id || result.file_id);
    } finally {
        await fsAsync.unlink(tmp).catch(() => {});
    }
}

const wfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 500 },
    fileFilter(req, file, cb) {
        cb(null, file.mimetype === "image/svg+xml" || file.originalname.toLowerCase().endsWith(".svg"));
    }
});

app.post("/generate", wfUpload.array("files", 500), async (req, res) => {
    const fontName = wfSanitizeName(req.body.fontName, "iconfont");
    const mode     = req.body.mode === "sprite" ? "sprite" : "files";
    const files    = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No SVG files received" });

    const tmpDir  = `/tmp/wf-${uuidv4()}`;
    const srcDir  = `${tmpDir}/src`;
    const distDir = `${tmpDir}/dist`;

    try {
        await fsAsync.mkdir(srcDir,  { recursive: true });
        await fsAsync.mkdir(distDir, { recursive: true });

        const iconNames = [];
        const uniq = base => { let n = base, i = 2; while (iconNames.includes(n)) n = `${base}-${i++}`; return n; };

        if (mode === "sprite") {
            const $ = cheerio.load(files[0].buffer.toString("utf8"), { xmlMode: true });
            const elById = {};
            $("[id]").each((_, el) => { elById[$(el).attr("id")] = el; });
            $("symbol[id]").each(async (_, sym) => {
                const rawId = $(sym).attr("id");
                if (!rawId || WF_SKIP_ID.test(rawId)) return;
                const $sym = $(sym).clone();
                $sym.find("use").each((_, use) => {
                    const href = ($(use).attr("href") || $(use).attr("xlink:href") || "").replace(/^#/, "");
                    if (href && elById[href]) $(use).replaceWith($(elById[href]).clone());
                });
                const vb   = $(sym).attr("viewBox") || "0 0 24 24";
                const name = uniq(wfSanitizeName(rawId));
                iconNames.push(name);
                await fsAsync.writeFile(`${srcDir}/${name}.svg`, wfPrepSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${$sym.html() || ""}</svg>`), "utf8");
            });
            $("svg > path[id], svg > g[id]").each(async (_, el) => {
                const rawId = $(el).attr("id");
                if (!rawId || WF_SKIP_ID.test(rawId)) return;
                const rootVb = $("svg").attr("viewBox") || `0 0 ${parseFloat($("svg").attr("width")) || 24} ${parseFloat($("svg").attr("height")) || 24}`;
                const name   = uniq(wfSanitizeName(rawId));
                iconNames.push(name);
                await fsAsync.writeFile(`${srcDir}/${name}.svg`, wfPrepSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rootVb}">${$.html(el)}</svg>`), "utf8");
            });
        } else {
            for (const file of files) {
                const name = uniq(wfSanitizeName(file.originalname.replace(/\.svg$/i, "")));
                iconNames.push(name);
                await fsAsync.writeFile(`${srcDir}/${name}.svg`, wfPrepSvg(file.buffer.toString("utf8")), "utf8");
            }
        }

        if (!iconNames.length) {
            await fsAsync.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
            return res.status(400).json({ error: "No valid icons found" });
        }

        const svgtofont = await _getWfSvgtofont();
        await svgtofont({
            src: srcDir, dist: distDir, fontName, css: true, startUnicode: 0xe001,
            svgicons2svgfont: { fontHeight: 1000, normalize: true, fixedWidth: true, centerHorizontally: true }
        });

        const [woff2Buf, woffBuf, ttfBuf, eotBuf, svgBuf] = await Promise.all([
            wfReadBuf(`${distDir}/${fontName}.woff2`),
            wfReadBuf(`${distDir}/${fontName}.woff`),
            wfReadBuf(`${distDir}/${fontName}.ttf`),
            wfReadBuf(`${distDir}/${fontName}.eot`),
            wfReadBuf(`${distDir}/${fontName}.svg`)
        ]);

        // ── Save to Catalyst File Store ──────────────────────────────────────
        const stored = {};
        if (WEBFONT_FOLDER_ID) {
            try {
                const folder = catalyst.initialize(req).filestore().folder(WEBFONT_FOLDER_ID);
                const ts     = Date.now();
                await Promise.all([
                    woff2Buf && wfUploadFont(folder, `${fontName}-${ts}.woff2`, woff2Buf).then(id => { stored.woff2 = id; }),
                    woffBuf  && wfUploadFont(folder, `${fontName}-${ts}.woff`,  woffBuf).then(id  => { stored.woff  = id; }),
                    ttfBuf   && wfUploadFont(folder, `${fontName}-${ts}.ttf`,   ttfBuf).then(id   => { stored.ttf   = id; }),
                    eotBuf   && wfUploadFont(folder, `${fontName}-${ts}.eot`,   eotBuf).then(id   => { stored.eot   = id; }),
                    svgBuf   && wfUploadFont(folder, `${fontName}-${ts}.svg`,   svgBuf).then(id   => { stored.svg   = id; }),
                ].filter(Boolean));
                console.log("[webfont] saved to File Store:", stored);
            } catch (storeErr) {
                console.warn("[webfont] File Store save failed:", storeErr.message);
            }
        }

        let genCss = "";
        for (const p of [`${distDir}/${fontName}.css`, `${distDir}/css/${fontName}.css`]) {
            try { genCss = await fsAsync.readFile(p, "utf8"); break; } catch (_) {}
        }

        let glyphs = wfParseGlyphs(genCss, fontName);
        if (!glyphs.length && svgBuf) {
            const $sf = cheerio.load(svgBuf.toString("utf8"), { xmlMode: true });
            $sf("glyph[unicode]").each((_, g) => {
                const unicode = $sf(g).attr("unicode") || "", gname = $sf(g).attr("glyph-name") || "";
                const cp = unicode.codePointAt(0);
                if (gname && cp && cp >= 0xe001) glyphs.push({ name: gname, cp: cp.toString(16) });
            });
        }
        if (!glyphs.length) glyphs = iconNames.map((name, i) => ({ name, cp: (0xe001 + i).toString(16) }));

        const ts       = Date.now();
        const srcParts = [
            eotBuf   ? `url("${fontName}.eot?t=${ts}#iefix") format("embedded-opentype")` : null,
            woff2Buf ? `url("${fontName}.woff2?t=${ts}") format("woff2")`  : null,
            woffBuf  ? `url("${fontName}.woff?t=${ts}") format("woff")`    : null,
            ttfBuf   ? `url("${fontName}.ttf?t=${ts}") format("truetype")` : null,
            svgBuf   ? `url("${fontName}.svg?t=${ts}#${fontName}") format("svg")` : null
        ].filter(Boolean).join(",\n       ");

        const css = [
            `@font-face {`, `  font-family: "${fontName}";`,
            eotBuf ? `  src: url("${fontName}.eot?t=${ts}");` : null,
            `  src: ${srcParts};`, `  font-weight: normal;`, `  font-style: normal;`, `}`, ``,
            `[class^="${fontName}-"], [class*=" ${fontName}-"] {`,
            `  font-family: "${fontName}" !important;`, `  speak: none;`, `  font-style: normal;`,
            `  font-weight: normal;`, `  font-variant: normal;`, `  text-transform: none;`,
            `  line-height: 1;`, `  -webkit-font-smoothing: antialiased;`,
            `  -moz-osx-font-smoothing: grayscale;`, `}`, ``,
            ...glyphs.map(g => `.${fontName}-${g.name}:before { content: "\\${g.cp}"; }`)
        ].filter(l => l !== null).join("\n");

        const previewHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fontName}</title><link rel="stylesheet" href="${fontName}.css"><style>body{font-family:-apple-system,sans-serif;padding:24px;background:#f8f9fa;margin:0}h1{color:#1a1a2e;margin-bottom:4px}.sub{color:#666;margin-bottom:24px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 8px;text-align:center;cursor:pointer;transition:all .15s}.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);border-color:#6366f1}.card i{font-size:28px;display:block;margin-bottom:8px;color:#374151}.card span{font-size:10px;color:#6b7280;display:block;word-break:break-all}.t{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:#1e293b;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;transition:transform .2s;pointer-events:none}.t.show{transform:translateX(-50%) translateY(0)}</style></head><body><h1>${fontName}</h1><p class="sub">${glyphs.length} icon${glyphs.length !== 1 ? "s" : ""} &mdash; click to copy class</p><div class="grid">${glyphs.map(g => `<div class="card" onclick="cp('${fontName} ${fontName}-${g.name}')"><i class="${fontName} ${fontName}-${g.name}"></i><span>${g.name}</span></div>`).join("")}</div><div class="t" id="t">Copied!</div><script>function cp(c){navigator.clipboard.writeText(c).catch(function(){var x=document.createElement("textarea");x.value=c;document.body.appendChild(x);x.select();document.execCommand("copy");document.body.removeChild(x)});var t=document.getElementById("t");t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2000)}</script></body></html>`;

        res.json({
            fontName,
            icons:       glyphs.map(g => g.name),
            css,
            previewHtml,
            stored,
            fonts: {
                woff2: woff2Buf ? woff2Buf.toString("base64") : null,
                woff:  woffBuf  ? woffBuf.toString("base64")  : null,
                ttf:   ttfBuf   ? ttfBuf.toString("base64")   : null,
                eot:   eotBuf   ? eotBuf.toString("base64")   : null,
                svg:   svgBuf   ? svgBuf.toString("base64")   : null
            }
        });

    } catch (err) {
        console.error("[webfont]", err);
        res.status(500).json({ error: err.message || "Font generation failed" });
    } finally {
        fsAsync.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
});

// ===================================
// SAVE WEBFONT
// Stratus: {sub}/webfonts/{ts}_{name}/  — one virtual folder per save
// Index:   {sub}/webfonts/_index.json  — catalogue for list/delete
// Local fallback: os.tmpdir()/svgforge-wf/
// ===================================
app.post("/save-webfont", async (req, res) => {
    const authCtx = getSession(req);
    if (!authCtx) return res.status(401).json({ success: false, message: "Sign in to save WebFonts" });
    try {
        const { fontName, fonts, css, previewHtml } = req.body || {};
        if (!fontName || !fonts) return res.status(400).json({ success: false, message: "Missing fontName or fonts" });

        // sub = OneAuth user's unique identifier used as the top-level folder
        const sub      = String(authCtx.session.user.id || authCtx.session.user.email || "user")
            .replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 40);
        const safeName = String(fontName).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 32);
        const ts       = Date.now();
        const entryId  = `${ts}_${safeName}`;
        const folderKey = `${sub}/webfonts/${entryId}`;

        // Detect Catalyst runtime by the presence of project credential headers
        const inCatalyst = !!(req.headers["x-zc-projectid"] || req.headers["x-zc-admin-cred-token"]);

        if (inCatalyst) {
            const uploads = [
                ...(["woff2","woff","ttf","eot"]).filter(t => fonts[t]).map(t =>
                    stratusPut(req, `${folderKey}/${safeName}.${t}`, Buffer.from(fonts[t], "base64"),
                        t === "woff2" ? "font/woff2" : `font/${t}`)
                ),
                fonts.svg   && stratusPut(req, `${folderKey}/${safeName}.svg`,          Buffer.from(fonts.svg,   "base64"), "image/svg+xml"),
                css         && stratusPut(req, `${folderKey}/${safeName}.css`,          Buffer.from(css,         "utf8"  ), "text/css"),
                previewHtml && stratusPut(req, `${folderKey}/${safeName}_preview.html`, Buffer.from(previewHtml, "utf8"  ), "text/html")
            ].filter(Boolean);
            await Promise.all(uploads);
            const index = await stratusReadIndex(req, sub);
            index.entries.unshift({ id: entryId, fontName: safeName, ts: String(ts), folderKey });
            await stratusWriteIndex(req, sub, index);
            return res.json({ success: true, id: entryId });
        }

        // ── Local-dev fallback ────────────────────────────────────────────────
        const localDir = path.join(LOCAL_WF_DIR, entryId);
        fs.mkdirSync(localDir, { recursive: true });
        const files = {};
        for (const t of ["woff2","woff","ttf","eot","svg"]) {
            if (fonts[t]) { fs.writeFileSync(path.join(localDir, `${safeName}.${t}`), Buffer.from(fonts[t], "base64")); files[t] = t; }
        }
        if (css)         { fs.writeFileSync(path.join(localDir, `${safeName}.css`),          css,         "utf8"); files.css  = "css";  }
        if (previewHtml) { fs.writeFileSync(path.join(localDir, `${safeName}_preview.html`), previewHtml, "utf8"); files.html = "html"; }
        const idx = localWfRead();
        idx.entries.unshift({ id: entryId, sub, fontName: safeName, ts: String(ts), localDir, files });
        localWfWrite(idx);
        return res.json({ success: true, id: entryId });

    } catch (err) {
        console.error("[save-webfont]", err);
        res.status(500).json({ success: false, message: err.message || "Save failed" });
    }
});

// ===================================
// LIST USER'S SAVED WEBFONTS
// ===================================
app.get("/list-webfonts", async (req, res) => {
    const authCtx = getSession(req);
    if (!authCtx) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const sub = String(authCtx.session.user.id || authCtx.session.user.email || "user")
            .replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 40);

        const inCatalyst = !!(req.headers["x-zc-projectid"] || req.headers["x-zc-admin-cred-token"]);

        if (inCatalyst) {
            const index = await stratusReadIndex(req, sub);
            return res.json({ success: true,
                fonts: (index.entries || []).map(e => ({
                    id: e.id, fontName: e.fontName, ts: e.ts, folderKey: e.folderKey
                }))
            });
        }

        // ── Local-dev fallback ────────────────────────────────────────────────
        const idx   = localWfRead();
        const fonts = idx.entries.filter(e => e.sub === sub)
            .map(e => ({ id: e.id, fontName: e.fontName, ts: e.ts,
                         folderKey: `local:${e.id}`, files: e.files }));
        return res.json({ success: true, fonts });

    } catch (err) {
        console.error("[list-webfonts]", err);
        res.status(500).json({ success: false, message: err.message || "List failed" });
    }
});

// ===================================
// DELETE SAVED WEBFONT — removes Stratus objects + updates index
// ===================================
app.delete("/delete-webfont/:id", async (req, res) => {
    const authCtx = getSession(req);
    if (!authCtx) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const sub     = String(authCtx.session.user.id || authCtx.session.user.email || "user")
            .replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 40);
        const entryId = req.params.id;

        const inCatalyst = !!(req.headers["x-zc-projectid"] || req.headers["x-zc-admin-cred-token"]);

        if (inCatalyst) {
            const index = await stratusReadIndex(req, sub);
            const entry = (index.entries || []).find(e => e.id === entryId);
            if (!entry) return res.status(404).json({ success: false, message: "Not found" });
            const fk   = entry.folderKey;
            const name = entry.fontName;
            // Delete all files in the virtual folder then update the index
            await Promise.all(
                ["woff2","woff","ttf","eot","svg","css"].map(ext => stratusDelete(req, `${fk}/${name}.${ext}`))
                    .concat([stratusDelete(req, `${fk}/${name}_preview.html`)])
            );
            index.entries = index.entries.filter(e => e.id !== entryId);
            await stratusWriteIndex(req, sub, index);
            return res.json({ success: true });
        }

        // ── Local-dev fallback ────────────────────────────────────────────────
        const idx   = localWfRead();
        const entry = idx.entries.find(e => e.id === entryId && e.sub === sub);
        if (!entry) return res.status(404).json({ success: false, message: "Not found" });
        if (entry.localDir) { try { fs.rmSync(entry.localDir, { recursive: true, force: true }); } catch (_) {} }
        idx.entries = idx.entries.filter(e => e.id !== entryId);
        localWfWrite(idx);
        return res.json({ success: true });

    } catch (err) {
        console.error("[delete-webfont]", err);
        res.status(500).json({ success: false, message: err.message || "Delete failed" });
    }
});

// ===================================
// DOWNLOAD WEBFONT FILE
// Stratus: GET /get-webfont-file?key={sub}/webfonts/{entryId}/{filename}
// Local:   GET /get-webfont-file?key=local:{entryId}/{filename}
// ===================================
app.get("/get-webfont-file", async (req, res) => {
    const key = String(req.query.key || "");
    if (!key) return res.status(400).json({ success: false, message: "Missing key param" });

    if (key.startsWith("local:")) {
        const rest    = key.slice(6);
        const slash   = rest.indexOf("/");
        const entryId = rest.slice(0, slash);
        const fname   = rest.slice(slash + 1);
        const idx     = localWfRead();
        const entry   = idx.entries.find(e => e.id === entryId);
        if (!entry) return res.status(404).send("Not found");
        const fpath   = path.join(entry.localDir, fname);
        if (!fs.existsSync(fpath)) return res.status(404).send("File not found");
        res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
        return res.sendFile(fpath);
    }

    try {
        const buffer = await stratusGet(req, key);
        const fname  = key.split("/").pop() || "download";
        res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = app;

// Local development only — Catalyst runs the app via module.exports
if (require.main === module) {
    require('dotenv').config();
    const http = require('http');
    const PORT = process.env.PORT || 3001;
    http.createServer(app).listen(PORT, () => {
        console.log(`[local] Function server running at http://localhost:${PORT}`);
    });
}
