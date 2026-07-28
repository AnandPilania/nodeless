import { Router } from "express";
import { browseDirectory, getDefaultBrowseStart, DRIVE_LIST_SENTINEL } from "../services/workspace.js";

export function createBrowseRouter(): Router {
    const router = Router();

    router.get("/platform", (_req, res) => {
        res.json({
            platform: process.platform,
            isWindows: process.platform === "win32",
            driveListSentinel: DRIVE_LIST_SENTINEL
        });
    });

    router.get("/", async (req, res) => {
        const targetPath = (req.query.path as string | undefined) ?? getDefaultBrowseStart();
        try {
            const listing = await browseDirectory(targetPath);
            res.json(listing);
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    return router;
}
