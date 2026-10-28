# Sistema visual "Central de Suporte CSP"

Direção adotada em 28/10/2026: portal de atendimento com a organização e o acabamento
do Jira Service Management e do Zendesk, sem copiar interfaces. Navegação em
azul-marinho, área de trabalho clara e plana, Inter, raios 8/12/16, sombras suaves.
Verde, âmbar e vermelho aparecem só em estados, sempre com texto ou ícone.

Fonte única de verdade: `frontend/src/index.css`. **Nenhuma cor hex fora desse arquivo**
(`grep -rnE "#[0-9a-fA-F]{3,6}" src --include=*.tsx` precisa sair vazio).

## Tokens

| Papel | Variável | Claro | Escuro |
|---|---|---|---|
| Navegação, títulos | `--navy` | `#14243B` | `#0F1B30` |
| Ação principal (fundo) | `--primary` / `--primary-hover` | `#2563EB` / `#1D4ED8` | igual |
| Texto e ícone azul | `--primary-ink` | `#2563EB` | `#60A5FA` |
| Fundo suave azul | `--primary-soft` | `#EAF1FE` | `rgba(59,130,246,.18)` |
| Fundo da página | `--bg` | `#F5F7FB` | `#0B1220` |
| Superfície / superfície 2 | `--surface` / `--surface-2` | `#FFF` / `#F8FAFD` | `#121B2E` / `#182338` |
| Texto / secundário | `--text` / `--text-2` | `#172033` / `#526176` | `#E6EBF3` / `#A3AFC2` |
| Borda / borda forte | `--line` / `--line-strong` | `#DFE5EE` / `#C9D3E0` | `#243049` / `#334260` |
| Estados (sólido / tinta / suave) | `--success*`, `--warning*`, `--danger*`, `--info-*`, `--neutral-*`, `--violet*` | ver arquivo | ver arquivo |
| Sobre o navy | `--on-navy`, `--on-navy-muted`, `--navy-line`, `--navy-active` | | |
| Raios | `--radius-sm` 8 (botão, input, chip) · `--radius-md` 12 (card, tabela) · `--radius-lg` 16 (modal, hero) · `--radius-badge` 6 | | |
| Sombras | `--shadow-sm` / `--shadow-md` / `--shadow-lg` | | |

Contraste conferido (WCAG 2.2 AA, luminância relativa): texto/branco 16,3; secundário/branco
6,3; branco sobre `#2563EB` 5,2; `#2563EB` sobre `#F5F7FB` 4,8; `#A9B6CC` sobre navy 7,6;
tintas de estado sobre os fundos suaves entre 5,5 e 6,8; tema escuro acima de 6,8.
Branco sobre verde reprova (3,3): por isso não há botão verde, só badges com texto.

**Aliases legados** (`--electric`, `--teal`, `--coral`, `--amber`, `--sky`, `--paper`,
`--bg-card`, `--text-secondary`, `--border`, `--radius-tile`, `--shadow`…) continuam
válidos para o estilo inline antigo. Não criar uso novo: `--electric` é tinta de texto
(fica clara no escuro); fundo azul com texto branco é `--primary`.

## Camadas

Todo o CSS do sistema vive em `@layer components`. Assim as utilities do Tailwind
(`hidden`, `md:flex`, `mb-4`…) continuam vencendo as classes do sistema. Sem isso, um
CSS fora de camada venceria `md:hidden` e o menu mobile apareceria no desktop.

## Casca

- `components/Layout.tsx`: sidebar navy de 240 px com grupos (Atendimento, Documentos,
  Gestão, Automação) filtrados por `canAccess`; item ativo por melhor prefixo da rota;
  topbar branca em todos os tamanhos com o botão **Abrir chamado** sempre visível, tema e
  chip do usuário; skip link "Ir para o conteúdo"; gaveta mobile como `dialog` que
  devolve o foco ao botão de menu.
- `components/PageHeader.tsx`: `{ title, description, actions, meta, backTo, backLabel }`
  (`subtitle` segue como alias). Plano, sem faixa colorida.
- `components/AuthShell.tsx`: faixa navy curta + card centrado; `AuthHeading`,
  `AuthField` (render-prop com `id`/`aria-describedby`), `AuthAlert`.

## Componentes (`components/ui`)

| Componente | Uso |
|---|---|
| `Button` | `variant` primary (uma por tela) · secondary (padrão, contorno) · ghost · danger; `size`; `icon`; `iconOnly` (exige `aria-label`); `loading` |
| `Field` / `Fieldset` | `<Field label required hint error>{(ctl) => <input className="field" {...ctl}/>}</Field>` associa `label`, `aria-describedby`, `aria-invalid` |
| `Modal` | `aria-labelledby`, foco inicial em `[data-autofocus]`, Tab preso, Esc fecha, foco devolvido |
| `Table` | `head`, `loading rows cols` (skeleton), `empty` (string vira `EmptyState`) |
| `Notice` | `kind` success/warning/danger/info, `title`, `actions`, `onClose`; ícone sempre |
| `EmptyState` | ícone em tile neutro + título + texto + ação |
| `IconTile` | `tone` electric/teal/amber/coral/violet/soft/navy/muted (suave + tinta) |
| `StatusBadge`, `UrgencyBadge`, `SupplyStatusBadge` | `.pill-*` com ponto e texto |

Classes de layout sem componente: `.page-body`, `.toolbar`, `.search-bar`, `.section-head`,
`.kpi-card`, `.stat-chip`, `.service-card`, `.home-hero`, `.timeline*`, `.dl`,
`.ticket-card*`, `.choice-grid/.choice`, `.form-group/.form-grid-2/.form-actions`,
`.tabs/.tab` (abas sublinhadas; dar `role="tablist"/"tab"` e usar `onTabsKeyDown` de `lib/a11y.ts`).

## Página inicial (`pages/HomePage.tsx`)

Para todo usuário logado: boas-vindas com **Abrir chamado** e **Acompanhar meus
chamados**; serviços reais filtrados por `canAccess` (`lib/homeServices.ts`); resumo e
atividade recente dos próprios chamados (calculados de `GET /tickets`); "Fila da equipe"
(Kanban) só para quem tem o módulo `dashboard`. Indicadores e gráficos ficam em
`/dashboard` ("Painel"), que avisa quando falta o módulo `relatorios`.

Sem busca falsa, sem notificações simuladas, sem SLA, prazo, anexo ou base de conhecimento:
nada disso existe na API.

## Conferência antes de publicar

```
cd frontend
npx tsc --noEmit -p tsconfig.app.json      # 0 erros
npx eslint src                             # sem problema novo (baseline registrada no ESTADO.md)
npx vite build
grep -rnE "#[0-9a-fA-F]{3,6}" src --include=*.tsx   # vazio
grep -rn "blob.svg\|Poppins\|page-hero" src index.html   # vazio
```

Rollback do visual anterior: tag `visual-telehap-final`.
