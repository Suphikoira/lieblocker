// Centralized storage service with caching and cleanup
class StorageService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 100;
  }

  async initialize() {
    // Clean up old cache entries on startup
    await this.cleanupOldEntries();
    
    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupCache();
    }, 60000); // Every minute
  }

  // Cached storage operations
  async get(key, useCache = true) {
    if (useCache && this.cache.has(key)) {
      const cached = this.cache.get(key);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
      this.cache.delete(key);
    }

    const result = await chrome.storage.local.get([key]);
    const data = result[key];

    if (useCache && data !== undefined) {
      this.setCacheEntry(key, data);
    }

    return data;
  }

  async set(key, data) {
    await chrome.storage.local.set({ [key]: data });
    this.setCacheEntry(key, data);
  }

  async remove(key) {
    await chrome.storage.local.remove([key]);
    this.cache.delete(key);
  }

  setCacheEntry(key, data) {
    // Implement LRU cache
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }

  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  async cleanupOldEntries() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      const now = Date.now();

      for (const [key, value] of Object.entries(allData)) {
        // Clean up old video lies data (older than 24 hours)
        if (key.startsWith('currentVideoLies_') && value.timestamp) {
          const age = now - value.timestamp;
          if (age > 24 * 60 * 60 * 1000) {
            keysToRemove.push(key);
          }
        }

        // Clean up old analysis states (older than 2 hours)
        if (key === 'backgroundAnalysisState' && value.timestamp) {
          const age = now - value.timestamp;
          if (age > 2 * 60 * 60 * 1000) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`🧹 Cleaned up ${keysToRemove.length} old storage entries`);
      }
    } catch (error) {
      console.error('Error during storage cleanup:', error);
    }
  }

  // Statistics and monitoring
  async getStorageStats() {
    const allData = await chrome.storage.local.get(null);
    const stats = {
      totalKeys: Object.keys(allData).length,
      cacheSize: this.cache.size,
      estimatedSize: JSON.stringify(allData).length,
      categories: {}
    };

    // Categorize storage usage
    for (const key of Object.keys(allData)) {
      let category = 'other';
      if (key.startsWith('currentVideoLies_')) category = 'videoLies';
      else if (key === 'backgroundAnalysisState') category = 'analysisState';
      else if (key === 'sessionStats') category = 'stats';
      else if (key.includes('settings')) category = 'settings';

      stats.categories[category] = (stats.categories[category] || 0) + 1;
    }

    return stats;
  }
}

// Register the service
window.ServiceRegistry.register('storage', new StorageService());