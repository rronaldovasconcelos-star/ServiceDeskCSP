# Sistema visual "Central de Suporte CSP"

Direção adotada em 28/10/2026: portal de atendimento com a organização e o acabamento
do Jira Service Management e do Zendesk, sem copiar interfaces. Navegação em
azul-marinho, área de trabalho clara e plana, raios 8/12/16, sombras suaves.
**Cores e fontes vêm da identidade do site colegiosantapaula.com.br** (extraídas em 28/10/2026:
azul `#001D7E`, vinho `#5F194A`, amarelo `#F7D347`, azul-claro `#DCEBF4`, texto `#253C56`;
Montserrat 700 nos títulos, Open Sans no texto).
Verde, âmbar e vermelho aparecem só em estados, sempre com texto ou ícone.

Fonte única de verdade: `frontend/src/index.css`. **Nenhuma cor hex fora desse arquivo**
(`grep -rnE "#[0-9a-fA-F]{3,6}" src --include=*.tsx` precisa sair vazio).

## Tokens

| Papel | Variável | Claro | Escuro |
|---|---|---|---|
| Navegação, títulos | `--navy` | `#001D7E` | `#05113F` |
| Ação principal (fundo) | `--primary` / `--primary-hover` | `#001D7E` / `#00155E` | `#3A5FD9` / `#4A6FE6` |
| Texto e ícone azul | `--primary-ink` | `#001D7E` | `#8FB0FF` |
| Fundo suave azul | `--primary-soft` | `#DCEBF4` | `rgba(58,95,217,.22)` |
| Fundo da página | `--bg` | `#F5F7FB` | `#0A1024` |
| Superfície / superfície 2 | `--surface` / `--surface-2` | `#FFF` / `#F3F8FC` | `#121A33` / `#19233F` |
| Texto / secundário | `--text` / `--text-2` | `#253C56` / `#5E6B7C` | `#E6EBF3` / `#A3AFC2` |
| Borda / borda forte | `--line` / `--line-strong` | `#D9E4EE` / `#BFCEDD` | `#243049` / `#334260` |
| Vinho do site (destaque, `--violet*`) | `--violet` / `--violet-ink` / `--violet-soft` | `#5F194A` / `#5F194A` / `#F4E6EE` | `#E7A9CF` / `#EFB9DA` / `rgba(126,0,81,.26)` |
| Amarelo do site (marcadores) | `--brand-yellow` / `-ink` / `-soft` | `#F7D347` / `#6B5300` / `#FDF5CF` | igual / `#F7D347` / `rgba(247,211,71,.16)` |
| Estados (sólido / tinta / suave) | `--success*`, `--warning*`, `--danger*`, `--info-*`, `--neutral-*`, `--violet*` | ver arquivo | ver arquivo |
| Sobre o navy | `--on-navy`, `--on-navy-muted`, `--navy-line`, `--navy-active` | | |
| Raios | `--radius-sm` 8 (botão, input, chip) · `--radius-md` 12 (card, tabela) · `--radius-lg` 16 (modal, hero) · `--radius-badge` 6 | | |
| Sombras | `--shadow-sm` / `--shadow-md` / `--shadow-lg` | | |

Contraste conferido em 28/10 com a paleta do site (WCAG 2.2 AA): texto/branco 11,3; secundário/
branco 5,4; branco sobre `#001D7E` 14,2; `#001D7E` sobre `#F5F7FB` 13,3; `#B3BFE3` sobre navy 7,8;
vinho sobre o suave 10,1; navy sobre o amarelo 9,7; tema escuro: texto 14,4, links 8,8, branco
sobre `#3A5FD9` 5,5.
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
