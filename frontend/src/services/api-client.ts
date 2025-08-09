import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// Error types for better error handling
export class APIError extends Error {
  public status: number | undefined;
  public code: string | undefined;
  public response: any;

  constructor(message: string, status?: number, code?: string, response?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Request options interface
export interface RequestOptions extends AxiosRequestConfig {
  retries?: number;
  retryDelay?: number;
}

// Base API Client class
export class APIClient {
  private axiosInstance: AxiosInstance;
  private baseURL: string;
  private defaultRetries: number = 3;
  private defaultRetryDelay: number = 1000; // 1 second

  constructor(baseURL?: string) {
    // For CloudFront distribution routing:
    // - In development: use VITE_CLOUDFRONT_URL if available
    // - In production: use current domain/origin (empty baseURL for relative paths)
    // - Fallback: use provided baseURL or empty string for relative paths
    if (baseURL) {
      this.baseURL = baseURL;
    } else if (import.meta.env.DEV && import.meta.env.VITE_CLOUDFRONT_URL) {
      // Only use VITE_CLOUDFRONT_URL in development mode
      this.baseURL = import.meta.env.VITE_CLOUDFRONT_URL;
    } else {
      // In production, use relative paths (empty baseURL)
      this.baseURL = '';
    }
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add timestamp to prevent caching
        if (config.params) {
          config.params._t = Date.now();
        } else {
          config.params = { _t: Date.now() };
        }
        return config;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): APIError | NetworkError {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const responseData = error.response.data as any;
      const message = responseData?.message || error.message || 'API request failed';
      const code = responseData?.code || error.code;
      
      return new APIError(message, status, code, error.response.data);
    } else if (error.request) {
      // Network error - no response received
      return new NetworkError('Network error: Unable to reach the server');
    } else {
      // Request setup error
      return new APIError(error.message || 'Request configuration error');
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private shouldRetry(error: APIError | NetworkError, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) {
      return false;
    }

    // Retry on network errors
    if (error instanceof NetworkError) {
      return true;
    }

    // Retry on specific HTTP status codes
    if (error instanceof APIError && error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      return retryableStatuses.includes(error.status);
    }

    return false;
  }

  public async request<T>(
    endpoint: string, 
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      ...axiosOptions
    } = options;

    let lastError: APIError | NetworkError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response: AxiosResponse<T> = await this.axiosInstance.request({
          url: endpoint,
          ...axiosOptions,
        });
        
        return response.data;
      } catch (error) {
        lastError = error as APIError | NetworkError;
        
        if (!this.shouldRetry(lastError, attempt, retries)) {
          break;
        }

        // Wait before retrying with exponential backoff
        const delayMs = retryDelay * Math.pow(2, attempt);
        await this.delay(delayMs);
      }
    }

    throw lastError!;
  }

  public async get<T>(
    endpoint: string, 
    params?: Record<string, any>, 
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
      params,
      ...options,
    });
  }

  public async post<T>(
    endpoint: string, 
    data?: any, 
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      data,
      ...options,
    });
  }

  public async put<T>(
    endpoint: string, 
    data?: any, 
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      data,
      ...options,
    });
  }

  public async delete<T>(
    endpoint: string, 
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  // Utility method to get the base URL
  public getBaseURL(): string {
    return this.baseURL;
  }

  // Utility method to update base URL if needed
  public setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    this.axiosInstance.defaults.baseURL = baseURL;
  }
}

// Create and export a default instance
export const apiClient = new APIClient();