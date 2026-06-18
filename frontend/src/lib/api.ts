import axios from 'axios';
import { getToken, clearToken } from './token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Não redireciona em falhas das rotas de autenticação (login/cadastro):
    // a própria tela exibe a mensagem de erro. O redirect é só para token expirado.
    const url: string = err.config?.url ?? '';
    const isAuthRoute = url.startsWith('/auth/');
    if (err.response?.status === 401 && !isAuthRoute) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
