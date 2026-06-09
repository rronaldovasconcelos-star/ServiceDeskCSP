import { Download, Trash2, ChevronRight, FileText, FolderDown } from 'lucide-react';
import { formatBytes, downloadFile, type FileRecord } from '../lib/files';
import { labelFor } from '../lib/taxonomy';

// Ordem dos níveis que espelha a rede interna:
// Ano → Segmento → Série → Etapa → Disciplina → Tipo.
const LEVELS = ['anoLetivo', 'segmento', 'serie', 'etapa', 'disciplina', 'tipoMaterial'] as const;
type Level = (typeof LEVELS)[number];

function levelLabel(level: Level, code: string): string {
  if (level === 'anoLetivo') return code === '—' ? 'Sem ano' : code;
  const axis = level as 'segmento' | 'serie' | 'etapa' | 'disciplina' | 'tipoMaterial';
  return code === '—' ? 'Sem classificação' : labelFor(axis, code);
}

interface Node {
  files: FileRecord[];
  children: Map<string, Node>;
}

function buildTree(files: FileRecord[]): Node {
  const root: Node = { files: [], children: new Map() };
  for (const f of files) {
    let node = root;
    for (const level of LEVELS) {
      const key = (f[level] as string | null) ?? '—';
      if (!node.children.has(key)) node.children.set(key, { files: [], children: new Map() });
      node = node.children.get(key)!;
    }
    node.files.push(f);
  }
  return root;
}

interface Props {
  files: FileRecord[];
  canDelete: (f: FileRecord) => boolean;
  onDelete: (f: FileRecord) => void;
  onDownloadFolder?: (ids: string[]) => void;
  showOwner?: boolean;
}

// Coleta recursivamente todos os ids de arquivos sob um nó.
function collectIds(node: Node): string[] {
  const ids = node.files.map((f) => f.id);
  for (const child of node.children.values()) ids.push(...collectIds(child));
  return ids;
}

export default function FilesTreeView({ files, canDelete, onDelete, onDownloadFolder, showOwner }: Props) {
  const tree = buildTree(files);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '6px 4px' }}>
      {renderChildren(tree, 0, LEVELS, canDelete, onDelete, onDownloadFolder, showOwner)}
    </div>
  );
}

function renderChildren(
  node: Node,
  depth: number,
  levels: readonly Level[],
  canDelete: (f: FileRecord) => boolean,
  onDelete: (f: FileRecord) => void,
  onDownloadFolder?: (ids: string[]) => void,
  showOwner?: boolean,
) {
  const level = levels[depth];
  // Ordena as chaves alfabeticamente pelos rótulos exibidos.
  const entries = Array.from(node.children.entries()).sort((a, b) =>
    levelLabel(level, a[0]).localeCompare(levelLabel(level, b[0]), 'pt-BR'),
  );

  return entries.map(([code, child]) => {
    const count = countFiles(child);
    const isLeaf = depth === levels.length - 1;
    return (
      <details key={code} style={{ marginLeft: depth === 0 ? 0 : '14px' }} open={depth < 2}>
        <summary
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: depth === 0 ? 700 : 500,
            color: 'var(--text-primary)',
            listStyle: 'none',
          }}
        >
          <ChevronRight size={14} className="tree-caret" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <span>{levelLabel(level, code)}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>({count})</span>
          {onDownloadFolder && count > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownloadFolder(collectIds(child)); }}
              title="Baixar esta pasta (.zip)"
              aria-label="Baixar esta pasta"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' }}
            >
              <FolderDown size={14} />
            </button>
          )}
        </summary>
        <div style={{ borderLeft: '1px solid var(--border)', marginLeft: '7px' }}>
          {isLeaf
            ? child.files.map((f) => (
                <FileRow key={f.id} f={f} canDelete={canDelete} onDelete={onDelete} showOwner={showOwner} />
              ))
            : renderChildren(child, depth + 1, levels, canDelete, onDelete, onDownloadFolder, showOwner)}
        </div>
      </details>
    );
  });
}

function countFiles(node: Node): number {
  let n = node.files.length;
  for (const child of node.children.values()) n += countFiles(child);
  return n;
}

function FileRow({ f, canDelete, onDelete, showOwner }: { f: FileRecord; canDelete: (f: FileRecord) => boolean; onDelete: (f: FileRecord) => void; showOwner?: boolean }) {
  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
    color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
  };
  return (
    <div
      className="table-row"
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 22px', fontSize: '13px' }}
    >
      <FileText size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>{f.originalName}</span>
      {showOwner && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>· {f.owner.name}</span>}
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
        {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
      </span>
      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={15} /></button>
      {canDelete(f) && <button onClick={() => onDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={15} /></button>}
    </div>
  );
}
