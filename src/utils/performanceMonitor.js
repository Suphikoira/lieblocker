// Performance monitoring and optimization
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      analysis: 300000, // 5 minutes
      apiCall: 30000,   // 30 seconds
      storage: 1000,    // 1 second
      ui: 100          // 100ms
    };
  }

  // Start timing an operation
  startTiming(operation, context = {}) {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    this.metrics.set(id, {
      operation,
      startTime: performance.now(),
      context
    });
    return id;
  }

  // End timing and log if threshold exceeded
  endTiming(id) {
    const metric = this.metrics.get(id);
    if (!metric) return null;

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    
    metric.endTime = endTime;
    metric.duration = duration;

    // Check threshold
    const threshold = this.thresholds[metric.operation] || 1000;
    if (duration > threshold) {
      console.warn(`⚠️ Performance: ${metric.operation} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`, metric.context);
      
      // Log slow operations
      this.logSlowOperation(metric);
    }

    this.metrics.delete(id);
    return metric;
  }

  async logSlowOperation(metric) {
    try {
      const result = await chrome.storage.local.get(['slowOperations']);
      const slowOps = result.slowOperations || [];
      
      slowOps.push({
        operation: metric.operation,
        duration: metric.duration,
        timestamp: Date.now(),
        context: metric.context
      });

      // Keep only last 50 slow operations
      if (slowOps.length > 50) {
        slowOps.splice(0, slowOps.length - 50);
      }

      await chrome.storage.local.set({ slowOperations: slowOps });
    } catch (error) {
      console.error('Failed to log slow operation:', error);
    }
  }

  // Monitor memory usage
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }

  // Get performance summary
  async getPerformanceSummary() {
    const slowOps = await chrome.storage.local.get(['slowOperations']);
    const memory = this.getMemoryUsage();
    
    return {
      activeTimings: this.metrics.size,
      slowOperations: slowOps.slowOperations || [],
      memoryUsage: memory,
      thresholds: this.thresholds
    };
  }

  // Clean up old performance data
  async cleanup() {
    await chrome.storage.local.remove(['slowOperations']);
    this.metrics.clear();
  }
}

window.PerformanceMonitor = new PerformanceMonitor();