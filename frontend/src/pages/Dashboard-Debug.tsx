import React, { useState } from 'react';

const DashboardDebug: React.FC = () => {
  const [apiTest, setApiTest] = useState<string>('Not tested');
  const [loading, setLoading] = useState(false);

  const testApiConnection = async () => {
    setLoading(true);
    setApiTest('Testing...');
    
    try {
      // Test the API client configuration
      const baseURL = import.meta.env.DEV ? (import.meta.env.VITE_CLOUDFRONT_URL || '') : '';
      setApiTest(`Base URL: ${baseURL || 'Using relative paths'}`);
      
      // Try to make a simple fetch request
      const response = await fetch('/health');
      const status = response.status;
      const text = await response.text();
      
      setApiTest(`API Test: ${status} - ${text.substring(0, 100)}...`);
    } catch (error) {
      setApiTest(`API Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard Debug Mode</h1>
      
      <div className="space-y-6">
        {/* Environment Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Environment Configuration</h2>
          <div className="space-y-2 text-sm">
            <div><strong>API Base URL:</strong> {import.meta.env.DEV ? (import.meta.env.VITE_CLOUDFRONT_URL || 'Using relative paths') : 'Using relative paths'}</div>
            <div><strong>VITE_APP_NAME:</strong> {import.meta.env.VITE_APP_NAME || 'Not set'}</div>
            <div><strong>VITE_APP_VERSION:</strong> {import.meta.env.VITE_APP_VERSION || 'Not set'}</div>
            <div><strong>NODE_ENV:</strong> {import.meta.env.NODE_ENV || 'Not set'}</div>
            <div><strong>DEV:</strong> {import.meta.env.DEV ? 'true' : 'false'}</div>
          </div>
        </div>

        {/* API Test */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">API Connection Test</h2>
          <div className="space-y-4">
            <button
              onClick={testApiConnection}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test API Connection'}
            </button>
            <div className="p-4 bg-gray-50 rounded border">
              <strong>Result:</strong> {apiTest}
            </div>
          </div>
        </div>

        {/* Mock KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Total Redirections</h3>
            <p className="text-3xl font-bold text-blue-600">1,234</p>
            <p className="text-sm text-gray-500">Mock data</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Unique IPs</h3>
            <p className="text-3xl font-bold text-green-600">567</p>
            <p className="text-sm text-gray-500">Mock data</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Top Source</h3>
            <p className="text-3xl font-bold text-purple-600">Google</p>
            <p className="text-sm text-gray-500">Mock data</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Active Sources</h3>
            <p className="text-3xl font-bold text-yellow-600">12</p>
            <p className="text-sm text-gray-500">Mock data</p>
          </div>
        </div>

        {/* Navigation Test */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Navigation Test</h2>
          <div className="space-x-4">
            <a href="/" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
              Dashboard
            </a>
            <a href="/analytics" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
              Analytics
            </a>
            <a href="/health" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
              Health
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardDebug;