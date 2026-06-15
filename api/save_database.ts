import type { VercelRequest, VercelResponse } from '@vercel/node';
import { saveDatabase, verifyAdminPasscode } from './_db_helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-passcode');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const passcode = req.headers['x-admin-passcode'] as string | undefined;
        if (!verifyAdminPasscode(passcode)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid passcode.' });
        }

        const newDbData = req.body;
        if (!newDbData || typeof newDbData !== 'object') {
            return res.status(400).json({ error: 'Invalid database payload.' });
        }

        await saveDatabase(newDbData);
        return res.status(200).json({ success: true, message: 'Database saved successfully.' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to save database.' });
    }
}
