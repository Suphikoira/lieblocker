// Central service registry for better organization
class ServiceRegistry {
  constructor() {
    this.services = new Map();
  }

  register(name, service) {
    this.services.set(name, service);
    console.log(`📋 Service registered: ${name}`);
  }

  get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }
    return service;
  }

  async initialize() {
    console.log('🚀 Initializing services...');
    
    // Initialize all services in proper order
    const initOrder = [
      'security',
      'storage',
      'api',
      'transcript',
      'analysis',
      'ui'
    ];

    for (const serviceName of initOrder) {
      const service = this.services.get(serviceName);
      if (service && typeof service.initialize === 'function') {
        try {
          await service.initialize();
          console.log(`✅ ${serviceName} service initialized`);
        } catch (error) {
          console.error(`❌ Failed to initialize ${serviceName} service:`, error);
        }
      }
    }
  }
}

// Global service registry
window.ServiceRegistry = new ServiceRegistry();