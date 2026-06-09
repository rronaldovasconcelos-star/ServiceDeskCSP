import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccess } from '../lib/modules';

interface Props {
  children: React.ReactNode;
  /** Módulo exigido para acessar a rota. ADMIN sempre passa; ver lib/modules.ts. */
  module?: string;
  adminOnly?: boolean;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, module, adminOnly, allowedRoles }: Props) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (module && !canAccess(user, module)) return <Navigate to="/tickets" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/tickets" replace />;
  if (adminOnly && !allowedRoles && user.role !== 'ADMIN') return <Navigate to="/tickets" replace />;

  return <>{children}</>;
}
