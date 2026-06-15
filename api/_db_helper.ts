import crypto from 'crypto';

export const DEFAULT_DATABASE = {
    schema: [
        {
            id: 'gate_logs',
            label: 'General Gate Logbook',
            cols: [
                { type: 'text', title: 'Date', width: 90 },
                { type: 'text', title: 'Time In', width: 70 },
                { type: 'text', title: 'Time Out', width: 70 },
                { type: 'text', title: 'Duration', width: 70, readOnly: true },
                { type: 'text', title: 'Full Name', width: 140 },
                { type: 'text', title: 'Company / Affiliation', width: 160 },
                { type: 'text', title: 'Phone Number', width: 100 },
                { type: 'text', title: 'Vehicle Reg No', width: 100 },
                { type: 'text', title: 'Card / Tag No', width: 80 },
                { type: 'text', title: 'Host / Dept', width: 120 },
                { type: 'text', title: 'Room', width: 70 },
                { type: 'text', title: 'Purpose', width: 160 },
                { type: 'numeric', title: 'Confidence', width: 80, mask: '#.##' },
                { type: 'dropdown', title: 'Status', width: 80, source: ['PASS', 'FAIL'] },
                { type: 'hidden', title: 'ID' }
            ],
            live: true,
            rowCount: 0,
            lastUpdated: new Date().toISOString()
        }
    ],
    tables: {
        gate_logs: []
    },
    uploads: [],
    daily_codes: []
};

// Retrieve credentials securely
function getCloudinaryCredentials() {
    const cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.VITE_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.VITE_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error('Cloudinary credentials (CLOUD_NAME, API_KEY, API_SECRET) are not fully configured.');
    }
    return { cloudName, apiKey, apiSecret };
}

// Generate secure Cloudinary SHA-1 upload signature
export function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHash('sha1').update(paramString + apiSecret).digest('hex');
}

// Fetch database JSON file from Cloudinary (self-healing)
export async function getDatabase(): Promise<any> {
    const { cloudName } = getCloudinaryCredentials();
    const dbUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/gateloga_db.json`;

    try {
        const response = await fetch(dbUrl, { cache: 'no-store' });
        if (response.status === 404) {
            // Self-heal: database doesn't exist yet, return initialized template
            return DEFAULT_DATABASE;
        }
        if (!response.ok) {
            return DEFAULT_DATABASE;
        }
        const data = await response.json();
        
        // Ensure structure is correct
        if (!data.schema || !data.tables || !data.uploads) {
            return {
                schema: data.schema || DEFAULT_DATABASE.schema,
                tables: data.tables || DEFAULT_DATABASE.tables,
                uploads: data.uploads || DEFAULT_DATABASE.uploads,
                daily_codes: data.daily_codes || DEFAULT_DATABASE.daily_codes
            };
        }
        return data;
    } catch (error) {
        console.error('getDatabase error, returning default template:', error);
        return DEFAULT_DATABASE;
    }
}

// Save database JSON file back to Cloudinary
export async function saveDatabase(dbObj: any): Promise<boolean> {
    const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const publicId = 'gateloga_db.json';

    // Parameters sorted alphabetically: overwrite=true, public_id=..., timestamp=...
    const signatureParams = {
        overwrite: 'true',
        public_id: publicId,
        timestamp: timestamp
    };

    const signature = signCloudinaryParams(signatureParams, apiSecret);
    const dbString = JSON.stringify(dbObj, null, 2);

    const formData = new FormData();
    const blob = new Blob([dbString], { type: 'application/json' });
    formData.append('file', blob, 'gateloga_db.json');
    formData.append('public_id', publicId);
    formData.append('overwrite', 'true');
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Cloudinary upload failed: ${response.status} - ${errText}`);
    }

    return true;
}

// Helper to authenticate admin passcodes
export function verifyAdminPasscode(passcode: string | undefined): boolean {
    const correctPasscode = process.env.ADMIN_PASSCODE || '1234';
    return String(passcode) === String(correctPasscode);
}
