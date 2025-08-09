import React from 'react';
import type { HealthResponse } from '../types';

interface HealthStatusCardProps {
  health: HealthResponse | null;
  loading?: boolean;
  error?: string | null;
}

const HealthStatusCard: React.FC<HealthStatusCardProps> = ({
  health,
  loading = false,
  error = null,
}) => {


  const getStatusTextColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return 'text-green-700';
      case 'unhealthy':
        return 'text-red-700';
      case 'degraded':
        return 'text-yellow-700';
      default:
        return 'text-gray-700';
    }
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'unhealthy':
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'degraded':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Overall Health</h3>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-gray-400 rounded-full mr-2 animate-pulse"></div>
            <span className="text-sm text-gray-500">Checking...</span>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Overall Health</h3>
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

  if (!health) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Overall Health</h3>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
            <span className="text-sm text-gray-500">No data</span>
          </div>
        </div>
        <p className="text-gray-600">Health data is not available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900">Overall Health</h3>
        <div className="flex items-center space-x-2">
          {getStatusIcon(health.status)}
          <span className={`text-sm font-medium ${getStatusTextColor(health.status)}`}>
            {getStatusText(health.status)}
          </span>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <span className="text-sm text-gray-600">Service:</span>
          <span className="text-sm font-medium text-gray-900 break-all">{health.service}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <span className="text-sm text-gray-600">Version:</span>
          <span className="text-sm font-medium text-gray-900">{health.version}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <span className="text-sm text-gray-600">Region:</span>
          <span className="text-sm font-medium text-gray-900">{health.region}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <span className="text-sm text-gray-600">Environment:</span>
          <span className="text-sm font-medium text-gray-900 capitalize">{health.environment}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <span className="text-sm text-gray-600">Last Check:</span>
          <span className="text-sm font-medium text-gray-900 text-right sm:text-left">
            {new Date(health.timestamp).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Status indicator bar */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>System Status</span>
          <span>{getStatusText(health.status)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              health.status.toLowerCase() === 'healthy' ? 'bg-green-500 w-full' :
              health.status.toLowerCase() === 'degraded' ? 'bg-yellow-500 w-3/4' :
              'bg-red-500 w-1/4'
            }`}
          ></div>
        </div>
      </div>

      {/* System uptime indicator */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">System Uptime</span>
        <div className="flex items-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${
            health.status.toLowerCase() === 'healthy' ? 'bg-green-400' : 
            health.status.toLowerCase() === 'degraded' ? 'bg-yellow-400' : 
            'bg-red-400'
          } animate-pulse`}></div>
          <span className="text-gray-700 font-medium">
            {health.status.toLowerCase() === 'healthy' ? 'Online' : 
             health.status.toLowerCase() === 'degraded' ? 'Degraded' : 
             'Issues Detected'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default HealthStatusCard;