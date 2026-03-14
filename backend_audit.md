# Backend Audit Report: YACA Catalogo

This report summarizes the findings of the backend audit conducted on the `catalogo` application. The focus was on identifying antipatterns, potential bugs, security vulnerabilities, and architectural bottlenecks.

## 1. Executive Summary
The backend is a sophisticated Node.js/Express application with advanced AI-driven recommendation features. While functionally robust, several architectural decisions introduce risks related to **distributed consistency**, **race conditions**, and **maintenance debt**.

---

## 2. Identified Vulnerabilities & Bugs

### 🚨 Critical/High: Distributed Race Conditions
As the application is designed to run in a clustered environment (e.g., multiple Node.js instances), several modules rely on process-local state, which will fail or cause data corruption under load.

*   **`syncManager.js` (Debounced Sync)**: Uses a local `Map` to track pending syncs. In a cluster, the same user could trigger concurrent syncs on different nodes, leading to inconsistent Stremio addon states.
*   **`trakt.js` (OAuth Token Refresh)**: If multiple requests for the same user fail with 401 simultaneously, multiple refresh calls will be triggered. Since Trakt invalidates old refresh tokens upon rotation, this will result in account lockout for all but one instance.
*   **`ProfileBuilder.js` (Lost Updates in Scoring)**: The process of updating user scores is a Read-Modify-Update cycle. Concurrent syncs or interactions for the same user will overwrite each other's score increments.

### ⚠️ Medium: Ineffective Rate Limiting
*   **`rateLimiter.js`**: Implements a per-request rate limiter. It does not provide cross-request or cross-node protection for API keys. A burst of requests will still result in 429 errors from TMDB or Trakt as each request operates its own independent throttle.

### ⚠️ Medium: Background Worker "Leaks"
*   **`tmdb.js` Enrichment**: Launches non-blocking background tasks via `setImmediate`. Under high load, these unbounded workers could consume excessive CPU/Memory and overwhelm external APIs, as there is no global queue or backpressure mechanism.

---

## 3. Architectural Antipatterns

### 🏛️ Giant Component / God Object
Several core files exceed manageable size and violate the Single Responsibility Principle:
*   **`catalogHandler.js` (~800 lines)**: Orchestrates fetching, filtering, AI logic, and formatting.
*   **`hybridRecommendations.js` (~800 lines)**: Contains mixing logic, scoring details, and fallback strategies.
*   **`tmdb.js` (~1000 lines)**: Combines client logic, complex parsing, image processing, and caching.

### 🏗️ Logic Leakage
Internal scoring logic and AI prompt construction are scattered across `handlers`, `engines`, and `ai` folders, making it difficult to change scoring weights or prompt strategies without visiting multiple files.

---

## 4. Recommendations

### Short Term (Fixes)
1.  **Distributed Locking**: Use `utils/distributedLock.js` (already present!) to wrap the Trakt refresh logic and the `ProfileBuilder` scoring updates.
2.  **Global Rate Limiting**: Implement a Redis-backed rate limiter for internal API clients to ensure global compliance with TMDB/Trakt limits regardless of request volume.
3.  **Atomic MongoDB Updates**: Refactor `ProfileBuilder` to use MongoDB's `$inc` operator for Map scores where possible, or use versioning/optimistic locking.

### Long Term (Refactoring)
1.  **Service Layer Extraction**: Move the core logic from `catalogHandler.js` and `tmdb.js` into smaller, testable 서비스 classes (e.g., `CatalogService`, `MetadataService`, `ImageProcessor`).
2.  **Worker Queue**: Replace `setImmediate` background tasks with a proper worker queue (e.g., BullMQ or a simple Redis-backed list) to manage background enrichment with proper concurrency control and retries.
3.  **Configuration Centralization**: Move all scoring weights and AI prompt templates into a unified configuration module or a database-backed settings system.

---
**Audit Status**: Phase 2 Complete.
**Next Steps**: Implementation of prioritized fixes for race conditions.
