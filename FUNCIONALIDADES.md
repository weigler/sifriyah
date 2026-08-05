# Funcionalidades — Sifriyah

Este documento descreve **o que cada parte do sistema faz e como foi construída por dentro** — modelo de dados, fórmulas de cálculo, regras de negócio, criptografia, sincronização e backups. O `README.md` é só sobre como configurar e publicar.

---

## Modelo de dados

Todo o estado do app vive em memória (`useState`) em quatro grandes coleções, que são também a unidade de criptografia e sincronização (ver [Seções](#seções-criptografia-e-sincronização)):

| Seção | Contém |
|---|---|
| `acervo` | `livros`, `categorias`, `tags` |
| `pessoas` | `pessoas` |
| `emprestimos` | `emprestimos`, `cobrancas`, `filas` |
| `ajustes` | `config` |

### Livro

```
{ id, titulo, autor, paginas, dataAquisicao, categoria, nivel,
  valorSemanal, valorSemanaExtra, valorReposicao, quantidade, limiteSemanas,
  sinopse, tags: [], linkExterno, capaUrl }
```

- `valorSemanal` é o preço-base de aluguel por semana, usado para sugerir o valor de um empréstimo novo (`valorSemanal × limiteSemanas`) e para calcular o desconto de devolução antecipada.
- `valorSemanaExtra` é o preço de cada semana **além** do combinado original — usado tanto na renovação manual ("+1 semana") quanto no cálculo automático de multa por atraso. Se não estiver preenchido, todo o sistema cai de volta para `valorSemanal` como aproximação.
- `valorReposicao` (opcional) é o custo sugerido quando um exemplar desse livro é marcado como perdido ou danificado (ver [Perdido/danificado](#perdido-ou-danificado)). Se não preenchido, o campo de custo aparece em branco na hora de marcar, e o admin digita o valor manualmente.
- `quantidade` é o número de unidades físicas daquele título; o sistema permite empréstimos simultâneos até esse limite (`unidadesEmprestadas(livroId) < quantidade`).
- `nivel` é um enum fechado: `Infantil, Juvenil, Iniciante, Intermediário, Avançado, Acadêmico`.

Duplicidade: ao cadastrar um livro novo, o formulário compara título + autor (normalizados,
ignorando maiúsculas/espaços) contra o acervo já existente. Se achar uma correspondência, mostra
um aviso e troca o botão para "Cadastrar mesmo assim" — precisa de um segundo clique pra confirmar.
Não bloqueia (pode ser mesmo título de edições diferentes), só evita duplicar sem querer.

### Pessoa

```
{ id, nome, sobrenome, telefone, email, genero, codigoUsuario }
```

`codigoUsuario` é gerado automaticamente na criação de toda pessoa nova (via `upsertPessoa`, ou implicitamente ao registrar um empréstimo ou aceitar um pedido de fila para alguém ainda não cadastrado). É uma string de 6 caracteres sorteada do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — deliberadamente sem `0/O`, `1/I/L`, para reduzir erro ao ditar o código por telefone. A geração checa unicidade contra os códigos já existentes antes de aceitar. Pode ser regenerado a qualquer momento pelo admin (`regerarCodigoPessoa`) ou editado manualmente. Esse código é a única "autenticação" que a vitrine pública pede de alguém que já é cadastrado, para entrar na fila ou reservar um livro sem precisar digitar nome e telefone de novo.

### Empréstimo

```
{ id, livroId, pessoaId, dataEmprestimo, prazo, valorCombinado,
  pagamentos: [{ id, valor, data }], devolvido, dataDevolucao, multaAnulada,
  statusFinal, custoReposicao }
```

`valorCombinado` é um número simples, não uma fórmula armazenada — cada evento que altera o preço (criação, renovação, desconto de devolução, custo de reposição) escreve um novo valor direto no campo. O histórico de *como* se chegou a esse número não é guardado; só o resultado.

`statusFinal` só existe quando `devolvido: true` e o encerramento não foi uma devolução normal —
vale `"perdido"` ou `"danificado"` (ver seção abaixo). `custoReposicao` guarda o valor que foi
somado ao `valorCombinado` nesse caso, só pra exibição (o valor em si já está embutido no total).

### Fila (`filas`)

```
{ id, livroId, pessoaId, criadoEm }
```

Fila de espera interna, por livro. É uma lista simples — a posição de cada pessoa na fila é implícita pela ordem de inserção (`criadoEm`), não há um campo de posição explícito.

### Cobrança (`cobrancas`)

```
{ id, emprestimoId, tipo: "cobranca" | "lembrete" | "sms", valor, data }
```

Registro de auditoria: toda vez que uma mensagem de cobrança, lembrete de prazo ou SMS é disparada pelo app, uma entrada é gravada aqui — mesmo que a pessoa nunca tenha realmente recebido a mensagem (o app não tem como confirmar entrega de um link `wa.me`). Serve para a aba Financeiro mostrar o que já foi tentado.

### Config (`ajustes`)

Chave Pix, nome do recebedor, WhatsApp de contato geral, link da vitrine, quantos dias uma
reserva pendente demora pra expirar sozinha (`diasExpiracaoReserva`, padrão 3), promoção ativa
(`{ ativa, descricao, validoAte, desconto }`) e os quatro modelos de mensagem editáveis
(`modeloCobranca`, `modeloRenovacao`, `modeloConfirmacao`, `modeloRecibo`).

---

## Precificação e cálculos financeiros

Não existe uma "tabela de preços" central — cada livro carrega seu próprio preço semanal, e todo o resto é derivado no momento em que é exibido (nada fica pré-calculado e armazenado, exceto `valorCombinado`).

**Valor sugerido ao criar um empréstimo** (`calcularValorSugerido`):
```
valor = livro.valorSemanal × livro.limiteSemanas
se promoção ativa e (sem data-limite OU validoAte >= hoje):
    valor -= promoção.desconto
```
O prazo sugerido é `hoje + limiteSemanas` (em semanas, `somarSemanas`).

**Renovação manual — "+1 semana"** (`renovarSemana`): soma 7 dias ao prazo atual (ou a partir de hoje, se já não havia prazo) e acrescenta `valorSemanaExtra` (ou `valorSemanal`) ao `valorCombinado`. Bloqueada (botão desabilitado) se houver qualquer pessoa na fila digital daquele livro — a lógica é: se tem gente esperando, o livro devia voltar, não ser estendido.

**Desconto na devolução antecipada**: ao devolver, o app calcula quantos dias restavam até o prazo (`diasRestantes`), converte em semanas completas não usadas (`Math.floor(diasRestantes / 7)`) e sugere abater `semanas × valorSemanal` do total combinado. É só uma sugestão pré-preenchida — o admin confirma o valor final na hora de devolver.

**Multa por atraso** (`calcularMulta` / `diasAtraso`) — não é armazenada, é **recalculada a cada renderização** a partir da data atual:
```
diasAtraso = max(0, hoje - prazo)          # só se não devolvido e há prazo
semanasAtraso = ceil(diasAtraso / 7)
valorSemana = config.valorMultaSemanal (se preenchido) OU valorSemanaExtra OU valorSemanal do livro
multa = semanasAtraso × valorSemana
```
`valorMultaSemanal` é um campo opcional em Ajustes — um valor único, geral, que substitui a taxa por livro quando preenchido. Se deixado em branco, cada livro usa sua própria taxa (`valorSemanaExtra`, com `valorSemanal` como último recurso).
Se `emprestimo.multaAnulada === true`, a multa é sempre 0, independente do atraso — um botão "anular multa" / "reativar multa" alterna essa flag por empréstimo. Isso existe especificamente para cobrir o caso de o livro já ter sido devolvido na prática, mas o admin só ter marcado isso no sistema alguns dias depois: sem a anulação, o atraso "de sistema" geraria uma multa indevida.

Por ser puramente derivada (não persistida), a multa nunca fica dessincronizada — junto com o pagamento, ela entra automaticamente em:
- `restante` (o "falta pagar" mostrado em cada empréstimo e usado no texto de cobrança),
- na regra de bloqueio de débito (abaixo),
- nos totais da aba Financeiro (`totalMultas`, somado a `totalCombinado`).

**Regras de bloqueio ao registrar um empréstimo novo**, checadas nessa ordem:
1. **Um livro por pessoa por vez** — bloqueia se a pessoa já tem qualquer empréstimo com `devolvido: false`.
2. **Débito pendente** (`pessoaTemDebito`) — soma `valorCombinado + multa − totalPago` de **todos** os empréstimos da pessoa (devolvidos ou não); se qualquer um estiver positivo, bloqueia até quitar.

**Total pago** (`totalPago`): soma simples do array `pagamentos` de um empréstimo — pagamentos parciais são permitidos e ficam listados individualmente (com opção de remover um lançamento errado).

**Aba "devedores"** (filtro dentro de Empréstimos): mostra todo empréstimo com `restante > 0` — **independente de já devolvido ou não**. É diferente do bloqueio de débito acima (que olha a pessoa como um todo): aqui é por empréstimo, então dá pra ver exatamente qual livro ainda tem valor em aberto, mesmo que já tenha voltado pra estante. Quando há alguém devendo, aparece um aviso no topo da aba (igual ao de atrasados) com a contagem de pessoas e o valor total em aberto; a lista, nesse filtro, ordena do maior débito pro menor.

### Perdido ou danificado

Alternativa a "marcar devolvido" (`marcarPerdidoDanificado`), disponível em qualquer empréstimo
ativo: encerra o empréstimo do mesmo jeito (`devolvido: true`, `dataDevolucao` preenchida), mas
grava `statusFinal: "perdido"` ou `"danificado"` e soma o custo de reposição informado (sugerido
a partir de `livro.valorReposicao`, editável na hora) direto ao `valorCombinado` do empréstimo —
reaproveitando o mecanismo de dívida já existente, sem precisar de um cálculo separado: esse
custo aparece em "falta pagar", entra na aba "devedores", nos totais do Financeiro etc., igual a
qualquer outro valor pendente. Também tira uma unidade de `quantidade` do livro (pra sumir da
prateleira); se o exemplar aparecer depois, o admin aumenta a quantidade de novo manualmente
editando o livro. O selo do empréstimo (`Stamp`) mostra "PERDIDO" ou "DANIFICADO" em vez de
"DEVOLVIDO" nesse caso.

---

## Seções, criptografia e sincronização

### Por que 4 seções, e não um blob único

Os dados nunca chegam ao Firestore em texto puro. Antes de salvar, o estado inteiro é dividido em 4 seções (`montarSecoes`) e cada uma é criptografada **separadamente**:

```
acervo:      { livros, categorias, tags }
pessoas:     { pessoas }
emprestimos: { emprestimos, cobrancas, filas }
ajustes:     { config }
```

Isso existe por dois motivos práticos: (1) autosave granular — editar só um livro não precisa recriptografar/reenviar pessoas e empréstimos também; (2) o formato antigo (anterior a essa divisão) guardava tudo num blob único no campo `blob` da raiz do documento — esse formato legado ainda é lido como fallback por `migrarDados`, mas nunca mais escrito.

Ao carregar, o processo inverso (`combinarSecoes`) remonta o objeto único a partir das 4 seções decodificadas, que então passa por `migrarDados` — responsável por preencher campos que podem não existir em dados antigos (ex.: dar um `id` a pagamentos que não tinham, ou reconstruir a lista de categorias/tags a partir dos próprios livros, caso a lista solta esteja ausente).

### Criptografia

Cada seção é criptografada individualmente com **AES-GCM 256 bits**, chave derivada da senha local via **PBKDF2 (SHA-256, 150.000 iterações)**, salt aleatório de 16 bytes por operação, IV aleatório de 12 bytes. O blob salvo é um JSON simples:

```json
{ "v": 1, "salt": "<base64>", "iv": "<base64>", "data": "<base64>" }
```

A senha em si **nunca** é enviada nem armazenada em lugar nenhum — só existe em memória no navegador enquanto o app está desbloqueado (`senhaAtual`), e é usada para derivar a chave toda vez que algo precisa ser criptografado ou decifrado. Isso significa que o Firebase (o serviço, os administradores do projeto, um eventual vazamento de regras de segurança) nunca tem acesso aos dados em texto puro — só ao blob cifrado.

**Modo "sem senha"**: em vez de pedir uma senha real, o app usa uma passphrase fixa e pública embutida no código (`SEM_SENHA_PASSPHRASE`) como chave de criptografia. Os dados continuam tecnicamente cifrados no Firestore (formato idêntico), mas isso não protege contra nada — é só um jeito de manter a mesma pipeline de dados sem exigir que o usuário digite senha toda vez. Ativar/desativar esse modo re-criptografa todas as seções na hora (`reencriptarTudoCom`), trocando a senha real pela passphrase fixa ou vice-versa.

### Autenticação de acesso (separada da senha local)

A senha local protege o **conteúdo**; o Firebase Authentication (e-mail/senha) protege o **acesso de leitura/escrita** às coleções, quando as regras do Firestore exigem `request.auth != null`. São dois sistemas independentes — é possível, por exemplo, que alguém autenticado no Firebase ainda não consiga ler os dados de verdade sem a senha local.

Um detalhe de implementação que já causou bugs reais neste projeto: a leitura inicial do documento (para decidir se já existem dados salvos) só pode acontecer **depois** que o Firebase Auth termina de restaurar a sessão persistida do navegador — se disparar antes, cai em "permission denied" e o app erroneamente conclui que a biblioteca está vazia. A correção ficou em duas partes: (1) `aguardarAuthPronto` — espera o primeiro evento de `onAuthStateChanged` antes de tentar ler; (2) o efeito que carrega os dados também reage a mudanças em `statusAdminAuth`, então se o admin loga manualmente *depois* do carregamento inicial (ex.: sessão não persistida), o app tenta ler de novo automaticamente, em vez de ficar preso no estado de "sem dados".

### Sincronização em tempo real

Quando conectado a um projeto Firebase, cada seção é ouvida via `onSnapshot` — mudanças feitas em outro aparelho chegam automaticamente, sem polling. Um relógio local (`atualizadoEm` por seção) evita que o próprio aparelho reaja ao eco da sua própria escrita.

---

## Backups

Dois tipos, guardados na coleção `sifriyah_backups`, cada um com as mesmas 4 seções criptografadas de novo (com a senha do momento):

- **Automático**: disparado no máximo uma vez a cada 24h, checado a cada desbloqueio bem-sucedido do app (compara `Date.now()` contra o `criadoEm` do backup automático mais recente). Mantém no máximo `config.maxBackupsAutomaticos` (padrão: `MAX_BACKUPS_AUTOMATICOS_PADRAO = 10`, editável em Ajustes) — ao ultrapassar, os mais antigos são apagados.
- **Manual**: disparado pelo botão em Ajustes, sem limite de quantidade — ficam retidos indefinidamente, servindo como "pontos de restauração" que o próprio usuário decide manter.

Restaurar (`restaurarBackup`) decifra as 4 seções do backup escolhido com a senha atual e substitui o estado em memória — os `useEffect` de autosave por seção então percebem a mudança e regravam tudo na nuvem sozinhos, sem passo manual adicional. Se a senha atual não bater com a que cifrou aquele backup (por exemplo, um backup de antes de uma troca de senha), a decodificação falha e isso é reportado na interface, em vez de falhar em silêncio.

---

## Pedidos vindos da vitrine pública: fila, reserva e sugestão

A vitrine pública (`catalogo/index.html`) não escreve diretamente nas coleções privadas — ela só cria documentos avulsos em `sifriyah_pedidos_fila`, com um campo `tipo` (`"fila"`, `"reserva"` ou `"sugestao"`) que os diferencia:

```
{ biblioteca, tipo, livroId, tituloLivro, autorSugerido, codigoUsuario, nome, sobrenome,
  telefone, criadoEm, atendido, atendidoEm, expirado }
```

Quem visita o catálogo pode se identificar de duas formas: pelo `codigoUsuario` (se já é cadastrado) ou por nome + telefone (se ainda não é). O formulário de fila/reserva é o mesmo para os dois tipos — só muda o rótulo do botão e o `tipo` gravado, conforme o livro esteja disponível (reserva) ou emprestado (fila). Sugestão de livro é um formulário separado, mais simples (título, autor opcional, identificação opcional), que usa a mesma coleção com `tipo: "sugestao"` e `tituloLivro`/`autorSugerido` no lugar de `livroId` (que não existe, já que o livro sugerido ainda não está no acervo).

No app administrativo, a aba **Fila** ouve essa coleção em tempo real e separa visualmente os três tipos em listas próprias. **Aceitar** um pedido tem efeito diferente conforme o tipo:
- **Fila**: tenta casar `codigoUsuario` com uma pessoa existente (ou o nome, se veio sem código); se achar, cria de verdade uma entrada na fila digital daquele livro (criando a pessoa também, se for a primeira vez que aparece); se não achar ninguém e não veio nome junto, mostra um erro em vez de falhar silenciosamente.
- **Reserva**: não existe um conceito de "reserva persistida" no sistema — aceitar só marca o pedido como atendido (o combinado de retirada é feito por fora, diretamente com a pessoa). Ver "Expiração de reservas" abaixo.
- **Sugestão**: "aceitar" (rotulado "marcar como vista" na interface) só marca o pedido como atendido — não cadastra o livro automaticamente. Se a biblioteca decidir comprar, o cadastro é feito manualmente pela aba Acervo, como qualquer outro livro.

Pedidos atendidos não somem na hora — ficam guardados por 60 dias (limpeza automática, `nuvemLimparPedidosFilaAntigos`, rodada uma vez por sessão) como histórico de curto prazo, e só então são apagados de vez.

### Expiração de reservas

Como não existe reserva persistida (a "disponibilidade" de um livro na vitrine só olha
empréstimos de verdade, nunca pedidos pendentes), um pedido de reserva esquecido na fila de
pendentes não trava nada tecnicamente — mas continua poluindo a lista que o admin precisa revisar. `nuvemExpirarReservasAntigas` roda uma vez por sessão (junto com a limpeza de pedidos antigos) e marca como atendida, com `expirado: true`, toda reserva pendente (`tipo: "reserva"`, `atendido: false`) criada há mais de `config.diasExpiracaoReserva` dias (padrão 3, editável em Ajustes). A consulta filtra só por `biblioteca` no Firestore e faz o resto no cliente, de propósito, pra não exigir nenhum índice composto configurado manualmente no Console.

### Notificações

Usa a Notification API nativa do navegador — não é push (não funciona com o app fechado; exigiria um servidor e Firebase Cloud Messaging). Um `useRef` guarda os IDs dos pedidos vistos na última renderização; quando a lista de `pedidosFila` ganha um ID novo que não estava lá antes, e o usuário já concedeu permissão (`Notification.requestPermission`), dispara uma notificação do sistema operacional com o título do livro e o tipo de pedido. A aba "Fila" também mostra, sempre, um contador simples (`pedidosFila.length`) como badge — esse não depende de permissão nenhuma.

---

## Mensagens via WhatsApp

Todas as mensagens (confirmação de empréstimo, cobrança, lembrete de prazo, comprovante de quitação, envio de código de usuário) são geradas client-side e abertas via link `https://wa.me/<telefone>?text=<mensagem>` — não há integração com a API oficial do WhatsApp, é só um deep link. Quatro dos cinco textos são editáveis pelo admin em Ajustes, com um pequeno mecanismo de template (`preencherModelo`): o texto guardado tem placeholders `{nome}`, `{livro}`, `{valor}`, `{prazo}`, `{dataInicio}`, `{dataFim}`, `{pix}`, substituídos por regex na hora de montar a mensagem final. Se o admin não personalizou um modelo, cada função tem um texto padrão embutido no código.

A mensagem de confirmação de empréstimo é a única que sempre aparece (não depende de haver saldo pendente); cobrança e lembrete de prazo só aparecem quando há algo a cobrar. O botão "Enviar comprovante" (`modeloRecibo`) aparece quando o empréstimo está com saldo zerado e algum pagamento já foi registrado (`restante === 0 && totalPago > 0`) — funciona tanto pra empréstimo já devolvido quanto pra um que a pessoa quitou mas ainda está com o livro.

---

## Vitrine pública (`catalogo/index.html`)

Página HTML/JS solta, sem build, sem dependência de React — só o SDK compat do Firestore. Lê o documento único da coleção `sifriyah_publico` via `onSnapshot` (leitura pública, sem autenticação) e renderiza a lista inteira via `innerHTML` a cada mudança — não há diffing nem estado incremental, o DOM é reconstruído por completo a cada evento (o que também significa que qualquer formulário aberto no momento, como o de pedido de fila, colapsa de volta pro estado fechado).

A busca de texto livre casa contra título, autor, **nível de leitura e tags** — não só título/autor. Cada livro mostra também o valor semanal, quando cadastrado.

O documento público é escrito pelo app administrativo (`nuvemSalvarPublico`), com uma projeção deliberadamente reduzida dos dados reais — nem todo campo de um livro é publicado, e nenhum dado de pessoa, empréstimo ou financeiro sai daí. A escrita só acontece enquanto o app admin está desbloqueado e sincronizado (efeito guardado por `unlocked && senhaAtual && cloudConfig`).

Pré-cadastro (nome/telefone/e-mail, sem exigir login) grava em `sifriyah_precadastros` e aparece para revisão na aba Pessoas do admin, que pode "importar" (virar uma pessoa de verdade, com código de usuário gerado na hora) ou descartar.

---

## Ranking de leitura

Três listas, todas dentro da aba Financeiro, calculadas a partir de `emprestimos` (contagem simples, sem nenhum estado próprio guardado):
- **Livros mais emprestados** (top 10): conta empréstimos por `livroId`.
- **Quem mais leu** (top 10): conta empréstimos por `pessoaId` — pensado como um elemento de engajamento pro grupo, não é sobre dinheiro.
- **Categorias mais populares** (top 8): soma os empréstimos dos livros de cada `categoria`, útil como indicativo de que tipo de livro comprar mais.

Todas contam empréstimos ativos e já devolvidos juntos (histórico completo, não só o momento atual).

---

## Exportar dados (CSV)

Em Ajustes, três botões baixam uma planilha (`baixarCSV`, com BOM UTF-8 pra acentuação abrir certo no Excel) com o estado atual — diferente do backup criptografado, que só o próprio Sifriyah consegue reabrir:
- **Acervo**: título, autor, categoria, nível, unidades, valores (semanal/extra/reposição), páginas, data de aquisição.
- **Pessoas**: nome, sobrenome, telefone, e-mail, código de usuário.
- **Empréstimos**: livro, pessoa, datas, situação (`statusFinal` quando houver), valor combinado, total pago, status (ativo/encerrado).

Gerado inteiramente no navegador (sem passar pelo Firestore de novo) — é só uma leitura formatada do estado já carregado em memória.

---

## Log de auditoria

Coleção `sifriyah_auditoria`, só existe com a nuvem conectada. Cada linha é `{ biblioteca, acao, detalhe, adminEmail, criadoEm }`, escrita por `auditar()` (best-effort — nunca trava a ação que está sendo registrada se a escrita falhar) nos pontos que envolvem dado sensível ou some do sistema: empréstimo registrado, devolução, perdido/danificado, pagamento registrado, pessoa removida, livro removido, senha trocada, backup restaurado, reset completo. As regras do Firestore permitem só `read`/`create` pra contas autenticadas — nem o próprio app tem como editar ou apagar uma linha já escrita (ver `firestore.rules`).

A listagem (`nuvemListarAuditoria`) busca só por `biblioteca` e ordena as últimas 200 entradas no cliente — mesma estratégia de `nuvemListarBackups` — pra não exigir índice composto configurado manualmente no Console. Pensado pra quando mais de uma conta administra a mesma biblioteca (ver preparo pro IPN Books no `CONTINUIDADE.md`); com um admin só, serve mais como um histórico de "o que mudou e quando".
