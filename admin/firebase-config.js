// ============================================================================
// GATELOGA CLOUDINARY-VERCEL FIREBASE COMPATIBILITY POLYFILL (ADAPTER)
// ============================================================================

// Local database state in memory
export let cloudDatabase = { schema: [], tables: {}, uploads: [], daily_codes: [] };
let databaseLoaded = false;
let activeListeners = [];
let authStateCallbacks = [];

const VERCEL_API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'https://venlog.vercel.app' : '';

// 1. DUMMY DATABASE AND AUTH INITIALIZATIONS
export const db = {};

export const auth = {
    currentUser: null
};

// Auto-login active session if credentials exist in local storage
const hasLoggedIn = localStorage.getItem('venlog_logged_in') === 'true';
const activePasscode = sessionStorage.getItem('admin_passcode');
if (hasLoggedIn && activePasscode) {
    auth.currentUser = { email: 'server@venlog.com', displayName: 'Server Service Account' };
}

export class GoogleAuthProvider {}

// 2. FETCH DATABASE FROM CLOUDINARY THROUGH VERCEL
async function fetchDb() {
    try {
        const response = await fetch(`${VERCEL_API}/api/get_database`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        cloudDatabase = await response.json();
        
        // Normalize fields
        if (!cloudDatabase.schema) cloudDatabase.schema = [];
        if (!cloudDatabase.tables) cloudDatabase.tables = {};
        if (!cloudDatabase.uploads) cloudDatabase.uploads = [];
        if (!cloudDatabase.daily_codes) cloudDatabase.daily_codes = [];
        
        databaseLoaded = true;
        triggerAllListeners();
    } catch (err) {
        console.error('Failed to load database from Cloudinary raw files:', err);
    }
}

// 3. UPLOAD DATABASE TO CLOUDINARY THROUGH VERCEL
async function pushDb() {
    try {
        const passcode = sessionStorage.getItem('admin_passcode') || '';
        const response = await fetch(`${VERCEL_API}/api/save_database`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-passcode': passcode
            },
            body: JSON.stringify(cloudDatabase)
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Server rejected database save.');
        }
        triggerAllListeners();
    } catch (err) {
        console.error('Failed to push database update to Cloudinary:', err);
        throw err;
    }
}

// Trigger all active database listeners
function triggerAllListeners() {
    activeListeners.forEach(listener => {
        try {
            listener.run();
        } catch (e) {
            console.error('Error running collection/document listener callback:', e);
        }
    });
}

// Start fetching right away if logged in
if (hasLoggedIn && activePasscode) {
    fetchDb();
}

// 4. MOCK FIRESTORE COMPATIBILITY FUNCTIONS
export function collection(dbInstance, path) {
    return { type: 'collection', path };
}

export function doc(dbInstance, colPath, docId) {
    // Overload signature: doc(db, colPath, docId) or doc(collectionRef, docId)
    if (typeof dbInstance === 'object' && dbInstance.type === 'collection') {
        return { type: 'document', colPath: dbInstance.path, docId: colPath };
    }
    return { type: 'document', colPath, docId };
}

export function query(collectionRef, ...constraints) {
    return collectionRef;
}

// Dummy constraints
export function where() { return { type: 'where' }; }
export function orderBy() { return { type: 'orderBy' }; }
export function limit() { return { type: 'limit' }; }
export function startAfter() { return { type: 'startAfter' }; }

