const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- 1. SIMULATED DATABASE WITH INITIAL SEED DATA ---
let db = {}; 
const rawData = JSON.parse(fs.readFileSync('./dataset.json', 'utf-8'));
rawData.forEach(item => {
    db[item.query.toLowerCase()] = { totalCount: item.count, recentCount: 0 };
});

// --- 2. MULTI-NODE REDIS CLIENT CONNECTIONS ---
const REDIS_CONFIGS = [
    { name: 'Node_A', url: 'redis://localhost:6379' },
    { name: 'Node_B', url: 'redis://localhost:6380' },
    { name: 'Node_C', url: 'redis://localhost:6381' }
];

const redisClients = {};
REDIS_CONFIGS.forEach(cfg => {
    const client = createClient({ url: cfg.url });
    client.on('error', (err) => console.error(`Redis ${cfg.name} Error`, err));
    client.connect().then(() => console.log(`Connected to Docker Redis ${cfg.name}`));
    redisClients[cfg.name] = client;
});

// Consistent Hashing Ring Router
function getCacheNode(prefix) {
    let hash = 0;
    for (let i = 0; i < prefix.length; i++) {
        hash = (hash << 5) - hash + prefix.charCodeAt(i);
        hash |= 0;
    }
    const nodeNames = Object.keys(redisClients);
    return nodeNames[Math.abs(hash) % nodeNames.length];
}

// --- 3. BATCH WRITER ---
let writeBuffer = {}; 

setInterval(async () => {
    const keys = Object.keys(writeBuffer);
    if (keys.length === 0) return;

    console.log(`[Batch Writer] Flushing ${keys.length} searches to Database...`);
    
    for (const query of keys) {
        if (!db[query]) db[query] = { totalCount: 0, recentCount: 0 };
        db[query].totalCount += writeBuffer[query];
        db[query].recentCount += writeBuffer[query];
        
        // Invalidate key across the specific Redis Ring node handling its prefixes
        for (let i = 1; i <= query.length; i++) {
            const prefix = query.substring(0, i);
            const targetNode = getCacheNode(prefix);
            try {
                await redisClients[targetNode].del(prefix); 
            } catch(e) { /* ignore cleanup errors on missing keys */ }
        }
    }
    writeBuffer = {}; 
}, 10000);

// Nightly Decay Strategy: Reduce counts by 10% periodically to clear old trends (Instructor Requirement)
setInterval(() => {
    console.log("[Decay Service] Decaying historical counts by 10%...");
    Object.keys(db).forEach(k => {
        db[k].totalCount = Math.floor(db[k].totalCount * 0.9);
        db[k].recentCount = Math.floor(db[k].recentCount * 0.9);
    });
}, 3600000); 

// --- 4. API ENDPOINTS ---

// GET /suggest?q=<prefix>
app.get('/suggest', async (req, res) => {
    const prefix = (req.query.q || '').toLowerCase().trim();
    
    // STRICT TRANSCRIPT CONSTRAINT: Minimum 3 characters required to load suggestions
    if (prefix.length < 3) {
        return res.json([]);
    }

    const targetNode = getCacheNode(prefix);

    try {
        // Attempt Cache Read from Assigned Redis Node
        const cachedData = await redisClients[targetNode].get(prefix);
        if (cachedData) {
            return res.json(JSON.parse(cachedData));
        }

        // Cache Miss: Compute Blended Score from DB
        const results = Object.keys(db)
            .filter(query => query.startsWith(prefix))
            .map(query => ({
                query,
                score: db[query].totalCount + (db[query].recentCount * 5) 
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(item => item.query);

        // Store result string inside the designated Redis instance (Expiring in 5 mins)
        await redisClients[targetNode].setEx(prefix, 300, JSON.stringify(results));
        
        return res.json(results);
    } catch (err) {
        return res.status(500).json({ error: "Cache cluster failure" });
    }
});

// POST /search
app.post('/search', (req, res) => {
    const query = (req.body.query || '').toLowerCase().trim();
    if (query) {
        writeBuffer[query] = (writeBuffer[query] || 0) + 1;
    }
    res.json({ message: "Searched" });
});

// GET /cache/debug?prefix=<prefix>
app.get('/cache/debug', async (req, res) => {
    const prefix = (req.query.prefix || '').toLowerCase().trim();
    if (prefix.length < 3) return res.json({ error: "Prefix must be >= 3 chars" });

    const targetNode = getCacheNode(prefix);
    const cachedData = await redisClients[targetNode].get(prefix);
    
    res.json({
        prefix,
        assignedNode: targetNode,
        cacheHit: !!cachedData
    });
});

// GET /trending - Returns global top 5 trending searches for the UI
app.get('/trending', (req, res) => {
    const globalTrends = Object.keys(db)
        .map(query => ({
            query,
            score: db[query].totalCount + (db[query].recentCount * 5) // Same recency math
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.query);

    res.json(globalTrends);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Typeahead Service running on http://localhost:${PORT}`));