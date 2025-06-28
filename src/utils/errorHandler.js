// Centralized error handling and logging system
class ErrorHandler {
  constructor() {
    this.errorQueue = [];
    this.maxQueueSize = 100;
    this.reportingEnabled = false;
  }

  // Log error with context and severity
  logError(error, context = {}, severity = 'error') {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || 'Unknown error',
      stack: error.stack,
      context: context,
      severity: severity,
      userAgent: navigator.userAgent,
      url: window.location?.href || 'unknown'
    };

    // Add to queue
    this.errorQueue.push(errorEntry);
    
    // Maintain queue size
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // Console logging based on severity
    switch (severity) {
      case 'critical':
        console.error('🚨 CRITICAL:', error, context);
        break;
      case 'error':
        console.error('❌ ERROR:', error, context);
        break;
      case 'warning':
        console.warn('⚠️ WARNING:', error, context);
        break;
      case 'info':
        console.info('ℹ️ INFO:', error, context);
        break;
    }

    // Store critical errors for user reporting
    if (severity === 'critical') {
      this.storeCriticalError(errorEntry);
    }
  }

  async storeCriticalError(errorEntry) {
    try {
      const result = await chrome.storage.local.get(['criticalErrors']);
      const errors = result.criticalErrors || [];
      
      errors.push(errorEntry);
      
      // Keep only last 10 critical errors
      if (errors.length > 10) {
        errors.splice(0, errors.length - 10);
      }
      
      await chrome.storage.local.set({ criticalErrors: errors });
    } catch (storageError) {
      console.error('Failed to store critical error:', storageError);
    }
  }

  // Get error summary for debugging
  getErrorSummary() {
    const summary = {
      totalErrors: this.errorQueue.length,
      bySeverity: {},
      recent: this.errorQueue.slice(-5)
    };

    this.errorQueue.forEach(error => {
      summary.bySeverity[error.severity] = (summary.bySeverity[error.severity] || 0) + 1;
    });

    return summary;
  }

  // Clear error queue
  clearErrors() {
    this.errorQueue = [];
    chrome.storage.local.remove(['criticalErrors']);
  }
}

// Global error handler instance
window.ErrorHandler = new ErrorHandler();

// Global error event listeners
window.addEventListener('error', (event) => {
  window.ErrorHandler.logError(event.error, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  window.ErrorHandler.logError(event.reason, {
    type: 'unhandledPromiseRejection'
  }, 'error');
});