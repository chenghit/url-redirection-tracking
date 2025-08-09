import React from 'react';
import type { DeepHealthResponse } from '../types';

interface ComponentStatusProps {
  deepHealth: DeepHealthResponse | null;
  loading?: boolean;
  error?: string | null;
}

interface ServiceStatus {
  name: string;
  status: string;
  responseTime?: number;
  details?: string;
}

const ComponentStatus: React.FC<ComponentStatusProps> = ({
  deepHealth,
  loading = false,
  error = null,
}) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return 'bg-green-500';
      case 'unhealthy':
        return 'bg-red-500';
      case 'degraded':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'unhealthy':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'degraded':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getResponseTimeColor = (responseTime: number) => {
    if (responseTime < 100) return 'text-green-600';
    if (responseTime < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getServices = (): ServiceStatus[] => {
    const services: ServiceStatus[] = [];

    // DynamoDB status from deep health check
    if (deepHealth?.checks?.dynamodb) {
      const dbResponseTime = deepHealth.checks.dynamodb.responseTime;
      let dbStatus = deepHealth.checks.dynamodb.status;
      
      // Determine status based on response time if not explicitly unhealthy
      if (dbStatus === 'healthy') {
        if (dbResponseTime > 1000) {
          dbStatus = 'degraded';
        } else if (dbResponseTime > 2000) {
          dbStatus = 'unhealthy';
        }
      }

      services.push({
        name: 'DynamoDB',
        status: dbStatus,
        responseTime: dbResponseTime,
        details: `${deepHealth.checks.dynamodb.tableName} - Database connectivity`,
      });
    }

    // Lambda Runtime status
    if (deepHealth?.checks?.runtime) {
      const runtime = deepHealth.checks.runtime;
      services.push({
        name: 'Lambda Runtime',
        status: runtime.status,
        details: `${runtime.lambdaName} (${runtime.lambdaVersion}) - Node.js ${runtime.nodeVersion}`,
      });
    }

    // API Gateway status (inferred from overall health)
    if (deepHealth) {
      services.push({
        name: 'API Gateway',
        status: deepHealth.status,
        responseTime: deepHealth.responseTime,
        details: 'REST API endpoints and routing',
      });
    }

    // Memory Management status
    if (deepHealth?.checks?.memory) {
      const memory = deepHealth.checks.memory;
      const heapUsagePercent = memory.heapUsagePercent;
      
      services.push({
        name: 'Memory Management',
        status: memory.status,
        details: `Heap usage: ${heapUsagePercent}% (${memory.usage.heapUsed}MB/${memory.usage.heapTotal}MB)`,
      });
    }

    // Environment Configuration status
    if (deepHealth?.checks?.environment) {
      const env = deepHealth.checks.environment;
      const missingCount = env.missingVariables.length;
      
      services.push({
        name: 'Environment Config',
        status: env.status,
        details: missingCount > 0 
          ? `${missingCount} missing variables: ${env.missingVariables.join(', ')}`
          : `All ${env.requiredVariables.length} required variables present`,
      });
    }

    return services;
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Component Status</h3>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-gray-400 rounded-full mr-2 animate-pulse"></div>
            <span className="text-sm text-gray-500">Checking...</span>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Component Status</h3>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            <span className="text-sm text-red-700">Error</span>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const services = getServices();
  const overallStatus = deepHealth?.status || 'unknown';

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900">Component Status</h3>
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(overallStatus)}`}></div>
          <span className="text-sm text-gray-700 capitalize">
            {overallStatus}
          </span>
        </div>
      </div>
      
      <div className="space-y-4">
        {services.length > 0 ? (
          services.map((service, index) => (
            <div key={index} className={`border-l-4 pl-4 rounded-r-md py-2 ${
              service.status.toLowerCase() === 'healthy' ? 'border-green-400 bg-green-50' :
              service.status.toLowerCase() === 'degraded' ? 'border-yellow-400 bg-yellow-50' :
              service.status.toLowerCase() === 'unhealthy' ? 'border-red-400 bg-red-50' :
              'border-gray-400 bg-gray-50'
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(service.status)}
                    <h4 className="text-sm font-medium text-gray-900">{service.name}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      service.status.toLowerCase() === 'healthy' ? 'bg-green-100 text-green-800' :
                      service.status.toLowerCase() === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                      service.status.toLowerCase() === 'unhealthy' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                    </span>
                  </div>
                  {service.details && (
                    <p className="text-xs text-gray-600 mt-1 ml-6">{service.details}</p>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  {service.responseTime && (
                    <div className="text-right">
                      <span className={`text-sm font-bold ${getResponseTimeColor(service.responseTime)}`}>
                        {service.responseTime}ms
                      </span>
                      <p className="text-xs text-gray-500">Response Time</p>
                    </div>
                  )}
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(service.status)} ${
                      service.status.toLowerCase() === 'healthy' ? 'animate-pulse' : ''
                    }`}></div>
                    <div className="text-xs text-gray-500 mt-1">Status</div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500 mt-2">No component data available</p>
          </div>
        )}
      </div>

      {/* Component health summary */}
      {services.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Component Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xl font-bold text-gray-900">
                {services.length}
              </p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xl font-bold text-green-600">
                {services.filter(s => s.status.toLowerCase() === 'healthy').length}
              </p>
              <p className="text-xs text-gray-500">Healthy</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-xl font-bold text-yellow-600">
                {services.filter(s => s.status.toLowerCase() === 'degraded').length}
              </p>
              <p className="text-xs text-gray-500">Degraded</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xl font-bold text-red-600">
                {services.filter(s => s.status.toLowerCase() === 'unhealthy').length}
              </p>
              <p className="text-xs text-gray-500">Unhealthy</p>
            </div>
          </div>
          
          {/* Overall health percentage */}
          <div className="mt-4 text-center">
            <div className="inline-flex items-center space-x-2">
              <span className="text-sm text-gray-600">Overall Health:</span>
              <span className={`text-lg font-bold ${
                services.filter(s => s.status.toLowerCase() === 'healthy').length === services.length 
                  ? 'text-green-600' 
                  : services.filter(s => s.status.toLowerCase() === 'unhealthy').length > 0 
                    ? 'text-red-600' 
                    : 'text-yellow-600'
              }`}>
                {Math.round((services.filter(s => s.status.toLowerCase() === 'healthy').length / services.length) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentStatus;