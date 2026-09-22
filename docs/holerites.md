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

## Dados que o TXT NÃO traz

O PDF da escola mostra CPF, CTPS, data de admissão e os códigos de cargo
(`0005`) e depto (`000005`). Nada disso vem no TXT atual. Enquanto o sistema
de folha não exportar um arquivo mais completo, o RH preenche esses campos
uma vez por colaborador (botão *Preencher* na aba de colaboradores). Campo em
branco sai em branco no PDF. O cabeçalho da empresa (nome completo e
endereço) vem das variáveis `HOLERITE_EMPRESA_NOME` / `HOLERITE_EMPRESA_ENDERECO`,
porque o TXT trunca o nome em 42 caracteres e não traz endereço.

Quando chegar o export mais completo, o lugar de mexer é
`backend/src/modules/holerites/holerite.parser.ts` (`lerCabecalho`) e o
`paraRegistro`/`atualizarDados` do serviço, gravando nos mesmos campos do
`Colaborador`.

## Layout do TXT (medido em `Holerite22092026.txt`, 22/09/2026)

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
npx tsx scripts/testar-holerites.ts                 # 21 testes: parser, recusas, PDF, importação, vínculo, autorização
npx tsx scripts/holerite-preview.ts arquivo.txt saida/   # gera um PDF por colaborador sem tocar no banco
```

A suíte roda contra `prisma/dev.db` com dados fictícios prefixados
`TESTE-HOLERITE` e limpa tudo no fim.

## Pendências

- **Export mais completo da folha** (CPF, CTPS, admissão, códigos): pedido ao
  contador em 22/09/2026. Até lá, o RH preenche na tela.
- **Produção**: criar a pasta `Holerites` no Drive do portal (o portal cria
  sozinha na primeira consulta) e liberar o módulo **rh** para quem faz a folha.
