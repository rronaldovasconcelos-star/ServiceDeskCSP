import { ChevronRight, FileText, FolderDown } from 'lucide-react';
import { formatBytes, type FileRecord } from '../lib/files';
import FileActionButtons from './FileActionButtons';
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

interface RowActions {
  canDelete: (f: FileRecord) => boolean;
  onDelete: (f: FileRecord) => void;
  canEditOffice?: (f: FileRecord) => boolean;
  onPreview: (f: FileRecord) => void;
  canReplace?: boolean;
  onReplace?: (f: FileRecord) => void;
  showOwner?: boolean;
}

interface Props extends RowActions {
  files: FileRecord[];
  onDownloadFolder?: (ids: string[]) => void;
}

// Coleta recursivamente todos os ids de arquivos sob um nó.
function collectIds(node: Node): string[] {
  const ids = node.files.map((f) => f.id);
  for (const child of node.children.values()) ids.push(...collectIds(child));
  return ids;
}

export default function FilesTreeView({ files, onDownloadFolder, ...actions }: Props) {
  const tree = buildTree(files);
  return (
    <div className="card p-2">
      {renderChildren(tree, 0, LEVELS, actions, onDownloadFolder)}
    </div>
  );
}

function renderChildren(
  node: Node,
  depth: number,
  levels: readonly Level[],
  actions: RowActions,
  onDownloadFolder?: (ids: string[]) => void,
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
      <details key={code} className={depth === 0 ? '' : 'ml-3.5'} open={depth < 2}>
        {/* `details > summary` já perde o marcador e ganha hover no index.css; aqui só layout e foco. */}
        <summary
          className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-(--radius-sm) px-2 py-1.5 text-[13px] text-(--text) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--primary) ${depth === 0 ? 'font-bold' : 'font-medium'}`}
        >
          <ChevronRight size={14} className="tree-caret shrink-0 text-(--text-2)" aria-hidden="true" />
          <span>{levelLabel(level, code)}</span>
          <span className="text-[11px] font-normal text-(--text-2)">({count})</span>
          {onDownloadFolder && count > 0 && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownloadFolder(collectIds(child)); }}
              title="Baixar esta pasta (.zip)"
              aria-label="Baixar esta pasta"
              className="btn btn-ghost btn-icon btn-sm size-7 min-h-7 min-w-7"
            >
              <FolderDown size={14} />
            </button>
          )}
        </summary>
        <div className="ml-[7px] border-l border-(--line)">
          {isLeaf
            ? child.files.map((f) => (
                <FileRow key={f.id} f={f} actions={actions} />
              ))
            : renderChildren(child, depth + 1, levels, actions, onDownloadFolder)}
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

function FileRow({ f, actions }: { f: FileRecord; actions: RowActions }) {
  return (
    <div className="table-row flex items-center gap-2 py-1.5 pr-2 pl-[22px] text-[13px]">
      <FileText size={14} className="shrink-0 text-(--text-2)" aria-hidden="true" />
      <span className="font-medium text-(--text) wrap-break-word">{f.originalName}</span>
      {actions.showOwner && <span className="text-[11px] text-(--text-2)">· {f.owner.name}</span>}
      <span className="ml-auto text-[11px] whitespace-nowrap text-(--text-2)">
        {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
      </span>
      <FileActionButtons
        f={f}
        size={15}
        canDelete={actions.canDelete(f)}
        onDelete={actions.onDelete}
        canReplace={actions.canReplace}
        onReplace={actions.onReplace}
        canEditOffice={actions.canEditOffice?.(f) ?? false}
        onPreview={actions.onPreview}
      />
    </div>
  );
}