// Construct mock Firestore Document Snapshots
function buildSnapshot(ref) {
    if (ref.type === 'document') {
        const colPath = ref.colPath;
        const docId = ref.docId;
        
        if (colPath === 'system_config' && docId === 'db_schema') {
            return {
                exists: () => true,
                id: docId,
                data: () => ({ tables: cloudDatabase.schema || [] })
            };
        }
        if (colPath === 'system_config' && docId === 'global') {
            return {
                exists: () => true,
                id: docId,
                data: () => ({ max_images: 20, require_pin: false, upload_permit_code: '' })
            };
        }
        if (colPath === 'system_config' && docId === 'daily_codes') {
            return {
                exists: () => true,
                id: docId,
                data: () => ({ codes: cloudDatabase.daily_codes || [] })
            };
        }
        if (colPath === 'uploads') {
            const item = (cloudDatabase.uploads || []).find(u => u.id === docId);
            if (item) {
                // Map properties to match legacy database expectations
                const legacyItem = {
                    ...item,
                    storage_url: item.imageUrl,
                    thumbnail_url: item.imageUrl,
                    officer_remark: item.docName,
                    timestamp: {
                        toDate: () => new Date(item.timestamp)
                    },
                    rows: item.extractedRows || [],
                    columns: item.columns || []
                };
                return {
                    exists: () => true,
                    id: docId,
                    data: () => legacyItem
                };
            }
        }
        if (colPath === 'authorized_admins') {
            return {
                exists: () => true,
                id: docId,
                data: () => ({ role: 'Admin', approved_at: new Date() })
            };
        }
        return {
            exists: () => false,
            id: docId,
            data: () => null
        };
    } else if (ref.type === 'collection') {
        let path = ref.path;
        if (path === 'gate_logs_mandela') path = 'gate_logs';

        let list = [];
        if (path === 'uploads') {
            // Map list to legacy Firestore format
            list = (cloudDatabase.uploads || []).map(item => ({
                ...item,
                storage_url: item.imageUrl,
                thumbnail_url: item.imageUrl,
                officer_remark: item.docName,
                timestamp: {
                    toDate: () => new Date(item.timestamp)
                },
                rows: item.extractedRows || [],
                columns: item.columns || []
            }));
        } else if (path === 'gemini_jobs') {
            // Bind job status logic to upload item state
            list = (cloudDatabase.uploads || []).map(item => ({
                ...item,
                timestamp: {
                    toDate: () => new Date(item.timestamp)
                }
            }));
        } else if (path === 'access_requests') {
            list = [];
        } else if (path === 'authorized_admins') {
            list = [{ id: 'admin@gateloga.com', role: 'Admin' }];
        } else {
            // General table rows
            list = cloudDatabase.tables[path] || [];
        }

        const docs = list.map(item => {
            const id = item.id || 'doc_' + Math.random().toString(36).substring(2, 9);
            return {
                id: id,
                data: () => item
            };
        });

        return {
            docs: docs,
            size: docs.length,
            empty: docs.length === 0,
            metadata: { hasPendingWrites: false },
            forEach: (cb) => docs.forEach(cb)
        };
    }
    throw new Error('Invalid Firebase reference type.');
}

// 5. ASYNC GETTERS AND EVENT RUNNERS
export async function getDoc(docRef) {
    return buildSnapshot(docRef);
}

export async function getDocs(queryRef) {
    return buildSnapshot(queryRef);
}

export function onSnapshot(ref, callback, errorCallback) {
    const listener = {
        ref,
        run: () => {
            const snap = buildSnapshot(ref);
            callback(snap);
        }
    };
    activeListeners.push(listener);

    // Run snapshot immediately in background microtask if loaded
    if (databaseLoaded) {
        setTimeout(() => {
            try {
                const snap = buildSnapshot(ref);
                callback(snap);
            } catch (err) {
                console.error(err);
                if (errorCallback) errorCallback(err);
            }
        }, 0);
    }

    return () => {
        activeListeners = activeListeners.filter(l => l !== listener);
    };
}

// 6. DB WRITING HANDLERS
export async function setDoc(docRef, data, options) {
    const col = docRef.colPath;
    const docId = docRef.docId;

    if (col === 'system_config') {
        if (docId === 'db_schema') {
            cloudDatabase.schema = data.tables;
        } else if (docId === 'daily_codes') {
            cloudDatabase.daily_codes = data.codes;
        }
    } else if (col === 'uploads') {
        if (!cloudDatabase.uploads) cloudDatabase.uploads = [];
        const idx = cloudDatabase.uploads.findIndex(u => u.id === docId);
        
        // Unpack legacy mappings
        const cleanData = { ...data };
        if (data.storage_url) {
            cleanData.imageUrl = data.storage_url;
            delete cleanData.storage_url;
        }
        if (data.officer_remark) {
            cleanData.docName = data.officer_remark;
            delete cleanData.officer_remark;
        }
        if (data.rows) {
            cleanData.extractedRows = data.rows;
            delete cleanData.rows;
        }

        if (idx !== -1) {
            cloudDatabase.uploads[idx] = { ...cloudDatabase.uploads[idx], ...cleanData };
        } else {
            cloudDatabase.uploads.unshift({ id: docId, ...cleanData });
        }
    } else {
        // Master Table row insert/update
        if (!cloudDatabase.tables[col]) cloudDatabase.tables[col] = [];
        const idx = cloudDatabase.tables[col].findIndex(r => r.id === docId);
        
        // Strip out toDate method if any timestamp gets serialized
        const cleanRow = { ...data };
        if (cleanRow.upload_timestamp && cleanRow.upload_timestamp.toDate) {
            cleanRow.upload_timestamp = cleanRow.upload_timestamp.toDate().toISOString();
        } else if (cleanRow.upload_timestamp instanceof Date) {
            cleanRow.upload_timestamp = cleanRow.upload_timestamp.toISOString();
        }

        if (idx !== -1) {
            cloudDatabase.tables[col][idx] = { ...cloudDatabase.tables[col][idx], ...cleanRow };
        } else {
            cloudDatabase.tables[col].push({ id: docId, ...cleanRow });
        }
    }

    await pushDb();
}

export async function updateDoc(docRef, data) {
    await setDoc(docRef, data, { merge: true });
}

