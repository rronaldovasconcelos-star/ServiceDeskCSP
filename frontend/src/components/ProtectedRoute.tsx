import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, adminOnly, allowedRoles }: Props) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/tickets" replace />;
  if (adminOnly && !allowedRoles && user.role !== 'ADMIN') return <Navigate to="/tickets" replace />;

  return <>{children}</>;
}
