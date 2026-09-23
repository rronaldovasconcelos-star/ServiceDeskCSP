# Holerites — o colaborador baixa o próprio demonstrativo pelo portal

Criado em 22/09/2026. O RH exporta o TXT da folha (Folpag), salva na pasta
**Holerites** do Google Drive do portal (ou envia pela tela), o portal importa,
e cada colaborador baixa o PDF do seu holerite em **Meus Holerites**, no mesmo
formato do "Demonstrativo de Pagamento" que a escola já entrega em papel.

## Fluxo

```
Folpag ──exporta──▶ Holerite<data>.txt ──▶ pasta "Holerites" no Drive (ou upload na tela RH · Holerites)
                                                  │
                          portal importa (a cada 30 min ou pelo botão "Importar novos")
                                                  │
                     Colaborador (código + nome do TXT) ──RH vincula uma vez──▶ login do portal
                                                  │
                                 Meus Holerites → "Baixar PDF" (gerado na hora)
```

- **Importar** conferindo tudo antes: soma das verbas = totais e líquido =
  vencimentos − descontos em **cada** bloco. Se algo não bater, o arquivo
  inteiro é recusado e a tela mostra a linha e o motivo. Folha errada não
  entra pela metade.
- **Reimportar** a mesma competência substitui o holerite (o TXT é a fonte).
  Competência nova soma ao histórico.
- **Drive**: cada arquivo é importado uma vez (dedupe pelo id do arquivo no
  Drive). Um TXT corrigido e salvo de novo ganha id novo e entra substituindo.
- **Vínculo**: o TXT identifica o colaborador só pelo código da folha e pelo
  nome. Na primeira importação o colaborador nasce **sem login**; o RH escolhe
  o usuário na aba *Colaboradores e vínculos*. Um usuário só pode estar em um
  colaborador. Sem vínculo, a pessoa vê o aviso "procure o RH" e nada mais.
- **Quem vê o quê**: o próprio colaborador (só os seus), ADMIN e quem tiver o
  módulo **rh** liberado em Usuários. O menu *Meus Holerites* é baseline (todo
  autenticado); *RH · Holerites* exige o módulo `rh`.
- **Observações do RH** (desde 23/09/2026): na aba *Mensagens* de *RH · Holerites*
  o RH escreve o que sai no campo **Observações** do PDF — a caixa em branco à
  esquerda de "Total / Valor Líquido", como no papel. Mensagem **geral** vale para
  todos os colaboradores; **individual**, para um só. Com competência, vale só
  naquele mês; sem, em todos. No PDF saem as gerais e depois as individuais,
  unidas por " · ", em 7 pt (2 linhas) ou 6 pt (3 linhas). A caixa é fixa, por
  isso: **120 caracteres** por mensagem (`LIMITE_MENSAGEM`) e uma guarda que mede
  o texto final de cada holerite alcançado com as fontes reais do PDF e **recusa**
  (422) a mensagem que não couber — nada sai cortado. A mensagem vive fora do
  `Holerite`: reimportar o TXT não a apaga; excluir o colaborador apaga as dele.

## Dois formatos de TXT

O Folpag já exportou em dois layouts. O parser decide pelo **primeiro
caractere da primeira linha** e aceita os dois:

| Formato | Primeiro caractere | Arquivo medido | Traz CPF, CTPS, admissão e códigos? |
|---------|-------------------|----------------|-------------------------------------|
| **completo** | `C` | `Holerite23092026.txt` (23/09/2026) | **Sim** — gravados no `Colaborador` a cada importação |
| antigo | `1` | `Holerite22092026.txt` (22/09/2026) | Não — o RH preenche na tela (botão *Preencher*) |

O export completo foi o que o Ronaldo pediu ao contador em 22/09/2026 e chegou
no dia seguinte. É o formato a usar daqui para a frente. Um arquivo do formato
antigo continua entrando, mas **não apaga** CPF/CTPS/admissão/códigos que um
arquivo completo (ou o RH) já gravou: só sobrescreve o que vier preenchido.

