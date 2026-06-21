# Distributed Search Typeahead System

A high-performance, distributed backend for a search typeahead system built with Node.js, Express, and Redis. This project implements distributed caching via consistent hashing, asynchronous batch database writes to protect primary data stores, and a custom recency-based trending search algorithm.

## ✨ Core Features

* **Distributed Cache Routing:** Implements a Consistent Hashing ring to distribute cache keys uniformly across a cluster of 3 Redis Docker containers, preventing catastrophic cache misses during scaling operations.
* **Asynchronous Batch Writes:** Buffers write-heavy search log submissions (`POST /search`) in memory and flushes them to the primary database in 10-second intervals, massively reducing database contention.
* **Trending Searches (Recency Bias):** Ranks suggestions not just by all-time historical popularity, but by a blended score `(totalCount + (recentCount * 5))`. A nightly decay cron job reduces counts by 10% to prevent old trends from permanently dominating the results.
* **Optimized Frontend UI:** Features a premium dark-mode interface with network debouncing (300ms), a strict 3-character API trigger threshold, and full keyboard navigation.

## 🚀 Setup & Execution

### 1. Prerequisites
* **Node.js** (v18+)
* **Docker Desktop** (Engine running)

### 2. Installation
Clone the repository and install the backend dependencies:
```bash
npm install
### 3. Boot the Redis Cluster

Spin up the 3 independent Redis cache nodes using Docker:

```bash
docker run -d --name redis-node-a -p 6379:6379 redis:alpine
docker run -d --name redis-node-b -p 6380:6379 redis:alpine
docker run -d --name redis-node-c -p 6381:6379 redis:alpine

```

### 4. Generate the Dataset

Generate the 100,000+ e-commerce and tech search queries to seed the primary database:

```bash
node generateData.js

```

### 5. Launch the System

Start the Express API server:

```bash
node server.js

```

Once the terminal logs `Connected to Docker Redis Node_A` (and B, C), open `index.html` in your web browser (or via VS Code Live Server) to interact with the UI.

## 🏗️ Architecture

### The Read Path (Suggestions)

1. **Debounced Input:** The UI waits for a 300ms pause and $\ge$ 3 characters before firing a request.
2. **Consistent Hashing:** The API hashes the exact prefix and routes the request to its designated Redis Node.
3. **Cache Fallback:** * **Hit:** Returns `O(1)` from Redis.
* **Miss:** Computes the top 10 trends from the DB, caches the array in the assigned Redis node for 5 minutes, and returns the data.



### The Write Path (Logging Searches)

1. **Buffer Intercept:** Search executions are intercepted and aggregated in a lightweight memory buffer.
2. **Periodic Flush:** Every 10 seconds, the buffer bulk-updates the primary database and executes cache-invalidation commands (`DEL`) strictly on the Redis nodes responsible for the updated prefixes.

## 🔌 API Documentation

### 1. Fetch Suggestions

**`GET /suggest?q=<prefix>`**

* **Description:** Returns top 10 prefix-matching suggestions sorted by the blended trending score.
* **Response (200 OK):**
```json
[
  "apple laptop pro",
  "apple laptop wireless"
]

```



### 2. Submit Search

**`POST /search`**

* **Description:** Submits a search query, adding it to the async batch writer buffer.
* **Body:** `{ "query": "apple laptop pro" }`
* **Response (200 OK):** `{ "message": "Searched" }`

### 3. Cache Debugger

**`GET /cache/debug?prefix=<prefix>`**

* **Description:** Exposes consistent hashing routing logic and hit/miss status.
* **Response (200 OK):**
```json
{
  "prefix": "app",
  "assignedNode": "Node_B",
  "cacheHit": true
}

```



## 📊 Performance Metrics

* **Write Load Reduction:** Asynchronous batching reduces potential synchronous database writes by up to 99% under peak load, collapsing thousands of identical requests per second into a single atomic update every 10 seconds.
* **Network Efficiency:** Frontend debouncing and character thresholds eliminate over 60% of unnecessary HTTP requests for partial strings.
