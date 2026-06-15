import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getDatabase, saveDatabase } from './_db_helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { imageUrl, docName } = req.body;
        if (!imageUrl || !docName) {
            return res.status(400).json({ error: 'Missing imageUrl or docName in request body.' });
        }

        const db = await getDatabase();
        
        // Ensure uploads array exists
        if (!db.uploads) {
            db.uploads = [];
        }

        const newUploadId = crypto.randomUUID();
        const newUpload = {
            id: newUploadId,
            imageUrl: imageUrl,
            docName: docName,
            timestamp: new Date().toISOString(),
            status: 'pending',
            extractedRows: [],
            columns: [],
            uploaded_by_code: 'scanner'
        };

        db.uploads.unshift(newUpload); // Add to beginning of array

        await saveDatabase(db);
        return res.status(200).json({ success: true, id: newUploadId, message: 'Upload registered as pending.' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to add pending record.' });
    }
}
