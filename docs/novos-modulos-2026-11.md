# Novos módulos — novembro/2026

Pedido da escola em `Demandas para o portal Service Desk.docx` (06/11/2026): Central de
Benefícios, Agendamento de Salas e Autorização de Imagens. O pedido de e-mail de
confirmação do agendamento **saiu do escopo por decisão do Ronaldo**: a confirmação
aparece só na tela e o portal continua sem enviar e-mail.

| Módulo | Quem usa | Quem administra | Rota do front | API |
|---|---|---|---|---|
| Central de Benefícios | todo usuário logado | ADMIN | `/beneficios` | `/api/beneficios` |
| Agendamento de Salas | todo usuário logado | ADMIN (altera/cancela qualquer reserva) | `/salas` | `/api/salas` |
| Autorização de Imagens | quem tem o módulo `autorizacao_imagem` | GESTOR e ADMIN | `/autorizacoes` e `/autorizacoes/gestao` | `/api/autorizacoes` |

## Central de Benefícios

- Cadastro (só ADMIN): nome, descrição, link, logo e ordem. "Ocultar" tira da vista de
  todos sem apagar.
- **Logo no banco** (`Beneficio.logo`, até 1 MB): entra no backup e não consulta o Drive.
  Aceita PNG, JPG e WEBP conferidos pelo **conteúdo** (`lib/uploadSeguro.ts`); SVG é
  recusado porque pode carregar script.
- Link só `http`/`https`, validado no backend (vira `href` na tela).
- O logo é servido por rota autenticada e carregado como blob (o token vive em
  `sessionStorage`, então `<img src>` direto não funcionaria).

## Agendamento de Salas

- Salas criadas pela migration: Sala Maker, Laboratório de Ciências, Biblioteca, Sala de
  Reuniões (tabela `Sala`; para acrescentar outra, inserir uma linha).
- Reserva direta, com horário livre: já nasce confirmada. Regras no servidor: fim depois
  do início, não pode ser no passado, começa e termina no mesmo dia. Horários encostados
  valem (10h–11h e 11h–12h).
- **Trava de conflito no banco:** dois gatilhos do SQLite
  (`ReservaSala_sem_sobreposicao_insert` e `_update`) abortam com `RESERVA_CONFLITO`
  quando há reserva confirmada sobreposta na mesma sala. Vale para pedidos simultâneos.
  A API consulta antes só para dizer qual horário está ocupado.
  - O Prisma não conhece gatilhos. **Se uma migration futura recriar `ReservaSala`, os
    gatilhos somem e têm de ser recriados nela.** O teste confere que existem.
  - O Prisma entrega o aborto como `P2003` ("foreign key"); a marca fica em
    `meta.driverAdapterError`. Ver `ehConflitoDoBanco` em `salas.controller.ts`.
- **Fuso:** o container roda em UTC. "Dia" e "hora" são calculados em
  `America/Sao_Paulo` de forma explícita no controller; o `TZ` global não foi mexido
  (mudaria o horário do backup).
- **Acesso (decisão de 06/11, noite):** todo usuário logado vê a agenda de todos e reserva;
  não há módulo. Alterar (sala, horário, finalidade) e cancelar: USER e GESTOR só a
  própria reserva; ADMIN qualquer uma. Só enquanto a reserva não terminou.
- Cancelar é lógico: o registro fica como `CANCELADA`, com quem e quando, e some da
  agenda do dia. Alterar (`PUT /api/salas/reservas/:id`) passa pelas mesmas regras e pelo
  mesmo gatilho de conflito.

## Autorização de Imagens

Fluxo: a gestão publica o modelo em PDF → o colaborador baixa → assina fora do portal,
no assinador do gov.br → envia o PDF assinado → a gestão confere no validador oficial
(`validar.iti.gov.br`) e marca como validado ou recusa com motivo.

- **Quem assina:** usuário ativo com `autorizacao_imagem` marcado em Usuários. ADMIN não
  entra na lista do painel. Quem já enviou continua no painel mesmo sem módulo ou conta.
- **Modelo imutável:** texto novo = documento novo. Cada envio aponta para o arquivo
  exato (há `sha256` do modelo e do assinado).
- **O que o portal confere no envio:** é PDF de verdade; a pessoa já baixou o modelo; o
  arquivo é diferente do modelo; contém um dicionário de assinatura digital
  (`/ByteRange` + `/Type /Sig` ou `/SubFilter` conhecido); não há outro envio aguardando
  ou validado. Depois de uma recusa, cabe novo envio e o recusado continua guardado.
- **O que o portal NÃO confere:** se a assinatura é válida, de quem é, ou se é do gov.br.
  Isso é da gestão, no validador. A tela diz isso.
- **Datas ("log"):** download do modelo e envio do assinado vêm do log do portal
  (`AutorizacaoEvento`, só de acréscimo, com ator e IP). A data "declarada no PDF" é o
  campo `/M` da assinatura: escrita pelo programa que assinou, informativa, não é prova.
- **Arquivos:** no storage configurado, pasta `AutorizacoesImagem/<documento>/`. Em
  produção isso é o Google Drive da escola: quem tem acesso a esse Drive enxerga a pasta.
  O backup do portal cobre o banco, não esses arquivos.
- **Sigilo:** o assinado só é entregue ao próprio colaborador e à gestão; a leitura pela
  gestão fica no log.
- Referências a usuário são soltas (sem chave estrangeira) com cópia do nome: apagar a
  conta não apaga documento nem histórico.

Limites conhecidos:
- A detecção de assinatura foi provada com PDF **sintético**. Falta a prova com um PDF
  assinado de verdade no gov.br.
- Dois envios do mesmo colaborador no mesmo instante poderiam entrar os dois (a tela
  bloqueia o botão enquanto envia; não há trava no banco).
- Modelo só em PDF (Word precisa ser exportado antes).

## Permissões no menu

`Layout.tsx` e `lib/homeServices.ts` ganharam `roles` opcional além de `module`. Módulo
liberado vale na API na hora, mas o menu da pessoa só muda quando ela recarrega a página.

## Testes

Banco local `prisma/dev.db`, app real numa porta livre. Sempre com os provedores falsos,
porque o `backend/.env` local aponta para serviços de produção:

```powershell
$env:WHATSAPP_PROVIDER='mock'; $env:STORAGE_PROVIDER='local'; $env:REMINDER_SCHEDULER_ENABLED='false'
npx tsx scripts/testar-beneficios-http.ts    # 20 casos
npx tsx scripts/testar-agendamento-http.ts   # 34 casos
npx tsx scripts/testar-autorizacoes-http.ts  # 27 casos
```

Cada guarda foi derrubada sozinha e o teste correspondente ficou vermelho (11 + 20 + 33
mutações). Confira o resultado pelo código de saída, não pela última linha.
