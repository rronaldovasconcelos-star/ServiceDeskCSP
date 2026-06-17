import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Conteúdo mostrado quando um filho lança erro. Default: aviso discreto. */
  fallback?: ReactNode;
}
interface State { hasError: boolean; msg: string }

/** Isola falhas de render de um trecho (ex.: mapa Leaflet) para não derrubar a página inteira. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, msg: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // ajuda no diagnóstico via console do navegador
    console.error('[ErrorBoundary] componente falhou:', err, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Não foi possível carregar esta parte. {this.state.msg}
        </p>
      );
    }
    return this.props.children;
  }
}
