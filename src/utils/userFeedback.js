// User feedback and notification system
class UserFeedback {
  constructor() {
    this.notificationQueue = [];
    this.maxNotifications = 3;
  }

  // Show user-friendly error messages
  showError(error, context = {}) {
    let userMessage = 'An unexpected error occurred';
    let actionable = false;

    // Convert technical errors to user-friendly messages
    if (error.message) {
      if (error.message.includes('API key')) {
        userMessage = 'Please check your AI API key in settings';
        actionable = true;
      } else if (error.message.includes('rate limit')) {
        userMessage = 'Too many requests. Please wait a moment and try again';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        userMessage = 'Network connection issue. Please check your internet connection';
      } else if (error.message.includes('transcript')) {
        userMessage = 'Could not extract video transcript. This video may not have captions available';
      } else if (error.message.includes('content script')) {
        userMessage = 'Please refresh the page and try again';
        actionable = true;
      }
    }

    this.showNotification(userMessage, 'error', {
      actionable,
      technical: error.message,
      ...context
    });
  }

  // Show success messages with helpful context
  showSuccess(message, details = {}) {
    this.showNotification(message, 'success', details);
  }

  // Show warning messages
  showWarning(message, details = {}) {
    this.showNotification(message, 'warning', details);
  }

  // Show info messages
  showInfo(message, details = {}) {
    this.showNotification(message, 'info', details);
  }

  // Core notification system
  showNotification(message, type = 'info', options = {}) {
    // Remove excess notifications
    while (this.notificationQueue.length >= this.maxNotifications) {
      const oldest = this.notificationQueue.shift();
      if (oldest.element && oldest.element.parentNode) {
        oldest.element.remove();
      }
    }

    const notification = this.createNotificationElement(message, type, options);
    document.body.appendChild(notification);

    const notificationData = {
      element: notification,
      timestamp: Date.now(),
      type,
      message
    };

    this.notificationQueue.push(notificationData);

    // Auto-remove after delay
    const delay = options.duration || this.getDefaultDuration(type);
    setTimeout(() => {
      this.removeNotification(notificationData);
    }, delay);

    return notificationData;
  }

  createNotificationElement(message, type, options) {
    const notification = document.createElement('div');
    notification.className = `user-notification ${type}`;
    
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    let actionButton = '';
    if (options.actionable && options.action) {
      actionButton = `<button class="notification-action">${options.action.text}</button>`;
    }

    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${icons[type] || icons.info}</span>
        <div class="notification-text">
          <div class="notification-message">${message}</div>
          ${options.technical ? `<div class="notification-technical">Technical: ${options.technical}</div>` : ''}
        </div>
        ${actionButton}
        <button class="notification-close">×</button>
      </div>
    `;

    // Add event listeners
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.removeNotification({ element: notification });
    });

    if (options.actionable && options.action) {
      const actionBtn = notification.querySelector('.notification-action');
      actionBtn.addEventListener('click', () => {
        options.action.callback();
        this.removeNotification({ element: notification });
      });
    }

    return notification;
  }

  removeNotification(notificationData) {
    if (notificationData.element && notificationData.element.parentNode) {
      notificationData.element.classList.add('removing');
      setTimeout(() => {
        if (notificationData.element.parentNode) {
          notificationData.element.remove();
        }
      }, 300);
    }

    const index = this.notificationQueue.indexOf(notificationData);
    if (index > -1) {
      this.notificationQueue.splice(index, 1);
    }
  }

  getDefaultDuration(type) {
    switch (type) {
      case 'error': return 8000;
      case 'warning': return 6000;
      case 'success': return 4000;
      case 'info': return 5000;
      default: return 5000;
    }
  }

  // Progress indicator for long operations
  showProgress(message, estimatedDuration = null) {
    const progress = this.createProgressElement(message, estimatedDuration);
    document.body.appendChild(progress);
    
    return {
      element: progress,
      update: (newMessage, percentage) => {
        const messageEl = progress.querySelector('.progress-message');
        const barEl = progress.querySelector('.progress-bar-fill');
        
        if (messageEl) messageEl.textContent = newMessage;
        if (barEl && percentage !== undefined) {
          barEl.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
        }
      },
      complete: () => {
        progress.classList.add('removing');
        setTimeout(() => {
          if (progress.parentNode) {
            progress.remove();
          }
        }, 300);
      }
    };
  }

  createProgressElement(message, estimatedDuration) {
    const progress = document.createElement('div');
    progress.className = 'user-progress';
    
    progress.innerHTML = `
      <div class="progress-content">
        <div class="progress-message">${message}</div>
        <div class="progress-bar">
          <div class="progress-bar-fill"></div>
        </div>
        ${estimatedDuration ? `<div class="progress-eta">Estimated: ${estimatedDuration}</div>` : ''}
      </div>
    `;

    return progress;
  }
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  .user-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    padding: 16px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideInBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-bottom: 8px;
  }

  .user-notification.success { background: #34a853; }
  .user-notification.error { background: #ea4335; }
  .user-notification.warning { background: #fbbc04; color: #3c4043; }
  .user-notification.info { background: #4285f4; }

  .notification-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .notification-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .notification-text {
    flex: 1;
    line-height: 1.4;
  }

  .notification-technical {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 4px;
    font-family: monospace;
  }

  .notification-action {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: inherit;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    margin-left: 8px;
  }

  .notification-close {
    background: none;
    border: none;
    color: inherit;
    font-size: 16px;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    opacity: 0.7;
  }

  .user-progress {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 10001;
    min-width: 300px;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #e8eaed;
    border-radius: 4px;
    margin: 12px 0;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #4285f4;
    border-radius: 4px;
    transition: width 0.3s ease;
    width: 0%;
  }

  .removing {
    animation: slideOut 0.3s ease-in-out forwards;
  }

  @keyframes slideInBounce {
    0% { transform: translateX(100%) scale(0.8); opacity: 0; }
    60% { transform: translateX(-10px) scale(1.05); opacity: 1; }
    100% { transform: translateX(0) scale(1); opacity: 1; }
  }

  @keyframes slideOut {
    0% { transform: translateX(0) scale(1); opacity: 1; }
    100% { transform: translateX(100%) scale(0.8); opacity: 0; }
  }
`;

if (document.head) {
  document.head.appendChild(style);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    document.head.appendChild(style);
  });
}

window.UserFeedback = new UserFeedback();