O que **nenhum** dos dois traz: o nome completo da empresa (vem truncado, sem
"SANTA PAULA") e o endereço. Os dois saem das variáveis `HOLERITE_EMPRESA_NOME`
/ `HOLERITE_EMPRESA_ENDERECO`. Campo em branco sai em branco no PDF.

## Layout do formato completo (medido em `Holerite23092026.txt`, 23/09/2026)

Codificação **Windows-1252**, quebra CRLF, colunas fixas (índices começam em 0,
intervalo `[início, fim)`). Um bloco por colaborador: uma linha `C`, uma linha
`D?` por verba e uma linha `R` que fecha o bloco. **Não há registro de fim.**

**`C` — cabeçalho (435 caracteres)**

| Colunas | Tam. | Campo | Exemplo (colaborador 285) | Como sai |
|--------:|-----:|-------|---------------------------|----------|
| 1–49 | 48 | nome da empresa (3 espaços à esquerda, truncado) | `SEBASTIANA CABRAL DE SOUSA PEREIRA - COLEGIO` | como vem |
| 49–63 | 14 | CNPJ só dígitos | `01241815000125` | `01.241.815/0001-25` |
| 63–69 | 6 | competência `MMAAAA` | `082026` | `2026-08` |
| 69–80 | 11 | código do colaborador | `00000000285` | `000285` |
| 80–125 | 45 | nome do colaborador | | |
| 125–145 | 20 | código do departamento | `…00005` | `000005` (6 dígitos, como no papel) |
| 145–190 | 45 | departamento | `Administração Escolar` | |
| 190–196 | 6 | código do cargo | `000005` | `0005` (4 dígitos, como no papel) |
| 196–243 | 47 | cargo à esquerda + salário **em formato americano** alinhado à direita | `Tecnico de Informatica … 5,458.30` | cargo e `545830` centavos |
| 243–251 | 8 | admissão `ddmmaaaa` | `01042025` | `01/04/2025` |
| 251–259 | 8 | demissão `ddmmaaaa` ou zeros | `00000000` | não usado |
| 274–282 | 8 | `31082026` — parece o fim do período | | não usado |
| 397–417 | 20 | CTPS número | `…0923499` | `0923499 / 00757` |
| 417–428 | 11 | CPF só dígitos | `09234990757` | `092.349.907-57` |
| 428–433 | 5 | CTPS série | `00757` | idem |
| 433–435 | 2 | CTPS UF | `MG` | não usado |

O salário é lido por expressão regular no fim do trecho 196–243 (`d,ddd.dd`),
porque o limite exato entre cargo e salário não pôde ser medido com dois
exemplos. As demais colunas são posicionais.

**`DP` / `DD` — verba (81 caracteres)**: `D`, depois `P` (provento →
vencimento) ou `D` (desconto), código em 5 dígitos (2–7, sai com 4: `0520`),
descrição em 50 (7–57), referência em 12 dígitos com duas casas (57–69:
`000000003000` → `30,00`) e valor em 12 dígitos **já em centavos** (69–81:
`000000680126` → 6.801,26).

**`R` — totais e bases (85 caracteres)**: `R` e sete campos de 12 dígitos em
centavos, nesta ordem: vencimentos, descontos, líquido, **base INSS, base
FGTS, FGTS do mês, base IRRF**. A ordem foi conferida contra o demonstrativo
impresso de 08/2026; base INSS e base FGTS vieram iguais nas duas amostras,
então a ordem entre elas segue a do papel e não pôde ser distinguida pelo dado.
Não há data de geração neste formato (`dataGeracao` fica nula).

## Layout do formato antigo (medido em `Holerite22092026.txt`, 22/09/2026)

Codificação **Windows-1252**, quebra CRLF, colunas fixas (índices começam em 0).
Um bloco por colaborador; o primeiro caractere é o tipo do registro.

**Tipo 1 — cabeçalho (232 caracteres)**