export async function deleteDoc(docRef) {
    const col = docRef.colPath;
    const docId = docRef.docId;

    if (col === 'uploads') {
        cloudDatabase.uploads = (cloudDatabase.uploads || []).filter(u => u.id !== docId);
    } else if (col !== 'system_config') {
        if (cloudDatabase.tables[col]) {
            cloudDatabase.tables[col] = cloudDatabase.tables[col].filter(r => r.id !== docId);
        }
    }

    await pushDb();
}

// 7. COMPAT AUTH PIPELINE INTERCEPTORS
export async function signInWithEmailAndPassword(authInstance, email, password) {
    authInstance.currentUser = { email: email, displayName: 'Server Account' };
    authStateCallbacks.forEach(cb => cb(authInstance.currentUser));

    // Force pull database now that session passcode is saved
    await fetchDb();
    
    return { user: authInstance.currentUser };
}

export async function signInWithPopup(authInstance, providerInstance) {
    throw new Error('Google Auth has been disabled. Please log in using the Admin Passcode.');
}

export async function signOut(authInstance) {
    authInstance.currentUser = null;
    localStorage.removeItem('venlog_logged_in');
    sessionStorage.removeItem('admin_passcode');
    authStateCallbacks.forEach(cb => cb(null));
    return true;
}

export function onAuthStateChanged(authInstance, callback) {
    authStateCallbacks.push(callback);
    callback(authInstance.currentUser);
    return () => {
        authStateCallbacks = authStateCallbacks.filter(cb => cb !== callback);
    };
}

// 8. INTERCEPT DYNAMIC CLIENT-SIDE FETCH CALLS (PROXY INTERCEPTOR)
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
    const urlStr = String(url);

    // A. Intercept Daily Code Generation
    if (urlStr.includes('/api/manage_daily_codes')) {
        try {
            const body = JSON.parse(options?.body || '{}');
            const code = body.code;
            const duration = body.duration_hours || 24;

            const now = Date.now();
            const newCode = {
                code,
                created_at: now,
                expires_at: now + duration * 60 * 60 * 1000,
                active: true
            };

            if (!cloudDatabase.daily_codes) cloudDatabase.daily_codes = [];
            cloudDatabase.daily_codes.unshift(newCode);

            await pushDb();
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    // B. Intercept Photo Delete Trigger (Cloudinary + Local list)
    if (urlStr.includes('/api/delete_upload')) {
        try {
            const body = JSON.parse(options?.body || '{}');
            const docId = body.doc_id;

            cloudDatabase.uploads = (cloudDatabase.uploads || []).filter(u => u.id !== docId);

            await pushDb();
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    // C. Intercept Staging Retry AI (Reroute to our new /api/process endpoint)
    if (urlStr.includes('/api/process_upload')) {
        try {
            const body = JSON.parse(options?.body || '{}');
            const docId = body.doc_id;
            const passcode = sessionStorage.getItem('admin_passcode') || '';

            // Forward to Vercel api/process
            const res = await originalFetch(`${VERCEL_API}/api/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-passcode': passcode
                },
                body: JSON.stringify({ uploadId: docId })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Gemini processing failed.');
            }

            const data = await res.json();
            
            // Sync local state
            const idx = cloudDatabase.uploads.findIndex(u => u.id === docId);
            if (idx !== -1) {
                cloudDatabase.uploads[idx] = data.upload;
            }

            // Trigger reactive lists
            triggerAllListeners();

            return new Response(JSON.stringify({ success: true, count: data.upload.extracted_count }), { status: 200 });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    // D. Intercept Storage Stats
    if (urlStr.includes('/api/cleanup_storage')) {
        return new Response(JSON.stringify({ success: true, freed_bytes: 0 }), { status: 200 });
    }

    // Normal pass-through
    return originalFetch.apply(this, arguments);
};

// 9. EVENT DELEGATION FOR PROCESS NOW BUTTON IN LIGHTBOX
document.addEventListener('click', async (e) => {
    const target = e.target;
    if (target && target.id === 'lb-btn-process-now') {
        const btn = target;
        const uploadId = btn.dataset.docId;
        if (!uploadId) return;

        btn.textContent = 'Processing with Gemini...';
        btn.disabled = true;

        try {
            const passcode = sessionStorage.getItem('admin_passcode') || '';
            const res = await fetch(`${VERCEL_API}/api/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-passcode': passcode
                },
                body: JSON.stringify({ uploadId })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Gemini processing failed.');
            }

            const data = await res.json();
            
            // Sync local cache
            const idx = cloudDatabase.uploads.findIndex(u => u.id === uploadId);
            if (idx !== -1) {
                cloudDatabase.uploads[idx] = data.upload;
            }

            // Alert success
            const alertFn = window.alert || console.log;
            alertFn('OCR extraction complete!', 'success');

            // Force refresh UI by triggering listeners
            triggerAllListeners();
        } catch (err) {
            const alertFn = window.alert || console.error;
            alertFn(err.message || 'AI processing failed.', 'error');
            btn.textContent = 'Convert with Gemini AI';
            btn.disabled = false;
        }
    }
});
