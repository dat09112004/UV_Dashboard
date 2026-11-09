import axios from 'axios';
import { setupInterceptors } from './interceptors';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
});

setupInterceptors(api);
export default api;