| Posição | Tam. | Campo | Exemplo |
|--------:|-----:|-------|---------|
| 1–6 | 6 | competência `MMAAAA` | `082026` |
| 7–48 | 42 | nome da empresa (truncado) | `SEBASTIANA CABRAL DE SOUSA PEREIRA - COLEG` |
| 49–66 | 18 | CNPJ | `01.241.815/0001-25` |
| 67–72 | 6 | código do colaborador | `000285` |
| 73–112 | 40 | nome do colaborador | |
| 113–142 | 30 | departamento | `Administração Escolar` |
| 143–184 | 42 | cargo | `Tecnico de Informatica` |
| 185– | var. | salário base (`d.ddd,dd`), depois `0000`, o depto de novo (30) e `00000` — só o salário é usado | `5.458,30` |

**Tipo 2 — verba (78 caracteres)**

| Posição | Tam. | Campo | Exemplo |
|--------:|-----:|-------|---------|
| 1–4 | 4 | código da verba | `0520` |
| 5–12 | 8 | referência, alinhada à direita (`30.00` → `30,00`; `02.00` → `2,00`) | `   14.00` |
| 13–57 | 45 | descrição | `Desconto INSS` |
| 58–67 | 10 | vencimento (vazio se for desconto) | `6.801,26` |
| 68–77 | 10 | desconto (vazio se for vencimento) | `988,07` |

**Tipo 3 — totais (64 caracteres)**: `3`, 5 espaços, 18 zeros, depois
vencimentos (24–33), descontos (34–43), líquido **sem ponto de milhar** (44–53,
ex. `6321,85`) e data de geração `dd/mm/aaaa` (54–63).

**Tipo 4 — bases (169 caracteres)**: quatro blocos de 42 (`RÓTULO` em 18 +
`:` + valor em 23): `BASE INSS`, `BASE FGTS`, `BASE IRRF`, `FGTS MÊS`. O parser
lê pelo rótulo (sem acento, sem espaços duplos), não pela posição.

**Tipo 5**: fim do bloco.

Regras do PDF: *Matrícula* = código com 10 dígitos; *Faixa IRRF* = referência
da verba de IRRF (`27,50` → `27,5%`); *Salário Base* = salário do cabeçalho;
*Sal. Contr. INSS* = BASE INSS.

## Onde está no código

| O quê | Arquivo |
|-------|---------|
| Parser do TXT (determinístico, recusa arquivo inconsistente) | `backend/src/modules/holerites/holerite.parser.ts` |
| PDF (duas vias por página, pdfkit) | `backend/src/modules/holerites/holerite.pdf.ts` |
| Importar, vincular, autorizar, PDF | `backend/src/modules/holerites/holerites.service.ts` |
| Pasta do Drive (listar, importar novos) | `backend/src/modules/holerites/holerites.drive.ts` |
| Importação automática (intervalo) | `backend/src/modules/holerites/holerites.scheduler.ts` |
| Rotas `/api/holerites/*` | `backend/src/modules/holerites/holerites.router.ts` |
| Tela do colaborador | `frontend/src/pages/HoleritesPage.tsx` (`/holerites`) |
| Tela do RH (importar, vínculos, histórico) | `frontend/src/pages/HoleritesRhPage.tsx` (`/holerites/rh`) |
| Tabelas `Colaborador`, `Holerite`, `HoleriteImportacao` | migration `20260922203813_add_holerites` |
| Tabela `HoleriteMensagem` (observações do RH) | migration `20260923184115_add_holerite_mensagens` |

Valores monetários ficam em **centavos (Int)** no banco.

## API

Todas exigem `Authorization: Bearer <jwt>`.

