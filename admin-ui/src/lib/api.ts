import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ApiResponse } from '@/types';

// Use production API if VITE_API_BASE_URL is set, otherwise use local proxy
const baseURL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 50000, // 50 seconds - increased for analysis requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<never>>) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// API helper functions
export async function handleApiError(error: unknown): Promise<never> {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error || error.message || 'An error occurred';
    throw new Error(message);
  }
  throw error;
}

export function isApiResponse<T>(data: unknown): data is ApiResponse<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof (data as ApiResponse<T>).success === 'boolean'
  );
}
