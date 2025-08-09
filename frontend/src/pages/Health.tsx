import React, { useState, useEffect, useCallback } from 'react';
import { HealthService } from '../services/health-service';
import type { HealthResponse, DeepHealthResponse } from '../types';
import { Loading, HealthStatusCard, ComponentStatus } from '../components';

interface HealthState {
  basicHealth: HealthResponse | null;
  deepHealth: DeepHealthResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const Health: React.FC = () => {
  const [healthState, setHealthState] = useState<HealthState>({
    basicHealth: null,
    deepHealth: null,
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const fetchHealthData = useCallback(async () => {
    setHealthState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Fetch both basic and deep health data concurrently
      const [basicHealthResponse, deepHealthResponse] = await Promise.all([
        HealthService.getBasicHealth(),
        HealthService.getDeepHealth(),
      ]);

      setHealthState({
        basicHealth: basicHealthResponse,
        deepHealth: deepHealthResponse,
        loading: false,
        error: null,
        lastUpdated: new Date().toLocaleString(),
      });
    } catch (error) {
      console.error('Failed to fetch health data:', error);
      setHealthState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch health data',
      }));
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  const toggleAutoRefresh = useCallback(() => {
    if (autoRefresh) {
      // Stop auto refresh
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
      setAutoRefresh(false);
    } else {
      // Start auto refresh (every 30 seconds)
      const interval = setInterval(() => {
        fetchHealthData();
      }, 30000);
      setRefreshInterval(interval);
      setAutoRefresh(true);
    }
  }, [autoRefresh, refreshInterval, fetchHealthData]);

  // Initial data fetch
  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);



  if (healthState.loading && !healthState.basicHealth) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">System Health</h1>
          {healthState.lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {healthState.lastUpdated}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={toggleAutoRefresh}
            className={`px-4 py-2 rounded-md text-white transition-colors text-sm sm:text-base ${
              autoRefresh
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <span className="hidden sm:inline">
              {autoRefresh ? 'Stop Auto Refresh' : 'Start Auto Refresh'}
            </span>
            <span className="sm:hidden">
              {autoRefresh ? 'Stop Auto' : 'Auto Refresh'}
            </span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={healthState.loading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            <span className="hidden sm:inline">
              {healthState.loading ? 'Refreshing...' : 'Refresh Status'}
            </span>
            <span className="sm:hidden">
              {healthState.loading ? 'Loading...' : 'Refresh'}
            </span>
          </button>
        </div>
      </div>

      {healthState.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Health Check Failed
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{healthState.error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Overall Health Status */}
        <HealthStatusCard
          health={healthState.basicHealth}
          loading={healthState.loading && !healthState.basicHealth}
          error={healthState.error}
        />
        
        {/* Component Status */}
        <ComponentStatus
          deepHealth={healthState.deepHealth}
          loading={healthState.loading && !healthState.deepHealth}
          error={healthState.error}
        />
      </div>
      
      {/* Performance Metrics */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {healthState.deepHealth?.checks?.dynamodb?.responseTime 
                ? `${healthState.deepHealth.checks.dynamodb.responseTime}ms`
                : '-'
              }
            </p>
            <p className="text-sm text-gray-500">DynamoDB Response Time</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {healthState.deepHealth?.responseTime 
                ? `${healthState.deepHealth.responseTime}ms`
                : '-'
              }
            </p>
            <p className="text-sm text-gray-500">API Response Time</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {healthState.deepHealth?.checks?.memory?.heapUsagePercent !== undefined
                ? `${healthState.deepHealth.checks.memory.heapUsagePercent}%`
                : '-'
              }
            </p>
            <p className="text-sm text-gray-500">Heap Memory Usage</p>
          </div>
        </div>
        
        {/* System Information */}
        {healthState.deepHealth && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3">System Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-medium">{healthState.deepHealth.service}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Version:</span>
                  <span className="font-medium">{healthState.deepHealth.version}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Environment:</span>
                  <span className="font-medium capitalize">{healthState.deepHealth.environment}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Region:</span>
                  <span className="font-medium">{healthState.deepHealth.region}</span>
                </div>
              </div>
              
              {healthState.deepHealth.checks?.runtime && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Node.js Version:</span>
                    <span className="font-medium">{healthState.deepHealth.checks.runtime.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Platform:</span>
                    <span className="font-medium">{healthState.deepHealth.checks.runtime.platform} ({healthState.deepHealth.checks.runtime.arch})</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Uptime:</span>
                    <span className="font-medium">{Math.floor(healthState.deepHealth.checks.runtime.uptime / 60)}m {healthState.deepHealth.checks.runtime.uptime % 60}s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Lambda Name:</span>
                    <span className="font-medium text-xs">{healthState.deepHealth.checks.runtime.lambdaName}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Memory Details */}
        {healthState.deepHealth?.checks?.memory && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Memory Details</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">
                  {healthState.deepHealth.checks.memory.usage.rss}MB
                </p>
                <p className="text-xs text-gray-500">RSS</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">
                  {healthState.deepHealth.checks.memory.usage.heapUsed}MB
                </p>
                <p className="text-xs text-gray-500">Heap Used</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">
                  {healthState.deepHealth.checks.memory.usage.heapTotal}MB
                </p>
                <p className="text-xs text-gray-500">Heap Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">
                  {healthState.deepHealth.checks.memory.usage.external}MB
                </p>
                <p className="text-xs text-gray-500">External</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Health;