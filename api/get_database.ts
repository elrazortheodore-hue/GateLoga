import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase } from './_db_helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const dbData = await getDatabase();
        return res.status(200).json(dbData);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to fetch database.' });
    }
}
