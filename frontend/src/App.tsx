import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import TicketsPage from './pages/TicketsPage';
import TicketFormPage from './pages/TicketFormPage';
import TicketDetailPage from './pages/TicketDetailPage';
import UsersPage from './pages/UsersPage';
import SuprimentosPage from './pages/SuprimentosPage';
import SuprimentosFormPage from './pages/SuprimentosFormPage';
import SuprimentosDetailPage from './pages/SuprimentosDetailPage';
import SuprimentosCatalogoPage from './pages/SuprimentosCatalogoPage';
import ManutencoesPage from './pages/ManutencoesPage';
import LembretesPage from './pages/LembretesPage';
import BackupPage from './pages/BackupPage';
import MeusArquivosPage from './pages/MeusArquivosPage';
import RepositorioPage from './pages/RepositorioPage';
import WhatsAppPage from './pages/WhatsAppPage';
import AgentePage from './pages/AgentePage';

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute module="dashboard">
                <Layout><DashboardPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <ProtectedRoute module="relatorios">
                <Layout><ReportsPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <Layout><TicketsPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets/new"
            element={
              <ProtectedRoute>
                <Layout><TicketFormPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <ProtectedRoute>
                <Layout><TicketDetailPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute module="users">
                <Layout><UsersPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suprimentos"
            element={
              <ProtectedRoute>
                <Layout><SuprimentosPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suprimentos/catalogo"
            element={
              <ProtectedRoute module="catalogo">
                <Layout><SuprimentosCatalogoPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/manutencoes"
            element={
              <ProtectedRoute module="manutencoes">
                <Layout><ManutencoesPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/lembretes"
            element={
              <ProtectedRoute module="lembretes">
                <Layout><LembretesPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suprimentos/new"
            element={
              <ProtectedRoute>
                <Layout><SuprimentosFormPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suprimentos/:id"
            element={
              <ProtectedRoute>
                <Layout><SuprimentosDetailPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/arquivos"
            element={
              <ProtectedRoute>
                <Layout><MeusArquivosPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositorio"
            element={
              <ProtectedRoute module="repositorio">
                <Layout><RepositorioPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/backups"
            element={
              <ProtectedRoute module="backups">
                <Layout><BackupPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute module="whatsapp">
                <Layout><WhatsAppPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp-suporte"
            element={
              <ProtectedRoute module="bot">
                <Layout>
                  <WhatsAppPage
                    apiBase="/bot/connection"
                    title="WhatsApp — Bot de Suporte"
                    instanceLabel="csp-suporte"
                    purpose="recebendo mensagens e abrindo chamados"
                  />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agente"
            element={
              <ProtectedRoute module="agente">
                <Layout><AgentePage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