| Método | Rota | Quem | O que faz |
|--------|------|------|-----------|
| GET | `/api/holerites/meus` | qualquer autenticado | `{vinculado, colaborador, holerites[]}` do próprio login |
| GET | `/api/holerites/:id/pdf` | dono, ADMIN ou módulo `rh` | PDF (`Content-Disposition: attachment`) |
| POST | `/api/holerites/rh/importar` | `rh` | multipart, campo `arquivo` (.txt até 5 MB) |
| GET | `/api/holerites/rh/drive` | `rh` | `{configured, pasta, intervaloMin, arquivos[]}` com `importadoEm` |
| POST | `/api/holerites/rh/drive/importar` | `rh` | `{fileId}` importa um; sem body importa os novos |
| GET | `/api/holerites/rh/colaboradores` | `rh` | lista com login vinculado, total e última competência |
| PUT | `/api/holerites/rh/colaboradores/:id/vinculo` | `rh` | `{userId}` ou `{userId: null}` |
| PUT | `/api/holerites/rh/colaboradores/:id/dados` | `rh` | `{cpf, ctps, admissao, cargoCodigo, deptoCodigo}` |
| GET | `/api/holerites/rh/colaboradores/:id/holerites` | `rh` | holerites de um colaborador |
| GET | `/api/holerites/rh/importacoes` | `rh` | histórico (50 últimas) |
| GET | `/api/holerites/rh/usuarios` | `rh` | usuários ativos + colaborador já vinculado |
| GET | `/api/holerites/rh/competencias` | `rh` | competências com holerite importado, mais recente primeiro |
| GET | `/api/holerites/rh/mensagens` | `rh` | mensagens do RH com o colaborador (individuais), mais recentes primeiro |
| POST | `/api/holerites/rh/mensagens` | `rh` | `{escopo: GERAL\|INDIVIDUAL, colaboradorId?, competencia?, texto}` (≤120); 422 se não couber no PDF |
| PUT | `/api/holerites/rh/mensagens/:id` | `rh` | `{texto, competencia?}` (mesma guarda) |
| DELETE | `/api/holerites/rh/mensagens/:id` | `rh` | 204 |

Erros do parser voltam como `400 {"error": "Arquivo recusado. Linha N: ..."}`.

## Variáveis de ambiente

| Variável | Padrão | Uso |
|----------|--------|-----|
| `HOLERITE_EMPRESA_NOME` | `SEBASTIANA CABRAL DE SOUSA PEREIRA - COLEGIO SANTA PAULA` | cabeçalho do PDF |
| `HOLERITE_EMPRESA_ENDERECO` | `Rua Adelia Hilbert Teixeira, 421 - Bairro Diamante - Belo Horizonte` | cabeçalho do PDF |
| `HOLERITE_DRIVE_FOLDER` | `Holerites` | nome da pasta dentro da raiz do portal no Drive |
| `HOLERITE_DRIVE_INTERVAL_MIN` | `30` | importação automática a cada N min (`0` desliga) |

O Drive usa as mesmas credenciais do Repositório/Backups
(`STORAGE_PROVIDER=google-drive` + `GOOGLE_OAUTH_*` + `GOOGLE_DRIVE_ROOT_FOLDER_ID`).
Sem elas, a tela avisa e só o upload manual funciona.

## Testes e ferramentas

```bash
cd backend
npx tsx scripts/testar-holerites.ts                 # 46 testes: parser (dois formatos), recusas, PDF, importação, vínculo, autorização, mensagens do RH
npx tsx scripts/holerite-preview.ts arquivo.txt saida/   # gera um PDF por colaborador sem tocar no banco
npx tsx scripts/holerite-preview.ts arquivo.txt saida/ --observacoes "texto"   # idem, com a caixa de observações preenchida
```

A suíte roda contra `prisma/dev.db` com dados fictícios prefixados
`TESTE-HOLERITE` e limpa tudo no fim.

## Pendências

- **Produção**: criar a pasta `Holerites` no Drive do portal (o portal cria
  sozinha na primeira consulta), liberar o módulo **rh** para quem faz a folha,
  importar o primeiro TXT (formato completo) e vincular os colaboradores.
- **Validar com um colaborador real** o PDF baixado em *Meus Holerites*.
- Se algum mês vier com base INSS ≠ base FGTS, conferir contra o papel se a
  ordem dos dois campos na linha `R` está certa (ver acima).

## Histórico

- 22/09/2026 — módulo criado sobre o formato antigo (`1`…`5`); CPF/CTPS/admissão
  preenchidos pelo RH.
- 23/09/2026 — em produção. No mesmo dia chegou o export completo (`C`/`DP`/`DD`/`R`);
  parser passou a aceitar os dois formatos e a gravar CPF, CTPS, admissão e códigos.
- 23/09/2026 (tarde) — validado de ponta a ponta em produção. Em seguida, a pedido
  do Ronaldo (print da caixa vazia do papel): campo **Observações** no PDF e aba
  *Mensagens* no RH (geral e individual), com guarda de espaço medida no pdfkit.
